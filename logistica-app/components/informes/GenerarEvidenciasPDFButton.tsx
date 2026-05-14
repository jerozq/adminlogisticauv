'use client'

import { useState } from 'react'
import { Images, Loader2 } from 'lucide-react'
import type { InformeActividad, EvidenciaInforme } from '@/actions/informes'
import { subirDocumentoActividad } from '@/actions/informes'
import { uploadInforme } from '@/lib/supabase-browser'

interface Props {
  actividad: InformeActividad
  evidencias: EvidenciaInforme[]
  onSuccess?: (url: string) => void
}

type State = 'idle' | 'generating' | 'uploading' | 'saving' | 'done' | 'error'

export function GenerarEvidenciasPDFButton({ actividad, evidencias, onSuccess }: Props) {
  const [state, setState] = useState<State>('idle')
  const [error, setError] = useState<string | null>(null)

  const hasPdf = !!actividad.informe_pdf3_url

  function getNumeroRequerimientoLabel() {
    const value = actividad.numero_requerimiento?.toString().trim()
    return value && value.length > 0 ? value : 'SIN_NUMERO_REQUERIMIENTO'
  }

  async function handleClick() {
    if (evidencias.length === 0) return
    setState('generating')
    setError(null)

    try {
      // 1. Generate PDF
      const [{ EvidenciasPDF }, { pdf }] = await Promise.all([
        import('./pdf/EvidenciasPDF'),
        import('@react-pdf/renderer'),
      ])
      const blob = await pdf(
        <EvidenciasPDF actividad={actividad} evidencias={evidencias} />
      ).toBlob()

      // 2. Convert blob to File for upload
      setState('uploading')
      const req = getNumeroRequerimientoLabel()
      const file = new File([blob], `EVIDENCIAS ${req}.pdf`, { type: 'application/pdf' })
      const url = await uploadInforme(file, 'pdfs')

      // 3. Save URL to DB
      setState('saving')
      const result = await subirDocumentoActividad(actividad.id, 'informe_pdf3_url', url)
      if (!result.ok) throw new Error(result.error ?? 'Error guardando en BD')

      setState('done')
      onSuccess?.(url)
    } catch (err) {
      console.error('Error generando PDF evidencias:', err)
      setError(err instanceof Error ? err.message : 'Error desconocido')
      setState('error')
    }
  }

  const labels: Record<State, string> = {
    idle: hasPdf ? 'Regenerar PDF Evidencias' : 'Generar PDF Evidencias',
    generating: 'Generando PDF…',
    uploading: 'Subiendo…',
    saving: 'Guardando…',
    done: 'PDF guardado',
    error: 'Reintentar',
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        onClick={handleClick}
        disabled={state === 'generating' || state === 'uploading' || state === 'saving' || evidencias.length === 0}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all
                   bg-violet-600 text-white hover:bg-violet-500
                   disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {(state === 'generating' || state === 'uploading' || state === 'saving')
          ? <Loader2 className="size-3.5 animate-spin" />
          : <Images strokeWidth={1.5} className="size-3.5" />
        }
        {labels[state]}
      </button>
      {state === 'done' && actividad.informe_pdf3_url && (
        <a
          href={actividad.informe_pdf3_url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-violet-400 underline underline-offset-2"
        >
          Ver PDF
        </a>
      )}
      {error && <span className="text-xs text-rose-400">{error}</span>}
      {evidencias.length === 0 && (
        <span className="text-xs [color:var(--text-muted)]">Sin evidencias disponibles</span>
      )}
    </div>
  )
}
