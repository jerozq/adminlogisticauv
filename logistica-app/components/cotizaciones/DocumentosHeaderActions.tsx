'use client'

import { useState } from 'react'
import { ChevronDown, Download, FileText, Receipt } from 'lucide-react'
import {
  obtenerDocumentoProyectoActual,
  type TipoDocumentoProyecto,
} from '@/actions/documentos-proyecto'

interface EncabezadoCotizacion {
  numeroRequerimiento: string
  nombreActividad: string
  municipio: string
  departamento: string
  fechaInicio: string
  fechaFin: string
  horaInicio: string
  horaFin: string
  responsableNombre: string
}

interface ItemCotizacion {
  descripcion: string
  cantidad: number
  precioUnitario: number
}

interface CotizacionVersionData {
  encabezado: EncabezadoCotizacion
  items: ItemCotizacion[]
}

interface Props {
  proyectoId: string
  identificadorProyecto: string
  encabezado: EncabezadoCotizacion
  items: ItemCotizacion[]
  cotizacionFecha?: string | null
  historialCotizaciones: Array<{
    id: string
    version: number
    estado: string
    total_general: number
    created_at: string
  }>
}

function extraerNombreArchivo(headers: Headers, fallback: string): string {
  const contentDisposition = headers.get('Content-Disposition') ?? ''
  const fnMatch = contentDisposition.match(/filename[*]?=(?:UTF-8'')?["']?([^"';\n]+)/)
  return fnMatch ? decodeURIComponent(fnMatch[1]) : fallback
}

function nombreArchivo(tipo: TipoDocumentoProyecto, identificador: string): string {
  const suffix = tipo === 'COTIZACION' ? 'Cotizacion' : 'CuentaCobro'
  return `${suffix}_${identificador || 'Proyecto'}.docx`
}

export function DocumentosHeaderActions({
  proyectoId,
  identificadorProyecto,
  encabezado,
  items,
  cotizacionFecha,
  historialCotizaciones,
}: Props) {
  const [downloading, setDownloading] = useState<TipoDocumentoProyecto | null>(null)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [versionMenuOpen, setVersionMenuOpen] = useState(false)
  const [selectedVersion, setSelectedVersion] = useState<number>(historialCotizaciones[0]?.version || 1)
  const [versionDataCache, setVersionDataCache] = useState<Record<string, CotizacionVersionData>>({})

  const selectedVersionEntry =
    historialCotizaciones.find((h) => h.version === selectedVersion) ?? historialCotizaciones[0]

  async function obtenerDatosVersionSeleccionada(): Promise<CotizacionVersionData> {
    const versionId = selectedVersionEntry?.id || proyectoId

    if (!selectedVersionEntry || versionId === proyectoId) {
      return { encabezado, items }
    }

    const cached = versionDataCache[versionId]
    if (cached) {
      return cached
    }

    const res = await fetch(`/api/cotizaciones/version/${versionId}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
    })

    if (!res.ok) {
      const payload = await res.json().catch(() => ({}))
      throw new Error(payload.error || 'No fue posible cargar los datos de la versión seleccionada.')
    }

    const payload = (await res.json()) as {
      ok: boolean
      encabezado: EncabezadoCotizacion
      items: ItemCotizacion[]
    }

    if (!payload.ok) {
      throw new Error('No fue posible cargar los datos de la versión seleccionada.')
    }

    const data: CotizacionVersionData = {
      encabezado: payload.encabezado,
      items: payload.items,
    }

    setVersionDataCache((prev) => ({
      ...prev,
      [versionId]: data,
    }))

    return data
  }

  async function descargar(tipoDocumento: TipoDocumentoProyecto) {
    setDownloading(tipoDocumento)

    try {
      const documento = await obtenerDocumentoProyectoActual({
        proyectoId,
        tipoDocumento,
      })

      if (!documento.ok) {
        throw new Error(documento.error)
      }

      const datosVersion = await obtenerDatosVersionSeleccionada()

      const encabezadoVersion = datosVersion.encabezado
      const itemsVersion = datosVersion.items

      const granTotal = itemsVersion.reduce((sum, item) => sum + item.cantidad * item.precioUnitario, 0)
      const filenameBase = nombreArchivo(tipoDocumento, identificadorProyecto)
      const filename = filenameBase.replace('.docx', `_v${selectedVersion}.docx`)

      const res =
        tipoDocumento === 'COTIZACION'
          ? await fetch('/api/generar-cotizacion', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                requerimiento: {
                  fecha_inicio: encabezadoVersion.fechaInicio || null,
                  numero_requerimiento: encabezadoVersion.numeroRequerimiento || null,
                  municipio: encabezadoVersion.municipio || null,
                  departamento: encabezadoVersion.departamento || null,
                },
                items: itemsVersion.map((item) => ({
                  descripcion: item.descripcion,
                  cantidad: item.cantidad,
                  precio_unitario: item.precioUnitario,
                })),
                totals: {
                  subtotal_servicios: granTotal,
                  total_reembolsos_sin_inhumacion: 0,
                  total_inhumaciones: 0,
                  cantidad_inhumaciones: 0,
                  total_reembolsos_con_inhumaciones: 0,
                  gran_total: granTotal,
                },
                cotizacion_fecha: cotizacionFecha ?? null,
                nombreArchivo: filename,
                overrides: documento.campos,
              }),
            })
          : await fetch('/api/generar-cuenta-cobro', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                requerimiento_id: selectedVersionEntry?.id || proyectoId,
                requerimiento: {
                  fecha_inicio: encabezadoVersion.fechaInicio || null,
                  fecha_fin: encabezadoVersion.fechaFin || null,
                  hora_inicio: encabezadoVersion.horaInicio || null,
                  hora_fin: encabezadoVersion.horaFin || null,
                  numero_requerimiento: encabezadoVersion.numeroRequerimiento || null,
                  nombre_actividad: encabezadoVersion.nombreActividad || '',
                  municipio: encabezadoVersion.municipio || null,
                  departamento: encabezadoVersion.departamento || null,
                  responsable_nombre: encabezadoVersion.responsableNombre || null,
                },
                items: itemsVersion.map((item) => ({
                  descripcion: item.descripcion,
                  cantidad: item.cantidad,
                  precio_unitario: item.precioUnitario,
                })),
                gran_total: granTotal,
                cotizacion_fecha: cotizacionFecha ?? null,
                nombreArchivo: filename,
                overrides: documento.campos,
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
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No fue posible descargar el documento.'
      window.alert(message)
    } finally {
      setDownloading(null)
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {/* Version selector */}
      <div className="relative">
        <button
          onClick={() => setVersionMenuOpen((prev) => !prev)}
          className="inline-flex items-center gap-2 rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-white/10 transition-colors"
        >
          <span>v{selectedVersion}</span>
          <ChevronDown className="size-4" />
        </button>
        {versionMenuOpen && historialCotizaciones.length > 0 && (
          <div className="absolute right-0 z-20 mt-2 min-w-[280px] max-h-[300px] overflow-y-auto rounded-xl border border-white/15 bg-slate-950/95 shadow-xl backdrop-blur">
            {historialCotizaciones.map((version, idx) => (
              <button
                key={`${version.id}-${version.version}`}
                onClick={() => {
                  setVersionMenuOpen(false)
                  setSelectedVersion(version.version)
                }}
                className={`flex w-full items-center justify-between px-3 py-2.5 text-left text-xs font-semibold transition-colors ${
                  selectedVersion === version.version
                    ? 'bg-blue-600/30 text-blue-300'
                    : 'text-slate-200 hover:bg-white/10'
                }`}
              >
                <div>
                  <div>v{version.version}</div>
                  <div className="text-xs text-slate-400">
                    {new Date(version.created_at).toLocaleDateString('es-ES')}
                  </div>
                </div>
                {idx === 0 && <span className="text-xs text-emerald-400">Última</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="relative md:hidden">
        <button
          onClick={() => setMobileMenuOpen((prev) => !prev)}
          disabled={downloading !== null}
          className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-500 transition-colors disabled:opacity-60"
        >
          <Download className="size-4" />
          Descargar
        </button>

        {mobileMenuOpen && (
          <div className="absolute right-0 z-20 mt-2 min-w-[220px] overflow-hidden rounded-xl border border-white/15 bg-slate-950/95 shadow-xl backdrop-blur">
            <button
              onClick={() => {
                setMobileMenuOpen(false)
                void descargar('COTIZACION')
              }}
              className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-xs font-semibold text-slate-200 hover:bg-white/10"
            >
              <FileText className="size-4" />
              Descargar Cotizacion
            </button>
            <button
              onClick={() => {
                setMobileMenuOpen(false)
                void descargar('CUENTA_COBRO')
              }}
              className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-xs font-semibold text-slate-200 hover:bg-white/10"
            >
              <Receipt className="size-4" />
              Descargar Cuenta de Cobro
            </button>
          </div>
        )}
      </div>

      <button
        onClick={() => void descargar('COTIZACION')}
        disabled={downloading !== null}
        className="hidden md:inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-500 transition-colors shadow-md shadow-blue-900/30 disabled:opacity-60"
      >
        {downloading === 'COTIZACION' ? (
          <Download className="size-4 animate-pulse" />
        ) : (
          <FileText className="size-4" />
        )}
        Descargar Cotizacion
      </button>

      <button
        onClick={() => void descargar('CUENTA_COBRO')}
        disabled={downloading !== null}
        className="hidden md:inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-500 transition-colors disabled:opacity-60"
      >
        {downloading === 'CUENTA_COBRO' ? (
          <Download className="size-4 animate-pulse" />
        ) : (
          <Receipt className="size-4" />
        )}
        Descargar Cuenta de Cobro
      </button>
    </div>
  )
}
