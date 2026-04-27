import type { AgregadoPorMes, AgregadoPorSocio, AgregadoPorFuente, FiltrosReporte } from './IReportingRepository'
import type { BalanceFinancieroProps } from '../entities/BalanceFinanciero'

// ============================================================
// Puerto: IFinancialExporter
//
// Contrato para exportar los datos del dashboard financiero a un
// archivo estructurado (Excel, CSV, etc.) apto para contabilidad.
//
// El puerto pertenece al dominio y sólo usa tipos de dominio.
// La implementación concreta (ExcelJS, Google Sheets…) vive en
// la capa de infraestructura y es inyectada desde el container.
//
// Auditoría de seguridad (OWASP A09 - Security Logging):
//   ConfigExportacion incluye userId y generadoEn para que cada
//   implementación pueda registrar quién generó el archivo.
// ============================================================

// ---------------------------------------------------------------
// KPIs del período (totales globales)
// ---------------------------------------------------------------

export interface KpisFinancieros {
  totalCotizado:       number
  totalGastoReal:      number
  totalReembolsos:     number
  utilidadBruta:       number
  utilidadNeta:        number
  dineroEnCaja:        number
  utilidadPorCobrar:   number
  cantidadActividades: number
}

// ---------------------------------------------------------------
// Payload de exportación — solo tipos de dominio/puerto
// ---------------------------------------------------------------

/**
 * Datos completos que se vuelcan en el archivo exportado.
 * Corresponde exactamente a la salida del caso de uso
 * GetFinancialSummary, expresada en tipos de dominio.
 */
export interface DatosExportacionFinanciero {
  kpis:               KpisFinancieros
  agregadosPorMes:    AgregadoPorMes[]
  agregadosPorSocio:  AgregadoPorSocio[]
  agregadosPorFuente: AgregadoPorFuente[]
  /** Detalle crudo por actividad (una fila por actividad en la hoja de detalle). */
  balancesDetalle:    BalanceFinancieroProps[]
}

// ---------------------------------------------------------------
// Configuración de auditoría (quién, cuándo, qué filtros)
// ---------------------------------------------------------------

/**
 * Metadatos que se incluyen en el encabezado del archivo
 * y en el log de auditoría de seguridad.
 */
export interface ConfigExportacion {
  /** ID único del usuario que solicitó la exportación. */
  userId: string
  /** Nombre de display del usuario (para el log de auditoría). */
  nombreUsuario?: string
  /** Fecha y hora de generación — ISO 8601 (ej. 2026-04-25T12:00:00.000Z). */
  generadoEn: string
  /** Filtros que se aplicaron al reporte. */
  filtrosAplicados: FiltrosReporte
  /** Título que aparece en la portada del Excel. */
  titulo?: string
}

// ---------------------------------------------------------------
// Resultado
// ---------------------------------------------------------------

export interface ArchivoExportado {
  /** Buffer con los bytes del archivo generado. */
  buffer: Buffer
  /** Nombre sugerido para la descarga (ej. "reporte-financiero-2026-04.xlsx"). */
  filename: string
  /** MIME type del archivo. */
  contentType: string
}

// ---------------------------------------------------------------
// Puerto
// ---------------------------------------------------------------

export interface IFinancialExporter {
  /**
   * Genera un archivo Excel multi-hoja con el resumen financiero
   * del período indicado por los filtros.
   *
   * Hojas generadas:
   *   1. Resumen       — KPIs globales + metadatos de auditoría
   *   2. Actividades   — Una fila por actividad con semáforo de margen
   *   3. Por Mes       — Agregados mensuales
   *   4. Por Socio     — Agregados por socio (aportó / recibió)
   *   5. Por Fuente    — Agregados por fuente de financiación
   *
   * @param datos  — Datos financieros del período.
   * @param config — Metadatos de auditoría y presentación.
   * @returns      Buffer del archivo + nombre + content-type.
   */
  exportarResumenDashboard(
    datos: DatosExportacionFinanciero,
    config: ConfigExportacion,
  ): Promise<ArchivoExportado>
}
