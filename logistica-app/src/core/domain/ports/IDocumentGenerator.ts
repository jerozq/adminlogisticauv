import type { DatosCotizacionDocumento } from '@/src/types/domain'

// ============================================================
// Puerto de dominio: IDocumentGenerator
//
// Abstrae la generación de documentos de cotización (Word/DOCX).
// El dominio no sabe si el adaptador usa docx.js, python-docx,
// una llamada a una API externa, o cualquier otra tecnología.
// ============================================================

/** Resultado de la generación; envuelve el documento en distintos formatos. */
export interface DocumentoGenerado {
  /** Contenido binario del archivo DOCX. */
  buffer: ArrayBuffer
  /** Nombre sugerido para la descarga, ej. "COT-UV-2026-042-v1.docx". */
  nombreArchivo: string
  /** Tipo MIME del documento generado. */
  mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
}

export interface IDocumentGenerator {
  /**
   * Genera el documento de cotización a partir de los datos de negocio.
   * No debe contener lógica de cálculo; recibe los totales ya calculados.
   *
   * @param datos - Datos puramente de dominio para rellenar la plantilla.
   * @returns El documento generado listo para descarga.
   */
  generarCotizacion(datos: DatosCotizacionDocumento): Promise<DocumentoGenerado>
}
