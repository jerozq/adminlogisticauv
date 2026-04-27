import fs from 'fs'
import os from 'os'
import path from 'path'
import { execSync } from 'child_process'
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
// plantilla XLSX oficial de la UV y LibreOffice headless para
// convertirla a PDF.
//
// Estrategia de conversión:
//   1. Cargar plantilla desde disco con ExcelJS (sin mutarla).
//   2. Escribir los datos del reembolso en las celdas exactas
//      del formato oficial.
//   3. Guardar el XLSX relleno en un archivo temporal.
//   4. Invocar LibreOffice headless para convertirlo a PDF.
//   5. Leer el PDF resultante, limpiar temporales y retornar.
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

function resolveTemplatePath(): string {
  const envPath = process.env.REEMBOLSO_TEMPLATE_PATH?.trim()

  const candidates = [
    envPath && path.isAbsolute(envPath) ? envPath : null,
    envPath ? path.resolve(process.cwd(), envPath) : null,
    path.resolve(process.cwd(), TEMPLATE_FILENAME),
    path.resolve(process.cwd(), '..', TEMPLATE_FILENAME),
    path.resolve(__dirname, '..', '..', '..', '..', TEMPLATE_FILENAME),
  ].filter((p): p is string => Boolean(p))

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate
  }

  throw new Error(
    `Plantilla de reembolso no encontrada. Rutas revisadas: ${candidates.join(' | ')}. ` +
    'Configura REEMBOLSO_TEMPLATE_PATH o ubica la plantilla en la raíz del proyecto.'
  )
}

// ---------------------------------------------------------------
// Búsqueda de LibreOffice en el sistema
// ---------------------------------------------------------------

/**
 * Candidatos de LibreOffice por plataforma.
 * Se prueban en orden; el primero que responda sin error se usa.
 */
const LIBREOFFICE_CANDIDATES: string[] = [
  // Variables de entorno explícitas para contenedores / CI
  ...(process.env.LIBREOFFICE_PATH ? [process.env.LIBREOFFICE_PATH] : []),
  // Linux / macOS (en PATH)
  'libreoffice',
  'soffice',
  '/usr/bin/libreoffice',
  '/usr/bin/soffice',
  '/usr/local/bin/libreoffice',
  // macOS (instalación estándar)
  '/Applications/LibreOffice.app/Contents/MacOS/soffice',
  // Windows (instalaciones por defecto)
  'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
  'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
]

let _libreOfficePath: string | null = null

function findLibreOffice(): string {
  if (_libreOfficePath) return _libreOfficePath

  const envPath = process.env.LIBREOFFICE_PATH?.trim()
  if (envPath) {
    try {
      execSync(`"${envPath}" --version`, { stdio: 'pipe', timeout: 5_000 })
      _libreOfficePath = envPath
      return envPath
    } catch {
      log.warn(
        { libreOfficePath: envPath },
        'LIBREOFFICE_PATH inválida; se intentará autodetección de LibreOffice'
      )
    }
  }

  const autoCandidates = LIBREOFFICE_CANDIDATES.filter((c) => c !== envPath)
  for (const candidate of autoCandidates) {
    try {
      execSync(`"${candidate}" --version`, { stdio: 'pipe', timeout: 5_000 })
      _libreOfficePath = candidate
      return candidate
    } catch {
      // No disponible en esta ruta, probar siguiente
    }
  }

  throw new Error(
    'LibreOffice no está instalado o no se encontró en el PATH. ' +
    'Instálalo desde https://www.libreoffice.org/ o define la variable ' +
    'de entorno LIBREOFFICE_PATH con la ruta al ejecutable soffice.exe.'
  )
}

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

function toArrayBuffer(buf: Buffer): ArrayBuffer {
  return buf.buffer.slice(
    buf.byteOffset,
    buf.byteOffset + buf.byteLength,
  ) as ArrayBuffer
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

    // ── Paso 4: Serializar XLSX relleno a archivo temporal ───────
    const tmpDir  = os.tmpdir()
    const tmpBase = `reembolso-${reembolso.tipo}-${reembolso.documento}-${Date.now()}`
    const tmpXlsx = path.join(tmpDir, `${tmpBase}.xlsx`)

    await workbook.xlsx.writeFile(tmpXlsx)

    const nombreArchivo =
      `REEMBOLSO-${reembolso.tipo}-${reembolso.documento}.pdf`

    try {
      // ── Paso 5: Convertir a PDF con LibreOffice ───────────────
      const libreOffice = findLibreOffice()

      execSync(
        `"${libreOffice}" --headless --convert-to pdf "${tmpXlsx}" --outdir "${tmpDir}"`,
        { timeout: 30_000, stdio: 'pipe' }
      )

      const tmpPdf = path.join(tmpDir, `${tmpBase}.pdf`)

      if (!fs.existsSync(tmpPdf)) {
        throw new Error(
          'LibreOffice no generó el archivo PDF esperado. ' +
          `Ruta buscada: ${tmpPdf}`
        )
      }

      const pdfNodeBuffer = fs.readFileSync(tmpPdf)
      const pdfArrayBuffer = toArrayBuffer(pdfNodeBuffer)

      // ── Paso 6: Log de éxito con Pino ────────────────────────
      log.info(
        {
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
        'PDF de reembolso generado exitosamente'
      )

      return {
        buffer:        pdfArrayBuffer,
        nombreArchivo,
        mimeType:      'application/pdf',
      }
    } finally {
      // Limpiar archivos temporales siempre, incluso si hay error
      for (const tmpFile of [tmpXlsx, path.join(tmpDir, `${tmpBase}.pdf`)]) {
        try { fs.unlinkSync(tmpFile) } catch { /* ignorar si no existe */ }
      }
    }
  }
}
