'use client'

import { useState, useEffect } from 'react'
import { Download, Loader2, X } from 'lucide-react'
import type { InformeActividad, ReembolsoInforme } from '@/actions/informes'

interface Props {
  label: string
  tipo: 'lista-asistencia' | 'recibo-satisfaccion'
  actividad: InformeActividad
  reembolsos: ReembolsoInforme[]
}

// ── Toast mínimo (patrón consistente con AgendaView) ────────────────────────
type ToastType = 'success' | 'warning' | 'error'

function Toast({
  type,
  message,
  onClose,
}: {
  type: ToastType
  message: string
  onClose: () => void
}) {
  useEffect(() => {
    const t = setTimeout(onClose, 7000)
    return () => clearTimeout(t)
  }, [onClose])

  const colorClass =
    type === 'success'
      ? 'pill-ok'
      : type === 'warning'
        ? 'pill-prep'
        : 'pill-cancel'

  return (
    <div
      className={`fixed top-20 right-6 z-[60] flex items-center gap-3 px-4 py-3 rounded-2xl
                  backdrop-blur-xl border border-white/20 shadow-lg
                  animate-in slide-in-from-right-4 max-w-sm ${colorClass}`}
    >
      <span className="text-sm font-medium">{message}</span>
      <button onClick={onClose} aria-label="Cerrar aviso">
        <X className="size-4 opacity-50" />
      </button>
    </div>
  )
}

// ── Componente principal ─────────────────────────────────────────────────────
export function DescargarPDFButton({ label, tipo, actividad, reembolsos }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<{ type: ToastType; message: string } | null>(null)

  function getNumeroRequerimientoLabel() {
    const value = actividad.numero_requerimiento?.toString().trim()
    return value && value.length > 0 ? value : 'SIN_NUMERO_REQUERIMIENTO'
  }

  function getBaseFileName() {
    const req = getNumeroRequerimientoLabel()
    return tipo === 'lista-asistencia' ? `DOCUMENTOS ${req}` : `RECIBO DE SATIFACCION ${req}`
  }

  function triggerDownload(blob: Blob, fileName: string) {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    a.click()
    URL.revokeObjectURL(url)
  }

  async function handleClick() {
    setLoading(true)
    setError(null)
    setToast(null)

    try {
      const response = await fetch('/api/informes/generar-formato', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo, actividad, reembolsos }),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => null) as { error?: string } | null
        throw new Error(data?.error ?? 'No se pudo generar el documento')
      }

      const conversionStatus = response.headers.get('X-Conversion-Status') ?? ''
      const blob = await response.blob()
      const baseName = getBaseFileName()

      if (conversionStatus === 'ERR_QUOTA_EXCEEDED') {
        // Cuota agotada: avisar al usuario y descargar el DOCX de respaldo
        setToast({
          type: 'warning',
          message:
            'Límite de conversiones gratuitas alcanzado. Recarga créditos en CloudConvert. Descargando versión editable (Word) como respaldo...',
        })
        triggerDownload(blob, `${baseName}.docx`)
        return
      }

      if (conversionStatus === 'pdf_ok') {
        triggerDownload(blob, `${baseName}.pdf`)
        return
      }

      // Cualquier otro estado (no_api_key, ERR_PROVIDER_ERROR, ERR_TIMEOUT, etc.)
      // → descargar el DOCX silenciosamente
      triggerDownload(blob, `${baseName}.docx`)
    } catch (err) {
      console.error('Error generando formato:', err)
      setError(err instanceof Error ? err.message : 'No se pudo generar el documento')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}
      <div className="flex flex-col gap-1">
        <button
          onClick={handleClick}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all
                     [background:var(--surface-raised)] [color:var(--text-primary)]
                     hover:[background:var(--surface-border)] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Download strokeWidth={1.5} className="size-3.5" />
          )}
          {label}
        </button>
        {error && <span className="text-xs text-rose-400">{error}</span>}
      </div>
    </>
  )
}

