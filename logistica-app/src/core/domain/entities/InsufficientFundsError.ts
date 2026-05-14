import { DomainError } from './DomainError'

/**
 * Error de dominio: fondos insuficientes en una cuenta.
 *
 * Se lanza cuando se intenta realizar una transacción pero los fondos
 * disponibles son menores que el monto solicitado.
 *
 * Campos de auditoría:
 *   - accountId: ID de la cuenta sin fondos
 *   - required: monto requerido
 *   - available: monto disponible
 *   - operationId: referencia de la operación que falló
 */
export class InsufficientFundsError extends DomainError {
  constructor(opts: {
    message: string
    accountId: string
    required: number
    available: number
    operationId: string
    cause?: unknown
  }) {
    super(
      opts.message,
      'INSUFFICIENT_FUNDS',
      {
        retryable: false,
        cause: opts.cause,
        details: {
          accountId: opts.accountId,
          required: opts.required,
          available: opts.available,
          operationId: opts.operationId,
        },
      }
    )
  }

  override toLog(): Record<string, unknown> {
    return {
      ...super.toLog(),
      accountId: this.metadata.details?.accountId,
      required: this.metadata.details?.required,
      available: this.metadata.details?.available,
      operationId: this.metadata.details?.operationId,
    }
  }
}
