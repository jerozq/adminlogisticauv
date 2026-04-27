'use client'

import type { DatosExportacion } from '@/actions/exportar-cotizacion'

// ============================================================
// Helpers
// ============================================================
const fmtCOP = (n: number) =>
  new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(n)

function fmtDate(s: string | null | undefined): string {
  if (!s) return '—'
  const d = new Date(s.includes('T') ? s : s + 'T00:00')
  return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' })
}

// ============================================================
// Props — recibe los mismos datos que el editor
// ============================================================
export interface ItemEditable {
  id: string
  descripcion: string
  cantidad: number
  precio_unitario: number
  es_passthrough: boolean
}

export interface Totales {
  subtotal_servicios: number
  total_reembolsos_sin_inhumacion: number
  total_inhumaciones: number
  cantidad_inhumaciones: number
  total_reembolsos_con_inhumaciones: number
  gran_total: number
}

interface Props {
  requerimiento: DatosExportacion['requerimiento']
  cotizacionFecha: string | null
  items: ItemEditable[]
  totals: Totales
}

// ============================================================
// Estilos de celda de encabezado de tabla
// ============================================================
const TH = 'border border-gray-400 px-3 py-2 text-left font-bold bg-gray-200 text-gray-800'
const TD = 'border border-gray-300 px-3 py-2'
const TD_R = 'border border-gray-300 px-3 py-2 text-right tabular-nums'
const TD_C = 'border border-gray-300 px-3 py-2 text-center'

// ============================================================
// Componente principal
// ============================================================
export function CotizacionDocPreview({ requerimiento, cotizacionFecha, items, totals }: Props) {
  // Ahora mostramos TODOS los ítems en la tabla principal (incluyendo inhumación)
  const serviciosItems = items

  // No hay reembolsos en tabla aparte por ahora, todo es servicio
  const hasReembolsos = false

  const precioUnitInhumacion =
    totals.cantidad_inhumaciones > 0
      ? totals.total_inhumaciones / totals.cantidad_inhumaciones
      : 0

  return (
    <div
      id="cotizacion-doc-preview"
      className="bg-white text-gray-900 font-sans text-[13px] leading-snug
                 w-full max-w-[794px] mx-auto px-12 py-10 print:px-0 print:py-0"
    >
      {/* ── Título ── */}
      <h1 className="text-center text-[17px] font-extrabold uppercase tracking-widest mb-8 text-gray-900">
        Cotización de Servicios
      </h1>

      {/* ── Info general ── */}
      <table className="w-full border-collapse mb-8 text-[13px]">
        <tbody>
          <tr>
            <td className="border border-gray-300 px-3 py-2 w-[22%] bg-gray-100 font-semibold text-gray-600 uppercase text-[11px] tracking-wide">
              Fecha cotización
            </td>
            <td className="border border-gray-300 px-3 py-2 w-[28%]">
              {fmtDate(cotizacionFecha ?? undefined)}
            </td>
            <td className="border border-gray-300 px-3 py-2 w-[22%] bg-gray-100 font-semibold text-gray-600 uppercase text-[11px] tracking-wide">
              Fecha inicio
            </td>
            <td className="border border-gray-300 px-3 py-2 w-[28%]">
              {fmtDate(requerimiento.fecha_inicio ?? undefined)}
            </td>
          </tr>
          <tr>
            <td className="border border-gray-300 px-3 py-2 bg-gray-100 font-semibold text-gray-600 uppercase text-[11px] tracking-wide">
              N° Requerimiento
            </td>
            <td
              colSpan={3}
              className="border border-gray-300 px-3 py-2 font-extrabold text-[15px] text-gray-900"
            >
              {requerimiento.numero_requerimiento ?? '—'}
            </td>
          </tr>
          <tr>
            <td className="border border-gray-300 px-3 py-2 bg-gray-100 font-semibold text-gray-600 uppercase text-[11px] tracking-wide">
              Municipio
            </td>
            <td className="border border-gray-300 px-3 py-2">
              {requerimiento.municipio ?? '—'}
            </td>
            <td className="border border-gray-300 px-3 py-2 bg-gray-100 font-semibold text-gray-600 uppercase text-[11px] tracking-wide">
              Departamento
            </td>
            <td className="border border-gray-300 px-3 py-2">
              {requerimiento.departamento ?? '—'}
            </td>
          </tr>
        </tbody>
      </table>

      {/* ── Tabla 1: Servicios ── */}
      <table className="w-full border-collapse mb-6 text-[13px]">
        <thead>
          <tr>
            <th className={TH}>Concepto</th>
            <th className={`${TH} text-center w-20`}>Cantidad</th>
            <th className={`${TH} text-right w-36`}>Valor Unitario</th>
            <th className={`${TH} text-right w-36`}>Total</th>
          </tr>
        </thead>
        <tbody>
          {serviciosItems.map((item, i) => (
            <tr key={item.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
              <td className={TD}>{item.descripcion}</td>
              <td className={TD_C}>{item.cantidad}</td>
              <td className={TD_R}>$ {fmtCOP(item.precio_unitario)}</td>
              <td className={TD_R}>$ {fmtCOP(item.cantidad * item.precio_unitario)}</td>
            </tr>
          ))}
          {/* Fila total */}
          <tr className="bg-gray-200 font-bold">
            <td colSpan={3} className="border border-gray-400 px-3 py-2 text-right uppercase tracking-wide text-gray-700">
              Total
            </td>
            <td className="border border-gray-400 px-3 py-2 text-right tabular-nums">
              $ {fmtCOP(totals.gran_total)}
            </td>
          </tr>
        </tbody>
      </table>

      {/* Tabla 2 eliminada: inhumación movida a Tabla 1 */}

      {/* ── Tabla Gran Total ── */}
      <table className="w-full border-collapse text-[13px]">
        <tbody>
          <tr className="bg-gray-900 text-white font-extrabold">
            <td colSpan={3} className="border border-gray-600 px-3 py-3 text-right uppercase tracking-widest text-[13px]">
              Total General
            </td>
            <td className="border border-gray-600 px-3 py-3 text-right text-[15px] tabular-nums w-36">
              $ {fmtCOP(totals.gran_total)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}
