'use server'

import ExcelJS from 'exceljs'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { generateObject } from 'ai'
import { z } from 'zod'
import { getSupabase } from '@/lib/supabase'
import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import {
  CronogramaEntregaDraft,
  CotizacionItemDraft,
  ParsedRequerimiento,
  ReembolsoDetalleDraft,
  RequerimientoEncabezado,
  TarifarioSugerencia,
} from '@/types/cotizacion'

// ============================================================
// Utilidades de celda
// ============================================================

function cellStr(val: ExcelJS.CellValue): string {
  if (val === null || val === undefined) return ''
  // ExcelJS retorna Date para celdas de fecha; String(date) produce "GMT-0500" que Postgres rechaza
  if (val instanceof Date) return val.toISOString().split('T')[0]
  if (typeof val === 'object' && 'text' in (val as object)) {
    return String((val as { text: string }).text).trim()
  }
  return String(val).trim()
}

/** Extrae YYYY-MM-DD de cualquier representación de fecha, o retorna null */
function sanitizeDate(s: string | null | undefined): string | null {
  if (!s) return null
  const str = String(s).trim()
  if (!str) return null

  // Ya es ISO date YYYY-MM-DD
  const iso = str.match(/(\d{4})-(\d{2})-(\d{2})/)
  if (iso) {
    const yyyy = parseInt(iso[1], 10)
    // Validar año razonable (1900-2099)
    if (yyyy >= 1900 && yyyy <= 2099) {
      return `${iso[1]}-${iso[2]}-${iso[3]}`
    }
  }

  // dd/mm/yyyy
  const dmy = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (dmy) {
    const yyyy = parseInt(dmy[3], 10)
    if (yyyy >= 1900 && yyyy <= 2099) {
      const mm = parseInt(dmy[2], 10)
      const dd = parseInt(dmy[1], 10)
      if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
        return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`
      }
    }
  }

  // Último recurso: intentar parsear (cubre "Thu Apr 10 2026 00:00:00 GMT-0500 ...")
  try {
    const d = new Date(str)
    if (!isNaN(d.getTime())) {
      const isoStr = d.toISOString().split('T')[0]
      // Validar que el año parseado sea razonable
      const yyy = isoStr.match(/^(\d{4})-/)
      if (yyy && parseInt(yyy[1], 10) >= 1900 && parseInt(yyy[1], 10) <= 2099) {
        return isoStr
      }
    }
  } catch (e) {
    // Ignorar errores de parsing
  }

  return null
}

function sanitizeTime(s: string | null | undefined): string {
  if (!s) return ''
  const raw = s.trim().toUpperCase()
  const hhmm = raw.match(/(\d{1,2}):(\d{2})/)
  if (hhmm) {
    return `${hhmm[1].padStart(2, '0')}:${hhmm[2]}`
  }
  const ampm = raw.match(/(\d{1,2})\s*([AP])\s*\.?M?\.?/)
  if (ampm) {
    let h = parseInt(ampm[1], 10)
    const p = ampm[2]
    if (p === 'P' && h < 12) h += 12
    if (p === 'A' && h === 12) h = 0
    return `${String(h).padStart(2, '0')}:00`
  }
  return ''
}

function toIsoDateTime(date: string | null | undefined, time: string | null | undefined): string | null {
  const d = sanitizeDate(date)
  if (!d) return null
  const t = sanitizeTime(time)
  const result = `${d}T${t || '08:00'}:00.000Z`
  
  // Validar que el resultado sea un datetime válido
  try {
    const testDate = new Date(result)
    if (!isNaN(testDate.getTime())) {
      return result
    }
  } catch (e) {
    // Ignorar
  }
  
  return null
}

function buildCronogramaFallback(
  encabezado: RequerimientoEncabezado,
  items: CotizacionItemDraft[]
): CronogramaEntregaDraft[] {
  const baseIso = toIsoDateTime(encabezado.fechaInicio, encabezado.horaInicio)
  if (!baseIso) return []

  const topItems = items
    .filter((it) => it.descripcion && !it.esPassthrough)
    .slice(0, 6)

  return topItems.map((it, idx) => {
    const dt = new Date(baseIso)
    dt.setHours(dt.getHours() + idx)
    return {
      descripcion: `Entrega de ${it.descripcion}`,
      fechaHoraLimite: dt.toISOString(),
    }
  })
}

function cellNum(val: ExcelJS.CellValue): number {
  const s = cellStr(val).replace(/[^0-9.,-]/g, '').replace(',', '.')
  const n = parseFloat(s)
  return isNaN(n) ? 0 : n
}

function cellDate(val: ExcelJS.CellValue): string {
  if (!val) return ''
  if (val instanceof Date) {
    const isoStr = val.toISOString().split('T')[0]
    const yyyy = parseInt(isoStr.substring(0, 4), 10)
    if (yyyy >= 1900 && yyyy <= 2099) {
      return isoStr
    }
    return ''
  }
  const s = cellStr(val)
  const sanitized = sanitizeDate(s)
  return sanitized || ''
}

/** Valor de la celda en fila r, columna c de la hoja */
function cell(sheet: ExcelJS.Worksheet, r: number, c: number): string {
  return cellStr(sheet.getRow(r).getCell(c).value)
}

/**
 * Busca la primera fila donde alguna celda (columnas 1–maxCol) contiene
 * la cadena dada (case-insensitive). Retorna 0 si no encuentra.
 */
function findRow(
  sheet: ExcelJS.Worksheet,
  label: string,
  maxRow = 120,
  maxCol = 10
): number {
  const upper = label.toUpperCase()
  for (let r = 1; r <= Math.min(sheet.rowCount, maxRow); r++) {
    for (let c = 1; c <= maxCol; c++) {
      if (cell(sheet, r, c).toUpperCase().includes(upper)) return r
    }
  }
  return 0
}

/**
 * En la fila r, busca la primera celda en los rangos de columnas [fromCol..toCol]
 * que NO esté vacía y retorna su valor.
 */
function firstNonEmpty(
  sheet: ExcelJS.Worksheet,
  r: number,
  fromCol: number,
  toCol: number
): string {
  for (let c = fromCol; c <= toCol; c++) {
    const v = cell(sheet, r, c)
    if (v) return v
  }
  return ''
}

// ============================================================
// SECCIÓN CONOCIDA DE ITEMS: keywords que indican categorías
// ============================================================

/**
 * Extrae el código del requerimiento del nombre del archivo.
 * Patrón UARIV: "2. REQUERIMIENTO EXCEL 629PE.xlsx" → "629PE"
 * Busca la primera secuencia alfanumérica que mezcle dígitos y letras.
 */
function extractNumeroFromFileName(name: string): string {
  const base = name.replace(/\.(xlsx?|xlsm)$/i, '')
  // Busca códigos como 629PE, A001, PE2025, 123-AB
  const m = base.match(/\b([A-Z0-9]*\d[A-Z]+[A-Z0-9]*|[A-Z]+\d+[A-Z0-9]*)\b/i)
  return m ? m[1].toUpperCase() : ''
}
const SECTION_HEADERS = [
  'SALONES E ITEMS', 'ITEMS LOGÍSTICOS', 'LOGÍSTICOS',
  'ALIMENTACIÓN', 'ALIMENTACION',
  'MATERIALES',
  'REQUERIMIENTOS ETNOP', 'ETNOPERA',
  'ALOJAMIENTO',
  'OBSERVACIONES FINALES',
]

const SECTION_TO_CATEGORY: Record<string, string> = {
  'SALONES': 'Logística',
  'ITEMS LOGÍSTICOS': 'Logística',
  'LOGÍSTICOS': 'Logística',
  'ALIMENTACIÓN': 'Alimentación',
  'ALIMENTACION': 'Alimentación',
  'MATERIALES': 'Materiales',
  'ALOJAMIENTO': 'Alojamiento',
  'ETNOP': 'Otros',
}

function isSectionHeader(desc: string): boolean {
  const u = desc.toUpperCase()
  return (
    SECTION_HEADERS.some(kw => u.includes(kw)) ||
    u === 'CONCEPTO' ||
    u.startsWith('#REF')
  )
}

function getCategoryFromHeader(desc: string): string | null {
  const u = desc.toUpperCase()
  for (const [kw, cat] of Object.entries(SECTION_TO_CATEGORY)) {
    if (u.includes(kw)) return cat
  }
  return null
}

// ============================================================
// Parser FORMATO MATERIAL APOYO
// Estructura real UARIV 2025:
//   R13:  C2="NOMBRE DE LA ACTIVIDAD:" → C4=valor
//   R15:  C4="FECHA DE SOLICITUD:" → C5=fecha | C6="DIRECCIÓN TERRITORIAL" → C7=valor
//   R17:  C2="DEPARTAMENTO:" → C3=valor | C4="MUNICIPIO:" → C5=valor
//   R20:  C2=lugar | C4="FECHA INICIO" → C6=fecha | C7="HORA INICIO" → C8=valor
//   R21:  C4="FECHA FIN" → C6=fecha | C7="HORA FINALIZACIÓN" → C8=valor
//   R22:  C2="RESPONSABLE" → C4=nombre | C7="CEDULA:" → C8=valor
//   R23:  C4=string_con_CORREO | C7="CELULAR:" → C8=valor
//   R48:  C7="NÚMERO DE VÍCTIMAS" → C8=valor
//   R77:  C6=monto (cuando C4 contiene "Monto Solicitado")
//   Items: C2=desc, C5=unidad, C6=cantidad (desde DETALLE ESPECÍFICO hasta OBSERVACIONES)
// ============================================================

function parseFormatoMaterialApoyo(sheet: ExcelJS.Worksheet): {
  encabezado: RequerimientoEncabezado
  items: CotizacionItemDraft[]
} {
  // ─── Encabezado ──────────────────────────────────────────
  const rActividad = findRow(sheet, 'NOMBRE DE LA ACTIVIDAD')
  const rFechaSol   = findRow(sheet, 'FECHA DE SOLICITUD')
  const rDepto      = findRow(sheet, 'DEPARTAMENTO:')
  const rLugar      = findRow(sheet, 'DIRECCIÓN Y LUGAR EXACTO')
  const rFechaIni   = findRow(sheet, 'FECHA INICIO DE LA ACTIVIDAD')
  const rFechaFin   = findRow(sheet, 'FECHA FIN DE LA ACTIVIDAD')
  const rResponsable = findRow(sheet, 'RESPONSABLE DE LA ACTIVIDAD')
  const rCelular    = findRow(sheet, 'CELULAR Y CORREO ELECTRÓNICO')
  const rVictimas   = findRow(sheet, 'NÚMERO DE VÍCTIMAS')
  const rMonto      = findRow(sheet, 'Monto Solicitado', 120)

  // Número de requerimiento: buscar label típico de UARIV
  const rNumReq =
    findRow(sheet, 'N.º DE REQUERIMIENTO', 30)
  const numeroRequerimiento = rNumReq ? firstNonEmpty(sheet, rNumReq, 3, 10) : ''

  // Nombre de actividad: valor en C4 (o primera celda no vacía entre C3-C8)
  const nombreActividad = rActividad
    ? firstNonEmpty(sheet, rActividad, 3, 8)
    : ''

  // Fecha solicitud: en la misma fila que "FECHA DE SOLICITUD", valor en C5
  const fechaSolicitudRaw = rFechaSol ? cell(sheet, rFechaSol, 5) : ''
  const fechaSolicitud = cellDate(fechaSolicitudRaw)

  // Dirección territorial: en la misma fila que "FECHA DE SOLICITUD", valor en C7
  const dirTerritorial = rFechaSol ? cell(sheet, rFechaSol, 7) : ''

  // Departamento C3, Municipio C5 (misma fila)
  const departamento = rDepto ? cell(sheet, rDepto, 3) : ''
  const municipio    = rDepto ? cell(sheet, rDepto, 5) : ''

  // Lugar: la fila de la etiqueta suele tener solo el título; el valor está en la sig. fila C2
  const lugarDetalle = rLugar ? cell(sheet, rLugar + 1, 2) : ''

  // Fechas: la hoja tiene fila INICIO y fila FIN como filas separadas
  const fechaInicio = rFechaIni ? cellDate(cell(sheet, rFechaIni, 6)) : ''
  const horaInicio  = rFechaIni ? cell(sheet, rFechaIni, 8) : ''
  const fechaFin    = rFechaFin ? cellDate(cell(sheet, rFechaFin, 6)) : ''
  const horaFin     = rFechaFin ? cell(sheet, rFechaFin, 8) : ''

  // Responsable: nombre en C4, cédula en C8 de la misma fila
  const responsableNombre = rResponsable ? cell(sheet, rResponsable, 4) : ''
  const responsableCedula = rResponsable ? cell(sheet, rResponsable, 8) : ''

  // Correo: en la fila CELULAR/CORREO, C4 contiene "CORREO: xxx@xxx" → extraer tras ':'
  const celularFila = rCelular || (rResponsable ? rResponsable + 1 : 0)
  let responsableCorreo = ''
  let responsableCelular = ''
  if (celularFila) {
    const correoRaw = cell(sheet, celularFila, 4)
    const colonIdx = correoRaw.toUpperCase().indexOf('CORREO:')
    responsableCorreo = colonIdx !== -1
      ? correoRaw.substring(colonIdx + 7).trim()
      : correoRaw
    responsableCelular = cell(sheet, celularFila, 8)
  }

  // Número de víctimas: C8 de la fila que tiene "NÚMERO DE VÍCTIMAS"
  const numVictimas = rVictimas ? parseInt(cell(sheet, rVictimas, 8)) || 0 : 0

  // Monto reembolso: en la fila de "Monto Solicitado", valor en C6
  const montoReembolsoDeclarado = rMonto ? cellNum(cell(sheet, rMonto, 6)) : 0

  const encabezado: RequerimientoEncabezado = {
    numeroRequerimiento,
    nombreActividad,
    objeto: '',
    direccionTerritorial: dirTerritorial,
    municipio,
    departamento,
    lugarDetalle,
    fechaSolicitud,
    fechaInicio,
    fechaFin,
    horaInicio,
    horaFin,
    responsableNombre,
    responsableCedula,
    responsableCelular,
    responsableCorreo,
    numVictimas,
    montoReembolsoDeclarado,
  }

  // ─── Ítems ────────────────────────────────────────────────
  // Buscar la sección "DETALLE ESPECÍFICO DEL REQUERIMIENTO" como punto de inicio
  const rDetalleStart = findRow(sheet, 'DETALLE ESPECÍFICO')
  // Buscar la sección "OBSERVACIONES" como punto de fin
  const rObsStop =
    findRow(sheet, 'OBSERVACIONES FINALES', 140) ||
    findRow(sheet, 'OBSERVACIONES', 140)

  const startRow = rDetalleStart ? rDetalleStart + 1 : 50
  const stopRow  = rObsStop ? Math.max(startRow, rObsStop - 1) : sheet.rowCount

  const items: CotizacionItemDraft[] = []
  let currentCategory = ''

  for (let r = startRow; r <= stopRow; r++) {
    const desc  = cell(sheet, r, 2)
    const unidad = cell(sheet, r, 5)
    const cantStr = cell(sheet, r, 6)

    // Saltar filas completamente vacías
    if (!desc && !cantStr) continue

    // Detectar si es encabezado de sección (cambia categoría activa)
    if (desc && isSectionHeader(desc)) {
      const cat = getCategoryFromHeader(desc)
      if (cat) currentCategory = cat
      // Si llegamos a observaciones, termina bloque de ítems
      if (desc.toUpperCase().includes('OBSERVACIONES')) break
      continue
    }

    // Saltar fila si no tiene descripción o cantidad válida
    if (!desc || desc.startsWith('#REF')) continue
    if (!cantStr || cantStr.startsWith('#REF')) continue

    const cantidad = cellNum(cantStr)
    if (cantidad <= 0) continue

    items.push({
      id: crypto.randomUUID(),
      tarifarioId: null,
      codigoItem: '',
      descripcion: desc,
      categoria: currentCategory,
      unidadMedida: unidad || 'und',
      cantidad,
      precioUnitario: 0,
      esPassthrough: false,
      excluirDeFinanzas: false,
      ocultarEnCotizacion: false,
      fuente: 'excel',
      opcionesTarifario: [],
    })
  }

  return { encabezado, items }
}

// ============================================================
// Parser ALOJAMIENTO Y,O TRANSPORTE
// Estructura real UARIV 2025:
//   R10:  Encabezados → C1="PRIMER NOMBRE", C2="SEGUNDO NOMBRE",
//         C3="PRIMER APELLIDO", C4="SEGUNDO APELLIDO", C5="TIPO DOC",
//         C6="NÚMERO DOCUMENTO", C15="LUGAR SALIDA Y LLEGADA",
//         C16="COSTO IDA", C17="COSTO REGRESO", C18="COSTO TOTAL"
//   R11+: datos hasta fila con C1="TOTAL"
// ============================================================

function parseAlojamientoTransporte(sheet: ExcelJS.Worksheet): ReembolsoDetalleDraft[] {
  const reembolsos: ReembolsoDetalleDraft[] = []

  // Encontrar fila de encabezado (contiene "PRIMER NOMBRE")
  const headerRow = findRow(sheet, 'PRIMER NOMBRE', 30, 10)
  if (!headerRow) return reembolsos

  // ── Detectar columnas dinámicamente desde la fila de encabezado ──
  // El formato UARIV cambia entre versiones: en 2025 los costos están en C16-C18,
  // en versiones más recientes están en C19-C21 y la ruta se mueve a C18.
  let colRuta = 15, colCostoIda = 16, colCostoRegreso = 17, colCostoTotal = 18

  const hr = sheet.getRow(headerRow)
  const maxHeaderCol = Math.max(hr.cellCount || 0, 25)
  for (let c = 1; c <= maxHeaderCol; c++) {
    const v = cellStr(hr.getCell(c).value).toUpperCase()
    if (!v) continue
    if (v.includes('LUGAR DE SALIDA') || v.includes('ITINERARIO TERRESTRE')) {
      colRuta = c
    } else if (v.includes('COSTO IDA') || (v.includes('GASTO TRANSPORTE') && !v.includes('BOGOTA'))) {
      colCostoIda = c
    } else if (v.includes('COSTO REGRESO') || v.includes('BOGOTA')) {
      colCostoRegreso = c
    } else if (v.includes('COSTO TOTAL')) {
      colCostoTotal = c
    }
  }

  for (let r = headerRow + 1; r <= sheet.rowCount; r++) {
    const c1 = cell(sheet, r, 1)

    // Parar en fila TOTAL o filas de firma (texto muy largo)
    if (c1.toUpperCase().startsWith('TOTAL')) break
    if (c1.includes('_____') || c1.includes('(Nombre')) break

    // Necesita al menos un nombre
    const nombre = [
      cell(sheet, r, 1),
      cell(sheet, r, 2),
      cell(sheet, r, 3),
      cell(sheet, r, 4),
    ]
      .filter(Boolean)
      .join(' ')
      .trim()

    if (!nombre) continue

    const tipoDoc = cell(sheet, r, 5)
    const numDoc  = cell(sheet, r, 6)
    const ruta    = cell(sheet, r, colRuta)
    const costoIda     = cellNum(cell(sheet, r, colCostoIda))
    const costoRegreso = cellNum(cell(sheet, r, colCostoRegreso))
    const costoTotal   = cellNum(cell(sheet, r, colCostoTotal))

    // El costo total del registro es el campo de total; si está vacío usa ida+regreso
    const valorTotal = costoTotal || costoIda + costoRegreso

    // SIEMPRE incluir al beneficiario aunque el valor sea 0 (puede editarse luego)

    // Ruta 'INHUMACION' → inhumación (valor_otros),
    // cualquier otra ruta → transporte de beneficiarios (valor_transporte)
    const esInhumacion = ruta.toUpperCase().includes('INHUMAC')

    reembolsos.push({
      id: crypto.randomUUID(),
      nombreBeneficiario: nombre,
      documentoIdentidad: tipoDoc ? `${tipoDoc} ${numDoc}`.trim() : numDoc,
      municipioOrigen: ruta,
      municipioDestino: '',
      valorTransporte: esInhumacion ? 0 : valorTotal,
      valorAlojamiento: 0,
      valorAlimentacion: 0,
      valorOtros: esInhumacion ? valorTotal : 0,
    })
  }

  return reembolsos
}

// ============================================================
// Esquemas Zod para extracción con IA
// ============================================================

const EncabezadoAISchema = z.object({
  numeroRequerimiento: z.string().describe('Número o código único del requerimiento, ej: 629PE, A-2025-001. Buscar etiquetas como "NÚMERO DE REQUERIMIENTO", "N° DE REQUERIMIENTO". Vacío si no aparece'),
  nombreActividad: z.string().describe('Nombre de la actividad o jornada logística'),
  fechaSolicitud: z.string().describe('Fecha de solicitud en formato YYYY-MM-DD, vacío si no está'),
  direccionTerritorial: z.string().describe('Dirección territorial o regional, ej: EJE CAFETERO'),
  departamento: z.string().describe('Departamento donde se realiza la actividad'),
  municipio: z.string().describe('Municipio donde se realiza la actividad'),
  lugarDetalle: z.string().describe('Dirección o lugar exacto de la actividad'),
  fechaInicio: z.string().describe('Fecha inicio de la actividad en formato YYYY-MM-DD, vacío si no está'),
  fechaFin: z.string().describe('Fecha fin de la actividad en formato YYYY-MM-DD, vacío si no está'),
  horaInicio: z.string().describe('Hora de inicio, ej: 8AM o 08:00'),
  horaFin: z.string().describe('Hora de fin, ej: 5PM o 17:00'),
  responsableNombre: z.string().describe('Nombre completo del responsable de la actividad'),
  responsableCedula: z.string().describe('Número de cédula del responsable'),
  responsableCelular: z.string().describe('Celular del responsable'),
  responsableCorreo: z.string().describe('Correo electrónico del responsable'),
  numVictimas: z.number().describe('Número de víctimas o participantes'),
  montoReembolsoDeclarado: z.number().describe('Monto total solicitado en pesos COP, 0 si no hay'),
})

const ItemAISchema = z.object({
  descripcion: z.string().describe('Descripción corta del ítem o servicio, tal como aparece en el Excel'),
  categoria: z.enum(['Logística', 'Alimentación', 'Materiales', 'Alojamiento', 'Otros']).describe('Categoría del ítem según la sección donde aparece'),
  unidadMedida: z.string().describe('Unidad de medida exacta del Excel (columna C5): "Unidad", "Persona", "Día", "Estación para 30pax", etc.'),
  cantidad: z.number().describe('Cantidad numérica exacta del Excel (columna C6), número entero positivo mayor que 0'),
})

const CronogramaAISchema = z.object({
  descripcion: z.string().describe('Hito de entrega operativo, claro y accionable, ej: "Entrega de alimentación"'),
  fecha: z.string().describe('Fecha estimada del hito en formato YYYY-MM-DD; si no está explícita, inferir desde la actividad'),
  hora: z.string().describe('Hora estimada del hito en formato HH:mm (24h). Si no está explícita, inferir según contexto'),
})

const ExcelParseAISchema = z.object({
  encabezado: EncabezadoAISchema,
  items: z.array(ItemAISchema),
  cronograma: z.array(CronogramaAISchema),
})

// ============================================================
// Convertir hoja Excel a texto compacto para la IA
// Formato: R13: C2="NOMBRE DE LA ACTIVIDAD:" | C4="ENTREGA DIGNA..."
// ============================================================

function sheetToCompactText(sheet: ExcelJS.Worksheet, maxRow = 130, maxCol = 20): string {
  const lines: string[] = []
  for (let r = 1; r <= Math.min(sheet.rowCount, maxRow); r++) {
    const parts: string[] = []
    for (let c = 1; c <= maxCol; c++) {
      const v = cellStr(sheet.getRow(r).getCell(c).value)
      if (v && !v.startsWith('#REF')) {
        // Truncar valores muy largos
        const truncated = v.length > 100 ? v.substring(0, 100) + '…' : v
        parts.push(`C${c}="${truncated}"`)
      }
    }
    if (parts.length > 0) {
      lines.push(`R${r.toString().padStart(3, '0')}: ${parts.join(' | ')}`)
    }
  }
  return lines.join('\n')
}

// ============================================================
// Parser con IA (Gemini 2.0 Flash — gratis hasta 1500 req/día)
// ============================================================

async function parseConIA(
  sheetFormato: ExcelJS.Worksheet,
  sheetAloj: ExcelJS.Worksheet | null,
  fileName = ''
): Promise<{
  encabezado: RequerimientoEncabezado
  items: CotizacionItemDraft[]
  reembolsos: ReembolsoDetalleDraft[]
  cronogramaSugerido: CronogramaEntregaDraft[]
}> {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY
  if (!apiKey) throw new Error('GOOGLE_GENERATIVE_AI_API_KEY no configurada')

  const google = createGoogleGenerativeAI({ apiKey })

  const formatoText = sheetToCompactText(sheetFormato, 180, 15)
  const alojText = sheetAloj ? sheetToCompactText(sheetAloj, 80, 20) : ''

  const systemPrompt = `Eres un extractor de datos especializado en formularios de requerimientos logísticos de la UARIV (Unidad para las Víctimas de Colombia).
Se te entrega el contenido crudo de una hoja de cálculo Excel en formato compacto (RNN: CN="valor") y el nombre del archivo.
Debes extraer los datos estructurados según el esquema indicado.

REGLAS IMPORTANTES:
- El NÚMERO DE REQUERIMIENTO (ej: 629PE, A-2025-001) aparece en el nombre del archivo y/o en alguna celda del Excel cerca de etiquetas como "N° DE REQUERIMIENTO", "NÚMERO", "REQUERIMIENTO N°". Si lo ves en el nombre del archivo úsalo.
- Las fechas deben estar en formato YYYY-MM-DD. Si el Excel muestra "2025-05-20 00:00:00" usa "2025-05-20".
- Si un campo no está presente, usa string vacío "" o 0 para números.
- Para los ÍTEMS: extrae solo ítems reales (bienes o servicios concretos). IGNORA filas que sean encabezados de sección como "ALIMENTACIÓN", "MATERIALES", "SALONES E ITEMS LOGÍSTICOS", "CONCEPTO", etc.
- ALOJAMIENTO en la hoja principal es un SERVICIO COTIZABLE con utilidad, por lo tanto debe ir en items (categoría "Alojamiento"), NO en reembolsos.
- Para los ÍTEMS: extrae la CANTIDAD exactamente como está en el Excel (número entero). La columna de cantidad suele ser la sexta columna (C6) de la hoja.
- Para los ÍTEMS: extrae la UNIDAD DE MEDIDA tal como aparece en el Excel (columna C5), por ejemplo: "Unidad", "Persona", "Día", "Estación para 30pax", etc.
- Genera el CRONOGRAMA usando principalmente "OBSERVACIONES" y el contexto de ítems (materiales, alimentación, alojamiento, logística). Deben ser hitos editables, no texto largo.
- El MONTO solicitado es un número en pesos colombianos (COP), sin signos de moneda.`

  const userPrompt = `${fileName ? `=== NOMBRE DEL ARCHIVO ===\n${fileName}\n\n` : ''}=== HOJA: FORMATO MATERIAL APOYO ===\n${formatoText}`

  const { object } = await generateObject({
    model: google('gemini-2.0-flash'),
    schema: ExcelParseAISchema,
    system: systemPrompt,
    prompt: userPrompt,
    temperature: 0,
  })

  // Mapear resultado AI → tipos internos
  const encabezado: RequerimientoEncabezado = {
    numeroRequerimiento: object.encabezado.numeroRequerimiento,
    nombreActividad: object.encabezado.nombreActividad,
    objeto: '',
    direccionTerritorial: object.encabezado.direccionTerritorial,
    municipio: object.encabezado.municipio,
    departamento: object.encabezado.departamento,
    lugarDetalle: object.encabezado.lugarDetalle,
    fechaSolicitud: object.encabezado.fechaSolicitud,
    fechaInicio: object.encabezado.fechaInicio,
    fechaFin: object.encabezado.fechaFin,
    horaInicio: object.encabezado.horaInicio,
    horaFin: object.encabezado.horaFin,
    responsableNombre: object.encabezado.responsableNombre,
    responsableCedula: object.encabezado.responsableCedula,
    responsableCelular: object.encabezado.responsableCelular,
    responsableCorreo: object.encabezado.responsableCorreo,
    numVictimas: object.encabezado.numVictimas,
    montoReembolsoDeclarado: object.encabezado.montoReembolsoDeclarado,
  }

  const items: CotizacionItemDraft[] = object.items.map(it => ({
    id: crypto.randomUUID(),
    tarifarioId: null,
    codigoItem: '',
    descripcion: it.descripcion,
    categoria: it.categoria,
    unidadMedida: it.unidadMedida,
    cantidad: it.cantidad,
    precioUnitario: 0,
    esPassthrough: false,
    excluirDeFinanzas: false,
    ocultarEnCotizacion: false,
    fuente: 'excel' as const,
    opcionesTarifario: [],
  }))

  const reembolsos: ReembolsoDetalleDraft[] = []

  const baseIso = toIsoDateTime(encabezado.fechaInicio, encabezado.horaInicio)
  const cronogramaSugerido: CronogramaEntregaDraft[] = object.cronograma
    .map((h, idx) => {
      const iso = toIsoDateTime(h.fecha, h.hora) ?? baseIso
      if (!iso || !h.descripcion?.trim()) return null
      // Evita choques exactos de hora para que el orden visual sea estable
      const dt = new Date(iso)
      dt.setMinutes(dt.getMinutes() + idx)
      return {
        descripcion: h.descripcion.trim(),
        fechaHoraLimite: dt.toISOString(),
      }
    })
    .filter((h): h is CronogramaEntregaDraft => Boolean(h))

  return { encabezado, items, reembolsos, cronogramaSugerido }
}

// ============================================================
// Enriquecer ítems con precios del tarifario 2026
// ============================================================

/**
 * Matching inteligente contra el tarifario 2026.
 * Usa múltiples palabras clave, categoría y unidad de medida para
 * encontrar el artículo exacto y calcular precio total automáticamente.
 */
const STOP_WORDS_ES = new Set([
  'de', 'del', 'la', 'el', 'los', 'las', 'un', 'una', 'unos', 'unas',
  'y', 'e', 'o', 'u', 'a', 'en', 'con', 'por', 'para', 'sin', 'sobre',
  'que', 'no', 'se', 'su', 'al', 'es', 'son', 'sus', 'más', 'tipo',
  'incluye', 'alquiler', 'servicio',
])

/** Extrae hasta 4 palabras clave significativas de una descripción */
function extractKeywords(description: string): string[] {
  return description
    .toLowerCase()
    .replace(/[^a-záéíóúüñ0-9\s]/gi, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 4 && !STOP_WORDS_ES.has(w))
    .slice(0, 4)
}

/**
 * Normaliza una unidad de medida para comparación:
 * elimina tildes, mayúsculas y caracteres no alfanuméricos.
 */
function normalizeUnit(unit: string): string {
  return (unit ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')   // quitar tildes
    .replace(/[^a-z0-9]/g, '')          // solo alfanumérico
}

/** Categorías reconocidas en el tarifario */
const TARIFARIO_CATEGORIAS = new Set(['Alimentación', 'Logística', 'Transporte', 'Alojamiento', 'Personal'])

async function enrichItemsConTarifario(
  items: CotizacionItemDraft[]
): Promise<CotizacionItemDraft[]> {
  if (items.length === 0) return items

  const { createClient } = await import('@supabase/supabase-js')
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const enriched = await Promise.all(
    items.map(async (item): Promise<CotizacionItemDraft> => {
      const keywords = extractKeywords(item.descripcion)
      if (keywords.length === 0) return item

      // ── 1. Consultar tarifario por palabra clave principal ──
      let query = sb
        .from('tarifario_2026')
        .select('id, codigo_item, descripcion, precio_venta, unidad_medida, categoria')
        .ilike('descripcion', `%${keywords[0]}%`)
        .limit(25)

      // Filtrar por categoría si coincide con una categoría conocida
      if (item.categoria && TARIFARIO_CATEGORIAS.has(item.categoria)) {
        query = query.eq('categoria', item.categoria)
      }

      const { data } = await query
      if (!data || data.length === 0) return item

      // ── 2. Puntuar candidatos ──────────────────────────────
      const unitNorm = normalizeUnit(item.unidadMedida)

      const scored = data.map(row => {
        const descLower = row.descripcion.toLowerCase()
        let score = 1 // base: ya matcheó keyword[0]

        // Bonus por keywords adicionales encontradas en la descripción
        for (let i = 1; i < keywords.length; i++) {
          if (descLower.includes(keywords[i])) score += 2
        }

        // Bonus por unidad de medida
        const rowUnitNorm = normalizeUnit(row.unidad_medida ?? '')
        if (unitNorm && rowUnitNorm) {
          if (unitNorm === rowUnitNorm) score += 4           // coincidencia exacta
          else if (rowUnitNorm.includes(unitNorm) || unitNorm.includes(rowUnitNorm)) score += 1
        }

        return { row, score }
      }).sort((a, b) => b.score - a.score)

      const best = scored[0]
      const suggestion: TarifarioSugerencia = {
        id: best.row.id as string,
        codigoItem: best.row.codigo_item as string,
        descripcion: best.row.descripcion as string,
        precioVenta: Number(best.row.precio_venta),
        unidadMedida: (best.row.unidad_medida as string) ?? 'und',
        categoria: (best.row.categoria as string) ?? '',
      }

      // ── 3. Decidir si aplicar precio automáticamente ──────
      // Alta confianza: unidad coincide exactamente Y score >= 5
      // O resultado único con score suficiente
      const highConfidence =
        best.score >= 5 ||
        (data.length === 1 && best.score >= 2)

      if (highConfidence) {
        return {
          ...item,
          tarifarioId: suggestion.id,
          codigoItem: suggestion.codigoItem,
          precioUnitario: suggestion.precioVenta,
          unidadMedida: suggestion.unidadMedida,
          fuente: 'tarifario' as const,
          opcionesTarifario: [],
        }
      }

      // Sin alta confianza → devolver todos los candidatos rankeados para que el usuario elija
      const candidatos: TarifarioSugerencia[] = scored
        .filter(s => s.score >= 1)
        .slice(0, 8)
        .map(s => ({
          id: s.row.id as string,
          codigoItem: s.row.codigo_item as string,
          descripcion: s.row.descripcion as string,
          precioVenta: Number(s.row.precio_venta),
          unidadMedida: (s.row.unidad_medida as string) ?? 'und',
          categoria: (s.row.categoria as string) ?? '',
        }))

      if (candidatos.length > 0) {
        return { ...item, opcionesTarifario: candidatos }
      }

      return item
    })
  )

  return enriched
}

// ============================================================
// Rellena numeroRequerimiento desde el nombre del archivo si
// el parser no pudo extraerlo del contenido del Excel.
// ============================================================
function withNumero(data: ParsedRequerimiento, fileName: string): ParsedRequerimiento {
  if (data.encabezado.numeroRequerimiento) return data
  const num = extractNumeroFromFileName(fileName)
  if (!num) return data
  return { ...data, encabezado: { ...data.encabezado, numeroRequerimiento: num } }
}

/**
 * Cuenta cuántos beneficiarios de la hoja ALOJAMIENTO Y,O TRANSPORTE
 * corresponden a inhumación (ruta contiene "INHUMAC").
 * El resultado se usa para crear el ítem "Servicios de inhumación"
 * con precio fijo de $530.000 por unidad.
 */
function countInhumaciones(sheetAloj: ExcelJS.Worksheet | null): number {
  if (!sheetAloj) return 0

  const headerRow = findRow(sheetAloj, 'PRIMER NOMBRE', 30, 10)
  if (!headerRow) return 0

  // Detectar columna de ruta dinámicamente (misma lógica que parseAlojamientoTransporte)
  let colRuta = 15
  const hr = sheetAloj.getRow(headerRow)
  const maxHeaderCol = Math.max(hr.cellCount || 0, 25)
  for (let c = 1; c <= maxHeaderCol; c++) {
    const v = cellStr(hr.getCell(c).value).toUpperCase()
    if (v.includes('LUGAR DE SALIDA') || v.includes('ITINERARIO TERRESTRE')) {
      colRuta = c
    }
  }

  let count = 0
  for (let r = headerRow + 1; r <= sheetAloj.rowCount; r++) {
    const c1 = cell(sheetAloj, r, 1)
    if (c1.toUpperCase().startsWith('TOTAL')) break
    if (c1.includes('_____') || c1.includes('(Nombre')) break

    const nombre = [c1, cell(sheetAloj, r, 2), cell(sheetAloj, r, 3), cell(sheetAloj, r, 4)]
      .filter(Boolean).join(' ').trim()
    if (!nombre) continue

    const ruta = cell(sheetAloj, r, colRuta)
    if (ruta.toUpperCase().includes('INHUMAC')) count++
  }

  return count
}

/** Precio fijo por unidad de inhumación definido por la Unidad */
const PRECIO_INHUMACION = 530_000

/**
 * Si el Excel registra inhumaciones, agrega automáticamente el ítem
 * "Servicios de inhumación" con cantidad = número de beneficiarios
 * y precio fijo de $530.000.
 */
function injectInhumacionItem(
  items: CotizacionItemDraft[],
  sheetAloj: ExcelJS.Worksheet | null
): CotizacionItemDraft[] {
  const cantidad = countInhumaciones(sheetAloj)
  if (cantidad === 0) return items

  const inhumacionItem: CotizacionItemDraft = {
    id: crypto.randomUUID(),
    tarifarioId: null,
    codigoItem: 'INHUMACION',
    descripcion: 'Servicios de inhumación',
    categoria: 'Otros',
    unidadMedida: 'und',
    cantidad,
    precioUnitario: PRECIO_INHUMACION,
    esPassthrough: false,
    excluirDeFinanzas: false,
    ocultarEnCotizacion: false,
    fuente: 'manual' as const,
    opcionesTarifario: [],
  }

  return [...items, inhumacionItem]
}

// ============================================================
// Server Action principal
// ============================================================

export async function parsearRequerimientoExcel(
  formData: FormData
): Promise<{ ok: true; data: ParsedRequerimiento; usedAI: boolean } | { ok: false; error: string }> {
  try {
    const file = formData.get('file')
    if (!file || !(file instanceof Blob)) {
      return { ok: false, error: 'No se recibió un archivo válido.' }
    }

    const fileName = (file as File).name || ''
    const ext = fileName.split('.').pop()?.toLowerCase()
    if (!['xlsx', 'xlsm', 'xls'].includes(ext ?? '')) {
      return { ok: false, error: 'El archivo debe ser un Excel (.xlsx, .xlsm o .xls).' }
    }

    if (file.size > 10 * 1024 * 1024) {
      return { ok: false, error: 'El archivo supera el límite de 10 MB.' }
    }

    const arrayBuffer = await file.arrayBuffer()
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(arrayBuffer)

    const sheetNames = workbook.worksheets.map(ws => ws.name)

    // Hoja principal: "FORMATO MATERIAL APOYO" (o similar)
    const sheetFormato = workbook.worksheets.find(ws => {
      const n = ws.name.toUpperCase()
      return (
        n.includes('FORMATO MATERIAL') ||
        n.includes('MATERIAL APOYO') ||
        (n.includes('FORMATO') && !n.includes('INTERNO'))
      )
    })

    if (!sheetFormato) {
      return {
        ok: false,
        error: `No se encontró la hoja "FORMATO MATERIAL APOYO".\nHojas disponibles: ${sheetNames.join(', ')}`,
      }
    }

    // Hoja de reembolsos: "ALOJAMIENTO Y,O TRANSPORTE"
    const sheetAloj = workbook.worksheets.find(ws => {
      const n = ws.name.toUpperCase()
      return n.includes('ALOJAMIENTO') || n.includes('TRANSPORTE')
    }) ?? null

    // ── Intentar con IA primero ───────────────────────────────
    const hasApiKey = Boolean(process.env.GOOGLE_GENERATIVE_AI_API_KEY)

    if (hasApiKey) {
      try {
        const aiResult = await parseConIA(sheetFormato, sheetAloj, fileName)
        const enrichedItems = await enrichItemsConTarifario(aiResult.items)
        const finalItems = injectInhumacionItem(enrichedItems, sheetAloj)
        const data = withNumero({ ...aiResult, items: finalItems, reembolsos: [] }, fileName)
        return { ok: true, data, usedAI: true }
      } catch (aiErr) {
        console.warn('[parsearRequerimientoExcel] IA falló, usando parser de coordenadas:', aiErr)
        // Continuar con el parser de respaldo
      }
    }

    // ── Fallback: parser de coordenadas exactas ──────────────────────────────
    const { encabezado, items } = parseFormatoMaterialApoyo(sheetFormato)
    const enrichedItems = await enrichItemsConTarifario(items)
    const finalItems = injectInhumacionItem(enrichedItems, sheetAloj)
    const cronogramaSugerido = buildCronogramaFallback(encabezado, finalItems)
    const data = withNumero({ encabezado, items: finalItems, reembolsos: [], cronogramaSugerido }, fileName)

    return { ok: true, data, usedAI: false }
  } catch (err) {
    console.error('[parsearRequerimientoExcel]', err)
    return {
      ok: false,
      error: 'Error al procesar el archivo Excel. Verifica que el formato sea correcto.',
    }
  }
}

// ============================================================
// Generación de agenda operativa (llamado interno desde guardarCotizacion)
// ============================================================

/**
 * Genera hitos operativos usando Gemini con datos en memoria.
 * No carga desde DB — aprovecha los datos ya disponibles en la creación.
 * Retorna el número de hitos guardados (0 si falla, sin lanzar error).
 */
async function generarHitosOperativosIA(
  encabezado: RequerimientoEncabezado,
  items: CotizacionItemDraft[],
  requerimientoId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: SupabaseClient<any, any, any>
): Promise<number> {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY
  if (!apiKey) return 0

  try {
    const fechaInicio = sanitizeDate(encabezado.fechaInicio) ?? new Date().toISOString().split('T')[0]
    const fechaFin = sanitizeDate(encabezado.fechaFin) ?? fechaInicio
    const diasActividad = Math.max(
      1,
      Math.ceil(
        (new Date(fechaFin).getTime() - new Date(fechaInicio).getTime()) / (1000 * 60 * 60 * 24)
      ) + 1
    )

    const itemsText =
      items.length > 0
        ? items
            .map(i => `- ${i.descripcion} (${i.cantidad} ${i.unidadMedida ?? 'und'}) [${i.categoria ?? 'General'}]`)
            .join('\n')
        : 'Sin ítems cotizados'

    const EntregableSchemaLocal = z.object({
      fecha: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida (use YYYY-MM-DD)'),
      hora: z
        .string()
        .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Hora inválida (use HH:MM 24h)'),
      descripcion_item: z.string().min(3),
      cantidad: z.number().int().positive(),
    })
    const CronogramaSchemaLocal = z.object({
      entregables: z.array(EntregableSchemaLocal),
    })

    const google = createGoogleGenerativeAI({ apiKey })

    const systemPrompt = `Eres un coordinador logístico experto de la UARIV (Unidad para las Víctimas de Colombia).
Se te pasan los datos de una actividad logística y debes generar un cronograma operativo detallado.

REGLAS:
- Eres un analista logístico experto. Analiza las observaciones de este requerimiento y extrae un cronograma estricto. Si no hay hora específica, infiere una lógica (ej. almuerzos a las 12:00 PM).
- Devuelve únicamente "entregables" con: fecha (YYYY-MM-DD), hora (HH:MM 24h), descripcion_item y cantidad.
- Genera entregables realistas y accionables para el equipo de campo.
- Si hay alimentación, programa horarios consistentes (ej. 10:00, 12:00, 15:00).
- Ordena cronológicamente por fecha y hora.
- Máximo ${diasActividad * 12} entregables en total.`

    const userPrompt = `=== ACTIVIDAD ===
Nombre: ${encabezado.nombreActividad}
Municipio: ${encabezado.municipio ?? 'No especificado'}
Fecha inicio: ${fechaInicio}
Fecha fin: ${fechaFin}
Hora inicio: ${encabezado.horaInicio ?? '08:00'}
Hora fin: ${encabezado.horaFin ?? '17:00'}
Días de actividad: ${diasActividad}
Víctimas/beneficiarios: ${encabezado.numVictimas ?? 0}

=== ÍTEMS COTIZADOS ===
${itemsText}

=== OBSERVACIONES ===
${encabezado.objeto ?? 'Sin observaciones adicionales'}

Genera el cronograma operativo completo.`

    const { object } = await generateObject({
      model: google('gemini-2.0-flash'),
      schema: CronogramaSchemaLocal,
      system: systemPrompt,
      prompt: userPrompt,
      temperature: 0.3,
    })

    const entregables = object.entregables

    await sb
      .from('actividades')
      .update({ cronograma_ia: entregables })
      .eq('id', requerimientoId)

    await sb
      .from('requerimientos')
      .update({ cronograma_ia: entregables })
      .eq('id', requerimientoId)

    let guardados = 0
    for (const entregable of entregables) {
      const fechaHora = new Date(`${entregable.fecha}T${entregable.hora}:00`)
      if (Number.isNaN(fechaHora.getTime())) continue

      const { error } = await sb.from('bitacora_entregas').insert({
        actividad_id: requerimientoId,
        descripcion: `${entregable.descripcion_item} (x${entregable.cantidad})`,
        fecha_hora_limite: fechaHora.toISOString(),
        estado: 'pendiente',
      })

      if (!error) guardados++
    }

    return guardados
  } catch (err) {
    console.warn('[generarHitosOperativosIA]', err instanceof Error ? err.message : err)
    return 0
  }
}

// ============================================================
// Server Action: guardar en Supabase
// ============================================================

export async function guardarCotizacion(
  encabezado: RequerimientoEncabezado,
  items: CotizacionItemDraft[],
  reembolsos: ReembolsoDetalleDraft[],
  fileName: string,
  cronogramaSugerido: CronogramaEntregaDraft[] = []
): Promise<{ ok: true; requerimientoId: string; cotizacionId: string } | { ok: false; error: string }> {
  try {
    // Import dinámico para evitar problemas de bundle en client
    const { createClient } = await import('@supabase/supabase-js')
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey =
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

    if (!supabaseUrl || !supabaseKey) {
      return {
        ok: false,
        error:
          'Faltan variables de entorno de Supabase. Revisa NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY.',
      }
    }

    const sb = createClient(supabaseUrl, supabaseKey)

    const isTransientFetchError = (message: string) => {
      const m = message.toLowerCase()
      return (
        m.includes('fetch failed') ||
        m.includes('network') ||
        m.includes('econnreset') ||
        m.includes('etimedout') ||
        m.includes('enotfound')
      )
    }

    async function withRetry<T extends { error: { message?: string; code?: string } | null }>(
      op: () => PromiseLike<T>,
      retries = 2
    ): Promise<T> {
      let last: T | null = null
      for (let attempt = 0; attempt <= retries; attempt++) {
        const result = await op()
        last = result
        const msg = result.error?.message ?? ''
        if (!msg || !isTransientFetchError(msg) || attempt === retries) {
          return result
        }
        await new Promise(resolve => setTimeout(resolve, 250 * (attempt + 1)))
      }
      return last as T
    }

    // 1. Insertar requerimiento
    const { data: req, error: reqError } = await withRetry(() =>
      sb
        .from('requerimientos')
        .insert({
          numero_requerimiento: encabezado.numeroRequerimiento || null,
          nombre_actividad: [
            encabezado.numeroRequerimiento || null,
            encabezado.municipio || null,
          ].filter(Boolean).join(' — ') || encabezado.nombreActividad || 'Sin nombre',
          objeto: encabezado.objeto || null,
          direccion_territorial: encabezado.direccionTerritorial || null,
          municipio: encabezado.municipio || null,
          departamento: encabezado.departamento || null,
          lugar_detalle: encabezado.lugarDetalle || null,
          fecha_solicitud: sanitizeDate(encabezado.fechaSolicitud),
          fecha_inicio: sanitizeDate(encabezado.fechaInicio),
          fecha_fin: sanitizeDate(encabezado.fechaFin),
          hora_inicio: encabezado.horaInicio || null,
          hora_fin: encabezado.horaFin || null,
          responsable_nombre: encabezado.responsableNombre || null,
          responsable_cedula: encabezado.responsableCedula || null,
          responsable_celular: encabezado.responsableCelular || null,
          responsable_correo: encabezado.responsableCorreo || null,
          num_victimas: encabezado.numVictimas || 0,
          monto_reembolso_declarado: encabezado.montoReembolsoDeclarado || null,
          archivo_origen_nombre: fileName,
          estado: 'generado',
        })
        .select('id')
        .single()
    )

    if (reqError || !req) {
      return { ok: false, error: `Error al guardar requerimiento: ${reqError?.message}` }
    }

    // 2. Calcular totales
    const subtotalServicios = items
      .filter(i => !i.esPassthrough)
      .reduce((sum, i) => sum + i.cantidad * i.precioUnitario, 0)

    // 3. Insertar cotización v1
    const { data: cot, error: cotError } = await withRetry(() =>
      sb
        .from('cotizaciones')
        .insert({
          requerimiento_id: req.id,
          version: 1,
          estado: 'borrador',
          subtotal_servicios: subtotalServicios,
          total_reembolsos: 0,
          total_general: subtotalServicios,
        })
        .select('id')
        .single()
    )

    if (cotError || !cot) {
      return { ok: false, error: `Error al guardar cotización: ${cotError?.message}` }
    }

    // 4. Insertar ítems
    if (items.length > 0) {
      const itemRows = items.map(i => ({
        cotizacion_id: cot.id,
        tarifario_id: i.tarifarioId || null,
        codigo_item: i.codigoItem || null,
        descripcion: i.descripcion,
        categoria: i.categoria || null,
        unidad_medida: i.unidadMedida || null,
        cantidad: i.cantidad,
        precio_unitario: i.precioUnitario,
        es_passthrough: i.esPassthrough,
        fuente: i.fuente,
      }))

      const { error: itemsError } = await withRetry(() =>
        sb.from('cotizacion_items').insert(itemRows)
      )
      if (itemsError) {
        return { ok: false, error: `Error al guardar ítems: ${itemsError.message}` }
      }
    }

    // 5. Insertar reembolsos
    if (reembolsos.length > 0) {
      const reembolsoRows = reembolsos.map(r => ({
        cotizacion_id: cot.id,
        nombre_beneficiario: r.nombreBeneficiario,
        documento_identidad: r.documentoIdentidad || null,
        municipio_origen: r.municipioOrigen || null,
        municipio_destino: r.municipioDestino || null,
        valor_transporte: r.valorTransporte,
        valor_alojamiento: r.valorAlojamiento,
        valor_alimentacion: r.valorAlimentacion,
        valor_otros: r.valorOtros,
      }))

      const { error: reembolsosError } = await withRetry(() =>
        sb.from('reembolsos_detalle').insert(reembolsoRows)
      )
      if (reembolsosError) {
        return { ok: false, error: `Error al guardar reembolsos: ${reembolsosError.message}` }
      }
    }

    // 6. Registrar en historial
    const { error: historialError } = await withRetry(() =>
      sb.from('cotizacion_historial').insert({
        cotizacion_id: cot.id,
        tipo_cambio: 'version_creada',
        descripcion: `Cotización v1 generada desde Excel: ${fileName}`,
        datos_nuevos: { items: items.length, reembolsos: reembolsos.length },
      })
    )

    if (historialError) {
      return { ok: false, error: `Error al registrar historial: ${historialError.message}` }
    }

    // 7. Generar agenda operativa en Ejecución usando IA (datos en memoria, sin llamada extra)
    //    Si la IA falla (cuota agotada, etc.), cae al cronograma sugerido extraído del Excel.
    const hitosGenerados = await generarHitosOperativosIA(encabezado, items, req.id, sb)

    if (hitosGenerados === 0 && cronogramaSugerido.length > 0) {
      // Fallback: sembrar el cronograma básico extraído por la IA del Excel
      const hitos = cronogramaSugerido
        .filter((h) => h.descripcion?.trim() && h.fechaHoraLimite)
        .map((h) => ({
          actividad_id: req.id,
          descripcion: h.descripcion.trim(),
          fecha_hora_limite: h.fechaHoraLimite,
        }))

      if (hitos.length > 0) {
        const { error: cronogramaError } = await withRetry(() =>
          sb.from('bitacora_entregas').insert(hitos)
        )

        if (cronogramaError) {
          const msg = cronogramaError.message?.toLowerCase() ?? ''
          const missingTable =
            msg.includes('schema cache') ||
            msg.includes('does not exist') ||
            (cronogramaError as { code?: string }).code === '42P01' ||
            (cronogramaError as { code?: string }).code === 'PGRST200'

          if (!missingTable) {
            console.warn('[guardarCotizacion] Error al guardar cronograma fallback:', cronogramaError.message)
          } else {
            console.warn('[guardarCotizacion] bitacora_entregas no disponible en este entorno')
          }
        }
      }
    }

    return { ok: true, requerimientoId: req.id, cotizacionId: cot.id }
  } catch (err) {
    console.error('[guardarCotizacion]', err)
    return { ok: false, error: 'Error inesperado al guardar en la base de datos.' }
  }
}

// ============================================================
// Server Actions de edición / carga (compatibilidad editor v2)
// ============================================================

export async function listarHistorialCotizaciones(requerimientoId: string): Promise<
  Array<{
    id: string
    version: number
    estado: string
    created_at: string
    total_general: number
  }>
> {
  try {
    const { createClient } = await import('@supabase/supabase-js')
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey =
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

    if (!supabaseUrl || !supabaseKey) return []

    const sb = createClient(supabaseUrl, supabaseKey)
    const { data } = await sb
      .from('cotizaciones')
      .select('id, version, estado, created_at, total_general')
      .eq('requerimiento_id', requerimientoId)
      .order('version', { ascending: false })

    return (data ?? []).map((h) => ({
      id: h.id,
      version: h.version,
      estado: h.estado,
      created_at: h.created_at,
      total_general: Number(h.total_general ?? 0),
    }))
  } catch (err) {
    console.error('[listarHistorialCotizaciones]', err)
    return []
  }
}

export async function cargarCotizacion(
  requerimientoId: string
): Promise<
  | {
      ok: true
      encabezado: RequerimientoEncabezado
      items: CotizacionItemDraft[]
      cotizacion: { id: string; version: number; estado: string }
      requerimientoEstado: string
    }
  | { ok: false; error: string }
> {
  try {
    const { createClient } = await import('@supabase/supabase-js')
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey =
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

    if (!supabaseUrl || !supabaseKey) {
      return { ok: false, error: 'Configuración de Supabase incompleta.' }
    }

    const sb = createClient(supabaseUrl, supabaseKey)

    const { data: req, error: reqError } = await sb
      .from('requerimientos')
      .select('*')
      .eq('id', requerimientoId)
      .single()

    if (reqError || !req) {
      return { ok: false, error: reqError?.message ?? 'Requerimiento no encontrado.' }
    }

    const { data: cot, error: cotError } = await sb
      .from('cotizaciones')
      .select('id, version, estado')
      .eq('requerimiento_id', requerimientoId)
      .order('version', { ascending: false })
      .limit(1)
      .single()

    if (cotError || !cot) {
      return { ok: false, error: cotError?.message ?? 'No hay cotización para este requerimiento.' }
    }

    const { data: itemsRows, error: itemsError } = await sb
      .from('cotizacion_items')
      .select('id, tarifario_id, codigo_item, descripcion, categoria, unidad_medida, cantidad, precio_unitario, es_passthrough, fuente')
      .eq('cotizacion_id', cot.id)
      .order('created_at', { ascending: true })

    if (itemsError) {
      return { ok: false, error: itemsError.message }
    }

    const encabezado: RequerimientoEncabezado = {
      numeroRequerimiento: req.numero_requerimiento ?? '',
      nombreActividad: req.nombre_actividad ?? '',
      objeto: req.objeto ?? '',
      direccionTerritorial: req.direccion_territorial ?? '',
      municipio: req.municipio ?? '',
      departamento: req.departamento ?? '',
      lugarDetalle: req.lugar_detalle ?? '',
      fechaSolicitud: req.fecha_solicitud ?? '',
      fechaInicio: req.fecha_inicio ?? '',
      horaInicio: req.hora_inicio ?? '',
      fechaFin: req.fecha_fin ?? '',
      horaFin: req.hora_fin ?? '',
      responsableNombre: req.responsable_nombre ?? '',
      responsableCedula: req.responsable_cedula ?? '',
      responsableCelular: req.responsable_celular ?? '',
      responsableCorreo: req.responsable_correo ?? '',
      numVictimas: Number(req.num_victimas ?? 0),
      montoReembolsoDeclarado: Number(req.monto_reembolso_declarado ?? 0),
    }

    const items: CotizacionItemDraft[] = (itemsRows ?? []).map((i) => ({
      id: i.id,
      tarifarioId: i.tarifario_id ?? null,
      codigoItem: i.codigo_item ?? '',
      descripcion: i.descripcion ?? '',
      categoria: i.categoria ?? 'Logística',
      unidadMedida: i.unidad_medida ?? 'unidad',
      cantidad: Number(i.cantidad ?? 0),
      precioUnitario: Number(i.precio_unitario ?? 0),
      esPassthrough: Boolean(i.es_passthrough),
      fuente:
        i.fuente === 'tarifario' || i.fuente === 'excel'
          ? i.fuente
          : 'manual',
      opcionesTarifario: [],
      excluirDeFinanzas: false,
      ocultarEnCotizacion: false,
    }))

    return {
      ok: true,
      encabezado,
      items,
      cotizacion: {
        id: cot.id,
        version: Number(cot.version ?? 1),
        estado: cot.estado ?? 'borrador',
      },
      requerimientoEstado: req.estado ?? 'generado',
    }
  } catch (err) {
    console.error('[cargarCotizacion]', err)
    return { ok: false, error: 'Error inesperado al cargar la cotización.' }
  }
}

export async function actualizarCotizacion(
  requerimientoId: string,
  _cotizacionId: string,
  encabezado: RequerimientoEncabezado,
  items: CotizacionItemDraft[]
): Promise<{ ok: true; cotizacionId: string } | { ok: false; error: string }> {
  try {
    const { createClient } = await import('@supabase/supabase-js')
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey =
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

    if (!supabaseUrl || !supabaseKey) {
      return { ok: false, error: 'Configuración de Supabase incompleta.' }
    }

    const sb = createClient(supabaseUrl, supabaseKey)

    const { data: latest, error: latestError } = await sb
      .from('cotizaciones')
      .select('id, version')
      .eq('requerimiento_id', requerimientoId)
      .order('version', { ascending: false })
      .limit(1)
      .single()

    if (latestError || !latest) {
      return { ok: false, error: latestError?.message ?? 'No se encontró cotización base para versionar.' }
    }

    const newVersion = Number(latest.version ?? 1) + 1
    const subtotalServicios = items
      .filter((i) => !i.esPassthrough)
      .reduce((sum, i) => sum + i.cantidad * i.precioUnitario, 0)

    const totalReembolsos = 0
    const totalGeneral = subtotalServicios + totalReembolsos

    const { data: newCot, error: newCotError } = await sb
      .from('cotizaciones')
      .insert({
        requerimiento_id: requerimientoId,
        version: newVersion,
        estado: 'borrador',
        subtotal_servicios: subtotalServicios,
        total_reembolsos: totalReembolsos,
        total_general: totalGeneral,
      })
      .select('id')
      .single()

    if (newCotError || !newCot) {
      return { ok: false, error: newCotError?.message ?? 'No fue posible crear la nueva versión.' }
    }

    if (items.length > 0) {
      const itemRows = items.map((i) => ({
        cotizacion_id: newCot.id,
        tarifario_id: i.tarifarioId || null,
        codigo_item: i.codigoItem || null,
        descripcion: i.descripcion,
        categoria: i.categoria || null,
        unidad_medida: i.unidadMedida || null,
        cantidad: i.cantidad,
        precio_unitario: i.precioUnitario,
        es_passthrough: i.esPassthrough,
        fuente: i.fuente,
      }))

      const { error: itemsError } = await sb.from('cotizacion_items').insert(itemRows)
      if (itemsError) {
        return { ok: false, error: itemsError.message }
      }
    }

    const { error: reqUpdateError } = await sb
      .from('requerimientos')
      .update({
        numero_requerimiento: encabezado.numeroRequerimiento || null,
        nombre_actividad: [
          encabezado.numeroRequerimiento || null,
          encabezado.municipio || null,
        ].filter(Boolean).join(' — ') || encabezado.nombreActividad || 'Sin nombre',
        objeto: encabezado.objeto || null,
        direccion_territorial: encabezado.direccionTerritorial || null,
        municipio: encabezado.municipio || null,
        departamento: encabezado.departamento || null,
        lugar_detalle: encabezado.lugarDetalle || null,
        fecha_solicitud: sanitizeDate(encabezado.fechaSolicitud),
        fecha_inicio: sanitizeDate(encabezado.fechaInicio),
        fecha_fin: sanitizeDate(encabezado.fechaFin),
        hora_inicio: encabezado.horaInicio || null,
        hora_fin: encabezado.horaFin || null,
        responsable_nombre: encabezado.responsableNombre || null,
        responsable_cedula: encabezado.responsableCedula || null,
        responsable_celular: encabezado.responsableCelular || null,
        responsable_correo: encabezado.responsableCorreo || null,
        num_victimas: encabezado.numVictimas || 0,
        monto_reembolso_declarado: encabezado.montoReembolsoDeclarado || null,
      })
      .eq('id', requerimientoId)

    if (reqUpdateError) {
      return { ok: false, error: reqUpdateError.message }
    }

    await sb.from('cotizacion_historial').insert({
      cotizacion_id: newCot.id,
      tipo_cambio: 'version_creada',
      descripcion: `Cotización v${newVersion} creada desde editor`,
      datos_nuevos: { items: items.length },
    })

    revalidatePath(`/cotizaciones/${requerimientoId}/editar`)
    revalidatePath(`/cotizaciones/${requerimientoId}`)

    return { ok: true, cotizacionId: newCot.id }
  } catch (err) {
    console.error('[actualizarCotizacion]', err)
    return { ok: false, error: 'Error inesperado al actualizar la cotización.' }
  }
}

// ============================================================
// LISTADO: requerimientos con su última cotización
// (para app/cotizaciones/page.tsx — Server Component)
// ============================================================

export interface RequerimientoConCotizacion {
  id: string
  numero: string
  nombre: string
  municipio: string
  departamento: string
  estadoReq: string
  version: number
  estadoCot: string
  total: number
}

export async function listarRequerimientosConCotizaciones(): Promise<RequerimientoConCotizacion[]> {
  const sb = getSupabase()
  const { data, error } = await sb
    .from('requerimientos')
    .select('id, numero_requerimiento, municipio, departamento, estado, nombre_actividad, fecha_inicio, cotizaciones(version, estado, total_general)')
    .order('created_at', { ascending: false })

  if (error || !data) return []

  return data.map((req: any) => {
    const cots = Array.isArray(req.cotizaciones) ? req.cotizaciones : []
    const latest = cots.sort((a: any, b: any) => b.version - a.version)[0] ?? null
    return {
      id: req.id,
      numero: req.numero_requerimiento || 'S/N',
      nombre: req.nombre_actividad || 'Sin nombre',
      municipio: req.municipio || 'N/A',
      departamento: req.departamento || 'N/A',
      estadoReq: req.estado || 'generado',
      version: latest?.version ?? 0,
      estadoCot: latest?.estado ?? 'borrador',
      total: latest?.total_general ?? 0,
    }
  })
}
