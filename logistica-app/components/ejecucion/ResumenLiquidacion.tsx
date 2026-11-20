import Link from 'next/link'
import { Wallet, ArrowRight } from 'lucide-react'
import type { LiquidacionResumen } from '@/actions/liquidaciones'
import { RegistrarCostoRapidoButton } from './RegistrarCostoRapidoButton'

const COP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })

/** Snapshot financiero de la actividad, visible en Ejecución, con acceso directo a Liquidaciones. */
export function ResumenLiquidacion({ resumen }: { resumen: LiquidacionResumen | null }) {
  if (!resumen) return null

  const sinNada = resumen.abonado === 0 && resumen.costosEjecutados === 0
  const tieneDevolucionPendiente = resumen.devolucionesPendientes > 0
  const utilidadNeta = resumen.cotizado - resumen.costosEjecutados

  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl surface-card px-4 py-3">
      <Link
        href={`/liquidaciones/${resumen.id}`}
        className="flex items-center gap-3 min-w-0 flex-1 hover:opacity-80 transition-opacity group"
      >
        <Wallet strokeWidth={1.5} className="size-4 [color:var(--text-muted)] shrink-0" />
        <div className="flex flex-wrap items-center gap-x-4 gap-y-0.5 text-xs">
          <span>
            <span className="[color:var(--text-muted)]">Cotizado: </span>
            <span className="font-semibold [color:var(--text-primary)]">{COP.format(resumen.cotizado)}</span>
          </span>
          <span>
            <span className="[color:var(--text-muted)]">Costos: </span>
            <span className="font-semibold [color:var(--text-primary)]">{COP.format(resumen.costosEjecutados)}</span>
          </span>
          <span>
            <span className="[color:var(--text-muted)]">Utilidad neta: </span>
            <span className={`font-semibold ${utilidadNeta >= 0 ? '[color:var(--state-ok-fg)]' : '[color:var(--state-cancel-fg)]'}`}>
              {COP.format(utilidadNeta)}
            </span>
          </span>
          <span>
            <span className="[color:var(--text-muted)]">Abonado: </span>
            <span className="font-semibold [color:var(--state-ok-fg)]">{COP.format(resumen.abonado)}</span>
          </span>
          {tieneDevolucionPendiente && (
            <span className="font-semibold [color:var(--state-cancel-fg)]">
              {COP.format(resumen.devolucionesPendientes)} por devolver
            </span>
          )}
          {sinNada && (
            <span className="[color:var(--text-muted)] italic">Sin movimientos registrados todavía</span>
          )}
        </div>
        <span className="flex items-center gap-1 text-xs font-semibold [color:var(--accent)] shrink-0 ml-auto">
          Detalle
          <ArrowRight strokeWidth={1.5} className="size-3.5 transition-transform group-hover:translate-x-0.5" />
        </span>
      </Link>
      <RegistrarCostoRapidoButton actividadId={resumen.id} />
    </div>
  )
}
