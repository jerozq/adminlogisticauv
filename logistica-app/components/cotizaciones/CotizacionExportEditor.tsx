'use client'

import { useState, useCallback } from 'react'
import {
  Download,
  Loader2,
  AlertTriangle,
  PenLine,
  CheckCircle2,
  Info,
  Eye,
  Printer,
  ArrowLeft,
} from 'lucide-react'
import type { DatosExportacion } from '@/actions/exportar-cotizacion'
import { CotizacionDocPreview } from './CotizacionDocPreview'

// ============================================================
// Helpers
// ============================================================
const fmtCOP = (n: number) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(n)

// ============================================================
// Tipos de estado del editor
// ============================================================
interface ItemEditable {
  id: string
  descripcion: string
  categoria: string | null
  unidad_medida: string | null
  cantidad: number
  precio_unitario: number
  es_passthrough: boolean
}

// ============================================================
// Derivar totales de los ítems editados
// ============================================================
function calcularTotales(items: ItemEditable[]) {
  // Servicios cotizados (ítems con margen, no passthrough)
  const subtotal_servicios = items
    .filter((i) => !i.es_passthrough)
    .reduce((s, i) => s + i.cantidad * i.precio_unitario, 0)

  const gran_total = subtotal_servicios

  return {
    subtotal_servicios,
    total_reembolsos_sin_inhumacion: 0,
    total_inhumaciones: 0,
    cantidad_inhumaciones: 0,
    total_reembolsos_con_inhumaciones: 0,
    gran_total,
  }
}

// ============================================================
// Props
// ============================================================
interface Props {
  datos: DatosExportacion
}

// ============================================================
// Componente principal
// ============================================================
export function CotizacionExportEditor({ datos }: Props) {
  const { requerimiento, reembolsos } = datos

  // Estado de ítems editable (inicializado desde la DB)
  const [items, setItems] = useState<ItemEditable[]>(
    datos.items.map((i) => ({
      id: i.id,
      descripcion: i.descripcion,
      categoria: i.categoria,
      unidad_medida: i.unidad_medida,
      cantidad: i.cantidad,
      precio_unitario: i.precio_unitario,
      es_passthrough: i.es_passthrough,
    }))
  )

  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showPreview, setShowPreview] = useState(false)

  // Totales reactivos
  const totals = calcularTotales(items, reembolsos)

  // ---- Edición de ítems ----
  const updateItem = useCallback(
    (id: string, field: 'descripcion' | 'cantidad' | 'precio_unitario', value: string) => {
      setItems((prev) =>
        prev.map((item) => {
          if (item.id !== id) return item
          if (field === 'descripcion') return { ...item, descripcion: value }
          const num = parseFloat(value) || 0
          return { ...item, [field]: num }
        })
      )
    },
    []
  )

  // ---- Descarga ----
  async function handleDescargar() {
    setDownloading(true)
    setError(null)

    try {
      const res = await fetch('/api/generar-cotizacion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requerimiento: {
            fecha_inicio: requerimiento.fecha_inicio,
            numero_requerimiento: requerimiento.numero_requerimiento,
            municipio: requerimiento.municipio,
            departamento: requerimiento.departamento,
          },
          cotizacion_fecha: datos.cotizacion?.created_at ?? null,
          items: items.map((i) => ({
            descripcion: i.descripcion,
            cantidad: i.cantidad,
            precio_unitario: i.precio_unitario,
            es_passthrough: i.es_passthrough,
          })),
          totals,
          nombreArchivo: `Cotizacion_${
            requerimiento.numero_requerimiento ?? requerimiento.nombre_actividad
          }.docx`,
        }),
      })

      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error ?? `Error ${res.status}`)
      }

      // Disparar descarga en el navegador
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const disp = res.headers.get('Content-Disposition') ?? ''
      const fnMatch = disp.match(/filename[*]?=(?:UTF-8'')?["']?([^"';\n]+)/)
      a.download = fnMatch ? decodeURIComponent(fnMatch[1]) : 'Cotizacion.docx'
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desconocido')
    } finally {
      setDownloading(false)
    }
  }

  // ============================================================
  // Render
  // ============================================================

  // ---- Vista previa ----
  if (showPreview) {
    return (
      <div className="space-y-4">
        {/* Barra de acciones de previsualización */}
        <div className="no-print flex items-center justify-between gap-3 bg-white rounded-2xl ring-1 ring-zinc-200 px-4 py-3">
          <button
            onClick={() => setShowPreview(false)}
            className="flex items-center gap-1.5 text-sm font-semibold text-zinc-600 hover:text-zinc-900"
          >
            <ArrowLeft className="size-4" />
            Volver a editar
          </button>

          <div className="flex gap-2">
            <button
              onClick={() => window.print()}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white
                         text-sm font-bold hover:bg-blue-700 transition-colors shadow-sm"
            >
              <Printer className="size-4" />
              Imprimir / Exportar PDF
            </button>
            <button
              onClick={handleDescargar}
              disabled={downloading}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-zinc-800 text-white
                         text-sm font-semibold hover:bg-zinc-700 transition-colors disabled:opacity-50"
            >
              {downloading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Download className="size-4" />
              )}
              .docx
            </button>
          </div>
        </div>

        {error && (
          <div className="no-print flex items-center gap-2 bg-red-50 text-red-700 text-sm px-4 py-3 rounded-xl ring-1 ring-red-200">
            <AlertTriangle className="size-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Documento */}
        <CotizacionDocPreview
          requerimiento={requerimiento}
          cotizacionFecha={datos.cotizacion?.created_at ?? null}
          items={items}
          totals={totals}
        />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* ---- Info actividad ---- */}
      <div className="bg-white rounded-2xl ring-1 ring-zinc-200 p-4">
        <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
          Actividad
        </p>
        <p className="font-bold text-zinc-900 text-base">
          {[
            requerimiento.numero_requerimiento ?? null,
            requerimiento.municipio ?? null,
          ].filter(Boolean).join(' — ') || 'Sin identificador'}
        </p>
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-sm text-zinc-500">
          {requerimiento.municipio && (
            <span>
              {requerimiento.municipio}
              {requerimiento.departamento ? `, ${requerimiento.departamento}` : ''}
            </span>
          )}
          {requerimiento.fecha_inicio && (
            <span>
              Inicio:{' '}
              {new Date(requerimiento.fecha_inicio + 'T00:00').toLocaleDateString('es-CO', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            </span>
          )}
        </div>
      </div>

      {/* ---- Aviso de edición ---- */}
      <div className="flex items-start gap-2 text-xs text-blue-700 bg-blue-50 rounded-xl px-3 py-2.5">
        <PenLine className="size-3.5 shrink-0 mt-0.5" />
        <span>
          Puedes editar descripción, cantidad y precio unitario antes de descargar.
          Los totales se recalculan automáticamente.
        </span>
      </div>

      {/* ---- Tabla de ítems editable ---- */}
      <div className="bg-white rounded-2xl ring-1 ring-zinc-200 overflow-hidden">
        <div className="px-4 py-3 bg-zinc-50 border-b border-zinc-100">
          <h2 className="text-sm font-bold text-zinc-700">
            Ítems de cotización ({items.length})
          </h2>
        </div>

        {items.length === 0 ? (
          <div className="py-10 text-center text-sm text-zinc-400">
            Sin ítems en la cotización
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-zinc-400 uppercase tracking-wider border-b border-zinc-100">
                  <th className="px-4 py-2.5 font-semibold w-auto">Descripción</th>
                  <th className="px-3 py-2.5 font-semibold text-right w-20">Cant.</th>
                  <th className="px-3 py-2.5 font-semibold text-right w-32">Precio Unit.</th>
                  <th className="px-3 py-2.5 font-semibold text-right w-32">Total</th>
                  <th className="px-3 py-2.5 font-semibold w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-50">
                {items.map((item) => {
                  const total = item.cantidad * item.precio_unitario
                  return (
                    <tr
                      key={item.id}
                      className={`group transition-colors ${
                        item.es_passthrough ? 'bg-amber-50/60' : 'bg-white'
                      } hover:bg-zinc-50`}
                    >
                      {/* Descripción */}
                      <td className="px-4 py-2">
                        <input
                          type="text"
                          value={item.descripcion}
                          onChange={(e) =>
                            updateItem(item.id, 'descripcion', e.target.value)
                          }
                          className="w-full min-w-[180px] border-b border-transparent
                                     focus:border-blue-400 focus:outline-none bg-transparent
                                     text-zinc-900 text-sm py-0.5"
                        />
                        {item.es_passthrough && (
                          <span className="text-[10px] text-amber-600 font-semibold block">
                            Passthrough (reembolso tercero)
                          </span>
                        )}
                      </td>

                      {/* Cantidad */}
                      <td className="px-3 py-2 text-right">
                        <input
                          type="number"
                          value={item.cantidad}
                          onChange={(e) =>
                            updateItem(item.id, 'cantidad', e.target.value)
                          }
                          className="w-16 text-right border-b border-transparent
                                     focus:border-blue-400 focus:outline-none bg-transparent
                                     text-zinc-900 text-sm py-0.5"
                          min="0"
                          step="1"
                        />
                      </td>

                      {/* Precio unitario */}
                      <td className="px-3 py-2 text-right">
                        <input
                          type="number"
                          value={item.precio_unitario}
                          onChange={(e) =>
                            updateItem(item.id, 'precio_unitario', e.target.value)
                          }
                          className="w-28 text-right border-b border-transparent
                                     focus:border-blue-400 focus:outline-none bg-transparent
                                     text-zinc-900 text-sm py-0.5"
                          min="0"
                          step="1000"
                        />
                      </td>

                      {/* Total */}
                      <td className="px-3 py-2 text-right font-semibold text-zinc-900 whitespace-nowrap">
                        {fmtCOP(total)}
                      </td>

                      {/* Indicador */}
                      <td className="px-3 py-2 text-center">
                        {item.es_passthrough ? (
                          <span title="Rubro de terceros">
                            <Info className="size-3.5 text-amber-500" />
                          </span>
                        ) : (
                          <CheckCircle2 className="size-3.5 text-green-400 opacity-0 group-hover:opacity-100" />
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ---- Reembolsos ---- */}
      {reembolsos.length > 0 && (
        <div className="bg-white rounded-2xl ring-1 ring-zinc-200 overflow-hidden">
          <div className="px-4 py-3 bg-zinc-50 border-b border-zinc-100">
            <h2 className="text-sm font-bold text-zinc-700">
              Reembolsos beneficiarios ({reembolsos.length})
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              Dinero de terceros · No editable aquí
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-zinc-400 uppercase tracking-wider border-b border-zinc-100">
                  <th className="px-4 py-2.5 font-semibold">Beneficiario</th>
                  <th className="px-3 py-2.5 font-semibold text-right">Transporte</th>
                  <th className="px-3 py-2.5 font-semibold text-right">Alojamiento</th>
                  <th className="px-3 py-2.5 font-semibold text-right">Alimentación</th>
                  <th className="px-3 py-2.5 font-semibold text-right">Otros</th>
                  <th className="px-3 py-2.5 font-semibold text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-50">
                {reembolsos.map((r) => (
                  <tr key={r.id} className="bg-white">
                    <td className="px-4 py-2 text-zinc-700">{r.nombre_beneficiario}</td>
                    <td className="px-3 py-2 text-right text-zinc-600">
                      {r.valor_transporte > 0 ? fmtCOP(r.valor_transporte) : '—'}
                    </td>
                    <td className="px-3 py-2 text-right text-zinc-600">
                      {r.valor_alojamiento > 0 ? fmtCOP(r.valor_alojamiento) : '—'}
                    </td>
                    <td className="px-3 py-2 text-right text-zinc-600">
                      {r.valor_alimentacion > 0 ? fmtCOP(r.valor_alimentacion) : '—'}
                    </td>
                    <td className="px-3 py-2 text-right text-zinc-600">
                      {r.valor_otros > 0 ? fmtCOP(r.valor_otros) : '—'}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold text-zinc-900">
                      {fmtCOP(r.total_reembolso)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ---- Resumen de totales ---- */}
      <div className="bg-white rounded-2xl ring-1 ring-zinc-200 overflow-hidden">
        <div className="px-4 py-3 bg-zinc-50 border-b border-zinc-100">
          <h2 className="text-sm font-bold text-zinc-700">Resumen de totales</h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Se inyectarán en la plantilla Word con estos valores
          </p>
        </div>

        <div className="p-4 space-y-2">
          {/* Etiqueta → Placeholder Word → Valor */}
          <TotalRow
            label="Subtotal servicios"
            placeholder="{{subtotal_servicios}}"
            value={totals.subtotal_servicios}
          />
          <TotalRow
            label="Reembolsos beneficiarios"
            placeholder="{{total_reembolsos_sin_inhumacion}}"
            value={totals.total_reembolsos_sin_inhumacion}
          />
          {totals.cantidad_inhumaciones > 0 && (
            <>
              <TotalRow
                label="Inhumaciones"
                placeholder="{{total_inhumaciones}}"
                value={totals.total_inhumaciones}
              />
              <div className="flex justify-between text-sm text-zinc-500 pl-1">
                <span>↳ Cantidad inhumaciones</span>
                <span className="font-mono text-xs text-zinc-400">
                  {'{{cantidad_inhumaciones}}'} = {totals.cantidad_inhumaciones}
                </span>
              </div>
              <TotalRow
                label="Total reembolsos con inhumación"
                placeholder="{{total_reembolsos_con_inhumaciones}}"
                value={totals.total_reembolsos_con_inhumaciones}
              />
            </>
          )}

          <div className="h-px bg-zinc-100 my-2" />

          {/* Gran Total */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-extrabold text-zinc-900">Gran Total</p>
              <p className="text-[10px] font-mono text-zinc-400">
                {'{{gran_total}}'}
              </p>
            </div>
            <p className="text-xl font-extrabold text-green-700">
              {fmtCOP(totals.gran_total)}
            </p>
          </div>
        </div>
      </div>

      {/* ---- Error ---- */}
      {error && (
        <div className="flex items-center gap-2 bg-red-50 text-red-700 text-sm px-4 py-3 rounded-xl ring-1 ring-red-200">
          <AlertTriangle className="size-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* ---- Acciones ---- */}
      <div className="flex flex-col gap-3">
        {/* Botón principal: previsualizar */}
        <button
          onClick={() => { setError(null); setShowPreview(true) }}
          disabled={items.length === 0}
          className="w-full flex items-center justify-center gap-2.5 py-4 text-base
                     font-bold text-white bg-blue-600 rounded-2xl hover:bg-blue-700
                     disabled:opacity-50 transition-colors shadow-md shadow-blue-200/60
                     active:scale-[0.98]"
        >
          <Eye className="size-5" />
          Previsualizar documento
        </button>

        {/* Botón secundario: descargar .docx directo */}
        <button
          onClick={handleDescargar}
          disabled={downloading || items.length === 0}
          className="w-full flex items-center justify-center gap-2 py-3 text-sm
                     font-semibold text-zinc-600 bg-zinc-100 rounded-2xl hover:bg-zinc-200
                     disabled:opacity-50 transition-colors active:scale-[0.98]"
        >
          {downloading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Download className="size-4" />
          )}
          {downloading ? 'Generando…' : 'Descargar .docx'}
        </button>
      </div>
    </div>
  )
}

// ============================================================
// Fila de resumen
// ============================================================
function TotalRow({
  label,
  placeholder,
  value,
}: {
  label: string
  placeholder: string
  value: number
}) {
  return (
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <p className="text-sm text-zinc-700">{label}</p>
        <p className="text-[10px] font-mono text-zinc-400 truncate">{placeholder}</p>
      </div>
      <p className="text-sm font-semibold text-zinc-900 whitespace-nowrap shrink-0">
        {fmtCOP(value)}
      </p>
    </div>
  )
}
