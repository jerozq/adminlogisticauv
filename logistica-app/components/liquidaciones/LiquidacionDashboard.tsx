'use client'

import { Fragment, useMemo, useState, useTransition } from 'react'
import { AlertCircle, Check, CheckCircle2, ChevronDown, ChevronUp, DollarSign, Info, Loader2, Pencil, Plus, RotateCcw, ShieldAlert, TrendingDown, Trash2, Upload, Users, Wallet, X } from 'lucide-react'
import { actualizarAbono, cambiarEstadoPagoCosto, eliminarAbono, eliminarCostoReal, eliminarDeudaDevolucion, marcarItemEstado, marcarReembolsoPagado, recalcularDevolucionesPendientes, registrarAbonoUnidad, registrarCostoReal, registrarDeudaDevolucion, registrarSalidaDevolucion, saldarDeudaDevolucion, toggleAsistenciaReembolso } from '@/actions/liquidaciones'
import { useRouter } from 'next/navigation'
import { GaleriaComprobantes } from './GaleriaComprobantes'
import type { SoporteProyecto } from '@/actions/liquidaciones'
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
  const { actividad, abonos, movimientosProyecto, devoluciones, deudas, costos, itemsCotizados, reembolsos } = detalle

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

function ItemsManager({ actividadId, itemsCotizados, costos, cuentas, totalAbonosOperativo, deudas }: any) {
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

  const totalCostos = useMemo(() => costos.reduce((acc: number, costo: any) => acc + Number(costo.monto ?? 0), 0), [costos])

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
        <button
          onClick={() => itemsCotizados[0] && abrirModalNuevo(itemsCotizados[0])}
          disabled={itemsCotizados.length === 0}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30 text-xs font-semibold transition-colors"
        >
          <Plus className="size-4" /> Nuevo costo
        </button>
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

      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="bg-white/5 border-b border-white/10 text-xs uppercase text-slate-400">
            <tr>
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
                  <tr className="hover:bg-white/5 align-top">
                    <td className="px-4 py-3 text-slate-200">
                      <div className="font-semibold">{it.descripcion}</div>
                      <div className="mt-1 flex items-center gap-2 text-[10px] text-slate-500">
                        <span className={`px-2 py-0.5 rounded-full ${it.tipo_rubro === 'OPERATIVO' ? 'bg-indigo-500/20 text-indigo-300' : 'bg-fuchsia-500/20 text-fuchsia-300'}`}>
                          {it.tipo_rubro}
                        </span>
                        {it.estado_ejecucion === 'CANCELADO' && <span className="px-2 py-0.5 rounded-full bg-red-500/20 text-red-300">CANCELADO</span>}
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
                      <td colSpan={10} className="px-4 py-4">
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

  async function handleToggleAsistencia(r: any) {
    const isAsistiendo = r.estado !== 'NO_ASISTIO'
    if (!confirm(`Marcar a ${r.beneficiario_nombre} como ${isAsistiendo ? 'NO ASISTIÓ' : 'ASISTIÓ'}?`)) return
    setLoadingId(r.id)
    await toggleAsistenciaReembolso(r.id, actividadId, !isAsistiendo, Number(r.precio_unitario ?? 0))
    router.refresh()
    setLoadingId(null)
  }

  async function handleTogglePagado(r: any) {
    const nuevoPagado = !r.pagado
    if (nuevoPagado && r.estado === 'NO_ASISTIO') {
      alert('No se puede marcar como pagado a alguien que no asistió.')
      return
    }
    setLoadingId(`pagado-${r.id}`)
    await marcarReembolsoPagado(r.id, actividadId, nuevoPagado)
    router.refresh()
    setLoadingId(null)
  }

  const totalReembolsos = reembolsos.reduce((s: number, r: any) => s + Number(r.precio_unitario ?? 0), 0)
  const pagados = reembolsos.filter((r: any) => r.pagado).length
  const noAsistieron = reembolsos.filter((r: any) => r.estado === 'NO_ASISTIO').length
  const pendientesPago = reembolsos.filter((r: any) => r.estado !== 'NO_ASISTIO' && !r.pagado).length

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          <Users className="w-5 h-5 text-fuchsia-400" />
          Reembolsos y Dineros de Terceros
        </h2>
        <div className="flex items-center gap-3 text-xs">
          <span className="px-2 py-1 rounded-lg bg-emerald-500/15 text-emerald-300 tabular-nums">
            {pagados}/{reembolsos.length} pagados
          </span>
          {noAsistieron > 0 && (
            <span className="px-2 py-1 rounded-lg bg-red-500/15 text-red-300 tabular-nums">
              {noAsistieron} no asistieron
            </span>
          )}
          {pendientesPago > 0 && (
            <span className="px-2 py-1 rounded-lg bg-amber-500/15 text-amber-300 tabular-nums">
              {pendientesPago} por confirmar pago
            </span>
          )}
        </div>
      </div>

      {/* KPI rápido */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="p-3 rounded-xl bg-white/5 border border-white/10">
          <div className="text-xs text-slate-400 mb-1">Total a distribuir</div>
          <div className="text-base font-bold text-fuchsia-400 tabular-nums">{COP.format(totalReembolsos)}</div>
        </div>
        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
          <div className="text-xs text-slate-400 mb-1">Confirmado pagado</div>
          <div className="text-base font-bold text-emerald-400 tabular-nums">
            {COP.format(reembolsos.filter((r: any) => r.pagado).reduce((s: number, r: any) => s + Number(r.precio_unitario ?? 0), 0))}
          </div>
        </div>
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20">
          <div className="text-xs text-slate-400 mb-1">No entregado / Devolver</div>
          <div className="text-base font-bold text-red-400 tabular-nums">
            {COP.format(reembolsos.filter((r: any) => r.estado === 'NO_ASISTIO').reduce((s: number, r: any) => s + Number(r.precio_unitario ?? 0), 0))}
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="bg-white/5 border-b border-white/10 text-xs uppercase text-slate-400">
            <tr>
              <th className="px-4 py-3">Beneficiario</th>
              <th className="px-4 py-3">Ruta / Concepto</th>
              <th className="px-4 py-3 text-right">Monto</th>
              <th className="px-4 py-3 text-center">¿Asistió?</th>
              <th className="px-4 py-3 text-center">¿Pagado?</th>
              <th className="px-4 py-3 text-center">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {reembolsos.map((r: any) => {
              const asistio = r.estado !== 'NO_ASISTIO'
              const pagado = Boolean(r.pagado)
              const isLoading = loadingId === r.id || loadingId === `pagado-${r.id}`

              // Estado visual del checklist
              let badgeColor = 'bg-amber-500/20 text-amber-300'
              let badgeLabel = 'Pendiente'
              if (!asistio) { badgeColor = 'bg-red-500/20 text-red-300'; badgeLabel = 'No asistió' }
              else if (pagado) { badgeColor = 'bg-emerald-500/20 text-emerald-300'; badgeLabel = 'Paz y salvo' }

              return (
                <tr key={r.id} className={`hover:bg-white/5 transition-colors ${!asistio ? 'opacity-60' : ''}`}>
                  <td className="px-4 py-3 text-slate-200">
                    <div className="font-semibold">{r.beneficiario_nombre ?? r.nombre_beneficiario ?? '—'}</div>
                    <div className="text-xs text-slate-500">{r.beneficiario_documento ?? r.documento ?? ''}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-400 text-xs">
                    {r.municipio_origen ?? r.descripcion ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-fuchsia-300 font-semibold">
                    {COP.format(Number(r.precio_unitario ?? 0))}
                  </td>

                  {/* Checkbox: Asistió */}
                  <td className="px-4 py-3 text-center">
                    <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={asistio}
                        disabled={isLoading}
                        onChange={() => handleToggleAsistencia(r)}
                        className="accent-emerald-500 w-4 h-4"
                      />
                      <span className={`text-xs ${asistio ? 'text-emerald-400' : 'text-red-400'}`}>
                        {asistio ? 'Sí' : 'No'}
                      </span>
                    </label>
                  </td>

                  {/* Checkbox: Pagado */}
                  <td className="px-4 py-3 text-center">
                    <label className={`inline-flex items-center gap-2 select-none ${asistio ? 'cursor-pointer' : 'cursor-not-allowed opacity-40'}`}>
                      <input
                        type="checkbox"
                        checked={pagado}
                        disabled={!asistio || isLoading}
                        onChange={() => handleTogglePagado(r)}
                        className="accent-fuchsia-500 w-4 h-4"
                      />
                      <span className={`text-xs ${pagado ? 'text-fuchsia-400' : 'text-slate-500'}`}>
                        {pagado ? 'Sí' : 'No'}
                      </span>
                    </label>
                  </td>

                  {/* Badge de estado */}
                  <td className="px-4 py-3 text-center">
                    {isLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin text-slate-400 inline" />
                    ) : (
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${badgeColor}`}>
                        {badgeLabel}
                      </span>
                    )}
                  </td>
                </tr>
              )
            })}
            {reembolsos.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                  No hay reembolsos ni dineros de terceros registrados para esta actividad.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {pendientesPago > 0 && (
        <div className="mt-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center gap-2 text-xs text-amber-300">
          <Info className="w-4 h-4 shrink-0" />
          Hay {pendientesPago} beneficiario{pendientesPago !== 1 ? 's' : ''} que asistieron pero aún no tienen confirmación de pago.
          Marcarlos como pagados cuando el dinero sea entregado.
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
