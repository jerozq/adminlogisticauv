'use client'

import { useState } from 'react'
import { FileDown, Loader2, AlertCircle } from 'lucide-react'

interface DownloadPdfButtonProps {
  costo: any
  actividad: any
  pagadorName: string
}

export function DownloadPdfButton({ costo, actividad, pagadorName }: DownloadPdfButtonProps) {
  const [isPending, setIsPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleDownload = async () => {
    setIsPending(true)
    setError(null)
    
    try {
      const descripcion = (costo.cotizacion_items?.descripcion || costo.descripcion || '').toUpperCase()
      const isInhumacion = descripcion.includes('INHUMACION') || descripcion.includes('FUNERARI')
      
      const payload = {
        actividadId: actividad.id,
        reembolsoProps: {
          id: costo.id,
          actividadId: actividad.id,
          tipo: isInhumacion ? 'INHUMACION' : 'TRANSPORTE',
          personaNombre: pagadorName,
          documento: 'PENDIENTE', // Placeholder, idealmente se debe pedir en un form
          celular: '',
          rutaOrigen: 'N/A',
          rutaDestino: 'N/A',
          fecha: actividad.fecha_inicio || new Date().toISOString().split('T')[0],
          valor: costo.monto
        }
      }

      const res = await fetch('/api/reembolsos/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || 'Error al generar el PDF')
      }

      // Download file
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      const filename = res.headers.get('Content-Disposition')?.match(/filename="([^"]+)"/)?.[1] || `Reembolso_${costo.id}.pdf`
      
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
      
    } catch (err: any) {
      console.error(err)
      setError(err.message || 'Error desconocido')
    } finally {
      setIsPending(false)
    }
  }

  return (
    <div className="flex flex-col items-end">
      <button
        onClick={handleDownload}
        disabled={isPending}
        title="Generar PDF Oficial"
        className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-100 hover:bg-violet-100 text-zinc-600 hover:text-violet-700 text-xs font-bold uppercase rounded-lg transition-colors disabled:opacity-50"
      >
        {isPending ? (
          <>
            <Loader2 className="size-3.5 animate-spin" strokeWidth={2} />
            <span>Generando...</span>
          </>
        ) : (
          <>
            <FileDown className="size-3.5" strokeWidth={2} />
            <span>PDF Oficial</span>
          </>
        )}
      </button>
      {error && (
        <span className="text-[10px] text-red-500 mt-1 flex items-center gap-1 max-w-[150px] leading-tight text-right">
          <AlertCircle className="size-3 shrink-0" /> {error}
        </span>
      )}
    </div>
  )
}
