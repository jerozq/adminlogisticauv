import { ChangeActivityStatus } from '@/src/core/application/use-cases/ChangeActivityStatus'
import { RedefinirParticipacion } from '@/src/core/application/use-cases/RedefinirParticipacion'
import { GetReembolsosFromActivity } from '@/src/core/application/use-cases/GetReembolsosFromActivity'
import { PrepareReembolsoDocument } from '@/src/core/application/use-cases/PrepareReembolsoDocument'
import { GetFinancialSummary } from '@/src/core/application/use-cases/GetFinancialSummary'
import { getSupabaseActivityRepository } from '@/src/infrastructure/adapters/SupabaseActivityRepository'
import { WordTemplateAdapter } from '@/src/infrastructure/adapters/WordTemplateAdapter'
import { ExcelToPdfReembolsoAdapter } from '@/src/infrastructure/adapters/ExcelToPdfReembolsoAdapter'
import { getInMemoryReembolsoRepository } from '@/src/infrastructure/adapters/InMemoryReembolsoRepository'
import { getSupabaseReportingRepository } from '@/src/infrastructure/adapters/SupabaseReportingRepository'
import { createSupabaseFinancialAdapter } from '@/src/infrastructure/adapters/SupabaseFinancialAdapter'
import { getFinancialExporter } from '@/src/infrastructure/adapters/FinancialExportAdapter'
import { CloudConvertAdapter } from '@/src/infrastructure/adapters/CloudConvertAdapter'
import type { IActivityRepository } from '@/src/core/domain/ports/IActivityRepository'
import type { IDocumentGenerator } from '@/src/core/domain/ports/IDocumentGenerator'
import type { IPdfGenerator } from '@/src/core/domain/ports/IPdfGenerator'
import type { IReportingRepository } from '@/src/core/domain/ports/IReportingRepository'
import type { IFinancialExporter } from '@/src/core/domain/ports/IFinancialExporter'
import type { IDocumentConverterService } from '@/src/core/domain/ports/IDocumentConverterService'

// ============================================================
// Container — Inyección de Dependencias (DI) simple
//
// Patrón: Service Locator con factories lazy-singleton.
//
// Cada función `make*` crea la instancia del caso de uso con sus
// adaptadores concretos ya inyectados.  Los adaptadores se
// instancian en el momento de la primera llamada y se reutilizan.
//
// Cómo añadir un nuevo caso de uso:
//   1. Crear la clase en src/core/application/use-cases/
//   2. Añadir una función make<NombreCasoDeUso>() aquí.
//   3. Importar y usar desde Server Actions o Route Handlers.
//
// Nota: En Next.js (App Router) cada Server Action invoca el
// módulo en el mismo proceso Node.js, por lo que los singletons
// se mantienen entre requests (igual que el cliente de Supabase).
// ============================================================

// ---------------------------------------------------------------
// Adaptadores compartidos (singletons de proceso)
// ---------------------------------------------------------------

let _wordAdapter: WordTemplateAdapter | null = null
let _pdfAdapter: ExcelToPdfReembolsoAdapter | null = null
let _cloudConvertAdapter: CloudConvertAdapter | null = null

function getWordAdapter(): IDocumentGenerator {
  if (!_wordAdapter) _wordAdapter = new WordTemplateAdapter()
  return _wordAdapter
}

function getPdfAdapter(): IPdfGenerator {
  if (!_pdfAdapter) _pdfAdapter = new ExcelToPdfReembolsoAdapter()
  return _pdfAdapter
}

/**
 * Devuelve el adaptador de conversión DOCX→PDF usando CloudConvert.
 *
 * Requiere la variable de entorno CLOUDCONVERT_API_KEY.
 * Si no está configurada, lanza un error en tiempo de ejecución.
 *
 * @example
 * ```ts
 * // En un Route Handler:
 * const converter = getDocumentConverterService()
 * const { pdfBuffer } = await converter.convertDocxToPdf({ docxBuffer, fileName })
 * ```
 */
export function getDocumentConverterService(): IDocumentConverterService {
  if (!_cloudConvertAdapter) {
    const apiKey = process.env.CLOUDCONVERT_API_KEY
    if (!apiKey) {
      throw new Error(
        '[DI Container] CLOUDCONVERT_API_KEY no está configurada. ' +
          'Añádela a .env.local y a las variables de entorno de Vercel.',
      )
    }
    _cloudConvertAdapter = new CloudConvertAdapter(apiKey)
  }
  return _cloudConvertAdapter
}

function getRepo(): IActivityRepository {
  return getSupabaseActivityRepository()
}

function getReportingRepository(): IReportingRepository {
  return getSupabaseReportingRepository()
}

// ---------------------------------------------------------------
// Factories de casos de uso
// ---------------------------------------------------------------

/**
 * Crea una instancia de ChangeActivityStatus con los adaptadores
 * de producción inyectados (Supabase + OTel).
 *
 * @example
 * ```ts
 * // En un Server Action:
 * const uc = makeChangeActivityStatus()
 * await uc.execute({ actividadId, nuevoEstado, motivo })
 * ```
 */
export function makeChangeActivityStatus(): ChangeActivityStatus {
  return new ChangeActivityStatus(getRepo())
}

export function makeRedefinirParticipacion(): RedefinirParticipacion {
  return new RedefinirParticipacion(getRepo())
}

export function makeGetReembolsosFromActivity(): GetReembolsosFromActivity {
  return new GetReembolsosFromActivity(getRepo(), getInMemoryReembolsoRepository())
}

export function makePrepareReembolsoDocument(): PrepareReembolsoDocument {
  return new PrepareReembolsoDocument(getInMemoryReembolsoRepository())
}

export function makeGetFinancialSummary(): GetFinancialSummary {
  return new GetFinancialSummary(getRepo(), getReportingRepository())
}

/**
 * Versión auditada de GetFinancialSummary que usa SupabaseFinancialAdapter:
 *   - Una sola query con relaciones embebidas (vs 6 queries en paralelo).
 *   - Audit log de Pino en cada consulta con userId + filtros + duracionMs.
 *
 * Usar desde el Route Handler de exportación o cuando se necesite
 * un trail de auditoría completo del acceso financiero.
 */
export function makeGetFinancialSummaryWithAudit(userId?: string): GetFinancialSummary {
  return new GetFinancialSummary(getRepo(), createSupabaseFinancialAdapter(userId))
}

// ---------------------------------------------------------------
// Re-exportaciones para facilitar imports en Server Actions
// ---------------------------------------------------------------

export {
  getRepo as getActivityRepository,
  getWordAdapter as getDocumentGenerator,
  getPdfAdapter as getPdfGenerator,
  getReportingRepository,
  getFinancialExporter,
  getInMemoryReembolsoRepository,
}
export type { IFinancialExporter }
