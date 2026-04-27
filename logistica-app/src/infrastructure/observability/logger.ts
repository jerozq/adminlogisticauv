import pino, { type Logger } from 'pino'
import { trace, context, SpanStatusCode } from '@opentelemetry/api'

// ============================================================
// Logger estructurado — Pino + OpenTelemetry context injection
//
// Estrategia de integración:
//   - Pino emite logs JSON de bajo overhead.
//   - En cada log se inyectan trace_id y span_id del span activo
//     de OpenTelemetry, permitiendo correlacionar logs con trazas
//     en cualquier backend (Grafana Loki, Axiom, Datadog, etc.).
//   - En desarrollo, se usa el nivel 'debug' para mayor verbosidad.
//   - En producción, el nivel por defecto es 'info'.
//
// Convención de campos de correlación OTel → Log:
//   trace_id   → dd.trace_id  (compatible con Datadog / Elastic)
//   span_id    → dd.span_id
// ============================================================

const level = process.env.LOG_LEVEL ??
  (process.env.NODE_ENV === 'production' ? 'info' : 'debug')

// Base logger (singleton del proceso)
const _baseLogger: Logger = pino({
  level,
  formatters: {
    level(label) {
      // Usa "level" como string en lugar del número numérico de Pino
      return { level: label }
    },
    bindings(bindings) {
      return {
        pid:     bindings['pid'],
        host:    bindings['hostname'],
        service: process.env.OTEL_SERVICE_NAME ?? 'logistica-uv',
      }
    },
    log(object) {
      // Inyectar trace_id / span_id desde el span activo de OpenTelemetry
      const span    = trace.getSpan(context.active())
      const spanCtx = span?.spanContext()

      if (spanCtx && spanCtx.traceId !== '00000000000000000000000000000000') {
        return {
          ...object,
          'dd.trace_id': spanCtx.traceId,
          'dd.span_id':  spanCtx.spanId,
        }
      }
      return object
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    // Evitar que credenciales o PII se filtren accidentalmente en logs
    paths: ['*.password', '*.token', '*.key', '*.apiKey', '*.secret'],
    censor: '[REDACTED]',
  },
})

// ---------------------------------------------------------------
// API pública
// ---------------------------------------------------------------

/**
 * Devuelve un child logger vinculado a un módulo específico.
 * El campo `module` aparece en cada línea de log.
 *
 * @example
 * ```ts
 * const log = getLogger('ChangeActivityStatus')
 * log.info({ actividadId }, 'Estado cambiado')
 * ```
 */
export function getLogger(module: string): Logger {
  return _baseLogger.child({ module })
}

/**
 * Registra un error en el logger Y en el span de OTel activo,
 * evitando duplicar la instrumentación manualmente en cada catch.
 *
 * @param log    - Logger del módulo que llama.
 * @param error  - El error capturado.
 * @param ctx    - Contexto adicional (ej. { actividadId, operacion }).
 */
export function logAndRecordError(
  log: Logger,
  error: unknown,
  ctx: Record<string, unknown> = {}
): void {
  const err = error instanceof Error ? error : new Error(String(error))

  // 1. Log estructurado
  log.error({ err, ...ctx }, err.message)

  // 2. Registrar en el span activo (si existe)
  const span = trace.getSpan(context.active())
  if (span) {
    span.recordException(err)
    span.setStatus({ code: SpanStatusCode.ERROR, message: err.message })
  }
}

export type { Logger }
