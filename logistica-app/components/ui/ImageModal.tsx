'use client'

import { useEffect } from 'react'
import { X } from 'lucide-react'

interface ImageModalProps {
  url: string | null
  onClose: () => void
  alt?: string
}

export function ImageModal({ url, onClose, alt = "Evidencia" }: ImageModalProps) {
  // Cierra con la tecla Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  if (!url) return null

  // Si es un PDF, no lo mostramos en etiqueta <img> sino en un iframe o damos opción de descarga.
  // Pero aquí asumiremos mayoritariamente imágenes, o usaremos un iframe genérico.
  const isPdf = url.toLowerCase().includes('.pdf')

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-zinc-950/80 backdrop-blur-md p-4 sm:p-8 transition-opacity duration-300"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="relative w-full max-w-5xl max-h-full glass-panel bg-white/10 rounded-3xl overflow-hidden flex flex-col shadow-2xl border border-white/20 animate-in zoom-in-95 duration-200">
        <div className="absolute top-4 right-4 z-10">
          <button
            onClick={onClose}
            className="p-2 bg-black/50 hover:bg-black/70 text-white rounded-full backdrop-blur-md transition-colors"
            aria-label="Cerrar"
          >
            <X strokeWidth={2} className="size-5" />
          </button>
        </div>
        
        <div className="flex-1 overflow-auto flex items-center justify-center p-4">
          {isPdf ? (
            <iframe
              src={url}
              className="w-full h-[80vh] rounded-xl bg-white"
              title={alt}
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={url}
              alt={alt}
              className="max-w-full max-h-[85vh] object-contain rounded-xl shadow-lg"
            />
          )}
        </div>
      </div>
    </div>
  )
}
