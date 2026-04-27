// Barrel — re-exporta todo lo público del dominio central.
// Los casos de uso y adaptadores importan desde aquí.

export { Actividad } from './entities/Actividad'
export type { ActividadProps } from './entities/Actividad'

export { Reembolso } from './entities/Reembolso'
export type { ReembolsoProps, TipoReembolso } from './entities/Reembolso'

export { BalanceFinanciero } from './entities/BalanceFinanciero'
export type { BalanceFinancieroProps } from './entities/BalanceFinanciero'

export type { IActivityRepository } from './ports/IActivityRepository'
export type { IDocumentGenerator, DocumentoGenerado } from './ports/IDocumentGenerator'
export type { IExcelParser, OpcionesParser } from './ports/IExcelParser'
export type { IReembolsoRepository } from './ports/IReembolsoRepository'
export type { IPdfGenerator, DatosReembolsoPdf, PdfGenerado, ContextoActividadPdf } from './ports/IPdfGenerator'
export type {
  IReportingRepository,
  FiltrosReporte,
  AgregadoPorMes,
  AgregadoPorSocio,
  AgregadoPorFuente,
} from './ports/IReportingRepository'
export type {
  IFinancialExporter,
  DatosExportacionFinanciero,
  KpisFinancieros,
  ConfigExportacion,
  ArchivoExportado,
} from './ports/IFinancialExporter'
