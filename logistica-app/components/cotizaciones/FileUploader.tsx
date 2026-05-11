'use client'

import { useRef, useState } from 'react'
import { Upload, FileSpreadsheet, FileText, AlertCircle, Loader2 } from 'lucide-react'
import { parsearRequerimientoExcel } from '@/actions/cotizaciones'
import type { ParsedRequerimiento } from '@/types/cotizacion'

interface FileUploaderProps {
  onParsed: (data: ParsedRequerimiento, fileName: string) => void
}

export function FileUploader({ onParsed }: FileUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [usedAI, setUsedAI] = useState<boolean | null>(null)

  async function handleFile(file: File) {
    setError(null)
    setUsedAI(null)
    setFileName(file.name)
    setLoading(true)

    try {
      const formData = new FormData()
      formData.append('file', file)
      const result = await parsearRequerimientoExcel(formData)

      if (!result.ok) {
        setError(result.error)
        setFileName(null)
      } else {
        setUsedAI(result.usedAI)
        onParsed(result.data, file.name)
      }
    } finally {
      setLoading(false)
    }
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
    // Reset para permitir re-subir el mismo archivo
    e.target.value = ''
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleFile(file)
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Zona de drop */}
      <div
        role="button"
        tabIndex={0}
        aria-label="Zona para cargar archivo Excel"
        onClick={() => !loading && inputRef.current?.click()}
        onKeyDown={e => e.key === 'Enter' && !loading && inputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={[
          'flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed',
          'px-6 py-12 text-center cursor-pointer transition-colors',
          loading
            ? 'border-blue-500/40 bg-blue-500/10 cursor-wait'
            : dragging
            ? 'border-blue-500 bg-blue-500/10'
            : 'border-white/20 bg-white/5 hover:border-blue-400/60 hover:bg-blue-500/5',
        ].join(' ')}
      >
        {loading ? (
          <>
            <Loader2 strokeWidth={1.5} className="size-10 animate-spin text-blue-500" />
            <p className="text-sm font-medium text-blue-400">Procesando {fileName}…</p>
            <p className="text-xs text-blue-500">Analizando con IA · extrayendo ítems, encabezado y reembolsos</p>
          </>
        ) : (
          <>
            <div className="flex size-16 items-center justify-center rounded-full bg-white/10 border border-white/20">
              {fileName ? (
                fileName.endsWith('.pdf')
                  ? <FileText strokeWidth={1.5} className="size-8 text-orange-400" />
                  : <FileSpreadsheet strokeWidth={1.5} className="size-8 text-green-500" />
              ) : (
                <Upload strokeWidth={1.5} className="size-8 text-blue-500" />
              )}            </div>
            <div>
              <p className="text-sm font-semibold text-slate-200">
                {fileName ?? 'Arrastra tu Excel o PDF aquí'}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                o{' '}
                <span className="font-medium text-blue-400 underline underline-offset-2">
                  haz clic para buscar
                </span>
                {' '}· .xlsx / .pdf · máx. 10 MB
              </p>
            </div>
          </>
        )}
      </div>

      {/* Badge IA */}
      {usedAI !== null && fileName && (
        <div className={[
          'flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-medium ring-1',
          usedAI
            ? 'bg-violet-500/10 text-violet-300 border border-violet-500/20'
            : 'bg-white/5 text-slate-400 border border-white/10',
        ].join(' ')}>
          <span>{usedAI ? '✦ Procesado con IA (Gemini)' : '⚙ Procesado con parser de coordenadas'}</span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-start gap-3 rounded-xl bg-red-500/10 p-4 text-sm text-red-400 border border-red-500/20">
          <AlertCircle strokeWidth={1.5} className="mt-0.5 size-4 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {/* Input oculto */}
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xlsm,.xls,.pdf"
        className="hidden"
        onChange={onInputChange}
        aria-hidden
      />
    </div>
  )
}
