// ============================================================
// Base de errores de dominio
//
// Todos los errores que escapan del dominio (hacia aplicación
// e infraestructura) deben ser subclases de DomainError.
//
// Propiedades garantizadas:
//   - errorCode: cadena estable (INVALID_STATE, INSUFFICIENT_FUNDS, etc.)
//   - metadata.retryable: si el error es recuperable automáticamente
//   - metadata.details: contexto adicional para auditoría
// ============================================================

export interface DomainErrorMetadata {
  retryable?: boolean
  cause?: unknown
  details?: Record<string, unknown>
}

export abstract class DomainError extends Error {
  readonly errorCode: string
  readonly metadata: DomainErrorMetadata

  protected constructor(
    message: string,
    errorCode: string,
    metadata: DomainErrorMetadata = {}
  ) {
    super(message)
    this.name = new.target.name
    this.errorCode = errorCode
    this.metadata = metadata
    Object.setPrototypeOf(this, new.target.prototype)
  }

  /**
   * Serializa el error para logging estructurado.
   * Subclases deben extender this si necesitan agregar campos.
   */
  toLog(): Record<string, unknown> {
    return {
      name: this.name,
      errorCode: this.errorCode,
      message: this.message,
      retryable: this.metadata.retryable ?? false,
      details: this.metadata.details ?? {},
    }
  }
}
