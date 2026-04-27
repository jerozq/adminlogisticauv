'use client'

import { useTransition, useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { ChevronDown, Loader2, Lock } from 'lucide-react'
import { cambiarEstadoActividad } from '@/actions/ejecucion'
import { TRANSICIONES_PERMITIDAS } from '@/lib/transiciones'
import type { EstadoActividad } from '@/lib/transiciones'
import { ModalMotivo } from './ModalMotivo'

interface Props {
  actividadId: string
  estadoActual: string
}

const ESTADOS: { value: EstadoActividad; label: string; cls: string; colorCls: string }[] = [
  { value: 'generado',     label: 'Preparado',    cls: '[color:var(--state-prep-fg)] hover:[background:var(--state-prep-bg)]',   colorCls: '[color:var(--state-prep-fg)]'   },
  { value: 'en_ejecucion', label: 'En Ejecución', cls: '[color:var(--state-run-fg)] hover:[background:var(--state-run-bg)]',    colorCls: '[color:var(--state-run-fg)]'  },
  { value: 'liquidado',    label: 'Liquidado',    cls: '[color:var(--state-ok-fg)] hover:[background:var(--state-ok-bg)]',      colorCls: '[color:var(--state-ok-fg)]'   },
  { value: 'aplazado',     label: 'Aplazado',     cls: '[color:var(--state-hold-fg)] hover:[background:var(--state-hold-bg)]',  colorCls: '[color:var(--state-hold-fg)]' },
  { value: 'cancelado',    label: 'Cancelado',    cls: '[color:var(--state-cancel-fg)] hover:[background:var(--state-cancel-bg)]', colorCls: '[color:var(--state-cancel-fg)]'   },
]

const BADGE: Record<EstadoActividad, string> = {
  generado:     'pill-prep',
  en_ejecucion: 'pill-run',
  liquidado:    'pill-ok',
  aplazado:     'pill-hold',
  cancelado:    'pill-cancel',
}

const DOT: Record<EstadoActividad, string> = {
  generado:     'var(--state-prep-dot)',
  en_ejecucion: 'var(--state-run-dot)',
  liquidado:    'var(--state-ok-dot)',
  aplazado:     'var(--state-hold-dot)',
  cancelado:    'var(--state-cancel-dot)',
}

/** Estados que requieren un motivo en modal antes de confirmar */
const NECESITA_MOTIVO: EstadoActividad[] = ['aplazado', 'cancelado']

/** Estados finales: no permiten ningún cambio saliente */
const ESTADOS_FINALES: EstadoActividad[] = ['liquidado', 'cancelado']

export function CambiarEstadoButton({ actividadId, estadoActual }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({})
  const [pendingEstado, setPendingEstado] = useState<EstadoActividad | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)

  const estadoActualTyped = estadoActual as EstadoActividad
  const esFinal = ESTADOS_FINALES.includes(estadoActualTyped)
  const permitidos = TRANSICIONES_PERMITIDAS[estadoActualTyped] ?? []
  const opcionesDropdown = ESTADOS.filter((e) => permitidos.includes(e.value))

  // Posición fija del dropdown (portal escape)
  useEffect(() => {
    if (!open || !btnRef.current) return
    const rect = btnRef.current.getBoundingClientRect()
    setDropdownStyle({
      position: 'fixed',
      top: rect.bottom + 4,
      left: rect.left,
      zIndex: 9999,
      minWidth: 180,
    })
  }, [open])

  // Cerrar al clic fuera
  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (btnRef.current && !btnRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Cerrar al scroll para evitar desincronización
  useEffect(() => {
    if (!open) return
    function handler() { setOpen(false) }
    window.addEventListener('scroll', handler, true)
    return () => window.removeEventListener('scroll', handler, true)
  }, [open])

  function ejecutarCambio(nuevoEstado: EstadoActividad, motivo?: string) {
    setError(null)
    startTransition(async () => {
      try {
        await cambiarEstadoActividad(actividadId, nuevoEstado, motivo)
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error al cambiar el estado.')
      }
    })
  }

  function handleSelect(nuevoEstado: EstadoActividad) {
    if (nuevoEstado === estadoActualTyped) { setOpen(false); return }
    setOpen(false)
    if (NECESITA_MOTIVO.includes(nuevoEstado)) {
      setPendingEstado(nuevoEstado)
    } else {
      ejecutarCambio(nuevoEstado)
    }
  }

  const badgeCls = BADGE[estadoActualTyped] ?? 'bg-zinc-100 text-zinc-600 ring-zinc-200'
  const currentLabel = ESTADOS.find((e) => e.value === estadoActual)?.label ?? estadoActual
  const pendingMeta = ESTADOS.find((e) => e.value === pendingEstado)

  // Estado final → badge bloqueado sin interacción
  if (esFinal) {
    return (
      <div className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-xl ${badgeCls}`}>
        <span className="size-1.5 rounded-full flex-shrink-0" style={{ background: DOT[estadoActualTyped] }} />
        {currentLabel}
        <Lock strokeWidth={1.5} className="size-3 opacity-40" />
      </div>
    )
  }

  const dropdown = open ? (
    <div style={dropdownStyle} className="rounded-xl surface-card py-1 overflow-hidden">
      {opcionesDropdown.length === 0 ? (
        <p className="px-3 py-2 text-xs text-zinc-400">Sin transiciones disponibles</p>
      ) : (
        opcionesDropdown.map((e) => (
          <button
            key={e.value}
            onMouseDown={(ev) => { ev.preventDefault(); handleSelect(e.value) }}
            className={`w-full text-left px-3 py-2 text-xs font-medium transition-colors flex items-center gap-2 ${e.cls}`}
          >
            <span className="size-1.5 rounded-full flex-shrink-0" style={{ background: `var(--state-${e.value === 'generado' ? 'prep' : e.value === 'en_ejecucion' ? 'run' : e.value === 'liquidado' ? 'ok' : e.value === 'aplazado' ? 'hold' : 'cancel'}-dot)` }} />
            {e.label}
            {NECESITA_MOTIVO.includes(e.value) && (
              <span className="ml-auto [color:var(--text-muted)] text-[10px] font-normal">· requiere motivo</span>
            )}
          </button>
        ))
      )}
    </div>
  ) : null

  return (
    <>
      <div className="flex flex-col items-start gap-1">
        <button
          ref={btnRef}
          onClick={() => setOpen((o) => !o)}
          disabled={isPending}
          className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-xl
                      transition-colors disabled:opacity-50 cursor-pointer ${badgeCls}`}
        >
          {isPending
            ? <Loader2 strokeWidth={1.5} className="size-3 animate-spin" />
            : <span className="size-1.5 rounded-full flex-shrink-0" style={{ background: DOT[estadoActualTyped] }} />
          }
          {currentLabel}
          <ChevronDown strokeWidth={1.5} className={`size-3 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
        {error && (
          <p className="text-[10px] text-red-500 leading-tight max-w-[180px] break-words">{error}</p>
        )}
      </div>

      {typeof window !== 'undefined' && dropdown && createPortal(dropdown, document.body)}

      {pendingEstado && pendingMeta && (
        <ModalMotivo
          estadoLabel={pendingMeta.label}
          colorCls={pendingMeta.colorCls}
          onConfirm={(motivo) => {
            const estado = pendingEstado
            setPendingEstado(null)
            ejecutarCambio(estado, motivo)
          }}
          onCancel={() => setPendingEstado(null)}
        />
      )}
    </>
  )
}

