import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, FileText } from 'lucide-react'
import { cargarDatosExportacion } from '@/actions/exportar-cotizacion'
import { cargarDocumentosProyecto } from '@/actions/documentos-proyecto'
import { CotizacionExportEditor } from '@/components/cotizaciones/CotizacionExportEditor'

// Ruta: /cotizaciones/[requerimientoId]/exportar
export default async function ExportarCotizacionPage({
  params,
}: {
  params: Promise<{ requerimientoId: string }>
}) {
  const { requerimientoId } = await params

  let datos
  try {
    datos = await cargarDatosExportacion(requerimientoId)
  } catch {
    notFound()
  }

  const documentosIniciales = await cargarDocumentosProyecto(requerimientoId)

  return (
    <div className="min-h-screen [background:var(--background)]">
      {/* Header */}
      <div className="sticky top-0 z-10 glass-panel border-x-0 border-t-0 border-b px-4 py-3">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <Link
            href={`/ejecucion/${requerimientoId}`}
            className="p-2 -ml-2 rounded-xl hover:[background:var(--surface)] transition-colors"
            aria-label="Volver"
          >
            <ArrowLeft strokeWidth={1.5} className="size-5 [color:var(--text-secondary)]" />
          </Link>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <FileText strokeWidth={1.5} className="size-4 [color:var(--accent)] shrink-0" />
              <h1 className="font-bold [color:var(--text-primary)] text-sm truncate">
                Exportar Cotización
              </h1>
            </div>
            <p className="text-xs [color:var(--text-muted)] truncate">
              {datos.requerimiento.numero_requerimiento ?? datos.requerimiento.nombre_actividad}
              {datos.cotizacion
                ? ` · v${datos.cotizacion.version}`
                : ' · Sin cotización'}
            </p>
          </div>
        </div>
      </div>

      {/* Contenido */}
      <div className="max-w-3xl mx-auto px-4 py-6">
        {!datos.cotizacion ? (
          <NoCotizacion />
        ) : datos.items.length === 0 ? (
          <SinItems />
        ) : (
          <CotizacionExportEditor
            datos={datos}
            documentosIniciales={documentosIniciales}
          />
        )}
      </div>
    </div>
  )
}

function NoCotizacion() {
  return (
    <div className="flex flex-col items-center py-20 [color:var(--text-muted)]">
      <FileText strokeWidth={1.5} className="size-12 mb-4 opacity-30" />
      <p className="font-semibold [color:var(--text-secondary)] mb-1">Sin cotización registrada</p>
      <p className="text-sm mb-6 text-center max-w-xs">
        Esta actividad no tiene aún una cotización. Crea una primero.
      </p>
      <Link
        href="/cotizaciones/nueva"
        className="btn-primary px-5 py-2.5 text-sm font-semibold rounded-xl transition-colors"
      >
        Crear cotización
      </Link>
    </div>
  )
}

function SinItems() {
  return (
    <div className="flex flex-col items-center py-20 [color:var(--text-muted)]">
      <FileText strokeWidth={1.5} className="size-12 mb-4 opacity-30" />
      <p className="font-semibold [color:var(--text-secondary)]">La cotización no tiene ítems</p>
      <p className="text-sm mt-1">Agrega ítems a la cotización antes de exportar.</p>
    </div>
  )
}
