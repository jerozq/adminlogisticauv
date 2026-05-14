import pino, { type Logger as PinoLogger } from 'pino'

// ============================================================
// Logger estructurado centralizado
//
// Modelo Lean/Startup:
//   - Pino emite logs JSON a stdout.
//   - Vercel captura stdout nativamente (sin costo).
//   - Campos mínimos garantizados: correlationId, userId, operation,
//     errorCode, metadata.
//   - Redacción automática de secretos.
// ============================================================

export type ErrorCode =
  | 'UNEXPECTED_ERROR'
  | 'VALIDATION_ERROR'
  | 'AUTH_ERROR'
  | 'DB_ERROR'
  | 'DB_CONCURRENCY_CONFLICT'
  | 'INSUFFICIENT_FUNDS'
  | 'EXTERNAL_API_ERROR'
  | 'EXTERNAL_TIMEOUT'
  | 'FALLBACK_FAILED'
  | 'QUOTA_EXCEEDED'

export interface LogContext {
  /** ID de correlación para rastrear request end-to-end. */
  correlationId: string
  /** ID del usuario autenticado o 'anonymous'. */
  userId: string
  /** Nombre de la operación (ej. 'registrarAbonoUnidad'). */
  operation: string
  /** Código de error (si aplica). */
  errorCode?: ErrorCode
  /** Ruta HTTP (ej. '/api/tesoreria/abono'). */
  route?: string
  /** Método HTTP. */
  method?: string
  /** Hash o fingerprint del payload para auditoría sin exponer PII. */
  payloadFingerprint?: string
  /** Metadata adicional para auditoría. */
  metadata?: Record<string, unknown>
}

export interface StructuredAppLogger {
  info(ctx: LogContext, message: string): void
  warn(ctx: LogContext, message: string): void
  error(ctx: LogContext, error: unknown, message?: string): void
}

const level = process.env.LOG_LEVEL ??
  (process.env.NODE_ENV === 'production' ? 'info' : 'debug')

// Base logger (singleton del proceso)
const _baseLogger: PinoLogger = pino({
  level,
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level(label) {
      return { level: label }
    },
    bindings(bindings) {
      return {
        pid: bindings.pid,
        host: bindings.hostname,
        service: process.env.OTEL_SERVICE_NAME ?? 'logistica-uv',
      }
    },
  },
  redact: {
    paths: [
      '*.password',
      '*.token',
      '*.secret',
      '*.apiKey',
      '*.authorization',
      '*.cookie',
      '*.CLOUDCONVERT_API_KEY',
      '*.JWT',
    ],
    censor: '[REDACTED]',
  },
})

// ---------------------------------------------------------------
// Helpers privados
// ---------------------------------------------------------------

function normalizeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    }
  }
  return {
    name: 'NonErrorThrown',
    message: String(error),
  }
}

function withDefaults(ctx: LogContext): LogContext {
  return {
    ...ctx,
    userId: ctx.userId || 'anonymous',
    errorCode: ctx.errorCode ?? 'UNEXPECTED_ERROR',
  }
}

function emit(
  logger: PinoLogger,
  level: 'info' | 'warn' | 'error',
  ctx: LogContext,
  message: string,
  err?: unknown,
): void {
  const finalCtx = withDefaults(ctx)

  const payload: Record<string, unknown> = {
    correlationId: finalCtx.correlationId,
    userId: finalCtx.userId,
    operation: finalCtx.operation,
    errorCode: finalCtx.errorCode,
    route: finalCtx.route,
    method: finalCtx.method,
    payloadFingerprint: finalCtx.payloadFingerprint,
    metadata: finalCtx.metadata ?? {},
  }

  if (err !== undefined) {
    payload.error = normalizeError(err)
  }

  logger[level](payload, message)
}

// ---------------------------------------------------------------
// API pública
// ---------------------------------------------------------------

/**
 * Devuelve un logger estructurado para la operación indicada.
 *
 * @example
 * ```ts
 * const log = getLogger('registrarAbonoUnidad')
 * log.info({
 *   correlationId: req.headers.get('x-correlation-id') ?? 'unknown',
 *   userId: user.id,
 *   operation: 'registrarAbonoUnidad',
 * }, 'Abono registrado exitosamente')
 * ```
 */
export function getLogger(_module: string): StructuredAppLogger {
  return {
    info(ctx, message) {
      emit(_baseLogger, 'info', ctx, message)
    },
    warn(ctx, message) {
      emit(_baseLogger, 'warn', ctx, message)
    },
    error(ctx, error, message) {
      const msg = message ?? (error instanceof Error ? error.message : 'Unexpected error')
      emit(_baseLogger, 'error', ctx, msg, error)
    },
  }
}
