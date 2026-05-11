'use client'

import { useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, FileText, Loader2, Receipt, Save } from 'lucide-react'
import {
  guardarDocumentoProyecto,
  type DocumentoCampos,
  type TipoDocumentoProyecto,
} from '@/actions/documentos-proyecto'
import { GlassModal } from '@/components/ui/GlassModal'

export interface DocumentoProyectoStateClient {
  campos: DocumentoCampos
  updatedAt: string | null
  persistido: boolean
}

export interface DocumentosProyectoStateClient {
  COTIZACION: DocumentoProyectoStateClient
  CUENTA_COBRO: DocumentoProyectoStateClient
}

interface Props {
  proyectoId: string
  identificadorProyecto: string
  documentosIniciales: DocumentosProyectoStateClient
  triggerLabel?: string
  triggerClassName?: string
  triggerTitle?: string
  showFooterDownload?: boolean
}

const TABS: Array<{ id: TipoDocumentoProyecto; label: string; icon: React.ReactNode }> = [
  { id: 'COTIZACION', label: 'Cotizacion', icon: <FileText className="size-4" /> },
  { id: 'CUENTA_COBRO', label: 'Cuenta de Cobro', icon: <Receipt className="size-4" /> },
]

const CAMPOS_POR_TIPO: Record<
  TipoDocumentoProyecto,
  Array<{ key: string; label: string; placeholder: string }>
> = {
  COTIZACION: [
    { key: 'created_at', label: 'Fecha cotizacion', placeholder: 'Ej: 11 de mayo de 2026' },
    { key: 'numero_requerimiento', label: 'Numero requerimiento', placeholder: 'Ej: 712PE' },
    { key: 'municipio', label: 'Municipio', placeholder: 'Ej: Buenaventura' },
    { key: 'departamento', label: 'Departamento', placeholder: 'Ej: Valle del Cauca' },
  ],
  CUENTA_COBRO: [
    { key: 'fecha', label: 'Fecha cuenta de cobro', placeholder: 'Ej: 11 de mayo de 2026' },
    { key: 'numero_requerimiento', label: 'Numero requerimiento', placeholder: 'Ej: 712PE' },
    { key: 'nombre_actividad', label: 'Nombre actividad', placeholder: 'Ej: Entrega digna...' },
    { key: 'municipio', label: 'Municipio', placeholder: 'Ej: Buenaventura' },
    { key: 'departamento', label: 'Departamento', placeholder: 'Ej: Valle del Cauca' },
    { key: 'responsable', label: 'Responsable', placeholder: 'Nombre responsable' },
    { key: 'concepto', label: 'Concepto', placeholder: 'Texto del concepto en plantilla' },
    { key: 'valor_numeros', label: 'Valor en numeros', placeholder: 'Ej: 1.250.000' },
    { key: 'valor_letras', label: 'Valor en letras', placeholder: 'Ej: un millon doscientos cincuenta mil pesos' },
  ],
}

function limpiarCampos(campos: DocumentoCampos): DocumentoCampos {
  return Object.entries(campos).reduce<DocumentoCampos>((acc, [key, value]) => {
    const trimmed = value.trim()
    if (trimmed) acc[key] = trimmed
    return acc
  }, {})
}

export function DocumentosProyectoModal({
  proyectoId,
  identificadorProyecto,
  documentosIniciales,
  triggerLabel = 'Editar Documentos',
  triggerClassName = 'w-full flex items-center justify-center gap-2 py-3 text-sm font-semibold text-slate-300 bg-white/5 rounded-2xl hover:bg-white/10 border border-white/10 transition-colors',
  triggerTitle,
  showFooterDownload = false,
}: Props) {
  const [open, setOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<TipoDocumentoProyecto>('COTIZACION')

  const [docs, setDocs] = useState<Record<TipoDocumentoProyecto, DocumentoCampos>>({
    COTIZACION: documentosIniciales.COTIZACION.campos,
    CUENTA_COBRO: documentosIniciales.CUENTA_COBRO.campos,
  })

  const [savedDocs, setSavedDocs] = useState<Record<TipoDocumentoProyecto, DocumentoCampos>>({
    COTIZACION: documentosIniciales.COTIZACION.campos,
    CUENTA_COBRO: documentosIniciales.CUENTA_COBRO.campos,
  })

  const [updatedAtByTab, setUpdatedAtByTab] = useState<Record<TipoDocumentoProyecto, string | null>>({
    COTIZACION: documentosIniciales.COTIZACION.updatedAt,
    CUENTA_COBRO: documentosIniciales.CUENTA_COBRO.updatedAt,
  })

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<'idle' | 'saved'>('idle')

  const hayCambios =
    JSON.stringify(limpiarCampos(docs[activeTab])) !== JSON.stringify(limpiarCampos(savedDocs[activeTab]))

  const fechaActualizacionTexto = useMemo(() => {
    const updatedAt = updatedAtByTab[activeTab]
    if (!updatedAt) return 'Sin guardar aun'
    return new Date(updatedAt).toLocaleString('es-CO', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }, [activeTab, updatedAtByTab])

  async function guardarTab(tab: TipoDocumentoProyecto) {
    setError(null)
    setSaving(true)

    const result = await guardarDocumentoProyecto({
      proyectoId,
      tipoDocumento: tab,
      campos: limpiarCampos(docs[tab]),
    })

    if (!result.ok) {
      setError(result.error)
      setSaving(false)
      setStatus('idle')
      return
    }

    setSavedDocs((prev) => ({
      ...prev,
      [tab]: limpiarCampos(docs[tab]),
    }))

    setUpdatedAtByTab((prev) => ({
      ...prev,
      [tab]: result.updatedAt,
    }))

    setSaving(false)
    setStatus('saved')

    window.setTimeout(() => {
      setStatus('idle')
    }, 1300)
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className={triggerClassName} title={triggerTitle}>
        <FileText className="size-4" />
        {triggerLabel}
      </button>

      <GlassModal
        open={open}
        onClose={() => setOpen(false)}
        title="Configurar Documentos Oficiales"
        subtitle={`Proyecto ${identificadorProyecto} · Plantillas Word oficiales`}
        maxWidth="max-w-2xl"
        portal
        footer={
          <div className="w-full flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:justify-between">
            <p className="text-xs text-slate-400">Ultima actualizacion: {fechaActualizacionTexto}</p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => void guardarTab(activeTab)}
                disabled={saving || !hayCambios}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-bold border border-white/15 bg-white/10 text-slate-200 hover:bg-white/20 disabled:opacity-50"
              >
                {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                Guardar cambios
              </button>
            </div>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-blue-500/20 bg-blue-500/10 p-3 text-xs text-blue-200">
            Esta configuracion aplica sobre las plantillas oficiales .docx.
            {showFooterDownload ? ' Las descargas se generan desde Word.' : ''}
          </div>

          <div className="flex flex-wrap gap-2">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold border transition-colors ${
                  activeTab === tab.id
                    ? 'bg-blue-600 text-white border-blue-500'
                    : 'bg-white/5 text-slate-300 border-white/10 hover:bg-white/10'
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {CAMPOS_POR_TIPO[activeTab].map((field) => (
              <label key={field.key} className="space-y-1.5">
                <span className="text-xs text-slate-300">{field.label}</span>
                <input
                  type="text"
                  value={docs[activeTab][field.key] ?? ''}
                  placeholder={field.placeholder}
                  onChange={(e) => {
                    const value = e.target.value
                    setDocs((prev) => ({
                      ...prev,
                      [activeTab]: {
                        ...prev[activeTab],
                        [field.key]: value,
                      },
                    }))
                    setStatus('idle')
                  }}
                  className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-400"
                />
              </label>
            ))}
          </div>

          <div className="flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 text-slate-400">
              {status === 'saved' ? (
                <>
                  <CheckCircle2 className="size-3.5 text-emerald-400" />
                  Configuracion guardada
                </>
              ) : hayCambios ? (
                <>
                  <AlertTriangle className="size-3.5 text-amber-400" />
                  Cambios pendientes
                </>
              ) : (
                'Sin cambios pendientes'
              )}
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-300">
              <AlertTriangle className="size-3.5" />
              <span>{error}</span>
            </div>
          )}
        </div>
      </GlassModal>
    </>
  )
}
