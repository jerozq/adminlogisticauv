import { DomainError } from './DomainError'

// ============================================================
// Error de dominio: DocumentConversionError
//
// Hereda de DomainError para garantizar errorCode y metadata.
// Representa fallos de conversión de documentos en adaptadores
// de infraestructura (CloudConvertAdapter, etc.).
//
// ErrorCodes:
//   ERR_QUOTA_EXCEEDED   – Cuota diaria / créditos agotados (HTTP 402).
//   ERR_PROVIDER_ERROR   – Error 5xx o de red del proveedor.
//   ERR_INVALID_RESPONSE – La respuesta del proveedor es inesperada.
//   ERR_TIMEOUT          – El trabajo de conversión tardó demasiado.
//   FALLBACK_FAILED      – Fallback a DOCX también falló (crítico).
// ============================================================

export type DocumentConversionErrorCode =
  | 'ERR_QUOTA_EXCEEDED'
  | 'ERR_PROVIDER_ERROR'
  | 'ERR_INVALID_RESPONSE'
  | 'ERR_TIMEOUT'
  | 'FALLBACK_FAILED'

export class DocumentConversionError extends DomainError {
  readonly provider: string
  readonly stage: 'upload' | 'convert' | 'download' | 'unknown'

  constructor(opts: {
    message: string
    code: DocumentConversionErrorCode
    provider: string
    stage?: 'upload' | 'convert' | 'download' | 'unknown'
    retryable?: boolean
    cause?: unknown
    details?: Record<string, unknown>
  }) {
    super(opts.message, opts.code, {
      retryable: opts.retryable ?? false,
      cause: opts.cause,
      details: opts.details ?? {},
    })
    this.provider = opts.provider
    this.stage = opts.stage ?? 'unknown'
  }

  /** Devuelve true si el error se debe a cuota agotada. */
  isQuotaExceeded(): boolean {
    return this.errorCode === 'ERR_QUOTA_EXCEEDED'
  }

  /** Serialización segura para logs estructurados. */
  override toLog(): Record<string, unknown> {
    return {
      ...super.toLog(),
      provider: this.provider,
      stage: this.stage,
    }
  }
}
