'use client'

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { X, AlertTriangle, Check } from 'lucide-react'

interface Props {
  estadoLabel: string
  colorCls?: string
  onConfirm: (motivo: string) => void
  onCancel: () => void
}

const MOTIVOS_APLAZADO = [
  'Condiciones climáticas adversas',
  'Falta de quórum de beneficiarios',
  'Cambio de sede o lugar del evento',
  'Problemas logísticos del proveedor',
  'Decisión administrativa interna',
  'Otro',
]

const MOTIVOS_CANCELADO = [
  'Cancelación por parte del contratante',
  'Beneficiarios no disponibles',
  'Orden público / seguridad',
  'Falta de presupuesto aprobado',
  'Duplicidad con otro requerimiento',
  'Otro',
]

export function ModalMotivo({ estadoLabel, colorCls = 'text-zinc-900', onConfirm, onCancel }: Props) {
  const [seleccion, setSeleccion] = useState<string | null>(null)
  const [textoLibre, setTextoLibre] = useState('')

  // Seleccionar lista según el estado destino
  const estadoKey = estadoLabel.toLowerCase()
  const opciones = estadoKey.includes('aplaz') ? MOTIVOS_APLAZADO : MOTIVOS_CANCELADO

  const esOtro = seleccion === 'Otro'
  const motivoFinal = esOtro ? textoLibre.trim() : (seleccion ?? '')
  const puedeConfirmar = esOtro ? textoLibre.trim().length > 0 : seleccion !== null

  const modal = (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel() }}
    >
      <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm mx-4">
        {/* Header */}
        <div className="flex items-start justify-between mb-5">
          <div className="flex items-start gap-2">
            <AlertTriangle strokeWidth={1.5} className="size-5 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <h2 className="font-bold text-zinc-900 text-sm">Motivo requerido</h2>
              <p className="text-sm text-zinc-500 mt-0.5 leading-snug">
                Para cambiar el estado a{' '}
                <span className={`font-semibold ${colorCls}`}>{estadoLabel}</span> selecciona
                el motivo.
              </p>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="text-zinc-400 hover:text-zinc-700 ml-3 shrink-0 transition-colors"
            aria-label="Cerrar"
          >
            <X strokeWidth={1.5} className="size-4" />
          </button>
        </div>

        {/* Opciones */}
        <div className="flex flex-col gap-1.5 mb-4">
          {opciones.map((op) => {
            const activo = seleccion === op
            return (
              <button
                key={op}
                type="button"
                onClick={() => { setSeleccion(op); if (op !== 'Otro') setTextoLibre('') }}
                className={`flex items-center gap-2.5 w-full text-left px-3 py-2.5 rounded-xl text-sm
                            border transition-all ${
                              activo
                                ? 'border-blue-400 bg-blue-50 text-blue-800 font-medium'
                                : 'border-zinc-200 bg-zinc-50 text-zinc-700 hover:border-zinc-300 hover:bg-zinc-100'
                            }`}
              >
                <span className={`size-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                  activo ? 'border-blue-500 bg-blue-500' : 'border-zinc-300'
                }`}>
                  {activo && <Check strokeWidth={1.5} className="size-2.5 text-white stroke-[3]" />}
                </span>
                {op}
              </button>
            )
          })}
        </div>

        {/* Texto libre cuando se elige "Otro" */}
        {esOtro && (
          <textarea
            className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm
                       resize-none focus:outline-none focus:ring-2 focus:ring-blue-400
                       focus:border-transparent min-h-[80px] transition-shadow mb-4"
            placeholder="Describe el motivo..."
            value={textoLibre}
            onChange={(e) => setTextoLibre(e.target.value)}
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
          />
        )}

        {/* Footer */}
        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm rounded-xl text-zinc-600 hover:bg-zinc-100 transition-colors font-medium"
          >
            Cancelar
          </button>
          <button
            disabled={!puedeConfirmar}
            onClick={() => onConfirm(motivoFinal)}
            className="px-4 py-2 text-sm rounded-xl font-semibold bg-blue-600 text-white
                       hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed
                       transition-colors"
          >
            Confirmar cambio
          </button>
        </div>
      </div>
    </div>
  )

  if (typeof window === 'undefined') return null
  return createPortal(modal, document.body)
}
