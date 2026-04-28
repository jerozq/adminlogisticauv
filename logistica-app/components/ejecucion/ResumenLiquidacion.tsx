'use client'

import { TrendingUp, TrendingDown, DollarSign, Landmark } from 'lucide-react'
import type { EjecucionCostoConItem, ItemCotizado } from '@/types/ejecucion'
import type { NuevaParticipacion } from '@/src/types/domain'

const fmt = (n: number) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(n)



interface Props {
  costos:           EjecucionCostoConItem[]
  ingresoTotal:     number
  itemsCotizados?:  ItemCotizado[]
  participaciones?: NuevaParticipacion[]
}

export function ResumenLiquidacion({ costos, ingresoTotal, itemsCotizados, participaciones }: Props) {
  const gastos_totales  = costos.reduce((s, c) => s + c.monto, 0)
  const pagado_jero     = costos.filter((c) => c.pagador === 'jero').reduce((s, c) => s + c.monto, 0)
  const pagado_socio    = costos.filter((c) => c.pagador === 'socio').reduce((s, c) => s + c.monto, 0)
  const pagado_anticipo = costos.filter((c) => c.pagador === 'anticipo_uv').reduce((s, c) => s + c.monto, 0)
  const pagado_caja     = costos.filter((c) => c.pagador === 'caja_proyecto').reduce((s, c) => s + c.monto, 0)

  const utilidad_neta = ingresoTotal - gastos_totales

  const sumaParticipaciones = (participaciones ?? []).reduce((s, p) => s + p.porcentaje, 0)
  const usarDistribucionDinamica =
    participaciones && participaciones.length >= 2 && Math.abs(sumaParticipaciones - 100) <= 0.01

  const distribucion = usarDistribucionDinamica
    ? participaciones!.map((p) => ({
        ...p,
        porcionUtilidad: utilidad_neta * (p.porcentaje / 100),
        totalRecibe:     p.montoAportado + utilidad_neta * (p.porcentaje / 100),
      }))
    : null

  const sociosFallback = participaciones && participaciones.length > 0
    ? participaciones
    : [
        { socioId: 'jero', nombreSocio: 'Jeronimo', porcentaje: 50, montoAportado: pagado_jero },
        { socioId: 'luis', nombreSocio: 'Luis', porcentaje: 50, montoAportado: pagado_socio },
      ]

  const sumaFallbackPorcentaje = sociosFallback.reduce((s, p) => s + p.porcentaje, 0)
  const fallbackDistribucion = sociosFallback.map((socio) => {
    const peso = sumaFallbackPorcentaje > 0
      ? socio.porcentaje / sumaFallbackPorcentaje
      : 1 / Math.max(sociosFallback.length, 1)
    const porcionUtilidad = utilidad_neta * peso
    return {
      ...socio,
      porcionUtilidad,
      totalRecibe: socio.montoAportado + porcionUtilidad,
      porcentajeVisual: peso * 100,
    }
  })

  if (ingresoTotal === 0 && costos.length === 0) {
    return (
      <div className="text-center py-6 text-sm text-white/40
                      bg-white/[0.03] backdrop-blur-[16px] border border-white/10
                      rounded-2xl">
        Agrega gastos para ver la liquidación estimada
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* 1. Resumen de Gastos */}
        <div className="bg-white/[0.03] backdrop-blur-[16px] border border-white/10 rounded-2xl shadow-xl p-5 transition-all hover:bg-white/10">
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-widest text-white/40">Resumen de Gastos</span>
              <TrendingDown className="size-5 text-rose-400" />
            </div>
            <div>
              <p className="text-xl font-black font-mono text-rose-400">
                {fmt(gastos_totales)}
              </p>
              <p className="text-[10px] text-white/40 mt-0.5 font-mono">Costos reales</p>
            </div>
          </div>
        </div>
        {/* 2. Balance Actual */}
        <div className="bg-white/[0.03] backdrop-blur-[16px] border border-white/10 rounded-2xl shadow-xl p-5 transition-all hover:bg-white/10">
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-widest text-white/40">Balance Actual</span>
              <DollarSign className="size-5 text-blue-400" />
            </div>
            <div>
              <p className={`text-xl font-black font-mono ${utilidad_neta >= 0 ? 'text-blue-400' : 'text-rose-400'}`}>
                {fmt(utilidad_neta)}
              </p>
              <p className="text-[10px] text-white/40 mt-0.5 font-mono">{utilidad_neta >= 0 ? 'Ganancia operativa' : 'Pérdida operativa'}</p>
            </div>
          </div>
        </div>
        {/* 3. Lo que entró */}
        <div className="bg-white/[0.03] backdrop-blur-[16px] border border-white/10 rounded-2xl shadow-xl p-5 transition-all hover:bg-white/10">
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-widest text-white/40">Lo que entró</span>
              <TrendingUp className="size-5 text-emerald-500" />
            </div>
            <div>
              <p className="text-xl font-black font-mono text-emerald-500">
                {fmt(ingresoTotal)}
              </p>
              <p className="text-[10px] text-white/40 mt-0.5 font-mono">Total cotizado</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Rentabilidad por Ítem ────────────────────────── */}
      {itemsCotizados && itemsCotizados.length > 0 && costos.length > 0 && (
        <RentabilidadPorItem items={itemsCotizados} costos={costos} />
      )}

      {gastos_totales > 0 && (
        <div className="bg-white/10 backdrop-blur-xl rounded-2xl overflow-hidden border border-white/20 shadow-xl">
          <div className="px-5 py-4 bg-white/5 border-b border-white/10">
            <h3 className="text-sm font-bold text-white/80">Origen de Fondos</h3>
          </div>
          <div className="p-5 space-y-2">
            {pagado_jero > 0 && (
              <OrigenRow label="Fondo Jero" monto={pagado_jero} />
            )}
            {pagado_socio > 0 && (
              <OrigenRow label="Fondo Socio" monto={pagado_socio} />
            )}
            {pagado_anticipo > 0 && (
              <OrigenRow
                label="Anticipo UV"
                monto={pagado_anticipo}
                sublabel="cubierto por anticipo de la UV"
              />
            )}
            {pagado_caja > 0 && (
              <OrigenRow label="Caja Proyecto" monto={pagado_caja} />
            )}
          </div>
        </div>
      )}

      <div className="bg-white/10 backdrop-blur-xl rounded-2xl overflow-hidden border border-white/20 shadow-xl">
        <div className="px-5 py-4 bg-white/5 border-b border-white/10 flex items-center justify-between">
          <h3 className="text-sm font-bold text-white/80">Liquidación de Socios</h3>
          <span className="text-xs text-white/60">Retorno + porción de utilidad</span>
        </div>

        <div className="p-5 space-y-4">
          <div className="flex items-center gap-2 text-xs text-white/60 bg-white/5 rounded-xl px-4 py-2.5 border border-white/10">
            <Landmark strokeWidth={1.5} className="size-3.5 shrink-0" />
            <span>
              Utilidad Neta{' '}
              <strong className={`font-mono ${utilidad_neta >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {fmt(utilidad_neta)}
              </strong>
              {' '}= {fmt(ingresoTotal)} - {fmt(gastos_totales)}
            </span>
          </div>

          {distribucion ? (
            distribucion.map((socio) => (
              <div
                key={socio.socioId}
                className="relative overflow-hidden rounded-2xl p-5 bg-white/10 border border-white/20 backdrop-blur-xl"
              >
                <div className="flex items-center justify-between relative z-10">
                  <div>
                    <p className="text-sm font-bold text-white/90 mb-1">{socio.nombreSocio} recibe</p>
                    <div className="flex flex-col gap-0.5">
                      <p className="text-[11px] font-medium font-mono text-white/60">
                        {fmt(socio.montoAportado)} (Retorno de inversión)
                      </p>
                      <p className="text-[11px] font-medium font-mono text-white/60">
                        + {fmt(socio.porcionUtilidad)} (Utilidad {socio.porcentaje}%)
                      </p>
                    </div>
                  </div>
                  <p className="text-2xl font-black font-mono text-white/90">{fmt(socio.totalRecibe)}</p>
                </div>
              </div>
            ))
          ) : (
            <div className="space-y-3">
              {fallbackDistribucion.map((socio) => (
                <SocioCard
                  key={socio.socioId}
                  nombre={socio.nombreSocio}
                  retorno={socio.montoAportado}
                  utilidad={socio.porcionUtilidad}
                  total={socio.totalRecibe}
                  porcentaje={socio.porcentajeVisual}
                />
              ))}
              {(!participaciones || participaciones.length === 0) && (
                <p className="text-[10px] text-amber-600 text-center uppercase font-bold tracking-tighter opacity-70">
                  Distribucion estimada 50/50 - Configura socios para exactitud
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function RentabilidadPorItem({
  items,
  costos,
}: {
  items: ItemCotizado[]
  costos: EjecucionCostoConItem[]
}) {
  const gastosPorItem = costos.reduce<Record<string, number>>((acc, c) => {
    if (c.item_id) acc[c.item_id] = (acc[c.item_id] ?? 0) + c.monto
    return acc
  }, {})

  const filas = items
    .map((item) => {
      const presupuesto = item.precio_total
      const costoReal   = gastosPorItem[item.id] ?? 0
      const utilidad    = presupuesto - costoReal
      const margen      = presupuesto > 0 ? (utilidad / presupuesto) * 100 : 0
      return { item, presupuesto, costoReal, utilidad, margen }
    })
    .filter((f) => f.costoReal > 0)

  if (filas.length === 0) return null

  return (
    <div className="bg-white/10 backdrop-blur-xl rounded-2xl overflow-hidden border border-white/20 shadow-xl">
      <div className="px-5 py-4 bg-white/5 border-b border-white/10">
        <h3 className="text-sm font-bold text-white/80">Rentabilidad por Ítem</h3>
        <p className="text-xs text-white/40 mt-0.5">Presupuesto vs costo real por ítem cotizado</p>
      </div>
      <div className="p-4">
        {/* Cabecera */}
        <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-2 px-3 pb-2 border-b border-white/10">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-white/30">Ítem</p>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-white/30 text-right">Presupuesto</p>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-white/30 text-right">Costo Real</p>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-white/30 text-right">Utilidad</p>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-white/30 text-right">Margen</p>
        </div>
        {/* Filas */}
        <div className="divide-y divide-white/5">
          {filas.map(({ item, presupuesto, costoReal, utilidad, margen }) => (
            <div
              key={item.id}
              className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-2 px-3 py-3 items-center
                         hover:bg-white/5 transition-colors rounded-xl"
            >
              <p className="text-xs text-white/80 leading-snug truncate">{item.descripcion}</p>
              <p className="text-xs font-mono text-white/50 text-right">{fmt(presupuesto)}</p>
              <p className="text-xs font-mono text-white/50 text-right">{fmt(costoReal)}</p>
              <p className={`text-xs font-mono font-semibold text-right ${
                utilidad >= 0 ? 'text-emerald-400' : 'text-rose-400'
              }`}>
                {fmt(utilidad)}
              </p>
              <p className={`text-xs font-mono font-semibold text-right ${
                margen >= 0 ? 'text-emerald-400' : 'text-rose-400'
              }`}>
                {margen.toFixed(1)}%
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function OrigenRow({
  label, monto, sublabel,
}: {
  label: string; monto: number; sublabel?: string
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-white/20 text-white/90">{label}</span>
        {sublabel && <span className="text-[10px] text-white/60 font-mono">{sublabel}</span>}
      </div>
      <span className="text-sm font-extrabold font-mono text-white/90">{fmt(monto)}</span>
    </div>
  )
}

function SocioCard({
  nombre, retorno, utilidad, total, porcentaje,
}: {
  nombre: string; retorno: number; utilidad: number; total: number; porcentaje: number
}) {
  return (
    <div className="flex items-center justify-between rounded-2xl p-4 bg-white/10 border border-white/20 backdrop-blur-lg">
      <div>
        <p className="text-sm font-bold text-white/90">{nombre} recibe</p>
        <p className="text-[11px] font-mono text-white/60 mt-0.5">
          {fmt(retorno)} retorno + {fmt(utilidad)} utilidad ({porcentaje.toFixed(1)}%)
        </p>
      </div>
      <p className="text-xl font-black font-mono text-white/90">{fmt(total)}</p>
    </div>
  )
}

function FinancialCard({
  label, value, sublabel, icon, isHighlight,
}: {
  label: string; value: string; sublabel: string; icon: React.ReactNode
  isHighlight?: boolean
}) {
  return (
    <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl shadow-xl p-5 transition-all hover:bg-white/10">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold uppercase tracking-widest text-zinc-400">{label}</span>
          {icon}
        </div>
        <div>
          <p className={`text-xl font-black font-mono ${isHighlight ? 'text-blue-500 dark:text-blue-400' : 'text-zinc-900 dark:text-white'}`}>
            {value}
          </p>
          <p className="text-[10px] text-zinc-400 mt-0.5 font-mono">{sublabel}</p>
        </div>
      </div>
    </div>
  )
}
