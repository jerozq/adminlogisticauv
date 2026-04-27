import type { RequerimientoParsed } from '@/src/types/domain'

// ============================================================
// Puerto de dominio: IExcelParser
//
// Abstrae la lectura de archivos Excel con el formato
// "MATERIAL DE APOYO" de la UV.  El dominio no sabe si el
// adaptador usa ExcelJS, SheetJS, una API de OCR, etc.
// ============================================================

/** Opciones opcionales que puede recibir el parser. */
export interface OpcionesParser {
  /**
   * Si es true, el parser intentará inferir elementos de cronograma
   * a partir de las observaciones del requerimiento (requiere IA).
   * Por defecto false.
   */
  inferirCronograma?: boolean

  /**
   * Hoja del libro de Excel a leer (nombre o índice 0-based).
   * Si no se indica, el parser usa la hoja activa o la primera.
   */
  hoja?: string | number
}

export interface IExcelParser {
  /**
   * Parsea un archivo Excel con el formato de requerimiento de la UV.
   *
   * @param archivo - Buffer con el contenido del XLSX, o un objeto File
   *   (disponible en entorno de navegador).
   * @param opciones - Ajustes opcionales del parseo.
   * @returns Los datos extraídos como tipos puramente de dominio.
   * @throws {Error} Si el archivo no tiene el formato esperado o está corrupto.
   */
  parsear(
    archivo: ArrayBuffer | Buffer | File,
    opciones?: OpcionesParser
  ): Promise<RequerimientoParsed>
}
