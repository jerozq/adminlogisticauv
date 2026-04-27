'use client'

import { useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

// ============================================================
// GlassModal — Componente reutilizable de overlay Liquid Glass
//
// Consolida el patrón repetido en 6+ modales:
//   - Overlay con backdrop-blur
//   - Cierre por click externo / Escape
//   - Animación de entrada
//   - Header opcional con título + botón cerrar
//   - Footer opcional con acciones
//
// Uso:
//   <GlassModal open={isOpen} onClose={handleClose} title="Mi Modal">
//     <p>Contenido del modal</p>
//   </GlassModal>
// ============================================================

export interface GlassModalProps {
  /** Controla la visibilidad del modal */
  open: boolean
  /** Callback para cerrar el modal */
  onClose: () => void
  /** Título en el header (opcional — si no se pasa, no renderiza header) */
  title?: string
  /** Subtítulo debajo del título */
  subtitle?: string
  /** Icono a la izquierda del título */
  icon?: React.ReactNode
  /** Ancho máximo del modal (default: max-w-md) */
  maxWidth?: 'max-w-sm' | 'max-w-md' | 'max-w-lg' | 'max-w-xl' | 'max-w-2xl'
  /** z-index del overlay (default: z-50) */
  zIndex?: 'z-50' | 'z-[100]' | 'z-[1000]'
  /** Contenido del footer (botones de acción) */
  footer?: React.ReactNode
  /** Contenido principal del modal */
  children: React.ReactNode
  /** Si true, usa createPortal para renderizar en document.body */
  portal?: boolean
}

export function GlassModal({
  open,
  onClose,
  title,
  subtitle,
  icon,
  maxWidth = 'max-w-md',
  zIndex = 'z-50',
  footer,
  children,
  portal = false,
}: GlassModalProps) {
  // Cerrar con Escape
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    },
    [onClose]
  )

  useEffect(() => {
    if (!open) return
    document.addEventListener('keydown', handleKeyDown)
    // Prevenir scroll del body
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = prev
    }
  }, [open, handleKeyDown])

  if (!open) return null

  const content = (
    <div
      className={`fixed inset-0 ${zIndex} flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 transition-all duration-300`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className={`modal-card rounded-2xl shadow-2xl w-full ${maxWidth} overflow-hidden animate-in zoom-in-95 duration-200`}
      >
        {/* Header */}
        {title && (
          <div className="flex items-center justify-between px-5 py-4 border-b [border-color:var(--surface-border)]">
            <div className="flex items-center gap-2 min-w-0">
              {icon}
              <div className="min-w-0">
                {subtitle && (
                  <p className="text-xs [color:var(--text-muted)]">{subtitle}</p>
                )}
                <h2 className="font-semibold [color:var(--text-primary)] text-sm leading-tight truncate">
                  {title}
                </h2>
              </div>
            </div>
            <button
              onClick={onClose}
              className="[color:var(--text-muted)] hover:[color:var(--text-primary)] ml-3 shrink-0 transition-colors"
              aria-label="Cerrar"
            >
              <X strokeWidth={1.5} className="size-4" />
            </button>
          </div>
        )}

        {/* Body */}
        <div className="px-5 py-4 max-h-[70vh] overflow-y-auto">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="px-5 py-3 border-t [border-color:var(--surface-border)] flex justify-end gap-2">
            {footer}
          </div>
        )}
      </div>
    </div>
  )

  if (portal && typeof window !== 'undefined') {
    return createPortal(content, document.body)
  }

  return content
}
