'use client'

import { createPortal } from 'react-dom'
import Link from 'next/link'
import { AlertTriangle, X } from 'lucide-react'
import type { LiquidacionResumen } from '@/actions/liquidaciones'

const COP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })

interface Props {
  resumen: LiquidacionResumen
  onConfirm: () => void
  onCancel: () => void
}

/** Avisa antes de marcar una actividad como "Liquidado" si la liquidación real parece pendiente. */
export function AlertaLiquidacionModal({ resumen, onConfirm, onCancel }: Props) {
  const sinNada = resumen.abonado === 0 && resumen.costosEjecutados === 0
  const tieneDevolucionPendiente = resumen.devolucionesPendientes > 0

  const modal = (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel() }}
    >
      <div className="bg-slate-950/95 backdrop-blur-xl rounded-2xl border border-white/10 shadow-2xl p-6 w-full max-w-sm mx-4">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-start gap-2">
            <AlertTriangle strokeWidth={1.5} className="size-5 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <h2 className="font-bold text-slate-100 text-sm">La liquidación parece pendiente</h2>
              <p className="text-sm text-slate-400 mt-0.5 leading-snug">
                {sinNada && 'No hay abonos ni costos registrados para esta actividad todavía. '}
                {tieneDevolucionPendiente && `Hay ${COP.format(resumen.devolucionesPendientes)} pendientes por devolver a la Unidad. `}
                ¿Seguro que quieres marcarla como Liquidada de todas formas?
              </p>
            </div>
          </div>
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-200 ml-3 shrink-0" aria-label="Cerrar">
            <X strokeWidth={1.5} className="size-4" />
          </button>
        </div>

        <div className="flex flex-col gap-2">
          <Link
            href={`/liquidaciones/${resumen.id}`}
            className="text-center px-4 py-2.5 text-sm rounded-xl font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors"
          >
            Revisar liquidación primero
          </Link>
          <button
            onClick={onConfirm}
            className="px-4 py-2.5 text-sm rounded-xl text-slate-300 hover:bg-white/10 transition-colors font-medium"
          >
            Marcar como liquidada de todas formas
          </button>
          <button
            onClick={onCancel}
            className="px-4 py-2 text-xs rounded-xl text-slate-500 hover:text-slate-300 transition-colors"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )

  if (typeof window === 'undefined') return null
  return createPortal(modal, document.body)
}
