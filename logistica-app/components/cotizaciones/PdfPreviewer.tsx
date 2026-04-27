'use client'

import { useState, useEffect } from 'react'
import { Loader2, AlertCircle } from 'lucide-react'

export function PdfPreviewer({ requerimientoId }: { requerimientoId: string }) {
  const [url, setUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let objectUrl: string | null = null

    async function fetchPdf() {
      try {
        setLoading(true)
        setError(null)
        
        // Use the existing generar-cotizacion API but request PDF format via POST body
        const res = await fetch(`/api/generar-cotizacion`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ requerimientoId, format: 'pdf' }),
        })

        if (!res.ok) {
          throw new Error('No se pudo generar la previsualización del PDF')
        }

        const blob = await res.blob()
        objectUrl = URL.createObjectURL(blob)
        setUrl(objectUrl)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Error desconocido al cargar PDF')
      } finally {
        setLoading(false)
      }
    }

    fetchPdf()

    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [requerimientoId])

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-zinc-500 gap-4 bg-zinc-50/50">
        <Loader2 className="size-8 animate-spin text-blue-500" />
        <p className="text-sm font-medium animate-pulse">Generando PDF oficial desde plantilla Excel...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-red-500 gap-3 bg-red-50/50">
        <AlertCircle className="size-8" />
        <p className="text-sm font-medium">{error}</p>
        <button 
          onClick={() => window.location.reload()}
          className="mt-2 px-4 py-2 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg text-xs font-bold transition-colors"
        >
          Reintentar
        </button>
      </div>
    )
  }

  return (
    <iframe
      src={url!}
      className="w-full h-full border-none bg-zinc-100"
      title="Previsualización de Cotización"
    />
  )
}
