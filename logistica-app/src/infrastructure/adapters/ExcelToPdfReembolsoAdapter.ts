import fs from 'fs'
import path from 'path'
import ExcelJS from 'exceljs'
import type {
  IPdfGenerator,
  DatosReembolsoPdf,
  PdfGenerado,
} from '@/src/core/domain/ports/IPdfGenerator'
import { getLogger } from '@/src/infrastructure/observability/logger'

// ============================================================
// ExcelToPdfReembolsoAdapter
//
// Implementa IPdfGenerator usando ExcelJS para rellenar la
// plantilla XLSX oficial de la UV y devolverla directamente
// como buffer sin necesitar ningún proceso externo.
//
// Estrategia de generación:
//   1. Cargar plantilla desde disco con ExcelJS (sin mutarla).
//   2. Escribir los datos del reembolso en las celdas exactas
//      del formato oficial.
//   3. Serializar el workbook a buffer XLSX y retornarlo.
//
// Celdas mapeadas — comunes (TRANSPORTE e INHUMACIÓN):
//   B11  Dirección Territorial
//   C13  Fecha de la actividad
//   I13  Ciudad / Municipio
//   C28  Nombre completo del beneficiario
//   C30  Número de documento (CC)
//   H30  Celular de contacto
//
// Celdas mapeadas — solo TRANSPORTE:
//   D19  Municipio de origen de la ruta
//   G19  Municipio de destino de la ruta
//   D22  Fecha del desplazamiento
//   I54  Valor numérico del reembolso
//   D56  Total en letras (primera fila)
//   D58  Total en letras (segunda fila / confirmación)
//
// Celdas mapeadas — solo INHUMACIÓN:
//   I54  Se limpia (sin valor de transporte)
//   D67  Se escribe 'INHUMACIÓN' para identificar el concepto
// ============================================================

const log = getLogger('ExcelToPdfReembolsoAdapter')

// ---------------------------------------------------------------
// Ruta a la plantilla XLSX
//
// Se intenta resolver en este orden:
//   1. REEMBOLSO_TEMPLATE_PATH absoluta
//   2. REEMBOLSO_TEMPLATE_PATH relativa al cwd
//   3. Candidatos locales (cwd y raíz del monorepo)
// ---------------------------------------------------------------
const TEMPLATE_FILENAME = 'UTF-8FORMATO REEMBOLSO DE TRANSPORTE V4 ultimo 12 mayo.xlsx'
const TEMPLATE_CANONICAL = 'FORMATO-REEMBOLSO.xlsx'

function resolveTemplatePath(): string {
  const envPath = process.env.REEMBOLSO_TEMPLATE_PATH?.trim()

  const candidates = [
    // 1. Variable de entorno (absoluta o relativa al cwd)
    envPath && path.isAbsolute(envPath) ? envPath : null,
    envPath ? path.resolve(process.cwd(), envPath) : null,
    // 2. Carpeta templates/ con nombre canónico (recomendado en Vercel)
    path.resolve(process.cwd(), 'templates', TEMPLATE_CANONICAL),
    // 3. Carpeta templates/ con nombre original
    path.resolve(process.cwd(), 'templates', TEMPLATE_FILENAME),
    // 4. Raíz del proyecto (fallback local)
    path.resolve(process.cwd(), TEMPLATE_CANONICAL),
    path.resolve(process.cwd(), TEMPLATE_FILENAME),
    path.resolve(process.cwd(), '..', TEMPLATE_CANONICAL),
    path.resolve(process.cwd(), '..', TEMPLATE_FILENAME),
  ].filter((p): p is string => Boolean(p))

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate
  }

  throw new Error(
    `Plantilla de reembolso no encontrada. Rutas revisadas:\n  ${candidates.join('\n  ')}\n` +
    'Opciones: (A) copia la plantilla .xlsx a logistica-app/templates/FORMATO-REEMBOLSO.xlsx, ' +
    'o (B) configura la variable de entorno REEMBOLSO_TEMPLATE_PATH con la ruta completa.'
  )
}

// ---------------------------------------------------------------
// El adaptador genera directamente el buffer XLSX con ExcelJS.
// No se requiere LibreOffice ni ningún proceso externo.
// ---------------------------------------------------------------

// ---------------------------------------------------------------
// Utilidades de fecha
// ---------------------------------------------------------------

/**
 * Convierte una fecha ISO 8601 (YYYY-MM-DD) al formato DD/MM/YYYY
 * que usa la plantilla oficial de la UV.
 */
function formatDate(isoDate: string): string {
  // Parsear como fecha local para evitar desfases de zona horaria
  const [year, month, day] = isoDate.split('-')
  if (!year || !month || !day) return isoDate
  return `${day.padStart(2, '0')}/${month.padStart(2, '0')}/${year}`
}

// ---------------------------------------------------------------
// Adaptador principal
// ---------------------------------------------------------------

export class ExcelToPdfReembolsoAdapter implements IPdfGenerator {
  async generateReembolsoPdf(data: DatosReembolsoPdf): Promise<PdfGenerado> {
    const { reembolso, actividad } = data
    const templatePath = resolveTemplatePath()

    // ── Paso 1: Cargar plantilla ─────────────────────────────────
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.readFile(templatePath)

    const ws = workbook.worksheets[0]
    if (!ws) {
      throw new Error(
        'La plantilla Excel no contiene hojas de cálculo. Verifica el archivo.'
      )
    }

    // ── Paso 2: Celdas comunes ───────────────────────────────────
    const fechaActividad = actividad.fechaInicio
      ? formatDate(actividad.fechaInicio)
      : formatDate(reembolso.fecha)

    ws.getCell('B11').value = actividad.municipio ?? ''     // Dirección Territorial
    ws.getCell('C13').value = fechaActividad                // Fecha de la actividad
    ws.getCell('I13').value = actividad.municipio ?? ''     // Ciudad
    ws.getCell('C28').value = reembolso.personaNombre       // Nombre beneficiario
    ws.getCell('C30').value = reembolso.documento           // Número CC
    ws.getCell('H30').value = reembolso.celular ?? ''       // Celular

    // ── Paso 3: Celdas específicas por tipo ──────────────────────
    if (reembolso.tipo === 'TRANSPORTE') {
      ws.getCell('D19').value = reembolso.rutaOrigen        // Municipio origen
      ws.getCell('G19').value = reembolso.rutaDestino       // Municipio destino
      ws.getCell('D22').value = formatDate(reembolso.fecha) // Fecha desplazamiento
      ws.getCell('I54').value = reembolso.valor             // Valor numérico COP
    } else {
      // INHUMACIÓN: limpiar celda de valor transporte y marcar concepto
      ws.getCell('I54').value = null
      ws.getCell('D67').value = 'INHUMACIÓN'
    }

    // D56 / D58: valor total en números y letras
    ws.getCell('D56').value = reembolso.valor
    ws.getCell('D58').value = reembolso.valorEnLetras()

    // ── Paso 4: Serializar XLSX directamente a buffer ────────────
    const nombreArchivo =
      `REEMBOLSO-${reembolso.tipo}-${reembolso.documento}.xlsx`

    const xlsxBuffer = await workbook.xlsx.writeBuffer()

    log.info(
      {
        correlationId: 'unknown',
        userId: 'anonymous',
        operation: 'generarReembolsoXlsx',
        metadata: {
          actividadId:   actividad.id,
          requerimiento: actividad.numeroRequerimiento,
          reembolsoId:   reembolso.id,
          tipo:          reembolso.tipo,
          beneficiario:  reembolso.personaNombre,
          documento:     reembolso.documento,
          monto:         reembolso.valor,
          valorEnLetras: reembolso.valorEnLetras(),
          rutaOrigen:    reembolso.rutaOrigen,
          rutaDestino:   reembolso.rutaDestino,
        },
      },
      'Documento XLSX de reembolso generado exitosamente'
    )

    return {
      buffer:        xlsxBuffer as ArrayBuffer,
      nombreArchivo,
      mimeType:      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }
  }
}
