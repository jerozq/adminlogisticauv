import { NextRequest, NextResponse } from 'next/server'
import ExcelJS from 'exceljs'

export const runtime = 'nodejs'

// ============================================================
// POST /api/cotizaciones/exportar-excel
//
// Genera un .xlsx de la cotización con los ítems editados.
//
// Body JSON esperado:
// {
//   requerimiento: {
//     numero_requerimiento?: string,
//     nombre_actividad?: string,
//     municipio?: string,
//     departamento?: string,
//     fecha_inicio?: string,
//   },
//   items: { descripcion: string; categoria?: string | null; unidad_medida?: string | null;
//             cantidad: number; precio_unitario: number; es_passthrough: boolean }[],
//   gran_total: number,
//   cotizacion_fecha?: string | null,
// }
// ============================================================

const COP = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
})

function fmtDate(iso: string | undefined | null) {
  if (!iso) return ''
  return new Date(iso + (iso.includes('T') ? '' : 'T00:00')).toLocaleDateString('es-CO', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })
}

export async function POST(request: NextRequest) {
  let body: {
    requerimiento: {
      numero_requerimiento?: string | null
      nombre_actividad?: string | null
      municipio?: string | null
      departamento?: string | null
      fecha_inicio?: string | null
    }
    items: {
      descripcion: string
      categoria?: string | null
      unidad_medida?: string | null
      cantidad: number
      precio_unitario: number
      es_passthrough: boolean
    }[]
    gran_total: number
    cotizacion_fecha?: string | null
  }

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Body JSON inválido.' }, { status: 400 })
  }

  const { requerimiento, items, gran_total } = body

  if (!items || items.length === 0) {
    return NextResponse.json(
      { error: 'No hay datos suficientes para generar el formato. Por favor, completa la información de costos/ítems primero.' },
      { status: 400 },
    )
  }

  // ─── Construir el libro Excel ─────────────────────────────────────────────
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Admin Logística UV'
  workbook.created = new Date()

  const sheet = workbook.addWorksheet('Cotización', {
    pageSetup: { fitToPage: true, fitToWidth: 1, orientation: 'landscape' },
  })

  // Colores corporativos
  const COLOR_HEADER_BG  = '1E3A5F'
  const COLOR_HEADER_FG  = 'FFFFFF'
  const COLOR_SUBHD_BG   = '2E6DA4'
  const COLOR_TOTAL_BG   = 'E8F4FD'
  const COLOR_PASS_BG    = 'FFF8E1'
  const COLOR_BORDER     = 'BFCBD9'

  const borderThin: Partial<ExcelJS.Borders> = {
    top:    { style: 'thin', color: { argb: COLOR_BORDER } },
    left:   { style: 'thin', color: { argb: COLOR_BORDER } },
    bottom: { style: 'thin', color: { argb: COLOR_BORDER } },
    right:  { style: 'thin', color: { argb: COLOR_BORDER } },
  }

  // Anchos de columna: N° | Descripción | Categoría | Unidad | Cant. | Precio Unit. | Total
  sheet.columns = [
    { key: 'num',       width: 6  },
    { key: 'desc',      width: 45 },
    { key: 'categoria', width: 18 },
    { key: 'unidad',    width: 14 },
    { key: 'cantidad',  width: 10 },
    { key: 'precio',    width: 18 },
    { key: 'total',     width: 18 },
  ]

  // ─── Fila 1: título principal ──────────────────────────────────────────────
  const titleRow = sheet.addRow(['COTIZACIÓN DE SERVICIOS LOGÍSTICOS', '', '', '', '', '', ''])
  sheet.mergeCells('A1:G1')
  titleRow.height = 32
  titleRow.getCell('A').style = {
    font: { bold: true, size: 16, color: { argb: COLOR_HEADER_FG } },
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_HEADER_BG } },
    alignment: { horizontal: 'center', vertical: 'middle' },
  }

  // ─── Filas 2-5: metadatos de la actividad ────────────────────────────────
  const metaStyle: Partial<ExcelJS.Style> = {
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'EAF2FB' } },
    font: { size: 11 },
    alignment: { vertical: 'middle' },
  }
  const metaLabelStyle: Partial<ExcelJS.Style> = {
    ...metaStyle,
    font: { bold: true, size: 11, color: { argb: COLOR_HEADER_BG } },
  }

  const addMeta = (label: string, value: string) => {
    const row = sheet.addRow([label, value, '', '', '', '', ''])
    row.height = 18
    sheet.mergeCells(`B${row.number}:G${row.number}`)
    row.getCell('A').style = metaLabelStyle
    row.getCell('B').style = metaStyle
  }

  addMeta(
    'Requerimiento:',
    [requerimiento.numero_requerimiento, requerimiento.municipio, requerimiento.departamento]
      .filter(Boolean)
      .join(' — ') || '—',
  )
  addMeta('Actividad:', requerimiento.nombre_actividad || '—')
  addMeta('Fecha inicio:', fmtDate(requerimiento.fecha_inicio))
  addMeta('Fecha cotización:', fmtDate(body.cotizacion_fecha ?? null))

  // Espacio
  sheet.addRow([])

  // ─── Cabecera de la tabla ─────────────────────────────────────────────────
  const headerRow = sheet.addRow(['N°', 'Descripción', 'Categoría', 'Unidad', 'Cantidad', 'Precio Unit.', 'Total'])
  headerRow.height = 22
  headerRow.eachCell((cell) => {
    cell.style = {
      font:      { bold: true, color: { argb: COLOR_HEADER_FG }, size: 11 },
      fill:      { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_SUBHD_BG } },
      alignment: { horizontal: 'center', vertical: 'middle', wrapText: true },
      border:    borderThin,
    }
  })

  // ─── Filas de ítems ───────────────────────────────────────────────────────
  items.forEach((item, idx) => {
    const total = item.cantidad * item.precio_unitario
    const row = sheet.addRow([
      idx + 1,
      item.descripcion,
      item.categoria ?? '',
      item.unidad_medida ?? 'und',
      item.cantidad,
      item.precio_unitario,
      total,
    ])
    row.height = 18

    const isPass = item.es_passthrough
    const rowBg  = isPass ? COLOR_PASS_BG : idx % 2 === 0 ? 'F7FAFD' : 'FFFFFF'

    row.eachCell((cell) => {
      cell.style = {
        fill:   { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBg } },
        border: borderThin,
        alignment: { vertical: 'middle', wrapText: true },
        font: { size: 11 },
      }
    })

    // Alineaciones específicas
    row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' }
    row.getCell(5).alignment = { horizontal: 'right',  vertical: 'middle' }
    row.getCell(6).alignment = { horizontal: 'right',  vertical: 'middle' }
    row.getCell(7).alignment = { horizontal: 'right',  vertical: 'middle' }

    // Formato número con moneda
    row.getCell(6).numFmt = '#,##0'
    row.getCell(7).numFmt = '#,##0'

    if (isPass) {
      row.getCell(2).font = { italic: true, color: { argb: 'B8860B' }, size: 11 }
    }
  })

  // ─── Fila de total ────────────────────────────────────────────────────────
  sheet.addRow([])
  const totalRow = sheet.addRow(['', '', '', '', '', 'GRAN TOTAL', gran_total])
  totalRow.height = 24
  totalRow.getCell(6).style = {
    font:      { bold: true, size: 12, color: { argb: COLOR_HEADER_BG } },
    fill:      { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_TOTAL_BG } },
    alignment: { horizontal: 'right', vertical: 'middle' },
    border:    borderThin,
  }
  totalRow.getCell(7).style = {
    font:      { bold: true, size: 12, color: { argb: '1A6B3C' } },
    fill:      { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_TOTAL_BG } },
    alignment: { horizontal: 'right', vertical: 'middle' },
    numFmt:    '#,##0',
    border:    borderThin,
  }
  sheet.mergeCells(`A${totalRow.number}:E${totalRow.number}`)

  // ─── Nota de passthrough ──────────────────────────────────────────────────
  const hasPass = items.some((i) => i.es_passthrough)
  if (hasPass) {
    sheet.addRow([])
    const noteRow = sheet.addRow(['* Filas amarillas corresponden a ítems passthrough (dinero de terceros / reembolsos).'])
    sheet.mergeCells(`A${noteRow.number}:G${noteRow.number}`)
    noteRow.getCell('A').style = {
      font: { italic: true, size: 10, color: { argb: 'B8860B' } },
      alignment: { horizontal: 'left' },
    }
  }

  // ─── Serializar y devolver ────────────────────────────────────────────────
  const buffer = await workbook.xlsx.writeBuffer()

  const nombreArchivo = encodeURIComponent(
    `Cotizacion_${(requerimiento.numero_requerimiento ?? 'SN').replace(/[/\\:*?"<>|]/g, '-')}.xlsx`,
  )

  return new NextResponse(buffer as ArrayBuffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename*=UTF-8''${nombreArchivo}`,
    },
  })
}
