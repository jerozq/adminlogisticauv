'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createPortal } from 'react-dom'
import { PiggyBank, X, Check, Loader2 } from 'lucide-react'
import { registrarCostoReal } from '@/actions/liquidaciones'

interface Props {
  actividadId: string
}

/**
 * Cierre rápido del balance de una actividad ya ejecutada: registra UN costo
 * total (sin desglosar por ítem) para poder ver cotizado vs. costo vs. utilidad
 * sin tener que pasar por el flujo completo de Liquidaciones. El detalle
 * itemizado sigue disponible ahí para quien lo quiera.
 */
export function RegistrarCostoRapidoButton({ actividadId }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [descripcion, setDescripcion] = useState('Costo total de la actividad')
  const [valor, setValor] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, startSaving] = useTransition()

  function handleSave() {
    const monto = Number(valor)
    if (!monto || monto <= 0) {
      setError('Ingresa un valor mayor a cero.')
      return
    }
    setError(null)
    startSaving(async () => {
      try {
        await registrarCostoReal({
          actividadId,
          itemId: null,
          descripcion: descripcion.trim() || 'Costo total de la actividad',
          modo: 'TOTAL',
          cantidad: 1,
          valor: monto,
        })
        setOpen(false)
        setValor('')
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Error al guardar el costo.')
      }
    })
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-xl border [border-color:var(--surface-border)] bg-transparent px-3 py-2 text-xs font-semibold [color:var(--text-secondary)] hover:[background:var(--surface-raised)] transition-colors shrink-0"
        title="Registrar el costo total de esta actividad sin desglosar por ítem"
      >
        <PiggyBank strokeWidth={1.5} className="size-3.5" />
        Registrar costo total
      </button>

      {open && typeof window !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false) }}
        >
          <div className="bg-slate-950/95 backdrop-blur-xl rounded-2xl border border-white/10 shadow-2xl p-6 w-full max-w-sm mx-4">
            <div className="flex items-start justify-between mb-4">
              <h2 className="font-bold text-slate-100 text-sm">Registrar costo total</h2>
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-200" aria-label="Cerrar">
                <X strokeWidth={1.5} className="size-4" />
              </button>
            </div>
            <p className="text-xs text-slate-400 mb-4 leading-snug">
              Para cerrar el balance rápido sin desglosar ítem por ítem. Si luego quieres el detalle completo, puedes editarlo desde Liquidaciones.
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Descripción</label>
                <input
                  value={descripcion}
                  onChange={(e) => setDescripcion(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Valor total (COP)</label>
                <input
                  type="number"
                  min={1}
                  step={1000}
                  value={valor}
                  onChange={(e) => setValor(e.target.value)}
                  placeholder="0"
                  autoFocus
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"
                />
              </div>
              {error && <p className="text-xs text-red-400">{error}</p>}
            </div>
            <div className="flex gap-2 justify-end mt-5">
              <button
                onClick={() => setOpen(false)}
                className="px-4 py-2 text-sm rounded-xl text-slate-300 hover:bg-white/10 transition-colors font-medium"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-xl font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {saving ? <Loader2 strokeWidth={1.5} className="size-3.5 animate-spin" /> : <Check strokeWidth={1.5} className="size-3.5" />}
                Guardar
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
