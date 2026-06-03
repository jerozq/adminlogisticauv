'use client'

import { Fragment, useMemo, useState, useTransition } from 'react'
import { AlertCircle, Check, CheckCircle2, ChevronDown, ChevronUp, DollarSign, Info, Layers, Loader2, Pencil, Plus, RotateCcw, ShieldAlert, TrendingDown, Trash2, Upload, Users, Wallet, X } from 'lucide-react'
import { actualizarAbono, actualizarGrupoCostos, cambiarEstadoPagoCosto, cambiarEstadoReembolso, crearGrupoCostos, eliminarAbono, eliminarCostoReal, eliminarDeudaDevolucion, eliminarGrupoCostos, eliminarPagoGrupo, marcarItemEstado, recalcularDevolucionesPendientes, registrarAbonoUnidad, registrarCostoReal, registrarDeudaDevolucion, registrarPagoGrupo, registrarSalidaDevolucion, saldarDeudaDevolucion } from '@/actions/liquidaciones'
import { useRouter } from 'next/navigation'
import { calcularTotalCostosRegistrados, contarCostosHuerfanos } from '@/src/utils/liquidacion-costos'
import { GaleriaComprobantes } from './GaleriaComprobantes'
import type { EstadoReembolso, SoporteProyecto } from '@/actions/liquidaciones'
import { FondosInsuficientesModal } from './FondosInsuficientesModal'

const COP = new Intl.NumberFormat('es-CO', {
  style: 'currency', currency: 'COP', maximumFractionDigits: 0,
})

type InsightsRetenciones = {
  muestras: Array<{ actividad: string; cotizado: number; banco: number; retencion: number; pct: number }>
  promedioPct: number | null
  totalMuestras: number
}

export function LiquidacionDashboard({ detalle, actividadId, insights, soportes, cuentas }: { detalle: any, actividadId: string, insights: InsightsRetenciones, soportes: SoporteProyecto[], cuentas: any[] }) {
  const router = useRouter()
  const { actividad, abonos, movimientosProyecto, devoluciones, deudas, costos, itemsCotizados, reembolsos, grupos } = detalle

  // Derived values
  const totalCotizado = itemsCotizados.reduce((acc: number, item: any) => acc + (item.cantidad * item.precio_unitario), 0)
  const totalAbonosOperativo = abonos
    .filter((ab: any) => (ab.tipo_abono ?? 'OPERATIVO') === 'OPERATIVO')
    .reduce((acc: number, ab: any) => acc + Number(ab.monto ?? 0), 0)

  const movsProyecto = (movimientosProyecto ?? []) as any[]
  const movsEjecutados = movsProyecto.filter((m: any) => !m.estado || m.estado === 'EJECUTADO')

  const totalIngresos = movsEjecutados
    .filter((m: any) => Number(m.impacto_neto ?? 0) > 0)
    .reduce((acc: number, m: any) => acc + Number(m.impacto_neto ?? 0), 0)

  const totalEgresos = Math.abs(movsEjecutados
    .filter((m: any) => Number(m.impacto_neto ?? 0) < 0)
    .reduce((acc: number, m: any) => acc + Number(m.impacto_neto ?? 0), 0))

  // Saldo de caja 1:1 con la cuenta PROYECTO (single source of truth: libro mayor)
  const saldoDisponible = movsEjecutados.reduce((acc: number, m: any) => acc + Number(m.impacto_neto ?? 0), 0)

  // Total Ejecutado = salidas reales operativas/terceros desde el libro mayor.
  // Por ahora el tipo contable que representa pagos de ejecución es GASTO.
  const totalEjecutado = movsEjecutados
    .filter((m: any) => m.tipo === 'GASTO' && Number(m.impacto_neto ?? 0) < 0)
    .reduce((acc: number, m: any) => acc + Math.abs(Number(m.impacto_neto ?? 0)), 0)

  const devolucionesPendientes = Number(actividad.devoluciones_pendientes_unidad ?? 0)
  const utilidadNeta = saldoDisponible - devolucionesPendientes

  // Cotizado operativo = items tipo SERVICIO (para cálculo de retención)
  const totalCotizadoOperativo = itemsCotizados
    .filter((i: any) => i.tipo === 'SERVICIO')
    .reduce((acc: number, i: any) => acc + Number(i.precio_total ?? (i.cantidad * i.precio_unitario)), 0)

  // Section B form state
  const [abonoMonto, setAbonoMonto] = useState('')
  const [tipoAbono, setTipoAbono] = useState<'OPERATIVO' | 'PASIVO_TERCERO'>('OPERATIVO')

  const [isPending, startTransition] = useTransition()
  // Estado para edición inline de abonos
  const [editingAbonoId, setEditingAbonoId] = useState<string | null>(null)
  const [editMonto, setEditMonto] = useState('')
  const [editRetencion, setEditRetencion] = useState('')
  const [editTipo, setEditTipo] = useState<'OPERATIVO' | 'PASIVO_TERCERO'>('OPERATIVO')

  // ── Retención auto-calculada (timeline acumulativa) ──
  // retención = cotizado_operativo − (abonos_operativos_previos + monto_actual)
  const montoReal = Number(abonoMonto) || 0
  const bancoAcumulado = totalAbonosOperativo + montoReal
  const retencionEstimada = tipoAbono === 'OPERATIVO' && montoReal > 0
    ? Math.max(0, totalCotizadoOperativo - bancoAcumulado)
    : 0
  const retencionPct = totalCotizadoOperativo > 0 && retencionEstimada > 0
    ? (retencionEstimada / totalCotizadoOperativo) * 100
    : 0

  async function handleAbono(e: React.FormEvent) {
    e.preventDefault()
    await registrarAbonoUnidad(actividadId, montoReal, retencionEstimada, tipoAbono)
    setAbonoMonto('')
    setTipoAbono('OPERATIVO')
    startTransition(() => router.refresh())
  }

  function handleStartEdit(ab: any) {
    setEditingAbonoId(ab.id)
    setEditMonto(String(ab.monto))
    setEditRetencion(String(ab.retencion_aplicada ?? 0))
    setEditTipo(ab.tipo_abono ?? 'OPERATIVO')
  }

  function handleCancelEdit() {
    setEditingAbonoId(null)
    setEditMonto('')
    setEditRetencion('')
    setEditTipo('OPERATIVO')
  }

  async function handleUpdateAbono(abonoId: string) {
    await actualizarAbono(abonoId, actividadId, Number(editMonto), Number(editRetencion), editTipo)
    handleCancelEdit()
    startTransition(() => router.refresh())
  }

  async function handleDeleteAbono(abonoId: string) {
    if (!confirm('¿Eliminar este abono? El total de abonos se recalculará automáticamente.')) return
    await eliminarAbono(abonoId, actividadId)
    startTransition(() => router.refresh())
  }

  return (
    <div className="space-y-6">
      {/* SECTION A: MOTOR DE AUDITOR?A */}
      <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md p-6">
        <h2 className="text-lg font-bold text-white flex items-center gap-2 mb-4">
          <ShieldAlert className="w-5 h-5 text-indigo-400" />
          Motor de Auditora
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="p-4 rounded-xl bg-white/5 border border-white/10">
            <div className="text-sm text-slate-400">Saldo Disponible</div>
            <div className={`text-xl font-bold tabular-nums ${saldoDisponible >= 0 ? 'text-indigo-300' : 'text-red-400'}`}>
              {COP.format(saldoDisponible)}
            </div>
            <div className="text-[10px] text-slate-500 mt-1">Ingresos: {COP.format(totalIngresos)} | Egresos: {COP.format(totalEgresos)}</div>
          </div>
          <div className="p-4 rounded-xl bg-white/5 border border-white/10">
            <div className="text-sm text-slate-400">Total Ejecutado</div>
            <div className="text-xl font-bold text-orange-400 tabular-nums">{COP.format(totalEjecutado)}</div>
            <div className="text-[10px] text-slate-500 mt-1">Libro mayor (salidas tipo GASTO)</div>
          </div>
          <div className={`p-4 rounded-xl border ${devolucionesPendientes > 0 ? 'bg-red-500/10 border-red-500/20' : 'bg-white/5 border-white/10'}`}>
            <div className="text-sm text-slate-400">Devoluciones Pendientes</div>
            <div className={`text-xl font-bold tabular-nums ${devolucionesPendientes > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
              {devolucionesPendientes > 0 ? COP.format(devolucionesPendientes) : '✓ Paz y salvo'}
            </div>
          </div>
          <div className={`p-4 rounded-xl border ${utilidadNeta >= 0 ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-red-500/10 border-red-500/20'}`}>
            <div className="text-sm text-slate-400">Utilidad Neta (Caja a repartir)</div>
            <div className={`text-xl font-bold tabular-nums ${utilidadNeta >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {COP.format(utilidadNeta)}
            </div>
            <div className="text-[10px] text-slate-500 mt-1">Saldo Disponible - Devoluciones Pendientes</div>
          </div>
        </div>

        {devolucionesPendientes > 0 && (
          <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center gap-3">
            <AlertCircle className="w-6 h-6 text-red-400" />
            <div>
              <div className="font-bold text-red-400">DESCUADRE: Faltan por justificar / devolver</div>
              <div className="text-sm text-red-300">Tienes {COP.format(devolucionesPendientes)} en Devoluciones Pendientes. Liquida este saldo antes de repartir utilidades.</div>
            </div>
          </div>
        )}
      </div>

      {/* SECTION B: INGRESOS Y RETENCIONES */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md p-6">
          <h2 className="text-lg font-bold text-white flex items-center gap-2 mb-4">
            <DollarSign className="w-5 h-5 text-emerald-400" />
            Registrar Abono
          </h2>
          <form onSubmit={handleAbono} className="space-y-4">
            {/* Destino del abono */}
            <div>
              <label className="block text-sm text-slate-400 mb-2">Destino del Abono</label>
              <div className="grid grid-cols-2 gap-2">
                <label className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${
                  tipoAbono === 'OPERATIVO'
                    ? 'border-emerald-500/60 bg-emerald-500/10 text-emerald-300'
                    : 'border-white/10 bg-white/5 text-slate-400 hover:border-white/20'
                }`}>
                  <input
                    type="radio"
                    name="tipoAbono"
                    value="OPERATIVO"
                    checked={tipoAbono === 'OPERATIVO'}
                    onChange={() => setTipoAbono('OPERATIVO')}
                    className="accent-emerald-500"
                  />
                  <span className="text-xs font-medium">Caja del Proyecto</span>
                </label>
                <label className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${
                  tipoAbono === 'PASIVO_TERCERO'
                    ? 'border-amber-500/60 bg-amber-500/10 text-amber-300'
                    : 'border-white/10 bg-white/5 text-slate-400 hover:border-white/20'
                }`}>
                  <input
                    type="radio"
                    name="tipoAbono"
                    value="PASIVO_TERCERO"
                    checked={tipoAbono === 'PASIVO_TERCERO'}
                    onChange={() => { setTipoAbono('PASIVO_TERCERO') }}
                    className="accent-amber-500"
                  />
                  <span className="text-xs font-medium">Fondo Terceros</span>
                </label>
              </div>
            </div>

            <div>
              <label className="block text-sm text-slate-400 mb-1">Monto Real en Banco</label>
              <input
                type="number"
                value={abonoMonto}
                onChange={e => setAbonoMonto(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                required
              />
            </div>
            {tipoAbono === 'OPERATIVO' && (
              <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2.5">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-slate-400 flex items-center gap-1">
                    <Info className="w-3 h-3" /> Retención auto-calculada
                  </span>
                  {retencionEstimada > 0 && (
                    <span className="text-xs font-semibold text-red-400">{retencionPct.toFixed(2)}%</span>
                  )}
                </div>
                <div className={`text-base font-semibold tabular-nums ${
                  retencionEstimada > 0 ? 'text-red-400' : 'text-slate-500'
                }`}>
                  {montoReal > 0
                    ? (retencionEstimada > 0
                        ? `− ${COP.format(retencionEstimada)}`
                        : 'Sin retención (banco ≥ cotizado)')
                    : 'Ingresa el monto del banco'}
                </div>
                <div className="text-[10px] text-slate-500 mt-1 space-y-0.5">
                  <div>Cotizado operativo: {COP.format(totalCotizadoOperativo)}</div>
                  {totalAbonosOperativo > 0 && (
                    <div>Abonos previos: {COP.format(totalAbonosOperativo)}</div>
                  )}
                  <div>Banco acumulado (previos + actual): {COP.format(bancoAcumulado)}</div>
                </div>
              </div>
            )}
            <button type="submit" className={`w-full text-white font-semibold py-2 rounded-lg transition-colors ${
              tipoAbono === 'OPERATIVO'
                ? 'bg-emerald-500 hover:bg-emerald-600'
                : 'bg-amber-500 hover:bg-amber-600'
            }`}>
              Guardar Abono
            </button>
          </form>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md p-6">
          <h2 className="text-lg font-bold text-white mb-2">Historial de Movimientos</h2>
          <p className="text-xs text-slate-400 mb-4">
            Libro mayor del proyecto. La Caja Neta se calcula solo con movimientos en estado EJECUTADO.
          </p>
          <div className="space-y-3 max-h-[430px] overflow-auto pr-1">
            {movsProyecto.map((tx: any) => {
              const isEditing = editingAbonoId === tx.id
              const notas = (tx.notas ?? {}) as any
              const tipoAbono = (notas.tipo_abono ?? 'OPERATIVO') as 'OPERATIVO' | 'PASIVO_TERCERO'
              const isAbonoEditable = tx.tipo === 'PAGO_UNIDAD'

              if (isEditing && isAbonoEditable) {
                return (
                  <div key={tx.id} className="p-3 bg-white/10 rounded-lg border border-indigo-500/40 space-y-3">
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="block text-xs text-slate-400 mb-1">Monto</label>
                        <input type="number" value={editMonto} onChange={e => setEditMonto(e.target.value)}
                          className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-white text-sm focus:outline-none focus:border-indigo-500" />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-400 mb-1">Tipo</label>
                        <select value={editTipo} onChange={e => { setEditTipo(e.target.value as any); if (e.target.value === 'PASIVO_TERCERO') setEditRetencion('0') }}
                          className="w-full bg-[#0a0a0a] border border-white/10 rounded px-2 py-1 text-white text-sm focus:outline-none focus:border-indigo-500">
                          <option value="OPERATIVO">Operativo</option>
                          <option value="PASIVO_TERCERO">Terceros</option>
                        </select>
                      </div>
                      <div className={editTipo === 'PASIVO_TERCERO' ? 'opacity-40 pointer-events-none' : ''}>
                        <label className="block text-xs text-slate-400 mb-1">Retención</label>
                        <input type="number" value={editRetencion} onChange={e => setEditRetencion(e.target.value)}
                          disabled={editTipo === 'PASIVO_TERCERO'}
                          className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-white text-sm focus:outline-none focus:border-indigo-500 disabled:cursor-not-allowed" />
                      </div>
                    </div>
                    <div className="flex gap-2 justify-end">
                      <button onClick={handleCancelEdit} className="px-3 py-1 bg-white/10 hover:bg-white/20 rounded text-xs transition-colors">Cancelar</button>
                      <button onClick={() => handleUpdateAbono(tx.id)} disabled={isPending}
                        className="px-3 py-1 bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 text-white rounded text-xs transition-colors">
                        Guardar cambios
                      </button>
                    </div>
                  </div>
                )
              }

              const impacto = Number(tx.impacto_neto ?? 0)
              const esEntrada = impacto > 0
              const signo = esEntrada ? '+' : impacto < 0 ? '-' : ''
              const montoAbs = Math.abs(impacto || Number(tx.monto ?? 0))
              const estadoMov = tx.estado ?? 'EJECUTADO'
              const colorMonto = esEntrada ? 'text-emerald-400' : impacto < 0 ? 'text-red-400' : 'text-slate-300'

              const tipoColor =
                tx.tipo === 'PAGO_UNIDAD' ? 'bg-cyan-500/20 text-cyan-300'
                : tx.tipo === 'GASTO' ? 'bg-orange-500/20 text-orange-300'
                : tx.tipo === 'TRANSFERENCIA' ? 'bg-blue-500/20 text-blue-300'
                : tx.tipo === 'REPARTO_50_50' ? 'bg-emerald-500/20 text-emerald-300'
                : tx.tipo === 'DEVOLUCION' ? 'bg-amber-500/20 text-amber-300'
                : tx.tipo === 'RETIRO' ? 'bg-red-500/20 text-red-300'
                : 'bg-white/10 text-slate-300'

              return (
                <div key={tx.id} className="flex justify-between items-center p-3 bg-white/5 rounded-lg border border-white/5">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                      <span className={`font-semibold ${colorMonto} tabular-nums`}>
                        {signo}{COP.format(montoAbs)}
                      </span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${tipoColor}`}>
                        {tx.tipo}
                      </span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${estadoMov === 'EJECUTADO' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-500/20 text-slate-300'}`}>
                        {estadoMov}
                      </span>
                      {isAbonoEditable && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${tipoAbono === 'PASIVO_TERCERO' ? 'bg-amber-500/20 text-amber-300' : 'bg-emerald-500/20 text-emerald-300'}`}>
                          {tipoAbono === 'PASIVO_TERCERO' ? 'TERCEROS' : 'OPERATIVO'}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-200 truncate">{tx.descripcion ?? 'Movimiento financiero del proyecto'}</div>
                    <div className="text-[11px] text-slate-500">{new Date(tx.fecha).toLocaleString('es-CO')}</div>
                  </div>

                  <div className="flex items-center gap-3">
                    {isAbonoEditable && (
                      <div className="text-right">
                        <div className="text-xs text-slate-400">Retención</div>
                        <div className="text-sm font-semibold text-red-400">-{COP.format(Number(notas.retencion_aplicada ?? 0))}</div>
                      </div>
                    )}
                    {isAbonoEditable && (
                      <div className="flex gap-1">
                        <button onClick={() => handleStartEdit({
                          id: tx.id,
                          monto: tx.monto,
                          tipo_abono: tipoAbono,
                          retencion_aplicada: Number(notas.retencion_aplicada ?? 0),
                        })} title="Editar abono"
                          className="p-1.5 hover:bg-white/10 rounded text-slate-400 hover:text-white transition-colors">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => handleDeleteAbono(tx.id)} title="Eliminar abono" disabled={isPending}
                          className="p-1.5 hover:bg-red-500/20 rounded text-slate-400 hover:text-red-400 disabled:opacity-50 transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
            {movsProyecto.length === 0 && <div className="text-slate-500 text-sm">No hay movimientos registrados para esta cuenta proyecto.</div>}
          </div>
        </div>
      </div>

      {/* PANEL: ANÁLISIS HISTÓRICO DE RETENCIONES */}
      {insights.totalMuestras > 0 && (
        <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md p-6">
          <div className="flex items-center gap-2 mb-4">
            <TrendingDown className="w-5 h-5 text-red-400" />
            <h2 className="text-lg font-bold text-white">Análisis Cobrado vs Retenido</h2>
            <span className="text-xs px-2 py-0.5 rounded-full bg-white/5 text-slate-400 border border-white/10">
              {insights.totalMuestras} {insights.totalMuestras === 1 ? 'actividad' : 'actividades'}
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20">
              <div className="text-xs text-slate-400 mb-1">Retenido total</div>
              <div className="text-2xl font-bold text-red-400">
                {COP.format(insights.muestras.reduce((s, m) => s + Number(m.retencion ?? 0), 0))}
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">Valor Cotizado - Llegó al Banco</div>
            </div>
            <div className="p-3 rounded-xl bg-white/5 border border-white/10">
              <div className="text-xs text-slate-400 mb-1">Retención promedio</div>
              <div className="text-lg font-bold text-slate-300">{(insights.promedioPct ?? 0).toFixed(2)}%</div>
            </div>
            <div className="p-3 rounded-xl bg-white/5 border border-white/10">
              <div className="text-xs text-slate-400 mb-1">Actividades con retención</div>
              <div className="text-lg font-bold text-slate-300">
                {insights.muestras.filter((m) => Number(m.retencion ?? 0) > 0).length}
              </div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="border-b border-white/10 text-slate-400 uppercase">
                <tr>
                  <th className="pb-2 pr-4 text-right">Valor Cotizado</th>
                  <th className="pb-2 pr-4 text-right">Llegó al banco</th>
                  <th className="pb-2 pr-4 text-right">Retenido</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {insights.muestras.map((m, i) => (
                  <tr key={i} className="hover:bg-white/5">
                    <td className="py-2 pr-4 text-right tabular-nums text-slate-400">
                      <div>{COP.format(m.cotizado)}</div>
                      <div className="text-[10px] text-slate-500 normal-case">{m.actividad}</div>
                    </td>
                    <td className="py-2 pr-4 text-right tabular-nums text-emerald-400">{COP.format(m.banco)}</td>
                    <td className={`py-2 pr-4 text-right tabular-nums ${m.retencion >= 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                      {m.retencion >= 0 ? '− ' : '+ '}{COP.format(Math.abs(m.retencion))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[10px] text-slate-500 mt-3 leading-relaxed">
            La retención se calcula por actividad agrupada, no por recibo individual.
            Fórmula aplicada en cada fila: Retenido = Valor Cotizado - Llegó al Banco.
            En este panel, Llegó al Banco solo suma abonos OPERATIVOS de tipo PAGO_UNIDAD.
          </p>
        </div>
      )}

      {/* SECTION C & D: COSTOS Y PASIVOS */}
      <ItemsManager 
        actividadId={actividadId} 
        itemsCotizados={itemsCotizados} 
        costos={costos} 
        cuentas={cuentas}
        totalAbonosOperativo={totalAbonosOperativo}
        deudas={deudas ?? []}
        grupos={grupos ?? []}
      />

      <ReembolsosManager 
        actividadId={actividadId}
        reembolsos={reembolsos}
      />

      {/* SECTION E: DEVOLUCIONES */}
      <DevolucionesManager 
        actividadId={actividadId} 
        devoluciones={devoluciones} 
        deudas={deudas ?? []}
        pendientes={actividad.devoluciones_pendientes_unidad}
        itemsCotizados={itemsCotizados}
        reembolsos={reembolsos}
        cuentas={cuentas}
      />

      {/* SECTION F: GALERÍA DE COMPROBANTES */}
      <GaleriaComprobantes
        requerimientoId={actividadId}
        initialSoportes={soportes}
      />
    </div>
  )
}

function ItemsManager({ actividadId, itemsCotizados, costos, cuentas, totalAbonosOperativo, deudas, grupos }: any) {
  const router = useRouter()
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingCostoId, setEditingCostoId] = useState<string | null>(null)
  const [selectedItem, setSelectedItem] = useState<any | null>(null)
  const [modoValor, setModoValor] = useState<'UNITARIO' | 'TOTAL'>('UNITARIO')
  const [cantidad, setCantidad] = useState('1')
  const [valor, setValor] = useState('')
  const [costoPagado, setCostoPagado] = useState(false)
  const [cuentaOrigenId, setCuentaOrigenId] = useState('')
  const [concepto, setConcepto] = useState('')
  const [observaciones, setObservaciones] = useState('')
  const [justificacionCantidad, setJustificacionCantidad] = useState('')
  const [errorModal, setErrorModal] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // ── Estado para grupos de costos ──────────────────────────────────────────
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set())
  const [grupoModalOpen, setGrupoModalOpen] = useState(false)
  const [editingGrupoId, setEditingGrupoId] = useState<string | null>(null)
  const [grupoNombre, setGrupoNombre] = useState('')
  const [grupoMontoStr, setGrupoMontoStr] = useState('')
  const [grupoItemsIds, setGrupoItemsIds] = useState<Set<string>>(new Set())
  const [grupoError, setGrupoError] = useState<string | null>(null)
  const [grupoPending, startGrupoTransition] = useTransition()
  const [expandedGrupoId, setExpandedGrupoId] = useState<string | null>(null)

  // ── Estado para pagos de grupo ─────────────────────────────────────────────
  const [pagoGrupoModalOpen, setPagoGrupoModalOpen] = useState(false)
  const [selectedGrupo, setSelectedGrupo] = useState<any | null>(null)
  const [editingPagoId, setEditingPagoId] = useState<string | null>(null)
  const [pagoDesc, setPagoDesc] = useState('')
  const [pagoMontoStr, setPagoMontoStr] = useState('')
  const [pagoPagado, setPagoPagado] = useState(false)
  const [pagoCuentaId, setPagoCuentaId] = useState('')
  const [pagoObs, setPagoObs] = useState('')
  const [pagoError, setPagoError] = useState<string | null>(null)
  const [pagoPending, startPagoTransition] = useTransition()

  // Modal de devolución parcial
  const [devModalOpen, setDevModalOpen] = useState(false)
  const [devSelectedItem, setDevSelectedItem] = useState<any | null>(null)
  const [devCantidad, setDevCantidad] = useState('1')
  const [devMotivo, setDevMotivo] = useState('')
  const [devError, setDevError] = useState<string | null>(null)
  const [devPending, startDevTransition] = useTransition()

  // Estado para modal de fondos insuficientes
  const [showFondosModal, setShowFondosModal] = useState(false)
  const [fondosError, setFondosError] = useState<{ saldoActual: number; montoRequerido: number; deficit: number; cuentaId: string } | null>(null)
  const [costoEnPagoId, setCostoEnPagoId] = useState<string | null>(null)
  const [cuentaOrigenActual, setCuentaOrigenActual] = useState<any>(null)
  const [cuentaOrigenForzada, setCuentaOrigenForzada] = useState<string | null>(null)
  // Input pendiente cuando falla al GUARDAR un costo nuevo por saldo insuficiente
  const [pendingCostoInput, setPendingCostoInput] = useState<Parameters<typeof registrarCostoReal>[0] | null>(null)

  const cuentaProyecto = useMemo(() => cuentas.find((c: any) => c.tipo === 'PROYECTO' && c.requerimiento_id === actividadId) ?? null, [cuentas, actividadId])
  const cuentaGeneral = useMemo(() => cuentas.find((c: any) => c.tipo === 'GENERAL') ?? null, [cuentas])
  const cuentasSeleccionables = useMemo(() => {
    const orden = ['GENERAL', 'PROYECTO', 'SOCIO']
    return [...cuentas].sort((a: any, b: any) => orden.indexOf(a.tipo) - orden.indexOf(b.tipo))
  }, [cuentas])
  const defaultCuentaOrigenId = cuentaProyecto?.id ?? cuentaGeneral?.id ?? cuentasSeleccionables[0]?.id ?? ''

  function resolverPagador(cuentaId: string | null): 'jero' | 'socio' | 'caja_proyecto' {
    const cuenta = cuentaId ? cuentas.find((item: any) => item.id === cuentaId) : null
    if (!cuenta) return 'caja_proyecto'
    return cuenta.tipo === 'SOCIO' ? 'socio' : 'caja_proyecto'
  }

  const costosPorItem = useMemo(() => {
    const map = new Map<string, any[]>()
    for (const costo of costos) {
      const key = costo.item_id ?? '__sin_item__'
      map.set(key, [...(map.get(key) ?? []), costo])
    }
    return map
  }, [costos])

  const deudasPorItem = useMemo(() => {
    const map = new Map<string, any[]>()
    for (const d of (deudas ?? [])) {
      if (!d.item_origen_id) continue
      const key = d.item_origen_id
      map.set(key, [...(map.get(key) ?? []), d])
    }
    return map
  }, [deudas])

  const itemIdsVigentes = useMemo(() => new Set((itemsCotizados ?? []).map((item: any) => String(item.id))), [itemsCotizados])

  function abrirModalDevolucion(it: any) {
    setDevSelectedItem(it)
    setDevCantidad('1')
    setDevMotivo('')
    setDevError(null)
    setDevModalOpen(true)
  }

  async function handleRegistrarDevolucion(e: React.FormEvent) {
    e.preventDefault()
    if (!devSelectedItem) return
    const cantNum = Number(devCantidad)
    if (!cantNum || cantNum <= 0) { setDevError('La cantidad debe ser mayor a cero.'); return }
    const maxCantidad = Number(devSelectedItem.cantidad ?? 1)
    if (cantNum > maxCantidad) { setDevError(`No puede superar la cantidad cotizada (${maxCantidad}).`); return }
    if (!devMotivo.trim()) { setDevError('Debes indicar el motivo de la devolución.'); return }

    const monto = cantNum * Number(devSelectedItem.precio_unitario ?? 0)
    if (monto <= 0) { setDevError('El valor unitario del ítem es cero. No se puede registrar deuda.'); return }

    const tipo = devSelectedItem.tipo_rubro === 'OPERATIVO' ? 'OPERATIVO' : 'TERCERO'
    setDevError(null)
    startDevTransition(async () => {
      try {
        await registrarDeudaDevolucion(actividadId, devSelectedItem.id, cantNum, monto, tipo, devMotivo.trim())
        setDevModalOpen(false)
        setDevSelectedItem(null)
        router.refresh()
      } catch (err) {
        setDevError(err instanceof Error ? err.message : 'Error al registrar la devolución')
      }
    })
  }

  const totalCostos = useMemo(() => calcularTotalCostosRegistrados(costos, itemIdsVigentes), [costos, itemIdsVigentes])
  const costosHuerfanos = useMemo(() => contarCostosHuerfanos(costos, itemIdsVigentes), [costos, itemIdsVigentes])

  function abrirModalNuevo(item: any) {
    const cantidadBase = Number(item?.cantidad ?? 1)
    const precioBase = Number(item?.precio_unitario ?? 0)
    setEditingCostoId(null)
    setSelectedItem(item)
    setModoValor('UNITARIO')
    setCantidad(String(cantidadBase))
    setValor(String(precioBase || 0))
    setCostoPagado(false)
    setCuentaOrigenId(defaultCuentaOrigenId)
    setConcepto(item?.descripcion ?? '')
    setObservaciones('')
    setJustificacionCantidad('')
    setErrorModal(null)
    setModalOpen(true)
  }

  function abrirModalEdicion(item: any, costo: any) {
    const cantidadCosto = Number(costo.cantidad ?? 1)
    const totalCosto = Number(costo.monto ?? 0)
    const precioUnitario = costo.precio_unitario != null ? Number(costo.precio_unitario) : (cantidadCosto > 0 ? totalCosto / cantidadCosto : totalCosto)
    setEditingCostoId(costo.id)
    setSelectedItem(item)
    setModoValor((costo.modo_registro ?? 'por_item') !== 'por_item' ? 'TOTAL' : 'UNITARIO')
    setCantidad(String(cantidadCosto))
    setValor(String((costo.modo_registro ?? 'por_item') !== 'por_item' ? totalCosto : precioUnitario))
    setCostoPagado(String(costo.estado_pago ?? 'PENDIENTE') === 'PAGADO')
    setCuentaOrigenId(costo.cuenta_origen_id ?? defaultCuentaOrigenId)
    setConcepto(costo.concepto ?? item?.descripcion ?? '')
    setObservaciones(costo.observaciones ?? '')
    setJustificacionCantidad('')
    setErrorModal(null)
    setModalOpen(true)
  }

  function cerrarModal() {
    setModalOpen(false)
    setEditingCostoId(null)
    setSelectedItem(null)
    setErrorModal(null)
  }

  async function handleGuardarCosto(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedItem) return

    const cantidadNum = Number(cantidad)
    const valorNum = Number(valor)
    if (!cantidadNum || cantidadNum <= 0) {
      setErrorModal('La cantidad es obligatoria y debe ser mayor a cero.')
      return
    }
    if (!valorNum || valorNum <= 0) {
      setErrorModal(modoValor === 'UNITARIO' ? 'El valor unitario debe ser mayor a cero.' : 'El valor total debe ser mayor a cero.')
      return
    }

    const cantidadCotizada = Number(selectedItem.cantidad ?? 1)
    const cantidadDiferente = cantidadNum !== cantidadCotizada
    if (cantidadDiferente && !justificacionCantidad.trim()) {
      setErrorModal('La cantidad del costo es distinta a la cotizada. Debes indicar la razón.')
      return
    }

    const observacionesFinales = [
      observaciones.trim(),
      cantidadDiferente ? `Verificación de cantidad: ${justificacionCantidad.trim()}` : null,
    ].filter(Boolean).join(' · ')

    setErrorModal(null)
    startTransition(async () => {
      const inputCosto = {
        costoId: editingCostoId,
        actividadId,
        itemId: selectedItem.id,
        descripcion: selectedItem.descripcion,
        modo: modoValor,
        cantidad: cantidadNum,
        valor: valorNum,
        cuentaOrigenId: costoPagado ? (cuentaOrigenId || defaultCuentaOrigenId) : null,
        estadoPago: costoPagado ? 'PAGADO' : 'PENDIENTE',
        observaciones: observacionesFinales || null,
        concepto: concepto.trim() || selectedItem.descripcion,
        pagador: resolverPagador(costoPagado ? (cuentaOrigenId || defaultCuentaOrigenId) : null),
      } as Parameters<typeof registrarCostoReal>[0]
      try {
        await registrarCostoReal(inputCosto)
        cerrarModal()
        router.refresh()
      } catch (err) {
        const mensaje = err instanceof Error ? err.message : 'Error al guardar el costo'
        if (mensaje.startsWith('SALDO_INSUFICIENTE|')) {
          try {
            const errorData = JSON.parse(mensaje.replace('SALDO_INSUFICIENTE|', ''))
            const cuentaOrig = cuentas.find((c: any) => c.id === errorData.cuentaId)
            setFondosError(errorData)
            setCuentaOrigenActual(cuentaOrig)
            setCuentaOrigenForzada(null)
            setCostoEnPagoId(null)
            setPendingCostoInput(inputCosto)
            setShowFondosModal(true)
          } catch {
            setErrorModal('Fondos insuficientes. Por favor, cambia la cuenta de origen o inyecta capital.')
          }
        } else {
          setErrorModal(mensaje)
        }
      }
    })
  }

  async function handleTogglePago(costo: any, checked: boolean) {
    const siguienteEstado = checked ? 'PAGADO' : 'PENDIENTE'
    const origen = costo.cuenta_origen_id ?? defaultCuentaOrigenId
    if (!checked && costo.estado_pago === 'PAGADO') {
      const ok = confirm('¿Desmarcar este costo como pagado? El movimiento se anulará, pero el costo permanecerá registrado.')
      if (!ok) return
    }

    try {
      await cambiarEstadoPagoCosto(costo.id, actividadId, siguienteEstado, checked ? origen : costo.cuenta_origen_id ?? origen)
      router.refresh()
    } catch (err) {
      const mensaje = err instanceof Error ? err.message : 'No se pudo actualizar el pago del costo'
      
      // Detectar error de fondos insuficientes
      if (mensaje.startsWith('SALDO_INSUFICIENTE|')) {
        try {
          const errorData = JSON.parse(mensaje.replace('SALDO_INSUFICIENTE|', ''))
          const cuentaOrig = cuentas.find((c: any) => c.id === errorData.cuentaId)
          setFondosError(errorData)
          setCuentaOrigenActual(cuentaOrig)
          setCuentaOrigenForzada(null)
          setCostoEnPagoId(costo.id)
          setShowFondosModal(true)
        } catch (parseErr) {
          alert('Fondos insuficientes en la cuenta. Por favor, inyecta capital o cambia de cuenta.')
        }
      } else {
        alert(mensaje)
      }
    }
  }

  async function handleFondosResuelto(data?: { cuentaOrigenId?: string }) {
    if (!costoEnPagoId && !pendingCostoInput) return

    const cuentaFinal = data?.cuentaOrigenId ?? cuentaOrigenForzada ?? cuentaOrigenActual?.id ?? defaultCuentaOrigenId

    try {
      if (pendingCostoInput) {
        // Caso: se falló al guardar un costo nuevo; reintentar con la nueva cuenta
        await registrarCostoReal({ ...pendingCostoInput, cuentaOrigenId: cuentaFinal })
        setShowFondosModal(false)
        setPendingCostoInput(null)
        setFondosError(null)
        setCuentaOrigenActual(null)
        setCuentaOrigenForzada(null)
        cerrarModal()
        router.refresh()
      } else {
        // Caso: fallo al hacer toggle de pago en un costo existente
        await cambiarEstadoPagoCosto(costoEnPagoId!, actividadId, 'PAGADO', cuentaFinal)
        setShowFondosModal(false)
        setCostoEnPagoId(null)
        setFondosError(null)
        setCuentaOrigenActual(null)
        setCuentaOrigenForzada(null)
        router.refresh()
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'No se pudo completar el auto-pago')
    }
  }

  async function handleEliminarCosto(costo: any) {
    const ok = confirm('¿Eliminar este costo? Si ya tenía movimiento asociado, se anulará.')
    if (!ok) return
    try {
      await eliminarCostoReal(costo.id, actividadId)
      router.refresh()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'No se pudo eliminar el costo')
    }
  }

  // ── Handlers para grupos de costos ────────────────────────────────────────
  const PREDEFINED_GRUPO_NOMBRES = [
    'Alimentación',
    'Transporte',
    'Hospedaje',
    'Material de apoyo',
    'Servicios técnicos',
    'Honorarios',
    'Comunicaciones',
    'Impresión y papelería',
    'Insumos de campo',
    'Logística general',
  ]

  function toggleItemSelection(itemId: string) {
    setSelectedItemIds(prev => {
      const next = new Set(prev)
      if (next.has(itemId)) next.delete(itemId)
      else next.add(itemId)
      return next
    })
  }

  function abrirModalNuevoGrupo() {
    setEditingGrupoId(null)
    setGrupoNombre('')
    setGrupoMontoStr('')
    setGrupoItemsIds(new Set(selectedItemIds))
    setGrupoError(null)
    setGrupoModalOpen(true)
  }

  function abrirModalEditarGrupo(grupo: any) {
    setEditingGrupoId(grupo.id)
    setGrupoNombre(grupo.nombre)
    setGrupoMontoStr(String(grupo.monto_total))
    setGrupoItemsIds(new Set(grupo.items_ids as string[]))
    setGrupoError(null)
    setGrupoModalOpen(true)
  }

  function cerrarGrupoModal() {
    setGrupoModalOpen(false)
    setEditingGrupoId(null)
    setGrupoError(null)
  }

  function toggleGrupoItem(itemId: string) {
    setGrupoItemsIds(prev => {
      const next = new Set(prev)
      if (next.has(itemId)) next.delete(itemId)
      else next.add(itemId)
      return next
    })
  }

  async function handleGuardarGrupo(e: React.FormEvent) {
    e.preventDefault()
    const montoNum = Number(grupoMontoStr)
    if (!grupoNombre.trim()) { setGrupoError('El nombre del grupo es obligatorio.'); return }
    if (!montoNum || montoNum <= 0) { setGrupoError('El monto del grupo debe ser mayor a cero.'); return }
    if (grupoItemsIds.size === 0) { setGrupoError('Selecciona al menos un ítem para el grupo.'); return }
    setGrupoError(null)
    startGrupoTransition(async () => {
      try {
        const input = { nombre: grupoNombre.trim(), montoTotal: montoNum, itemsIds: Array.from(grupoItemsIds) }
        if (editingGrupoId) {
          await actualizarGrupoCostos(editingGrupoId, actividadId, input)
        } else {
          await crearGrupoCostos(actividadId, input)
          setSelectedItemIds(new Set())
        }
        cerrarGrupoModal()
        router.refresh()
      } catch (err) {
        setGrupoError(err instanceof Error ? err.message : 'Error al guardar el grupo')
      }
    })
  }

  async function handleEliminarGrupo(grupoId: string) {
    if (!confirm('¿Eliminar este grupo? Los ítems individuales no se verán afectados.')) return
    try {
      await eliminarGrupoCostos(grupoId, actividadId)
      router.refresh()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'No se pudo eliminar el grupo')
    }
  }

  // ── Handlers de pagos de grupo ─────────────────────────────────────────────
  function abrirModalNuevoPagoGrupo(grupo: any) {
    setSelectedGrupo(grupo)
    setEditingPagoId(null)
    setPagoDesc(grupo.nombre)
    setPagoMontoStr('')
    setPagoPagado(false)
    setPagoCuentaId(defaultCuentaOrigenId)
    setPagoObs('')
    setPagoError(null)
    setPagoGrupoModalOpen(true)
  }

  function abrirModalEditarPagoGrupo(grupo: any, pago: any) {
    setSelectedGrupo(grupo)
    setEditingPagoId(pago.id)
    setPagoDesc(pago.descripcion ?? grupo.nombre)
    setPagoMontoStr(String(pago.monto))
    setPagoPagado(pago.estado_pago === 'PAGADO')
    setPagoCuentaId(pago.cuenta_origen_id ?? defaultCuentaOrigenId)
    setPagoObs(pago.observaciones ?? '')
    setPagoError(null)
    setPagoGrupoModalOpen(true)
  }

  function cerrarPagoGrupoModal() {
    setPagoGrupoModalOpen(false)
    setSelectedGrupo(null)
    setEditingPagoId(null)
    setPagoError(null)
  }

  async function handleGuardarPagoGrupo(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedGrupo) return
    const montoNum = Number(pagoMontoStr)
    if (!pagoDesc.trim()) { setPagoError('La descripción es obligatoria.'); return }
    if (!montoNum || montoNum <= 0) { setPagoError('El monto debe ser mayor a cero.'); return }
    setPagoError(null)
    startPagoTransition(async () => {
      try {
        await registrarPagoGrupo({
          pagoId: editingPagoId,
          grupoId: selectedGrupo.id,
          actividadId,
          descripcion: pagoDesc.trim(),
          monto: montoNum,
          cuentaOrigenId: pagoPagado ? (pagoCuentaId || defaultCuentaOrigenId) : null,
          estadoPago: pagoPagado ? 'PAGADO' : 'PENDIENTE',
          pagador: resolverPagador(pagoPagado ? (pagoCuentaId || defaultCuentaOrigenId) : null),
          observaciones: pagoObs.trim() || null,
        })
        cerrarPagoGrupoModal()
        router.refresh()
      } catch (err) {
        setPagoError(err instanceof Error ? err.message : 'Error al guardar el pago')
      }
    })
  }

  async function handleEliminarPagoGrupo(pagoId: string) {
    if (!confirm('¿Eliminar este pago? Si ya tenía movimiento asociado, se anulará.')) return
    try {
      await eliminarPagoGrupo(pagoId, actividadId)
      router.refresh()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'No se pudo eliminar el pago')
    }
  }

  async function handleCancelarItem(item: any) {
    if (confirm(`Cancelar el item "${item.descripcion}". Se marcará como cancelado.`)) {
      await marcarItemEstado(item.id, actividadId, 'CANCELADO')
      router.refresh()
    }
  }

  async function handleReactivarItem(item: any) {
    if (confirm(`Reactivar "${item.descripcion}"? Podrás volver a registrar costos.`)) {
      await marcarItemEstado(item.id, actividadId, 'EJECUTADO')
      router.refresh()
    }
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md p-6">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-lg font-bold text-white">Cruce de Costos vs Cotización</h2>
          <p className="text-xs text-slate-400 mt-1">Carga costos desde un modal sin bajar la tabla. Cada ítem puede tener varios costos y cada costo se puede editar o anular.</p>
        </div>
        <div className="flex items-center gap-2">
          {selectedItemIds.size > 0 && (
            <button
              onClick={abrirModalNuevoGrupo}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-violet-500/20 text-violet-300 hover:bg-violet-500/30 text-xs font-semibold transition-colors"
            >
              <Layers className="size-4" /> Agrupar {selectedItemIds.size} ítem{selectedItemIds.size === 1 ? '' : 's'}
            </button>
          )}
          <button
            onClick={() => itemsCotizados[0] && abrirModalNuevo(itemsCotizados[0])}
            disabled={itemsCotizados.length === 0}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30 text-xs font-semibold transition-colors"
          >
            <Plus className="size-4" /> Nuevo costo
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-3 mb-5">
        <div className="p-4 rounded-xl bg-white/5 border border-white/10">
          <div className="text-xs text-slate-400">Presupuesto cotizado</div>
          <div className="text-lg font-bold text-slate-100 tabular-nums">{COP.format(itemsCotizados.reduce((acc: number, it: any) => acc + Number(it.cantidad) * Number(it.precio_unitario), 0))}</div>
        </div>
        <div className="p-4 rounded-xl bg-white/5 border border-white/10">
          <div className="text-xs text-slate-400">Abono operativo</div>
          <div className="text-lg font-bold text-sky-400 tabular-nums">{COP.format(totalAbonosOperativo)}</div>
        </div>
        <div className="p-4 rounded-xl bg-white/5 border border-white/10">
          <div className="text-xs text-slate-400">Costos registrados</div>
          <div className="text-lg font-bold text-orange-400 tabular-nums">{COP.format(totalCostos)}</div>
          {costosHuerfanos > 0 && (
            <div className="text-[10px] text-amber-300 mt-1">
              {costosHuerfanos} costo{costosHuerfanos === 1 ? '' : 's'} de ítems antiguos no se cuentan.
            </div>
          )}
        </div>
        <div className="p-4 rounded-xl bg-white/5 border border-white/10">
          <div className="text-xs text-slate-400">Utilidad estimada</div>
          <div className={`text-lg font-bold tabular-nums ${totalAbonosOperativo - totalCostos >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {COP.format(totalAbonosOperativo - totalCostos)}
          </div>
        </div>
        <div className="p-4 rounded-xl bg-white/5 border border-white/10">
          <div className="text-xs text-slate-400">Margen global</div>
          <div className="text-lg font-bold text-indigo-300 tabular-nums">
            {(() => {
              const utilidad = totalAbonosOperativo - totalCostos
              return totalAbonosOperativo > 0 ? `${((utilidad / totalAbonosOperativo) * 100).toFixed(1)}%` : '0%'
            })()}
          </div>
        </div>
      </div>

      {/* ── GRUPOS DE COSTOS ──────────────────────────────────────────── */}
      {(grupos ?? []).length > 0 && (
        <div className="mb-5 space-y-2">
          <div className="flex items-center gap-2 mb-3">
            <Layers className="size-4 text-violet-400" />
            <h3 className="text-sm font-bold text-white">Grupos de Costos</h3>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-300 border border-violet-500/20">
              {(grupos ?? []).length} grupo{(grupos ?? []).length === 1 ? '' : 's'}
            </span>
          </div>
          {(grupos ?? []).map((grupo: any) => {
            const itemsDelGrupo = itemsCotizados.filter((it: any) => (grupo.items_ids as string[]).includes(it.id))
            const sumaCotizadoGrupo = itemsDelGrupo.reduce((acc: number, it: any) => acc + Number(it.cantidad) * Number(it.precio_unitario), 0)
            const montoGrupo = Number(grupo.monto_total ?? 0)
            const diferencia = sumaCotizadoGrupo - montoGrupo
            const expandedG = expandedGrupoId === grupo.id
            const pagosGrupo = costos.filter((c: any) => c.grupo_id === grupo.id)
            const totalPagadoGrupo = pagosGrupo.filter((c: any) => c.estado_pago === 'PAGADO').reduce((acc: number, c: any) => acc + Number(c.monto), 0)
            const totalRegistradoGrupo = pagosGrupo.reduce((acc: number, c: any) => acc + Number(c.monto), 0)

            return (
              <div key={grupo.id} className="rounded-xl border border-violet-500/20 bg-violet-500/5">
                <div className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <button
                      onClick={() => setExpandedGrupoId(expandedG ? null : grupo.id)}
                      className="text-slate-400 hover:text-white transition-colors shrink-0"
                    >
                      {expandedG ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                    </button>
                    <div className="min-w-0">
                      <div className="font-semibold text-violet-200 text-sm truncate">{grupo.nombre}</div>
                      <div className="text-[10px] text-slate-500 mt-0.5 flex items-center gap-2">
                        <span>{itemsDelGrupo.length} ítem{itemsDelGrupo.length === 1 ? '' : 's'} · Cotizado: {COP.format(sumaCotizadoGrupo)}</span>
                        {pagosGrupo.length > 0 && (
                          <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-semibold ${totalPagadoGrupo >= montoGrupo ? 'bg-emerald-500/20 text-emerald-300' : 'bg-orange-500/20 text-orange-300'}`}>
                            {pagosGrupo.length} pago{pagosGrupo.length === 1 ? '' : 's'} · {COP.format(totalRegistradoGrupo)} reg.
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <div className="text-xs text-slate-400">Presupuesto</div>
                      <div className="font-bold text-violet-300 tabular-nums text-sm">{COP.format(montoGrupo)}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-slate-400">Pagado</div>
                      <div className={`font-bold tabular-nums text-sm ${totalPagadoGrupo > 0 ? 'text-orange-400' : 'text-slate-500'}`}>{COP.format(totalPagadoGrupo)}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-slate-400">Diferencia</div>
                      <div className={`font-bold tabular-nums text-sm ${diferencia >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {diferencia >= 0 ? '+' : ''}{COP.format(diferencia)}
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => abrirModalNuevoPagoGrupo(grupo)}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded bg-orange-500/20 text-orange-300 hover:bg-orange-500/30 text-[10px] font-semibold transition-colors"
                        title="Registrar pago"
                      >
                        <Plus className="size-3" /> Pago
                      </button>
                      <button
                        onClick={() => abrirModalEditarGrupo(grupo)}
                        className="p-1.5 hover:bg-white/10 rounded text-slate-400 hover:text-white transition-colors"
                        title="Editar grupo"
                      >
                        <Pencil className="size-3.5" />
                      </button>
                      <button
                        onClick={() => handleEliminarGrupo(grupo.id)}
                        className="p-1.5 hover:bg-red-500/20 rounded text-slate-400 hover:text-red-400 transition-colors"
                        title="Eliminar grupo"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </div>
                </div>

                {expandedG && (
                  <div className="border-t border-violet-500/20 px-4 py-3 space-y-3">
                    {/* Ítems del grupo */}
                    {itemsDelGrupo.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Ítems agrupados</p>
                        {itemsDelGrupo.map((it: any) => (
                          <div key={it.id} className="flex justify-between items-center text-xs text-slate-300 pl-4 border-l-2 border-violet-500/30">
                            <span className="truncate">{it.descripcion}</span>
                            <span className="tabular-nums text-slate-400 shrink-0 ml-4">{COP.format(Number(it.cantidad) * Number(it.precio_unitario))}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Pagos registrados del grupo */}
                    {pagosGrupo.length > 0 && (
                      <div className="space-y-1.5">
                        <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Pagos registrados</p>
                        {pagosGrupo.map((pago: any) => (
                          <div key={pago.id} className="flex items-center justify-between gap-2 pl-4 border-l-2 border-orange-500/30 text-xs">
                            <div className="min-w-0">
                              <span className="text-slate-300 truncate block">{pago.descripcion || grupo.nombre}</span>
                              {pago.observaciones && <span className="text-slate-500 text-[10px]">{pago.observaciones}</span>}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-semibold ${pago.estado_pago === 'PAGADO' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-yellow-500/20 text-yellow-300'}`}>
                                {pago.estado_pago}
                              </span>
                              <span className="font-bold tabular-nums text-orange-400">{COP.format(Number(pago.monto))}</span>
                              <button
                                onClick={() => abrirModalEditarPagoGrupo(grupo, pago)}
                                className="p-1 hover:bg-white/10 rounded text-slate-500 hover:text-white transition-colors"
                              >
                                <Pencil className="size-3" />
                              </button>
                              <button
                                onClick={() => handleEliminarPagoGrupo(pago.id)}
                                className="p-1 hover:bg-red-500/20 rounded text-slate-500 hover:text-red-400 transition-colors"
                              >
                                <Trash2 className="size-3" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {pagosGrupo.length === 0 && itemsDelGrupo.length === 0 && (
                      <p className="text-xs text-slate-500">No se encontraron ítems ni pagos.</p>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="bg-white/5 border-b border-white/10 text-xs uppercase text-slate-400">
            <tr>
              <th className="px-3 py-3">
                <input
                  type="checkbox"
                  checked={selectedItemIds.size === itemsCotizados.length && itemsCotizados.length > 0}
                  onChange={e => {
                    if (e.target.checked) setSelectedItemIds(new Set(itemsCotizados.map((it: any) => it.id)))
                    else setSelectedItemIds(new Set())
                  }}
                  className="accent-violet-500"
                  title="Seleccionar todos"
                />
              </th>
              <th className="px-4 py-3">Item</th>
              <th className="px-4 py-3 text-right">Cantidad cotizada</th>
              <th className="px-4 py-3 text-right">Valor unitario</th>
              <th className="px-4 py-3 text-right">Presupuesto</th>
              <th className="px-4 py-3 text-right">Cantidad costo</th>
              <th className="px-4 py-3 text-right">Costo unitario</th>
              <th className="px-4 py-3 text-right">Costo total</th>
              <th className="px-4 py-3 text-right">Utilidad</th>
              <th className="px-4 py-3 text-right">Ganancia</th>
              <th className="px-4 py-3 text-center">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {itemsCotizados.map((it: any) => {
              const itemCostos = costosPorItem.get(it.id) ?? []
              const sumCostos = itemCostos.reduce((acc: number, c: any) => acc + Number(c.monto ?? 0), 0)
              const cantidadCosto = itemCostos.reduce((acc: number, c: any) => acc + Number(c.cantidad ?? 1), 0)
              const costoUnitarioProm = cantidadCosto > 0 ? sumCostos / cantidadCosto : 0
              const presupuesto = Number(it.cantidad) * Number(it.precio_unitario)
              const utilidad = presupuesto - sumCostos
              const gananciaPct = presupuesto > 0 ? (utilidad / presupuesto) * 100 : 0
              const expanded = expandedItemId === it.id

              return (
                <Fragment key={it.id}>
                  <tr className={`hover:bg-white/5 align-top ${selectedItemIds.has(it.id) ? 'bg-violet-500/5' : ''}`}>
                    <td className="px-3 py-3">
                      <input
                        type="checkbox"
                        checked={selectedItemIds.has(it.id)}
                        onChange={() => toggleItemSelection(it.id)}
                        className="accent-violet-500"
                      />
                    </td>
                    <td className="px-4 py-3 text-slate-200">
                      <div className="font-semibold">{it.descripcion}</div>
                      <div className="mt-1 flex items-center gap-2 text-[10px] text-slate-500">
                        <span className={`px-2 py-0.5 rounded-full ${it.tipo_rubro === 'OPERATIVO' ? 'bg-indigo-500/20 text-indigo-300' : 'bg-fuchsia-500/20 text-fuchsia-300'}`}>
                          {it.tipo_rubro}
                        </span>
                        {it.estado_ejecucion === 'CANCELADO' && <span className="px-2 py-0.5 rounded-full bg-red-500/20 text-red-300">CANCELADO</span>}
                        {(grupos ?? []).some((g: any) => (g.items_ids as string[]).includes(it.id)) && (
                          <span className="px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-300 inline-flex items-center gap-1">
                            <Layers className="size-2.5" /> en grupo
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{Number(it.cantidad).toLocaleString('es-CO')}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{COP.format(Number(it.precio_unitario))}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold">{COP.format(presupuesto)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-orange-300">{cantidadCosto > 0 ? Number(cantidadCosto).toLocaleString('es-CO') : '-'}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-orange-300">{cantidadCosto > 0 ? COP.format(costoUnitarioProm) : '-'}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-orange-400 font-semibold">{sumCostos > 0 ? COP.format(sumCostos) : '-'}</td>
                    <td className={`px-4 py-3 text-right tabular-nums font-semibold ${utilidad >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{COP.format(utilidad)}</td>
                    <td className={`px-4 py-3 text-right tabular-nums font-semibold ${gananciaPct >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>{presupuesto > 0 ? `${gananciaPct.toFixed(1)}%` : '0%'}</td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex justify-center gap-2">
                        <button
                          onClick={() => expanded ? setExpandedItemId(null) : setExpandedItemId(it.id)}
                          className="px-2 py-1 bg-white/10 hover:bg-white/20 rounded text-xs transition-colors inline-flex items-center gap-1"
                        >
                          {expanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                          Costos
                        </button>
                        {it.estado_ejecucion === 'CANCELADO' ? (
                          <button
                            onClick={() => handleReactivarItem(it)}
                            className="px-2 py-1 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 rounded text-xs transition-colors"
                          >
                            Reactivar
                          </button>
                        ) : (
                          <>
                            <button
                              onClick={() => abrirModalNuevo(it)}
                              className="px-2 py-1 bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 rounded text-xs transition-colors"
                            >
                              + Costo
                            </button>
                            <button
                              onClick={() => abrirModalDevolucion(it)}
                              title="Registrar cantidad no ejecutada que debe devolverse a la Unidad"
                              className="px-2 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 rounded text-xs transition-colors"
                            >
                              + Devolución
                            </button>
                            <button
                              onClick={() => handleCancelarItem(it)}
                              className="px-2 py-1 bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded text-xs transition-colors"
                            >
                              Cancelar
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                  {expanded && (
                    <tr key={`${it.id}-detail`} className="bg-white/5">
                      <td colSpan={11} className="px-4 py-4">
                        <div className="space-y-3">
                          <div className="flex items-center justify-between gap-3">
                            <h3 className="text-sm font-semibold text-white">Costos de {it.descripcion}</h3>
                            <span className="text-[10px] text-slate-400">{itemCostos.length} registro{itemCostos.length === 1 ? '' : 's'}</span>
                          </div>
                          {itemCostos.length === 0 ? (
                            <div className="rounded-xl border border-dashed border-white/10 px-4 py-4 text-sm text-slate-500">
                              No hay costos registrados para este ítem.
                            </div>
                          ) : (
                            <div className="space-y-2">
                              {itemCostos.map((costo: any) => {
                                const cantidadCostoRow = Number(costo.cantidad ?? 1)
                                const unitarioCostoRow = costo.precio_unitario != null ? Number(costo.precio_unitario) : (cantidadCostoRow > 0 ? Number(costo.monto ?? 0) / cantidadCostoRow : Number(costo.monto ?? 0))
                                const costoTotalRow = Number(costo.monto ?? 0)
                                const pagoActivo = String(costo.estado_pago ?? 'PENDIENTE') === 'PAGADO'
                                const cuentaFuente = cuentas.find((cuenta: any) => cuenta.id === costo.cuenta_origen_id)
                                return (
                                  <div key={costo.id} className="rounded-xl border border-white/10 bg-black/10 px-4 py-3">
                                    <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${pagoActivo ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'}`}>
                                            {pagoActivo ? 'PAGADO' : 'PENDIENTE'}
                                          </span>
                                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-slate-300 font-medium">
                                            {String(costo.modo_registro ?? 'por_item') !== 'por_item' ? 'TOTAL' : 'UNITARIO'}
                                          </span>
                                          {cuentaFuente && (
                                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 font-medium">
                                              {cuentaFuente.nombre}
                                            </span>
                                          )}
                                        </div>
                                        <p className="text-sm text-slate-200 mt-2 font-medium">{costo.descripcion ?? it.descripcion}</p>
                                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
                                          <span>Cantidad: <strong className="text-slate-200">{cantidadCostoRow}</strong></span>
                                          <span>Unitario: <strong className="text-slate-200">{COP.format(unitarioCostoRow)}</strong></span>
                                          <span>Total: <strong className="text-slate-200">{COP.format(costoTotalRow)}</strong></span>
                                        </div>
                                        {costo.concepto && <p className="mt-2 text-xs text-slate-500">Concepto: {costo.concepto}</p>}
                                        {costo.observaciones && <p className="mt-1 text-xs text-slate-500 whitespace-pre-wrap">Obs: {costo.observaciones}</p>}
                                      </div>

                                      <div className="flex flex-wrap items-center gap-3 shrink-0">
                                        <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none">
                                          <input
                                            type="checkbox"
                                            checked={pagoActivo}
                                            onChange={(e) => handleTogglePago(costo, e.target.checked)}
                                            className="accent-emerald-500"
                                          />
                                          Pagado
                                        </label>
                                        <button
                                          onClick={() => abrirModalEdicion(it, costo)}
                                          className="px-2 py-1 bg-white/10 hover:bg-white/20 rounded text-xs transition-colors inline-flex items-center gap-1"
                                        >
                                          <Pencil className="size-3.5" />
                                          Editar
                                        </button>
                                        <button
                                          onClick={() => handleEliminarCosto(costo)}
                                          className="px-2 py-1 bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded text-xs transition-colors inline-flex items-center gap-1"
                                        >
                                          <Trash2 className="size-3.5" />
                                          Eliminar
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* ── MODAL: Crear / Editar Grupo de Costos ──────────────────────────── */}
      {grupoModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-6">
          <div className="w-full max-w-xl rounded-2xl border border-violet-500/30 bg-[#0b1020] shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
              <div className="flex items-center gap-2">
                <Layers className="size-5 text-violet-400" />
                <h3 className="text-lg font-bold text-white">{editingGrupoId ? 'Editar grupo' : 'Nuevo grupo de costos'}</h3>
              </div>
              <button onClick={cerrarGrupoModal} className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 transition-colors">
                <X className="size-4" />
              </button>
            </div>

            <form onSubmit={handleGuardarGrupo} className="p-5 space-y-5">
              {/* Nombre del grupo */}
              <div>
                <label className="block text-xs text-slate-400 mb-1">Nombre del grupo</label>
                <input
                  list="grupo-nombres-predefinidos"
                  value={grupoNombre}
                  onChange={e => setGrupoNombre(e.target.value)}
                  type="text"
                  placeholder="Ej. Alimentación o escribe un nombre…"
                  required
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-violet-500"
                />
                <datalist id="grupo-nombres-predefinidos">
                  {PREDEFINED_GRUPO_NOMBRES.map(n => <option key={n} value={n} />)}
                </datalist>
              </div>

              {/* Monto total */}
              <div>
                <label className="block text-xs text-slate-400 mb-1">Costo total del grupo</label>
                <input
                  value={grupoMontoStr}
                  onChange={e => setGrupoMontoStr(e.target.value)}
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  placeholder="0"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-violet-500"
                />
                <p className="text-[10px] text-slate-500 mt-1">Este es el costo real total de los ítems agrupados, sin desglosar por ítem.</p>
              </div>

              {/* Selección de ítems */}
              <div>
                <label className="block text-xs text-slate-400 mb-2">Ítems incluidos en el grupo</label>
                <div className="rounded-xl border border-white/10 bg-white/5 divide-y divide-white/5 max-h-52 overflow-y-auto">
                  {itemsCotizados.map((it: any) => {
                    const checked = grupoItemsIds.has(it.id)
                    const presup = Number(it.cantidad) * Number(it.precio_unitario)
                    return (
                      <label key={it.id} className={`flex items-center gap-3 px-3 py-2 cursor-pointer select-none transition-colors ${checked ? 'bg-violet-500/10' : 'hover:bg-white/5'}`}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleGrupoItem(it.id)}
                          className="accent-violet-500 shrink-0"
                        />
                        <span className="flex-1 text-sm text-slate-200 truncate">{it.descripcion}</span>
                        <span className="text-xs text-slate-400 tabular-nums shrink-0">{COP.format(presup)}</span>
                      </label>
                    )
                  })}
                </div>
                {grupoItemsIds.size > 0 && (
                  <p className="text-[10px] text-slate-500 mt-1">
                    Cotizado seleccionado: <strong className="text-slate-300">
                      {COP.format(itemsCotizados
                        .filter((it: any) => grupoItemsIds.has(it.id))
                        .reduce((acc: number, it: any) => acc + Number(it.cantidad) * Number(it.precio_unitario), 0)
                      )}
                    </strong>
                  </p>
                )}
              </div>

              {grupoError && (
                <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-200 flex items-start gap-2">
                  <AlertCircle className="size-3.5 shrink-0 mt-0.5" />
                  <span>{grupoError}</span>
                </div>
              )}

              <div className="flex gap-2 justify-end pt-1">
                <button type="button" onClick={cerrarGrupoModal} className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-sm font-semibold text-white transition-colors">Cancelar</button>
                <button type="submit" disabled={grupoPending} className="px-4 py-2 rounded-lg bg-violet-500 hover:bg-violet-600 disabled:opacity-50 text-sm font-semibold text-white transition-colors inline-flex items-center gap-2">
                  {grupoPending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                  {editingGrupoId ? 'Actualizar grupo' : 'Crear grupo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: Registrar / Editar Pago de Grupo ────────────────────────── */}
      {pagoGrupoModalOpen && selectedGrupo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-6">
          <div className="w-full max-w-md rounded-2xl border border-orange-500/20 bg-[#0b1020] shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
              <div>
                <h3 className="text-lg font-bold text-white">{editingPagoId ? 'Editar pago' : 'Registrar pago'}</h3>
                <p className="text-xs text-slate-400">{selectedGrupo.nombre}</p>
              </div>
              <button onClick={cerrarPagoGrupoModal} className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 transition-colors">
                <X className="size-4" />
              </button>
            </div>

            <form onSubmit={handleGuardarPagoGrupo} className="p-5 space-y-4">
              <label className="block">
                <span className="text-xs text-slate-400 mb-1 block">Descripción</span>
                <input
                  value={pagoDesc}
                  onChange={e => setPagoDesc(e.target.value)}
                  type="text"
                  required
                  placeholder="Descripción del pago"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500"
                />
              </label>

              <label className="block">
                <span className="text-xs text-slate-400 mb-1 block">Monto ($)</span>
                <input
                  value={pagoMontoStr}
                  onChange={e => setPagoMontoStr(e.target.value)}
                  type="number"
                  min="0"
                  step="any"
                  required
                  placeholder="0"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500"
                />
                <p className="text-[10px] text-slate-500 mt-1">Presupuesto del grupo: <strong className="text-violet-300">{COP.format(Number(selectedGrupo.monto_total ?? 0))}</strong></p>
              </label>

              <label className="block">
                <span className="text-xs text-slate-400 mb-1 block">Observaciones (opcional)</span>
                <input
                  value={pagoObs}
                  onChange={e => setPagoObs(e.target.value)}
                  type="text"
                  placeholder="Observaciones"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500"
                />
              </label>

              <div className="flex items-center gap-3 pt-1">
                <input
                  id="pago-grupo-pagado"
                  type="checkbox"
                  checked={pagoPagado}
                  onChange={e => setPagoPagado(e.target.checked)}
                  className="accent-orange-500 size-4"
                />
                <label htmlFor="pago-grupo-pagado" className="text-sm text-slate-300 cursor-pointer">¿Ya fue pagado?</label>
              </div>

              {pagoPagado && (
                <label className="block">
                  <span className="text-xs text-slate-400 mb-1 block">Cuenta de origen</span>
                  <select
                    value={pagoCuentaId}
                    onChange={e => setPagoCuentaId(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500"
                  >
                    {cuentasSeleccionables.map((c: any) => (
                      <option key={c.id} value={c.id}>{c.nombre ?? c.tipo} — {COP.format(Number(c.saldo ?? 0))}</option>
                    ))}
                  </select>
                </label>
              )}

              {pagoError && (
                <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-200 flex items-start gap-2">
                  <AlertCircle className="size-3.5 shrink-0 mt-0.5" />
                  <span>{pagoError}</span>
                </div>
              )}

              <div className="flex gap-2 justify-end pt-1">
                <button type="button" onClick={cerrarPagoGrupoModal} className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-sm font-semibold text-white transition-colors">Cancelar</button>
                <button type="submit" disabled={pagoPending} className="px-4 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-sm font-semibold text-white transition-colors inline-flex items-center gap-2">
                  {pagoPending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                  {editingPagoId ? 'Actualizar pago' : 'Registrar pago'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {modalOpen && selectedItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-6">
          <div className="w-full max-w-4xl rounded-2xl border border-white/10 bg-[#0b1020] shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
              <div>
                <h3 className="text-lg font-bold text-white">{editingCostoId ? 'Editar costo' : 'Registrar costo'}</h3>
                <p className="text-xs text-slate-400">{selectedItem.descripcion}</p>
              </div>
              <button onClick={cerrarModal} className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 transition-colors">
                <X className="size-4" />
              </button>
            </div>

            <form onSubmit={handleGuardarCosto} className="grid grid-cols-1 lg:grid-cols-2 gap-6 p-5">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="text-xs text-slate-400 mb-1 block">Modo de captura</span>
                    <select value={modoValor} onChange={(e) => setModoValor(e.target.value as 'UNITARIO' | 'TOTAL')} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500">
                      <option value="UNITARIO">Unitario</option>
                      <option value="TOTAL">Total</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-xs text-slate-400 mb-1 block">Cantidad</span>
                    <input value={cantidad} onChange={(e) => setCantidad(e.target.value)} type="number" min="1" required className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500" />
                  </label>
                </div>

                <label className="block">
                  <span className="text-xs text-slate-400 mb-1 block">{modoValor === 'UNITARIO' ? 'Valor unitario' : 'Valor total'}</span>
                  <input value={valor} onChange={(e) => setValor(e.target.value)} type="number" min="0" step="0.01" required className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500" />
                </label>

                <label className="block">
                  <span className="text-xs text-slate-400 mb-1 block">Concepto</span>
                  <input value={concepto} onChange={(e) => setConcepto(e.target.value)} type="text" className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500" placeholder="Ej. Almuerzo de equipo" />
                </label>

                <label className="block">
                  <span className="text-xs text-slate-400 mb-1 block">Observaciones</span>
                  <textarea value={observaciones} onChange={(e) => setObservaciones(e.target.value)} rows={4} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500 resize-none" placeholder="Opcional" />
                </label>

                {Number(cantidad) !== Number(selectedItem.cantidad ?? 1) && (
                  <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-200">
                    <div className="flex items-center gap-2 font-semibold mb-1"><Info className="size-3.5" /> La cantidad del costo no coincide con la cotizada</div>
                    <p className="text-amber-100/80 mb-2">Cotizado: {selectedItem.cantidad}. Si esta diferencia es correcta, explica la razón.</p>
                    <textarea value={justificacionCantidad} onChange={(e) => setJustificacionCantidad(e.target.value)} rows={3} className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500 resize-none" placeholder="Ej. Se registró solo una parte / se obsequió una unidad / se añadirá el resto después" />
                  </div>
                )}
              </div>

              <div className="space-y-4">
                <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <div className="text-xs text-slate-400 mb-3 flex items-center gap-2"><Wallet className="size-3.5" /> Origen de fondos</div>
                  <div className="space-y-3">
                    <label className="block">
                      <span className="text-xs text-slate-400 mb-1 block">Cuenta origen</span>
                      <select value={cuentaOrigenId} onChange={(e) => setCuentaOrigenId(e.target.value)} className="w-full bg-[#0a0a0a] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500">
                        <option value="">Selecciona una cuenta</option>
                        {cuentasSeleccionables.map((cuenta: any) => (
                          <option key={cuenta.id} value={cuenta.id}>
                            {cuenta.nombre} · {cuenta.tipo}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-300">
                      <input type="checkbox" checked={costoPagado} onChange={(e) => setCostoPagado(e.target.checked)} className="accent-emerald-500" />
                      Costo pagado
                    </label>

                    <div className="rounded-lg bg-black/20 border border-white/10 p-3 text-xs text-slate-400 space-y-1">
                      <div className="flex justify-between gap-3"><span>Cuenta sugerida</span><span className="text-white">{cuentaProyecto?.nombre ?? 'Proyecto'}</span></div>
                      <div className="flex justify-between gap-3"><span>Ítem</span><span className="text-white">{selectedItem.descripcion}</span></div>
                      <div className="flex justify-between gap-3"><span>Total calculado</span><span className="text-white">{Number(cantidad || 0) > 0 && Number(valor || 0) > 0 ? COP.format(modoValor === 'UNITARIO' ? Number(cantidad) * Number(valor) : Number(valor)) : '—'}</span></div>
                      <div className="flex justify-between gap-3"><span>Tipo de captura</span><span className="text-white">{modoValor}</span></div>
                    </div>
                  </div>
                </div>

                {errorModal && (
                  <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-200 flex items-start gap-2">
                    <AlertCircle className="size-3.5 shrink-0 mt-0.5" />
                    <span>{errorModal}</span>
                  </div>
                )}

                <div className="flex gap-2 justify-end pt-2">
                  <button type="button" onClick={cerrarModal} className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-sm font-semibold text-white transition-colors">Cancelar</button>
                  <button type="submit" disabled={isPending} className="px-4 py-2 rounded-lg bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 text-sm font-semibold text-white transition-colors inline-flex items-center gap-2">
                    {isPending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                    {editingCostoId ? 'Actualizar' : 'Guardar'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {fondosError && (
        <FondosInsuficientesModal
          isOpen={showFondosModal}
          saldoActual={fondosError.saldoActual}
          montoRequerido={fondosError.montoRequerido}
          deficit={fondosError.deficit}
          cuentaIdOrigen={fondosError.cuentaId}
          cuentaOrigen={cuentaOrigenActual}
          socios={cuentas.filter((c: any) => c.tipo === 'SOCIO')}
          cuentas={cuentas}
          onClose={() => {
            setShowFondosModal(false)
            setCostoEnPagoId(null)
            setFondosError(null)
            setCuentaOrigenForzada(null)
          }}
          onExito={(data) => {
            if (data?.cuentaOrigenId) {
              setCuentaOrigenForzada(data.cuentaOrigenId)
            }
            void handleFondosResuelto(data)
          }}
        />
      )}

      {/* Modal: Registrar devolución parcial */}
      {devModalOpen && devSelectedItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-amber-500/30 bg-[#0f1117] shadow-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-white">Registrar Devolución Parcial</h3>
              <button onClick={() => setDevModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mb-4 p-3 rounded-xl bg-white/5 border border-white/10">
              <p className="text-xs text-slate-400">Ítem</p>
              <p className="text-sm font-semibold text-white">{devSelectedItem.descripcion}</p>
              <div className="mt-1 flex gap-4 text-xs text-slate-400">
                <span>Cantidad cotizada: <strong className="text-slate-200">{Number(devSelectedItem.cantidad)}</strong></span>
                <span>Valor unitario: <strong className="text-amber-300">{COP.format(Number(devSelectedItem.precio_unitario ?? 0))}</strong></span>
              </div>
            </div>

            <form onSubmit={handleRegistrarDevolucion} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Cantidad cancelada / no ejecutada
                  <span className="text-slate-500 font-normal ml-1">(máx: {Number(devSelectedItem.cantidad)})</span>
                </label>
                <input
                  type="number"
                  min={1}
                  max={Number(devSelectedItem.cantidad)}
                  step={1}
                  value={devCantidad}
                  onChange={e => setDevCantidad(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500/50"
                  required
                />
                {devCantidad && Number(devCantidad) > 0 && (
                  <p className="mt-1 text-xs text-amber-300">
                    Monto a devolver: <strong>{COP.format(Number(devCantidad) * Number(devSelectedItem.precio_unitario ?? 0))}</strong>
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">Motivo de la devolución</label>
                <textarea
                  rows={2}
                  value={devMotivo}
                  onChange={e => setDevMotivo(e.target.value)}
                  placeholder="Ej: Transporte no fue contratado, participante canceló..."
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500/50 resize-none"
                  required
                />
              </div>

              {devError && (
                <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{devError}</p>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setDevModalOpen(false)} className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm text-slate-300 transition-colors">
                  Cancelar
                </button>
                <button type="submit" disabled={devPending} className="px-4 py-2 bg-amber-500/30 hover:bg-amber-500/40 text-amber-300 rounded-lg text-sm font-semibold transition-colors inline-flex items-center gap-2 disabled:opacity-60">
                  {devPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                  Registrar deuda
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

function ReembolsosManager({ actividadId, reembolsos }: any) {
  const router = useRouter()
  const [loadingId, setLoadingId] = useState<string | null>(null)

  async function handleCambiarEstado(r: any, nuevoEstado: EstadoReembolso) {
    if (r.estado === nuevoEstado) return
    const etiquetas: Record<EstadoReembolso, string> = {
      PENDIENTE: 'Pendiente',
      PAGADO: 'Pagado — se registrará un egreso en tesorería',
      DEVOLUCION: 'Para devolución — pasará al módulo de devoluciones',
    }
    if (!confirm(`Cambiar estado de "${r.beneficiario_nombre ?? r.descripcion ?? 'beneficiario'}" a: ${etiquetas[nuevoEstado]}?`)) return
    setLoadingId(r.id)
    try {
      await cambiarEstadoReembolso(r.id, actividadId, nuevoEstado)
      router.refresh()
    } catch (e: any) {
      alert(`Error: ${e?.message ?? 'Ocurrió un error'}`)
    } finally {
      setLoadingId(null)
    }
  }

  const totalReembolsos = reembolsos.reduce((s: number, r: any) => s + Number(r.precio_total ?? r.precio_unitario ?? 0), 0)
  const cntPagados    = reembolsos.filter((r: any) => r.estado === 'PAGADO').length
  const cntDevolucion = reembolsos.filter((r: any) => r.estado === 'DEVOLUCION').length
  const cntPendientes = reembolsos.filter((r: any) => r.estado === 'PENDIENTE' || (r.estado !== 'PAGADO' && r.estado !== 'DEVOLUCION')).length
  const montoPagado   = reembolsos.filter((r: any) => r.estado === 'PAGADO').reduce((s: number, r: any) => s + Number(r.precio_total ?? r.precio_unitario ?? 0), 0)
  const montoDevolver = reembolsos.filter((r: any) => r.estado === 'DEVOLUCION').reduce((s: number, r: any) => s + Number(r.precio_total ?? r.precio_unitario ?? 0), 0)

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          <Users className="w-5 h-5 text-fuchsia-400" />
          Reembolsos y Dineros de Terceros
        </h2>
        <div className="flex items-center gap-3 text-xs">
          <span className="px-2 py-1 rounded-lg bg-emerald-500/15 text-emerald-300 tabular-nums">
            {cntPagados} pagado{cntPagados !== 1 ? 's' : ''}
          </span>
          {cntDevolucion > 0 && (
            <span className="px-2 py-1 rounded-lg bg-red-500/15 text-red-300 tabular-nums">
              {cntDevolucion} a devolver
            </span>
          )}
          {cntPendientes > 0 && (
            <span className="px-2 py-1 rounded-lg bg-amber-500/15 text-amber-300 tabular-nums">
              {cntPendientes} pendiente{cntPendientes !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="p-3 rounded-xl bg-white/5 border border-white/10">
          <div className="text-xs text-slate-400 mb-1">Total a distribuir</div>
          <div className="text-base font-bold text-fuchsia-400 tabular-nums">{COP.format(totalReembolsos)}</div>
        </div>
        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
          <div className="text-xs text-slate-400 mb-1">Pagado (egreso registrado)</div>
          <div className="text-base font-bold text-emerald-400 tabular-nums">{COP.format(montoPagado)}</div>
        </div>
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20">
          <div className="text-xs text-slate-400 mb-1">Para devolver</div>
          <div className="text-base font-bold text-red-400 tabular-nums">{COP.format(montoDevolver)}</div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="bg-white/5 border-b border-white/10 text-xs uppercase text-slate-400">
            <tr>
              <th className="px-4 py-3">Beneficiario</th>
              <th className="px-4 py-3">Ruta / Concepto</th>
              <th className="px-4 py-3 text-right">Monto</th>
              <th className="px-4 py-3 text-center">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {reembolsos.map((r: any) => {
              const estado: EstadoReembolso =
                r.estado === 'PAGADO' ? 'PAGADO'
                : r.estado === 'DEVOLUCION' ? 'DEVOLUCION'
                : 'PENDIENTE'
              const isLoading = loadingId === r.id

              return (
                <tr key={r.id} className="hover:bg-white/5 transition-colors">
                  <td className="px-4 py-3 text-slate-200">
                    <div className="font-semibold">{r.beneficiario_nombre ?? r.nombre_beneficiario ?? '—'}</div>
                    <div className="text-xs text-slate-500">{r.beneficiario_documento ?? r.documento ?? ''}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-400 text-xs">
                    {r.municipio_origen ?? r.descripcion ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-fuchsia-300 font-semibold">
                    {COP.format(Number(r.precio_total ?? r.precio_unitario ?? 0))}
                  </td>
                  <td className="px-4 py-3">
                    {isLoading ? (
                      <div className="flex justify-center"><Loader2 className="w-4 h-4 animate-spin text-slate-400" /></div>
                    ) : (
                      <div className="flex items-center gap-1 justify-center">
                        <button
                          onClick={() => handleCambiarEstado(r, 'PENDIENTE')}
                          title="Marcar como pendiente"
                          className={`px-2 py-1 rounded-lg text-[11px] font-medium transition-colors border ${
                            estado === 'PENDIENTE'
                              ? 'bg-amber-500/25 border-amber-500/50 text-amber-300'
                              : 'bg-white/5 border-white/10 text-slate-400 hover:border-amber-500/30 hover:text-amber-300'
                          }`}
                        >
                          Pendiente
                        </button>
                        <button
                          onClick={() => handleCambiarEstado(r, 'PAGADO')}
                          title="Marcar como pagado — se registra egreso en tesorería"
                          className={`px-2 py-1 rounded-lg text-[11px] font-medium transition-colors border ${
                            estado === 'PAGADO'
                              ? 'bg-emerald-500/25 border-emerald-500/50 text-emerald-300'
                              : 'bg-white/5 border-white/10 text-slate-400 hover:border-emerald-500/30 hover:text-emerald-300'
                          }`}
                        >
                          <Check className="w-3 h-3 inline mr-1" />Pagado
                        </button>
                        <button
                          onClick={() => handleCambiarEstado(r, 'DEVOLUCION')}
                          title="Marcar para devolución — pasa al módulo de devoluciones sin egreso inmediato"
                          className={`px-2 py-1 rounded-lg text-[11px] font-medium transition-colors border ${
                            estado === 'DEVOLUCION'
                              ? 'bg-red-500/25 border-red-500/50 text-red-300'
                              : 'bg-white/5 border-white/10 text-slate-400 hover:border-red-500/30 hover:text-red-300'
                          }`}
                        >
                          <RotateCcw className="w-3 h-3 inline mr-1" />Devolución
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
            {reembolsos.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                  No hay reembolsos ni dineros de terceros registrados para esta actividad.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {cntPendientes > 0 && (
        <div className="mt-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center gap-2 text-xs text-amber-300">
          <Info className="w-4 h-4 shrink-0" />
          {cntPendientes} reembolso{cntPendientes !== 1 ? 's' : ''} pendiente{cntPendientes !== 1 ? 's' : ''}.
          Marca cada uno como <strong className="ml-1">Pagado</strong> (registra egreso en tesorería) o <strong className="ml-1">Devolución</strong> (pasa al módulo de devoluciones).
        </div>
      )}
    </div>
  )
}

function DevolucionesManager({ actividadId, devoluciones, deudas, pendientes, itemsCotizados, reembolsos, cuentas }: any) {
  const router = useRouter()
  const [corrigiendo, setCorrigiendo] = useState(false)
  const [filtro, setFiltro] = useState<'TODOS' | 'OPERATIVO' | 'TERCERO'>('TODOS')

  // Modal para saldar deuda
  const [saldarModal, setSaldarModal] = useState(false)
  const [saldarDeuda, setSaldarDeuda] = useState<any | null>(null)
  const [saldarCuentaId, setSaldarCuentaId] = useState('')
  const [saldarError, setSaldarError] = useState<string | null>(null)
  const [saldarPending, startSaldarTransition] = useTransition()
  const [eliminarPending, startEliminarTransition] = useTransition()

  const deudasFiltradas = (deudas ?? []).filter((d: any) => filtro === 'TODOS' || d.tipo === filtro)
  const deudas_pendientes = (deudas ?? []).filter((d: any) => d.estado_deuda === 'PENDIENTE')
  const deudas_saldadas = (deudas ?? []).filter((d: any) => d.estado_deuda === 'SALDADO')
  const totalPendiente = deudas_pendientes.reduce((s: number, d: any) => s + Number(d.monto_total), 0)
  const totalSaldado = deudas_saldadas.reduce((s: number, d: any) => s + Number(d.monto_total), 0)
  // Salidas legacy (movimientos de tipo RETIRO)
  const totalSalidas = (devoluciones || []).reduce((s: number, d: any) => s + Number(d.monto), 0)
  const pazYSalvo = deudas_pendientes.length === 0 && (deudas ?? []).length > 0
  const defaultCuentaId = (cuentas ?? []).find((c: any) => c.tipo === 'PROYECTO' && c.requerimiento_id === actividadId)?.id
    ?? (cuentas ?? []).find((c: any) => c.tipo === 'GENERAL')?.id
    ?? ''

  function abrirSaldarModal(d: any) {
    setSaldarDeuda(d)
    setSaldarCuentaId(defaultCuentaId)
    setSaldarError(null)
    setSaldarModal(true)
  }

  async function handleSaldar(e: React.FormEvent) {
    e.preventDefault()
    if (!saldarDeuda || !saldarCuentaId) { setSaldarError('Selecciona la cuenta de origen.'); return }
    setSaldarError(null)
    startSaldarTransition(async () => {
      try {
        await saldarDeudaDevolucion(saldarDeuda.id, actividadId, saldarCuentaId, Number(saldarDeuda.monto_total))
        setSaldarModal(false)
        setSaldarDeuda(null)
        router.refresh()
      } catch (err) {
        setSaldarError(err instanceof Error ? err.message : 'Error al saldar la deuda')
      }
    })
  }

  async function handleEliminar(d: any) {
    if (!confirm(`¿Eliminar esta deuda de ${COP.format(Number(d.monto_total))}? Solo se puede eliminar si está PENDIENTE.`)) return
    startEliminarTransition(async () => {
      try {
        await eliminarDeudaDevolucion(d.id, actividadId)
        router.refresh()
      } catch (err) {
        alert(err instanceof Error ? err.message : 'Error al eliminar la deuda')
      }
    })
  }

  async function handleCorregir() {
    setCorrigiendo(true)
    await recalcularDevolucionesPendientes(actividadId)
    router.refresh()
    setCorrigiendo(false)
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md p-6">
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          <RotateCcw className="w-5 h-5 text-amber-400" />
          Devoluciones
          {pazYSalvo && (
            <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-medium">
              ✓ Paz y salvo
            </span>
          )}
        </h2>
        <button
          onClick={handleCorregir}
          disabled={corrigiendo}
          className="px-3 py-1 bg-white/10 hover:bg-white/20 disabled:opacity-50 text-slate-300 text-xs rounded-lg transition-colors"
        >
          {corrigiendo ? 'Recalculando…' : 'Recalcular saldo'}
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className={`p-3 rounded-xl border ${totalPendiente > 0 ? 'bg-red-500/10 border-red-500/20' : 'bg-white/5 border-white/10'}`}>
          <div className="text-xs text-slate-400 mb-1">Deuda Pendiente (Unidad)</div>
          <div className={`text-lg font-bold tabular-nums ${totalPendiente > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
            {totalPendiente > 0 ? COP.format(totalPendiente) : '✓ Sin deuda'}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">{deudas_pendientes.length} concepto{deudas_pendientes.length !== 1 ? 's' : ''} pendiente{deudas_pendientes.length !== 1 ? 's' : ''}</div>
        </div>
        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
          <div className="text-xs text-slate-400 mb-1">Total Devuelto</div>
          <div className="text-lg font-bold text-emerald-400 tabular-nums">{COP.format(totalSaldado + totalSalidas)}</div>
          <div className="text-[10px] text-slate-500 mt-0.5">{deudas_saldadas.length} saldadas{totalSalidas > 0 ? ` + ${COP.format(totalSalidas)} legacy` : ''}</div>
        </div>
        <div className="p-3 rounded-xl bg-white/5 border border-white/10">
          <div className="text-xs text-slate-400 mb-1">Total registrado</div>
          <div className="text-lg font-bold text-amber-300 tabular-nums">{COP.format(totalPendiente + totalSaldado + totalSalidas)}</div>
          <div className="text-[10px] text-slate-500 mt-0.5">{(deudas ?? []).length} concepto{(deudas ?? []).length !== 1 ? 's' : ''}</div>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex gap-2 mb-4">
        {(['TODOS', 'OPERATIVO', 'TERCERO'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFiltro(f)}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${filtro === f ? 'bg-amber-500/30 text-amber-300' : 'bg-white/5 text-slate-400 hover:bg-white/10'}`}
          >
            {f === 'TODOS' ? 'Todos' : f === 'OPERATIVO' ? 'Operativa' : 'Terceros'}
          </button>
        ))}
      </div>

      {/* Tabla de deudas */}
      <div className="mb-6">
        <h3 className="text-sm font-semibold text-slate-300 mb-3">Conceptos a devolver</h3>
        {deudasFiltradas.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/10 px-4 py-6 text-sm text-slate-500 text-center">
            {(deudas ?? []).length === 0
              ? 'No hay devoluciones registradas. Usa el botón "+ Devolución" en cada ítem o cancela ítems de cotización.'
              : 'No hay conceptos con el filtro seleccionado.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="border-b border-white/10 text-xs uppercase text-slate-400">
                <tr>
                  <th className="pb-2 pr-4">Concepto / Motivo</th>
                  <th className="pb-2 pr-4">Tipo</th>
                  <th className="pb-2 pr-4 text-right">Cantidad</th>
                  <th className="pb-2 pr-4 text-right">Monto</th>
                  <th className="pb-2 pr-4 text-center">Estado</th>
                  <th className="pb-2 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {deudasFiltradas.map((d: any) => {
                  const saldado = d.estado_deuda === 'SALDADO'
                  return (
                    <tr key={d.id} className={`hover:bg-white/5 transition-colors ${saldado ? 'opacity-60' : ''}`}>
                      <td className="py-2.5 pr-4 text-slate-200">
                        <div className="font-medium">{d.motivo ?? '—'}</div>
                        <div className="text-[10px] text-slate-500">{new Date(d.created_at).toLocaleDateString('es-CO')}</div>
                      </td>
                      <td className="py-2.5 pr-4">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${d.tipo === 'OPERATIVO' ? 'bg-indigo-500/20 text-indigo-300' : 'bg-fuchsia-500/20 text-fuchsia-300'}`}>
                          {d.tipo}
                        </span>
                      </td>
                      <td className="py-2.5 pr-4 text-right tabular-nums text-slate-300">{Number(d.cantidad_cancelada)}</td>
                      <td className="py-2.5 pr-4 text-right tabular-nums font-semibold text-amber-300">{COP.format(Number(d.monto_total))}</td>
                      <td className="py-2.5 pr-4 text-center">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${saldado ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'}`}>
                          {saldado ? 'SALDADO' : 'PENDIENTE'}
                        </span>
                      </td>
                      <td className="py-2.5 text-center">
                        {!saldado && (
                          <div className="flex justify-center gap-2">
                            <button
                              onClick={() => abrirSaldarModal(d)}
                              className="px-2 py-1 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 rounded text-xs transition-colors inline-flex items-center gap-1"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Saldar
                            </button>
                            <button
                              onClick={() => handleEliminar(d)}
                              disabled={eliminarPending as boolean}
                              className="px-2 py-1 bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded text-xs transition-colors inline-flex items-center gap-1 disabled:opacity-50"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Historial de salidas legado */}
      {(devoluciones || []).length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-slate-300 mb-3">Salidas registradas (flujo anterior)</h3>
          <div className="space-y-2">
            {(devoluciones || []).map((d: any) => (
              <div key={d.id} className="flex justify-between items-center p-3 bg-white/5 rounded-lg border border-white/5">
                <div>
                  <div className="font-semibold text-emerald-400 tabular-nums">{COP.format(d.monto)}</div>
                  <div className="text-xs text-slate-400">{new Date(d.fecha_salida ?? d.created_at).toLocaleString('es-CO')}</div>
                </div>
                <div className="text-emerald-400 text-xs flex items-center gap-1">
                  <CheckCircle2 className="w-4 h-4" /> Ejecutado
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal: Saldar deuda */}
      {saldarModal && saldarDeuda && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-emerald-500/30 bg-[#0f1117] shadow-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-white">Saldar Deuda de Devolución</h3>
              <button onClick={() => setSaldarModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mb-4 p-3 rounded-xl bg-white/5 border border-white/10">
              <p className="text-xs text-slate-400">Concepto</p>
              <p className="text-sm font-semibold text-white">{saldarDeuda.motivo}</p>
              <p className="mt-1 text-lg font-bold text-emerald-400 tabular-nums">{COP.format(Number(saldarDeuda.monto_total))}</p>
            </div>

            <form onSubmit={handleSaldar} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">Cuenta de origen del egreso</label>
                <select
                  value={saldarCuentaId}
                  onChange={e => setSaldarCuentaId(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-500/50"
                  required
                >
                  <option value="">Selecciona una cuenta...</option>
                  {(cuentas ?? []).map((c: any) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre} — {COP.format(Number(c.saldo ?? 0))}
                    </option>
                  ))}
                </select>
              </div>

              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-300">
                Se creará un movimiento bancario de tipo DEVOLUCIÓN por {COP.format(Number(saldarDeuda.monto_total))} y la deuda quedará SALDADA.
              </div>

              {saldarError && (
                <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{saldarError}</p>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setSaldarModal(false)} className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm text-slate-300 transition-colors">
                  Cancelar
                </button>
                <button type="submit" disabled={saldarPending} className="px-4 py-2 bg-emerald-500/30 hover:bg-emerald-500/40 text-emerald-300 rounded-lg text-sm font-semibold transition-colors inline-flex items-center gap-2 disabled:opacity-60">
                  {saldarPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  Confirmar pago
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
