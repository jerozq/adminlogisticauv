'use client'

import { useState } from 'react'
import { Download, Loader2, AlertCircle } from 'lucide-react'
import type { InformeActividad, ReembolsoInforme } from '@/actions/informes'

interface Props {
  actividadId: string
  actividad: InformeActividad
  reembolsos: ReembolsoInforme[]
}

/** Descarga en un solo .zip todos los documentos ya subidos: RS, Asistencia, Reembolsos y Evidencias. */
export function DescargarTodoButton({ actividadId, actividad, reembolsos }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const hayAlgoParaDescargar =
    !!actividad.recibo_satisfaccion_firmado_url ||
    !!actividad.lista_asistencia_firmada_url ||
    !!actividad.informe_pdf3_url ||
    reembolsos.some((r) => r.reembolso_firmado_url || r.cedula_url)

  async function handleClick() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/informes/descargar-todo?actividadId=${actividadId}`)
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error ?? 'No se pudo generar el archivo.')
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `Informe-${actividad.numero_requerimiento || actividadId}.zip`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error inesperado')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center gap-2 mb-4">
      <button
        onClick={handleClick}
        disabled={loading || !hayAlgoParaDescargar}
        title={hayAlgoParaDescargar ? undefined : 'Sube al menos un documento para poder descargar'}
        className="flex items-center gap-2 rounded-xl btn-primary px-4 py-2 text-xs font-semibold disabled:opacity-50 transition-colors"
      >
        {loading ? <Loader2 strokeWidth={1.5} className="size-3.5 animate-spin" /> : <Download strokeWidth={1.5} className="size-3.5" />}
        {loading ? 'Preparando...' : 'Descargar todo (RS, Asistencia, Reembolsos, Evidencias)'}
      </button>
      {error && (
        <span className="flex items-center gap-1 text-xs [color:var(--state-cancel-fg)]">
          <AlertCircle strokeWidth={1.5} className="size-3.5" />
          {error}
        </span>
      )}
    </div>
  )
}
