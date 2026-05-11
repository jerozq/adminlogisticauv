'use client'

import { useState, useRef, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Images,
  Upload,
  Trash2,
  FileText,
  FileSpreadsheet,
  File,
  Loader2,
  X,
  ExternalLink,
  AlertCircle,
} from 'lucide-react'
import { uploadEvidencia } from '@/lib/supabase-browser'
import { registrarSoporte, eliminarSoporte, type SoporteProyecto } from '@/actions/liquidaciones'

// ── Helpers ──────────────────────────────────────────────────

function detectTipo(file: File): SoporteProyecto['tipo_archivo'] {
  if (file.type.startsWith('image/')) return 'IMAGEN'
  if (file.type === 'application/pdf') return 'PDF'
  if (
    file.type.includes('spreadsheet') ||
    file.name.endsWith('.xlsx') ||
    file.name.endsWith('.xls') ||
    file.name.endsWith('.csv')
  )
    return 'EXCEL'
  return 'OTRO'
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('es-CO', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// ── Thumbnail / Icon ─────────────────────────────────────────

function SoporteThumb({ soporte }: { soporte: SoporteProyecto }) {
  if (soporte.tipo_archivo === 'IMAGEN') {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={soporte.url}
        alt={soporte.nombre_archivo ?? 'Soporte'}
        className="w-full h-28 object-cover rounded-t-xl"
        loading="lazy"
      />
    )
  }

  const Icon =
    soporte.tipo_archivo === 'PDF'
      ? FileText
      : soporte.tipo_archivo === 'EXCEL'
      ? FileSpreadsheet
      : File

  const color =
    soporte.tipo_archivo === 'PDF'
      ? 'text-red-400'
      : soporte.tipo_archivo === 'EXCEL'
      ? 'text-emerald-400'
      : 'text-slate-400'

  return (
    <div className="w-full h-28 flex items-center justify-center bg-white/5 rounded-t-xl">
      <Icon className={`size-12 ${color}`} strokeWidth={1.5} />
    </div>
  )
}

// ── Main Component ───────────────────────────────────────────

interface Props {
  requerimientoId: string
  initialSoportes: SoporteProyecto[]
}

export function GaleriaComprobantes({ requerimientoId, initialSoportes }: Props) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isPending, startTransition] = useTransition()
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [descripcion, setDescripcion] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [lightbox, setLightbox] = useState<string | null>(null)

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadError(null)
    setUploading(true)
    try {
      const url = await uploadEvidencia(file, 'soportes')
      const tipo = detectTipo(file)
      const res = await registrarSoporte(
        requerimientoId,
        url,
        file.name,
        tipo,
        descripcion.trim() || undefined,
      )
      if (!res.ok) throw new Error(res.error)
      setDescripcion('')
      startTransition(() => router.refresh())
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Error al subir archivo')
    } finally {
      setUploading(false)
      // Reset the file input so the same file can be re-selected if needed
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function handleDelete(soporte: SoporteProyecto) {
    if (!confirm(`¿Eliminar "${soporte.nombre_archivo ?? 'este soporte'}"? Esta acción no se puede deshacer.`)) return
    setDeletingId(soporte.id)
    try {
      const res = await eliminarSoporte(soporte.id, requerimientoId)
      if (!res.ok) throw new Error(res.error)
      startTransition(() => router.refresh())
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Error al eliminar')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <>
      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          onClick={() => setLightbox(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightbox}
            alt="Soporte ampliado"
            className="max-h-[90vh] max-w-full rounded-2xl shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            onClick={() => setLightbox(null)}
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
          >
            <X className="size-5" />
          </button>
        </div>
      )}

      <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Images className="w-5 h-5 text-sky-400" strokeWidth={1.5} />
            Galería de Comprobantes
          </h2>
          <span className="text-xs px-2 py-0.5 rounded-full bg-white/5 text-slate-400 border border-white/10">
            {initialSoportes.length} {initialSoportes.length === 1 ? 'archivo' : 'archivos'}
          </span>
        </div>

        {/* Upload zone */}
        <div className="mb-5 space-y-3">
          <div className="flex gap-2">
            <input
              type="text"
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Descripción opcional del soporte..."
              className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm
                         placeholder:text-slate-500 focus:outline-none focus:border-sky-500/60 transition-colors"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-sky-500/20 border border-sky-500/30
                         text-sky-300 text-sm font-semibold hover:bg-sky-500/30 disabled:opacity-50 transition-colors"
            >
              {uploading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Upload className="size-4" strokeWidth={1.5} />
              )}
              {uploading ? 'Subiendo…' : 'Subir soporte'}
            </button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,.pdf,.xlsx,.xls,.csv"
            className="hidden"
            onChange={handleFileChange}
          />
          {uploadError && (
            <div className="flex items-center gap-2 text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              <AlertCircle className="size-3.5 shrink-0" />
              {uploadError}
            </div>
          )}
        </div>

        {/* Gallery grid */}
        {initialSoportes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Images className="size-10 text-slate-600 mb-3" strokeWidth={1} />
            <p className="text-sm text-slate-500">No hay comprobantes subidos aún.</p>
            <p className="text-xs text-slate-600 mt-1">
              Sube recibos, PDFs o Excel de respaldo del proyecto.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {initialSoportes.map((soporte) => (
              <div
                key={soporte.id}
                className="group relative rounded-xl border border-white/10 bg-white/5 overflow-hidden
                           hover:border-white/20 transition-colors"
              >
                {/* Thumbnail */}
                <div
                  className={soporte.tipo_archivo === 'IMAGEN' ? 'cursor-zoom-in' : ''}
                  onClick={() => soporte.tipo_archivo === 'IMAGEN' && setLightbox(soporte.url)}
                >
                  <SoporteThumb soporte={soporte} />
                </div>

                {/* Info footer */}
                <div className="px-2 py-1.5">
                  <p className="text-[10px] text-slate-300 truncate font-medium" title={soporte.nombre_archivo ?? ''}>
                    {soporte.nombre_archivo ?? 'Sin nombre'}
                  </p>
                  {soporte.descripcion && (
                    <p className="text-[9px] text-slate-500 truncate">{soporte.descripcion}</p>
                  )}
                  <p className="text-[9px] text-slate-600 mt-0.5">{fmtDate(soporte.created_at)}</p>
                </div>

                {/* Actions overlay */}
                <div className="absolute top-1.5 right-1.5 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <a
                    href={soporte.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex size-6 items-center justify-center rounded-md bg-black/60 text-white hover:bg-black/80 transition-colors"
                    title="Abrir en nueva pestaña"
                  >
                    <ExternalLink className="size-3" />
                  </a>
                  <button
                    onClick={() => handleDelete(soporte)}
                    disabled={deletingId === soporte.id}
                    className="flex size-6 items-center justify-center rounded-md bg-black/60 text-red-400 hover:bg-red-500/60 disabled:opacity-50 transition-colors"
                    title="Eliminar soporte"
                  >
                    {deletingId === soporte.id ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <Trash2 className="size-3" />
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
