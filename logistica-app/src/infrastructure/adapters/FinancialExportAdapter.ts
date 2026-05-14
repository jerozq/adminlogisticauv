import ExcelJS from 'exceljs'
import { BalanceFinanciero } from '@/src/core/domain/entities/BalanceFinanciero'
import type {
  IFinancialExporter,
  DatosExportacionFinanciero,
  ConfigExportacion,
  ArchivoExportado,
} from '@/src/core/domain/ports/IFinancialExporter'
import { getLogger } from '@/src/infrastructure/observability/logger'

// ============================================================
// FinancialExportAdapter
//
// Implementa IFinancialExporter generando un archivo Excel
// multi-hoja estructurado para contabilidad usando ExcelJS.
//
// Hojas generadas:
//   1. Resumen        — KPIs globales + metadatos de auditoría
//   2. Actividades    — Detalle por actividad con semáforo de margen
//   3. Por Mes        — Agregados mensuales
//   4. Por Socio      — Quién aportó / quién recibió
//   5. Por Fuente     — Distribución por fuente de financiación
//
// Auditoría de seguridad (OWASP A09):
//   Pino registra dos eventos:
//   - Inicio de exportación (solicitud + userId + filtros)
//   - Fin de exportación   (filename + tamaño + duracionMs)
//   Ambos incluyen el campo { accesoFinanciero: true } para
//   facilitar alertas en sistemas SIEM.
// ============================================================

const log = getLogger('FinancialExportAdapter')

// ---------------------------------------------------------------
// Estilos reutilizables
// ---------------------------------------------------------------

const VIOLET_700  = 'FF5B21B6'
const WHITE       = 'FFFFFFFF'
const GREEN_BG    = 'FFD1FAE5'
const YELLOW_BG   = 'FFFEF3C7'
const RED_BG      = 'FFFEE2E2'
const GRAY_ROW    = 'FFF4F4F5'

const HEADER_FILL: ExcelJS.Fill = {
  type: 'pattern', pattern: 'solid', fgColor: { argb: VIOLET_700 },
}
const TOTAL_FILL: ExcelJS.Fill = {
  type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' },
}
const HEADER_FONT: Partial<ExcelJS.Font> = {
  bold: true, color: { argb: WHITE }, size: 11, name: 'Calibri',
}
const BORDER_THIN: Partial<ExcelJS.Borders> = {
  top:    { style: 'thin', color: { argb: 'FFCBD5E1' } },
  bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
  left:   { style: 'thin', color: { argb: 'FFCBD5E1' } },
  right:  { style: 'thin', color: { argb: 'FFCBD5E1' } },
}

const COP_FORMAT = '"$"#,##0'
const PCT_FORMAT = '0.00"%"'

// ---------------------------------------------------------------
// Helpers internos
// ---------------------------------------------------------------

function applyHeaderRow(row: ExcelJS.Row): void {
  row.eachCell({ includeEmpty: true }, (cell) => {
    cell.fill      = HEADER_FILL
    cell.font      = HEADER_FONT
    cell.border    = BORDER_THIN
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
  })
  row.height = 28
}

function applyDataRow(row: ExcelJS.Row, alternate = false): void {
  row.eachCell({ includeEmpty: true }, (cell) => {
    cell.border    = BORDER_THIN
    cell.alignment = { vertical: 'middle' }
    if (alternate) {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GRAY_ROW } }
    }
  })
  row.height = 18
}

function applyTotalRow(row: ExcelJS.Row): void {
  row.eachCell({ includeEmpty: true }, (cell) => {
    cell.fill   = TOTAL_FILL
    cell.font   = { bold: true, name: 'Calibri', size: 11 }
    cell.border = BORDER_THIN
  })
  row.height = 20
}

function addWorksheet(wb: ExcelJS.Workbook, title: string): ExcelJS.Worksheet {
  return wb.addWorksheet(title, {
    pageSetup: {
      paperSize:    9,          // A4
      orientation:  'landscape',
      fitToPage:    true,
      fitToWidth:   1,
      fitToHeight:  0,
      margins: { left: 0.5, right: 0.5, top: 0.75, bottom: 0.75, header: 0.3, footer: 0.3 },
    },
    views: [{ state: 'frozen', ySplit: 1 }],  // header siempre visible
    properties: { defaultRowHeight: 18 },
  })
}

function setColumnWidths(ws: ExcelJS.Worksheet, widths: number[]): void {
  ws.columns.forEach((col, i) => {
    col.width = widths[i] ?? 14
  })
}

// ---------------------------------------------------------------
// Hoja 1: Resumen (KPIs + metadatos)
// ---------------------------------------------------------------

function buildHojaResumen(
  wb:     ExcelJS.Workbook,
  datos:  DatosExportacionFinanciero,
  config: ConfigExportacion,
): void {
  const ws = addWorksheet(wb, 'Resumen')
  ws.mergeCells('A1:C1')
  ws.mergeCells('A2:C2')
  ws.mergeCells('A3:C3')

  // ── Encabezado informativo ──
  const titulo = config.titulo ?? 'Reporte Financiero — Admin Logística UV'
  const r1     = ws.getRow(1)
  r1.getCell(1).value = titulo
  r1.getCell(1).font  = { bold: true, size: 14, color: { argb: VIOLET_700 }, name: 'Calibri' }
  r1.height           = 32

  ws.getRow(2).getCell(1).value =
    `Generado por: ${config.nombreUsuario ?? config.userId}  |  ${config.generadoEn}`
  ws.getRow(2).getCell(1).font = { italic: true, size: 10, color: { argb: 'FF6B7280' } }

  const periodo =
    `Período: ${config.filtrosAplicados.desde ?? 'inicio'} → ${config.filtrosAplicados.hasta ?? 'hoy'}` +
    (config.filtrosAplicados.estadoActividad ? `  |  Estado: ${config.filtrosAplicados.estadoActividad}` : '') +
    (config.filtrosAplicados.fuenteFinanciacion ? `  |  Fuente: ${config.filtrosAplicados.fuenteFinanciacion}` : '')
  ws.getRow(3).getCell(1).value = periodo
  ws.getRow(3).getCell(1).font  = { size: 10, color: { argb: 'FF6B7280' } }

  ws.addRow([])  // separador

  // ── Tabla KPI ──
  const headerKpi = ws.addRow(['Indicador', 'Valor (COP)', ''])
  applyHeaderRow(headerKpi)
  ws.mergeCells(`C${headerKpi.number}:C${headerKpi.number}`)

  const kpis: Array<[string, number | string, boolean]> = [
    ['Total Cotizado (Ingresos)',  datos.kpis.totalCotizado,       false],
    ['Total Gastos Reales',        datos.kpis.totalGastoReal,       false],
    ['Total Reembolsos',           datos.kpis.totalReembolsos,      false],
    ['Utilidad Bruta',             datos.kpis.utilidadBruta,        true ],
    ['Utilidad Neta',              datos.kpis.utilidadNeta,         true ],
    ['Dinero en Caja',             datos.kpis.dineroEnCaja,         false],
    ['Utilidad por Cobrar',        datos.kpis.utilidadPorCobrar,    false],
    ['# Actividades del Período',  datos.kpis.cantidadActividades,  false],
  ]

  for (const [concepto, valor, isTotal] of kpis) {
    const r = ws.addRow([concepto, valor])
    if (typeof valor === 'number' && valor > 9_999) r.getCell(2).numFmt = COP_FORMAT
    if (isTotal) applyTotalRow(r)
    else         applyDataRow(r)
    r.getCell(1).alignment = { vertical: 'middle', indent: 1 }
  }

  setColumnWidths(ws, [38, 22, 6])
}

// ---------------------------------------------------------------
// Hoja 2: Actividades (detalle por actividad)
// ---------------------------------------------------------------

function buildHojaActividades(
  wb:    ExcelJS.Workbook,
  datos: DatosExportacionFinanciero,
): void {
  const ws = addWorksheet(wb, 'Actividades')
  ws.columns = [
    { key: 'id',         header: 'ID Actividad',      width: 14 },
    { key: 'nombre',     header: 'Nombre',             width: 42 },
    { key: 'municipio',  header: 'Municipio',          width: 18 },
    { key: 'fecha',      header: 'Fecha',              width: 13 },
    { key: 'fuente',     header: 'Fuente',             width: 20 },
    { key: 'cotizado',   header: 'Cotizado',           width: 18 },
    { key: 'costo',      header: 'Costo Real',         width: 18 },
    { key: 'reembolsos', header: 'Reembolsos',         width: 16 },
    { key: 'uBruta',     header: 'Util. Bruta',        width: 18 },
    { key: 'uNeta',      header: 'Util. Neta',         width: 18 },
    { key: 'margen',     header: 'Margen %',           width: 11 },
    { key: 'semaforo',   header: 'Rentabilidad',       width: 14 },
  ]

  applyHeaderRow(ws.getRow(1))
  ws.views = [{ state: 'frozen', ySplit: 1 }]

  const COP_COLS  = ['cotizado', 'costo', 'reembolsos', 'uBruta', 'uNeta']

  let rowIndex = 0
  for (const props of datos.balancesDetalle) {
    const b      = new BalanceFinanciero(props)
    const margen = b.totalCotizado > 0
      ? Math.round((b.utilidadNeta / b.totalCotizado) * 10_000) / 100
      : 0

    const semaforo =
      margen >= 20 ? 'Alta (≥ 20 %)' :
      margen >= 10 ? 'Media (10-20 %)' :
                     'Baja (< 10 %)'

    const r = ws.addRow({
      id:         props.actividadId,
      nombre:     props.nombreActividad,
      municipio:  props.municipio ?? '',
      fecha:      props.fechaActividad ?? '',
      fuente:     props.fuenteFinanciacion,
      cotizado:   b.totalCotizado,
      costo:      b.totalCostosReales,
      reembolsos: b.totalReembolsos,
      uBruta:     b.utilidadBruta,
      uNeta:      b.utilidadNeta,
      margen,
      semaforo,
    })

    for (const col of COP_COLS) r.getCell(col).numFmt = COP_FORMAT
    r.getCell('margen').numFmt = PCT_FORMAT

    // Semáforo visual en la celda Margen
    const margenCell  = r.getCell('margen')
    const semaforoCell = r.getCell('semaforo')
    if (margen >= 20) {
      margenCell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: GREEN_BG } }
      semaforoCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GREEN_BG } }
      semaforoCell.font = { color: { argb: 'FF065F46' }, bold: true }
    } else if (margen >= 10) {
      margenCell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: YELLOW_BG } }
      semaforoCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: YELLOW_BG } }
      semaforoCell.font = { color: { argb: 'FF92400E' }, bold: true }
    } else {
      margenCell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: RED_BG } }
      semaforoCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: RED_BG } }
      semaforoCell.font = { color: { argb: 'FF991B1B' }, bold: true }
    }

    applyDataRow(r, rowIndex % 2 === 1)
    rowIndex++
  }

  // Fila de totales
  const totalRow = ws.addRow({
    nombre:     `TOTALES (${datos.balancesDetalle.length} actividades)`,
    cotizado:   datos.kpis.totalCotizado,
    costo:      datos.kpis.totalGastoReal,
    reembolsos: datos.kpis.totalReembolsos,
    uBruta:     datos.kpis.utilidadBruta,
    uNeta:      datos.kpis.utilidadNeta,
  })
  for (const col of COP_COLS) totalRow.getCell(col).numFmt = COP_FORMAT
  applyTotalRow(totalRow)

  ws.autoFilter = {
    from: { row: 1, column: 1 },
    to:   { row: 1, column: ws.columns.length },
  }
}

// ---------------------------------------------------------------
// Hoja 3: Por Mes
// ---------------------------------------------------------------

function buildHojaPorMes(
  wb:    ExcelJS.Workbook,
  datos: DatosExportacionFinanciero,
): void {
  const ws = addWorksheet(wb, 'Por Mes')
  ws.columns = [
    { key: 'mes',       header: 'Mes',              width: 12 },
    { key: 'cotizado',  header: 'Cotizado',         width: 18 },
    { key: 'costo',     header: 'Costo Real',       width: 18 },
    { key: 'reembolso', header: 'Reembolsos',       width: 16 },
    { key: 'uBruta',    header: 'Util. Bruta',      width: 18 },
    { key: 'uNeta',     header: 'Util. Neta',       width: 18 },
    { key: 'cantidad',  header: '# Actividades',    width: 14 },
    { key: 'margenPct', header: 'Margen % Mes',     width: 14 },
  ]

  applyHeaderRow(ws.getRow(1))

  const COP_COLS = ['cotizado', 'costo', 'reembolso', 'uBruta', 'uNeta']

  let idx = 0
  for (const m of datos.agregadosPorMes) {
    const margenMes = m.totalCotizado > 0
      ? Math.round((m.utilidadNeta / m.totalCotizado) * 10_000) / 100
      : 0
    const r = ws.addRow({
      mes:       m.mes,
      cotizado:  m.totalCotizado,
      costo:     m.totalCostosReales,
      reembolso: m.totalReembolsos,
      uBruta:    m.utilidadBruta,
      uNeta:     m.utilidadNeta,
      cantidad:  m.cantidadActividades,
      margenPct: margenMes,
    })
    for (const col of COP_COLS) r.getCell(col).numFmt = COP_FORMAT
    r.getCell('margenPct').numFmt = PCT_FORMAT
    applyDataRow(r, idx % 2 === 1)
    idx++
  }

  // Fila de totales
  const total = ws.addRow({
    mes:       'TOTAL',
    cotizado:  datos.kpis.totalCotizado,
    costo:     datos.kpis.totalGastoReal,
    reembolso: datos.kpis.totalReembolsos,
    uBruta:    datos.kpis.utilidadBruta,
    uNeta:     datos.kpis.utilidadNeta,
    cantidad:  datos.kpis.cantidadActividades,
  })
  for (const col of COP_COLS) total.getCell(col).numFmt = COP_FORMAT
  applyTotalRow(total)
}

// ---------------------------------------------------------------
// Hoja 4: Por Socio
// ---------------------------------------------------------------

function buildHojaPorSocio(
  wb:    ExcelJS.Workbook,
  datos: DatosExportacionFinanciero,
): void {
  const ws = addWorksheet(wb, 'Por Socio')
  ws.columns = [
    { key: 'socio',      header: 'Socio',               width: 30 },
    { key: 'aportado',   header: 'Total Aportado',       width: 22 },
    { key: 'recibido',   header: 'Total Recibido',       width: 22 },
    { key: 'ganancia',   header: 'Ganancia Neta',        width: 22 },
    { key: 'retorno',    header: 'ROI %',                width: 12 },
    { key: 'cantidad',   header: '# Actividades',        width: 14 },
  ]

  applyHeaderRow(ws.getRow(1))

  let idx = 0
  for (const s of datos.agregadosPorSocio) {
    const ganancia = s.totalRecibido - s.totalAportado
    const roi      = s.totalAportado > 0
      ? Math.round((ganancia / s.totalAportado) * 10_000) / 100
      : 0
    const r = ws.addRow({
      socio:    s.nombreSocio,
      aportado: s.totalAportado,
      recibido: s.totalRecibido,
      ganancia,
      retorno:  roi,
      cantidad: s.cantidadActividades,
    })
    for (const col of ['aportado', 'recibido', 'ganancia']) r.getCell(col).numFmt = COP_FORMAT
    r.getCell('retorno').numFmt = PCT_FORMAT

    // ROI positivo → verde; negativo → rojo
    if (roi >= 0) {
      r.getCell('ganancia').font = { color: { argb: 'FF065F46' } }
    } else {
      r.getCell('ganancia').font = { color: { argb: 'FF991B1B' } }
    }
    applyDataRow(r, idx % 2 === 1)
    idx++
  }
}

// ---------------------------------------------------------------
// Hoja 5: Por Fuente
// ---------------------------------------------------------------

function buildHojaPorFuente(
  wb:    ExcelJS.Workbook,
  datos: DatosExportacionFinanciero,
): void {
  const ws = addWorksheet(wb, 'Por Fuente')
  ws.columns = [
    { key: 'fuente',    header: 'Fuente de Financiación', width: 26 },
    { key: 'cotizado',  header: 'Cotizado',               width: 20 },
    { key: 'costo',     header: 'Costo Real',             width: 20 },
    { key: 'uBruta',    header: 'Util. Bruta',            width: 20 },
    { key: 'uNeta',     header: 'Util. Neta',             width: 20 },
    { key: 'margen',    header: 'Margen %',               width: 12 },
    { key: 'cantidad',  header: '# Actividades',          width: 14 },
  ]

  applyHeaderRow(ws.getRow(1))

  let idx = 0
  for (const f of datos.agregadosPorFuente) {
    const margen = f.totalCotizado > 0
      ? Math.round((f.utilidadNeta / f.totalCotizado) * 10_000) / 100
      : 0
    const r = ws.addRow({
      fuente:   f.fuenteFinanciacion,
      cotizado: f.totalCotizado,
      costo:    f.totalCostosReales,
      uBruta:   f.utilidadBruta,
      uNeta:    f.utilidadNeta,
      margen,
      cantidad: f.cantidadActividades,
    })
    for (const col of ['cotizado', 'costo', 'uBruta', 'uNeta']) r.getCell(col).numFmt = COP_FORMAT
    r.getCell('margen').numFmt = PCT_FORMAT
    applyDataRow(r, idx % 2 === 1)
    idx++
  }
}

// ---------------------------------------------------------------
// Adaptador principal
// ---------------------------------------------------------------

export class FinancialExportAdapter implements IFinancialExporter {
  async exportarResumenDashboard(
    datos:  DatosExportacionFinanciero,
    config: ConfigExportacion,
  ): Promise<ArchivoExportado> {
    const t0    = Date.now()
    const actor = config.userId

    // ── Audit log: inicio de exportación ──────────────────────
    log.info(
      {
        correlationId: 'unknown',
        userId:        actor,
        operation:     'exportarResumenDashboard',
        metadata: {
          nombreUsuario:       config.nombreUsuario ?? 'desconocido',
          filtros:             config.filtrosAplicados,
          cantidadActividades: datos.balancesDetalle.length,
          generadoEn:          config.generadoEn,
          accesoFinanciero:    true,
          timestamp:           new Date().toISOString(),
        },
      },
      '[Auditoría] Exportación financiera iniciada',
    )

    const wb        = new ExcelJS.Workbook()
    wb.creator      = config.nombreUsuario ?? config.userId
    wb.created      = new Date(config.generadoEn)
    wb.description  = 'Reporte financiero exportado desde Admin Logística UV'
    wb.company      = 'Universidad del Valle — Logística'

    // Construir las 5 hojas
    buildHojaResumen(wb, datos, config)
    buildHojaActividades(wb, datos)
    buildHojaPorMes(wb, datos)
    buildHojaPorSocio(wb, datos)
    buildHojaPorFuente(wb, datos)

    const buffer   = Buffer.from(await wb.xlsx.writeBuffer())
    const slug     = new Date(config.generadoEn).toISOString().slice(0, 10)
    const filename = `reporte-financiero-${slug}.xlsx`

    const duracionMs = Date.now() - t0

    // ── Audit log: exportación completada ─────────────────────
    log.info(
      {
        correlationId: 'unknown',
        userId:        actor,
        operation:     'exportarResumenDashboard',
        metadata: {
          nombreUsuario:    config.nombreUsuario ?? 'desconocido',
          filename,
          tamañoBytes:      buffer.byteLength,
          duracionMs,
          hojas:            ['Resumen', 'Actividades', 'Por Mes', 'Por Socio', 'Por Fuente'],
          accesoFinanciero: true,
          timestamp:        new Date().toISOString(),
        },
      },
      '[Auditoría] Exportación financiera completada',
    )

    return {
      buffer,
      filename,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }
  }
}

// ---------------------------------------------------------------
// Singleton de proceso
// ---------------------------------------------------------------

let _instance: FinancialExportAdapter | null = null

export function getFinancialExporter(): IFinancialExporter {
  if (!_instance) _instance = new FinancialExportAdapter()
  return _instance
}
