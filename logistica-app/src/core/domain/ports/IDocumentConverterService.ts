// ============================================================
// Puerto de dominio: IDocumentConverterService
//
// Abstrae la conversión de DOCX → PDF usando un proveedor externo
// (CloudConvert, ConvertAPI, etc.).  El dominio sólo conoce esta
// interfaz; nunca importa un SDK concreto.
//
// Separado de IDocumentGenerator porque son responsabilidades
// distintas: generar plantilla Word vs. convertirla a PDF.
// ============================================================

/** Proveedor concreto que procesó la conversión (trazabilidad). */
export type DocumentConverterProvider = 'cloudconvert' | 'convertapi' | 'pdfco'

/** Input mínimo que necesita cualquier adaptador de conversión. */
export interface ConvertDocxToPdfInput {
  /** Contenido binario del archivo DOCX a convertir. */
  docxBuffer: Buffer
  /** Nombre del archivo (para logs y metadatos del proveedor). */
  fileName: string
  /** ID de correlación opcional para trazabilidad end-to-end. */
  correlationId?: string
}

/** Resultado exitoso de la conversión. */
export interface ConvertDocxToPdfOutput {
  /** Buffer binario del PDF generado. */
  pdfBuffer: Buffer
  /** Proveedor que completó la conversión (para logs/alertas). */
  provider: DocumentConverterProvider
}

export interface IDocumentConverterService {
  /**
   * Convierte un buffer DOCX a PDF usando el proveedor configurado.
   *
   * @throws {DocumentConversionError} Si falla la conversión después de
   *   agotar los reintentos o si la cuota está agotada.
   */
  convertDocxToPdf(input: ConvertDocxToPdfInput): Promise<ConvertDocxToPdfOutput>
}
