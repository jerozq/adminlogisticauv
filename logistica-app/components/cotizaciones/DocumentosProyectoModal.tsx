'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { AlertTriangle, CheckCircle2, Download, FileText, Loader2, Receipt, Save } from 'lucide-react'
import { guardarDocumentoProyecto, type TipoDocumentoProyecto } from '@/actions/documentos-proyecto'
import { GlassModal } from '@/components/ui/GlassModal'

export interface DocumentoProyectoStateClient {
  html: string
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
}

const TABS: Array<{ id: TipoDocumentoProyecto; label: string; icon: React.ReactNode }> = [
  { id: 'COTIZACION', label: 'Cotizacion', icon: <FileText className="size-4" /> },
  { id: 'CUENTA_COBRO', label: 'Cuenta de Cobro', icon: <Receipt className="size-4" /> },
]

function extraerNombreArchivo(headers: Headers, fallback: string): string {
  const contentDisposition = headers.get('Content-Disposition') ?? ''
  const fnMatch = contentDisposition.match(/filename[*]?=(?:UTF-8'')?["']?([^"';\n]+)/)
  return fnMatch ? decodeURIComponent(fnMatch[1]) : fallback
}

function nombreArchivo(tipo: TipoDocumentoProyecto, identificador: string): string {
  const suffix = tipo === 'COTIZACION' ? 'Cotizacion' : 'CuentaCobro'
  return `${suffix}_${identificador || 'Proyecto'}.docx`
}

function RichEditor({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}) {
  const editor = useEditor({
    extensions: [StarterKit],
    content: value,
    editorProps: {
      attributes: {
        class:
          'min-h-[360px] max-h-[50vh] overflow-y-auto rounded-2xl border border-white/15 bg-white/5 px-5 py-4 text-sm text-slate-100 focus:outline-none',
      },
    },
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML())
    },
  })

  useEffect(() => {
    if (!editor) return
    const current = editor.getHTML()
    if (current !== value) {
      editor.commands.setContent(value, false)
    }
  }, [editor, value])

  return <EditorContent editor={editor} />
}

export function DocumentosProyectoModal({
  proyectoId,
  identificadorProyecto,
  documentosIniciales,
}: Props) {
  const [open, setOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<TipoDocumentoProyecto>('COTIZACION')

  const [docs, setDocs] = useState<Record<TipoDocumentoProyecto, string>>({
    COTIZACION: documentosIniciales.COTIZACION.html,
    CUENTA_COBRO: documentosIniciales.CUENTA_COBRO.html,
  })

  const [savedDocs, setSavedDocs] = useState<Record<TipoDocumentoProyecto, string>>({
    COTIZACION: documentosIniciales.COTIZACION.html,
    CUENTA_COBRO: documentosIniciales.CUENTA_COBRO.html,
  })

  const [updatedAtByTab, setUpdatedAtByTab] = useState<Record<TipoDocumentoProyecto, string | null>>({
    COTIZACION: documentosIniciales.COTIZACION.updatedAt,
    CUENTA_COBRO: documentosIniciales.CUENTA_COBRO.updatedAt,
  })

  const [saving, setSaving] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<'idle' | 'autosaving' | 'saved'>('idle')

  const htmlActivo = docs[activeTab]
  const hayCambios = docs[activeTab] !== savedDocs[activeTab]

  const fechaActualizacionTexto = useMemo(() => {
    const updatedAt = updatedAtByTab[activeTab]
    if (!updatedAt) return 'Sin guardar aún'
    return new Date(updatedAt).toLocaleString('es-CO', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }, [activeTab, updatedAtByTab])

  const guardarTab = useCallback(async (tab: TipoDocumentoProyecto, opts?: { autosave?: boolean }) => {
    setError(null)
    setSaving(true)
    setStatus(opts?.autosave ? 'autosaving' : 'idle')

    const result = await guardarDocumentoProyecto({
      proyectoId,
      tipoDocumento: tab,
      contenidoHtml: docs[tab],
    })

    if (!result.ok) {
      setError(result.error)
      setSaving(false)
      setStatus('idle')
      return
    }

    setSavedDocs((prev) => ({
      ...prev,
      [tab]: docs[tab],
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
  }, [docs, proyectoId])

  useEffect(() => {
    if (!open) return
    if (!hayCambios) return

    const timer = window.setTimeout(() => {
      void guardarTab(activeTab, { autosave: true })
    }, 2000)

    return () => window.clearTimeout(timer)
  }, [activeTab, guardarTab, hayCambios, open, htmlActivo])

  async function descargarTabActiva() {
    setDownloading(true)
    setError(null)

    try {
      const filename = nombreArchivo(activeTab, identificadorProyecto)
      const res = await fetch('/api/documentos/exportar-docx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          html: docs[activeTab],
          nombreArchivo: filename,
        }),
      })

      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error || `Error ${res.status}`)
      }

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = extraerNombreArchivo(res.headers, filename)
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No fue posible descargar el documento.')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-full flex items-center justify-center gap-2 py-3 text-sm font-semibold text-slate-300 bg-white/5 rounded-2xl hover:bg-white/10 border border-white/10 transition-colors"
      >
        <FileText className="size-4" />
        Editar Documentos
      </button>

      <GlassModal
        open={open}
        onClose={() => setOpen(false)}
        title="Editor de Documentos"
        subtitle="Cotizacion y Cuenta de Cobro con autoguardado"
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
                Guardar
              </button>
              <button
                onClick={() => void descargarTabActiva()}
                disabled={downloading}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50"
              >
                {downloading ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
                Descargar Word
              </button>
            </div>
          </div>
        }
      >
        <div className="space-y-4">
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

          <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-2">
            <RichEditor
              value={docs[activeTab]}
              onChange={(value) => {
                setDocs((prev) => ({ ...prev, [activeTab]: value }))
                setStatus('idle')
              }}
            />
          </div>

          <div className="flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 text-slate-400">
              {status === 'autosaving' ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  Autoguardando...
                </>
              ) : status === 'saved' ? (
                <>
                  <CheckCircle2 className="size-3.5 text-emerald-400" />
                  Guardado
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
