import type { Reembolso } from '@/src/core/domain/entities/Reembolso'

// ============================================================
// Puerto de dominio: IPdfGenerator
//
// Abstrae la generación de documentos PDF de reembolso.
// El dominio no sabe si el adaptador usa Puppeteer, pdf-lib,
// jsPDF, una llamada a una API externa, etc.
//
// La implementación concreta vive en src/infrastructure/adapters/
// ============================================================

/**
 * Contexto mínimo de la actividad necesario para encabezar
 * el documento de reembolso sin acoplar al generador con la
 * entidad completa.
 */
export interface ContextoActividadPdf {
  id: string
  numeroRequerimiento: string | null
  nombreActividad: string
  municipio: string | null
  /** Fecha de inicio de la actividad (YYYY-MM-DD). */
  fechaInicio: string | null
}

/**
 * Datos que el generador necesita para producir el PDF de un
 * reembolso individual.
 */
export interface DatosReembolsoPdf {
  /** La entidad Reembolso con todos sus atributos calculados. */
  reembolso: Reembolso
  /** Datos de la actividad que origina el reembolso. */
  actividad: ContextoActividadPdf
  /**
   * Nombre del funcionario o responsable que expide el documento.
   * Aparece en la firma del PDF.
   */
  expedidoPor: string
}

/** Resultado binario de la generación del documento. */
export interface PdfGenerado {
  /** Contenido binario del archivo. */
  buffer: ArrayBuffer
  /** Nombre sugerido para la descarga, ej. "REEMBOLSO-TRANSPORTE-1234567.xlsx". */
  nombreArchivo: string
  /** Tipo MIME del documento generado. */
  mimeType: string
}

export interface IPdfGenerator {
  /**
   * Genera el PDF del reembolso a partir de los datos de negocio.
   * Incluye el valor en letras obtenido de reembolso.valorEnLetras().
   *
   * @param data - Datos puramente de dominio para rellenar la plantilla PDF.
   * @returns El documento PDF generado, listo para descarga.
   * @throws {Error} Si los datos son inválidos o la generación falla.
   */
  generateReembolsoPdf(data: DatosReembolsoPdf): Promise<PdfGenerado>
}
