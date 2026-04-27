'use client'

import { useState } from 'react'
import { ImageModal } from '@/components/ui/ImageModal'
import { Camera, Calendar, User, Search, Link as LinkIcon } from 'lucide-react'
import Link from 'next/link'
import type { EvidenciaGlobal } from '@/actions/evidencias'

const fmt = (n: number) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(n)

export function GaleriaEvidencias({ evidencias }: { evidencias: EvidenciaGlobal[] }) {
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')

  const filtered = evidencias.filter(e => 
    e.descripcion?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    e.nombre_actividad.toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <div className="space-y-6">
      {/* Search and Header */}
      <div className="glass-panel rounded-3xl p-5 flex flex-col sm:flex-row justify-between items-center gap-4">
        <div>
          <h2 className="text-lg font-bold text-zinc-900">Evidencias de Gastos</h2>
          <p className="text-sm text-zinc-500">{filtered.length} soportes disponibles</p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-zinc-400" />
          <input 
            type="text"
            placeholder="Buscar por descripción o actividad..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 bg-white/50 border border-zinc-200/60 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-300 transition-all"
          />
        </div>
      </div>

      {/* Grid Gallery */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
        {filtered.map(ev => (
          <div key={ev.id} className="glass-panel rounded-3xl overflow-hidden group flex flex-col hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
            {/* Image Preview Container */}
            <div 
              className="aspect-video relative bg-zinc-100 cursor-pointer overflow-hidden border-b border-zinc-200/50"
              onClick={() => setSelectedUrl(ev.soporte_url)}
            >
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity z-10 flex items-center justify-center">
                <Camera className="size-8 text-white" strokeWidth={1.5} />
              </div>
              {ev.soporte_url.toLowerCase().includes('.pdf') ? (
                <div className="w-full h-full flex flex-col items-center justify-center text-zinc-400">
                  <span className="text-xs font-bold uppercase tracking-widest bg-zinc-200/50 px-3 py-1 rounded-full">Documento PDF</span>
                </div>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img 
                  src={ev.soporte_url} 
                  alt={ev.descripcion}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                />
              )}
            </div>
            
            {/* Details */}
            <div className="p-4 flex flex-col flex-1">
              <div className="flex items-start justify-between mb-2">
                <h3 className="font-semibold text-sm text-zinc-800 line-clamp-2 leading-tight flex-1 pr-2" title={ev.descripcion}>
                  {ev.descripcion || 'Sin descripción'}
                </h3>
                <span className="font-extrabold text-sm text-zinc-900 shrink-0 bg-zinc-100/80 px-2 py-0.5 rounded-lg border border-zinc-200/50">
                  {fmt(ev.monto)}
                </span>
              </div>
              
              <div className="mt-auto space-y-1.5 pt-3">
                <Link href={`/ejecucion/${ev.actividad_id}`} className="flex items-center gap-1.5 text-[11px] text-zinc-500 hover:text-violet-600 transition-colors">
                  <LinkIcon strokeWidth={1.5} className="size-3 shrink-0" />
                  <span className="truncate">{ev.nombre_actividad}</span>
                </Link>
                <div className="flex items-center justify-between text-[11px] text-zinc-400">
                  <span className="flex items-center gap-1">
                    <User strokeWidth={1.5} className="size-3" />
                    Pagó: <span className="capitalize font-medium text-zinc-500">{ev.pagador}</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <Calendar strokeWidth={1.5} className="size-3" />
                    {new Date(ev.created_at).toLocaleDateString('es-CO')}
                  </span>
                </div>
              </div>
            </div>
          </div>
        ))}
        
        {filtered.length === 0 && (
          <div className="col-span-full py-16 flex flex-col items-center justify-center text-zinc-400 glass-panel rounded-3xl">
            <Camera strokeWidth={1.5} className="size-10 mb-3 opacity-30" />
            <p className="text-sm font-medium">No se encontraron evidencias fotográficas</p>
          </div>
        )}
      </div>

      {/* Modal */}
      <ImageModal 
        url={selectedUrl} 
        onClose={() => setSelectedUrl(null)} 
      />
    </div>
  )
}
