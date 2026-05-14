'use client'

import { useRef, useState, useTransition } from 'react'
import { Upload, Check, Loader2, AlertCircle, ExternalLink, RotateCcw } from 'lucide-react'
import { uploadInforme } from '@/lib/supabase-browser'

// ============================================================
// UploadDocumento
//
// Botón de carga reutilizable para el módulo de Informes.
// Flujo: seleccionar archivo → subir a bucket 'informes' →
//        llamar onSuccess(url) para persistir en BD.
//
// Estados visuales:
//   idle        → botón con color según si ya hay doc o no
//   uploading   → spinner + texto "Subiendo..."
//   saving      → spinner + texto "Guardando..."
//   success     → check verde "Guardado"
//   error       → rojo con mensaje
// ============================================================

type UploadFolder = 'firmados' | 'cedulas' | 'asistencia' | 'pdfs'
type Status = 'idle' | 'uploading' | 'saving' | 'success' | 'error'

interface Props {
  /** Texto del botón cuando no hay documento */
  label: string
  /** URL actual (si ya fue subido antes) */
  currentUrl: string | null
  /** Subcarpeta en el bucket 'informes' */
  uploadFolder: UploadFolder
  /** Tipos MIME aceptados */
  accept?: string
  /** Llamado con la URL pública tras subir al Storage */
  onSuccess: (url: string) => Promise<void>
}

export function UploadDocumento({
  label,
  currentUrl,
  uploadFolder,
  accept = 'application/pdf,image/jpeg,image/png,image/webp,image/heic',
  onSuccess,
}: Props) {
  const [status, setStatus] = useState<Status>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [, startTransition] = useTransition()
  const inputRef = useRef<HTMLInputElement>(null)

  const hasDoc = !!currentUrl
  const isLoading = status === 'uploading' || status === 'saving'

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (inputRef.current) inputRef.current.value = ''

    setStatus('uploading')
    setErrorMsg(null)

    let publicUrl: string
    try {
      publicUrl = await uploadInforme(file, uploadFolder)
    } catch (err) {
      setStatus('error')
      setErrorMsg(err instanceof Error ? err.message : 'Error al subir el archivo')
      return
    }

    setStatus('saving')
    startTransition(async () => {
      try {
        await onSuccess(publicUrl)
        setStatus('success')
        // Volver a idle después de 3 s para permitir reemplazar
        setTimeout(() => setStatus('idle'), 3000)
      } catch (err) {
        setStatus('error')
        setErrorMsg(err instanceof Error ? err.message : 'Error al guardar la URL')
      }
    })
  }

  // ── Render ────────────────────────────────────────────────
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Ver documento existente */}
      {hasDoc && status === 'idle' && (
        <a
          href={currentUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs font-medium text-emerald-400 hover:text-emerald-300 transition-colors"
        >
          <Check strokeWidth={2} className="size-3.5" />
          Subido
          <ExternalLink strokeWidth={1.5} className="size-3 opacity-60" />
        </a>
      )}

      {/* Botón de carga */}
      <label
        className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold
                    border cursor-pointer transition-all select-none
                    ${isLoading ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''}
                    ${
                      status === 'success'
                        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                        : status === 'error'
                        ? 'border-rose-500/30 bg-rose-500/10 text-rose-300'
                        : hasDoc
                        ? 'border-white/10 bg-white/5 [color:var(--text-muted)] hover:bg-white/10 hover:[color:var(--text-secondary)]'
                        : 'border-violet-500/30 bg-violet-500/10 text-violet-300 hover:bg-violet-500/20'
                    }`}
      >
        {isLoading ? (
          <Loader2 strokeWidth={2} className="size-3.5 animate-spin" />
        ) : status === 'success' ? (
          <Check strokeWidth={2} className="size-3.5" />
        ) : status === 'error' ? (
          <AlertCircle strokeWidth={2} className="size-3.5" />
        ) : hasDoc ? (
          <RotateCcw strokeWidth={1.5} className="size-3.5" />
        ) : (
          <Upload strokeWidth={1.5} className="size-3.5" />
        )}

        {isLoading
          ? status === 'uploading'
            ? 'Subiendo…'
            : 'Guardando…'
          : status === 'success'
          ? 'Guardado'
          : status === 'error'
          ? 'Reintentar'
          : hasDoc
          ? 'Reemplazar'
          : label}

        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="hidden"
          disabled={isLoading}
          onChange={handleChange}
        />
      </label>

      {/* Mensaje de error inline */}
      {status === 'error' && errorMsg && (
        <span className="text-xs text-rose-400 max-w-[160px] truncate" title={errorMsg}>
          {errorMsg}
        </span>
      )}
    </div>
  )
}
