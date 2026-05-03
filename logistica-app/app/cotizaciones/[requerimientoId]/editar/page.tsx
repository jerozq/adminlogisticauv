import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Edit3, History, Eye } from 'lucide-react'
import { cargarCotizacion, listarHistorialCotizaciones } from '@/actions/cotizaciones'
import { CotizacionEditor } from '@/components/cotizaciones/CotizacionEditor'
import { PdfPreviewer } from '@/components/cotizaciones/PdfPreviewer'

export const dynamic = 'force-dynamic'

export default async function EditarCotizacionPage({
  params,
  searchParams,
}: {
  params: Promise<{ requerimientoId: string }>
  searchParams: Promise<{ vista?: string; version?: string }>
}) {
  const { requerimientoId } = await params
  const { vista = 'editar', version } = await searchParams

  // Cargar desde capa de aplicación (acciones)
  const historial = await listarHistorialCotizaciones(requerimientoId)

  const datos = await cargarCotizacion(requerimientoId)

  if (!datos.ok) {
    notFound()
  }

  // The latest version is the highest version number
  const ultimaVersion = historial[0]?.version || 1
  const isLatest = !version || Number(version) === ultimaVersion
  
  // Si piden una versión específica, la buscamos. Pero el editor siempre carga la última. 
  // (Para simplificar, el editor solo puede editar la última, pero el PDF sí podría ver cualquier versión si le pasamos el ID, por ahora solo veamos la última en el editor)

  return (
    <div className="min-h-screen bg-[#0a0b0f] flex flex-col text-slate-200">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-black/80 backdrop-blur-md border-b border-white/10 px-4 py-3 shrink-0">
        <div className="max-w-[1400px] mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <Link
              href="/cotizaciones"
              className="p-2 -ml-2 rounded-xl hover:bg-white/10 transition-colors"
              aria-label="Volver a la lista"
            >
              <ArrowLeft strokeWidth={1.5} className="size-5 text-slate-300" />
            </Link>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <Edit3 strokeWidth={1.5} className="size-4 text-blue-500 shrink-0" />
                <h1 className="font-bold text-slate-100 text-sm truncate">
                  {vista === 'pdf' ? 'Previsualizar Cotización' : 'Editar Cotización'}
                </h1>
              </div>
              <p className="text-xs text-slate-400 truncate">
                {datos.encabezado.numeroRequerimiento
                  ? `N° ${datos.encabezado.numeroRequerimiento} · `
                  : ''}
                {datos.encabezado.nombreActividad || 'Sin nombre'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Link
              href={`/cotizaciones/${requerimientoId}/editar?vista=${vista === 'pdf' ? 'editar' : 'pdf'}`}
              className="flex items-center gap-2 rounded-xl bg-white/5 border border-white/10 px-4 py-2 text-xs font-bold text-slate-300 hover:bg-white/10 transition-colors"
            >
              {vista === 'pdf' ? (
                <>
                  <Edit3 className="size-4" />
                  Volver al Editor
                </>
              ) : (
                <>
                  <Eye className="size-4" />
                  Previsualizar PDF
                </>
              )}
            </Link>
            <Link
              href={`/cotizaciones/${requerimientoId}/exportar`}
              className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-500 transition-colors shadow-md shadow-blue-900/30"
            >
              Descargar Word
            </Link>
          </div>
        </div>
      </div>

      {/* Contenido (Layout con panel lateral) */}
      <div className="flex-1 max-w-[1400px] mx-auto w-full flex flex-col md:flex-row gap-6 p-4 md:p-6">
        
        {/* Main Area */}
        <div className="flex-1 min-w-0">
          {vista === 'pdf' ? (
            <div className="glass-panel rounded-3xl h-[800px] overflow-hidden flex flex-col">
               <PdfPreviewer requerimientoId={requerimientoId} />
            </div>
          ) : (
            <CotizacionEditor
              requerimientoId={requerimientoId}
              cotizacionId={datos.cotizacion.id}
              initialEncabezado={datos.encabezado}
              initialItems={datos.items}
              version={datos.cotizacion.version}
              estado={datos.cotizacion.estado}
              requerimientoEstado={datos.requerimientoEstado}
            />
          )}
        </div>

        {/* Sidebar (Historial) */}
        <div className="w-full md:w-80 shrink-0">
          <div className="glass-panel rounded-3xl p-5 sticky top-24 bg-white/5 border border-white/10 backdrop-blur-md">
            <div className="flex items-center gap-2 mb-4">
              <History className="size-4 text-slate-400" />
              <h3 className="font-bold text-sm text-slate-200">Línea de Tiempo</h3>
            </div>
            
            <div className="space-y-4">
              {historial?.map((h, i) => {
                const isCurrent = h.version === datos.cotizacion.version
                return (
                  <div key={h.id} className="relative pl-6">
                    {/* Line connection */}
                    {i !== historial.length - 1 && (
                      <div className="absolute left-[9px] top-6 bottom-[-24px] w-0.5 bg-white/10" />
                    )}
                    {/* Dot */}
                    <div className={`absolute left-0 top-1 size-5 rounded-full border-[3px] border-white/20 shadow-sm flex items-center justify-center ${isCurrent ? 'bg-blue-500' : 'bg-slate-700'}`} />
                    
                    <div>
                      <div className="flex items-center justify-between">
                        <span className={`text-sm font-bold ${isCurrent ? 'text-slate-100' : 'text-slate-300'}`}>
                          Versión {h.version}
                        </span>
                        <span className="text-[10px] text-slate-500 font-medium">
                          {new Date(h.created_at).toLocaleDateString('es-CO')}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(h.total_general)}
                      </p>
                      {isCurrent && (
                        <div className="mt-2 inline-flex items-center rounded-md bg-blue-500/10 px-2 py-1 text-xs font-bold text-blue-300 border border-blue-500/20">
                          Actual (Editable)
                        </div>
                      )}
                      {!isCurrent && (
                         <div className="mt-2 inline-flex items-center rounded-md bg-white/5 px-2 py-1 text-xs font-medium text-slate-400 border border-white/10">
                          Archivada
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
