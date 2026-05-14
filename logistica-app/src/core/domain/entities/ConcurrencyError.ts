import { DomainError } from './DomainError'

/**
 * Error de dominio: conflicto de concurrencia.
 *
 * Se lanza cuando múltiples procesos o usuarios intentan modificar
 * el mismo recurso simultáneamente (ej. validación de versión fallida
 * o constraint violado).
 *
 * Campos de auditoría:
 *   - resourceId: ID del recurso contencioso
 *   - operation: qué operación causó el conflicto
 *   - expectedVersion: versión esperada (si aplica)
 *   - actualVersion: versión real encontrada (si aplica)
 */
export class ConcurrencyError extends DomainError {
  constructor(opts: {
    message: string
    resourceId: string
    operation: string
    expectedVersion?: number
    actualVersion?: number
    cause?: unknown
  }) {
    super(
      opts.message,
      'DB_CONCURRENCY_CONFLICT',
      {
        retryable: true,
        cause: opts.cause,
        details: {
          resourceId: opts.resourceId,
          operation: opts.operation,
          expectedVersion: opts.expectedVersion,
          actualVersion: opts.actualVersion,
        },
      }
    )
  }

  override toLog(): Record<string, unknown> {
    return {
      ...super.toLog(),
      resourceId: this.metadata.details?.resourceId,
      operation: this.metadata.details?.operation,
      expectedVersion: this.metadata.details?.expectedVersion,
      actualVersion: this.metadata.details?.actualVersion,
    }
  }
}
