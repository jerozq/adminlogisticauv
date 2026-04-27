import { NodeSDK } from '@opentelemetry/sdk-node'
import { ConsoleSpanExporter } from '@opentelemetry/sdk-trace-base'
import { resourceFromAttributes } from '@opentelemetry/resources'
import {
  trace,
  SpanStatusCode,
  SpanKind,
  type Tracer,
  type Span,
  type Attributes,
} from '@opentelemetry/api'

// ============================================================
// Observabilidad — OpenTelemetry
//
// Estrategia de exportación:
//   - Desarrollo  → ConsoleSpanExporter (stdout legible)
//   - Producción  → Configurar vía env vars estándar de OTel:
//       OTEL_EXPORTER_OTLP_ENDPOINT, OTEL_EXPORTER_OTLP_HEADERS
//     El SDK los recoge automáticamente si se usa un exporter OTLP.
// ============================================================

const SERVICE_NAME    = process.env.OTEL_SERVICE_NAME    ?? 'logistica-uv'
const SERVICE_VERSION = process.env.OTEL_SERVICE_VERSION ?? '0.1.0'

let _sdk: NodeSDK | null = null

// ---------------------------------------------------------------
// initSDK
// ---------------------------------------------------------------

/**
 * Inicializa el SDK de OpenTelemetry una sola vez por proceso.
 * Llamar desde `instrumentation.ts` (hook de Next.js).
 *
 * Es idempotente: llamadas subsecuentes no hacen nada.
 */
export function initSDK(): void {
  if (_sdk) return

  _sdk = new NodeSDK({
    resource: resourceFromAttributes({
      'service.name':    SERVICE_NAME,
      'service.version': SERVICE_VERSION,
    }),
    // En producción reemplaza ConsoleSpanExporter por un exporter OTLP.
    traceExporter: new ConsoleSpanExporter(),
  })

  _sdk.start()

  // Apagado limpio: espera que todos los spans se exporten antes de salir.
  process.on('SIGTERM', () => {
    _sdk?.shutdown().catch(console.error)
  })
}

// ---------------------------------------------------------------
// getTracer
// ---------------------------------------------------------------

/**
 * Devuelve un Tracer para el scope indicado.
 *
 * Convención de nombres:
 *   - Casos de uso:    `use-case.<NombreDelCasoDeUso>`
 *   - Adaptadores:     `adapter.<NombreDelAdaptador>`
 *   - Infraestructura: `infra.<modulo>`
 *
 * @param scope - Nombre del módulo que crea el tracer.
 */
export function getTracer(scope: string): Tracer {
  return trace.getTracer(scope, SERVICE_VERSION)
}

// ---------------------------------------------------------------
// withSpan — helper de instrumentación manual
// ---------------------------------------------------------------

export interface SpanOptions {
  /** Atributos iniciales del span (key-value). */
  attributes?: Attributes
  /** Tipo de span. Por defecto INTERNAL. */
  kind?: SpanKind
}

/**
 * Ejecuta `fn` dentro de un span activo.
 *
 * - Si `fn` resuelve: el span termina con status OK.
 * - Si `fn` lanza: el span registra la excepción como evento,
 *   establece el status ERROR y re-lanza el error original.
 *
 * El span siempre se cierra en el bloque `finally`.
 *
 * @example
 * ```ts
 * const result = await withSpan(tracer, 'MiOperacion', async (span) => {
 *   span.setAttributes({ 'item.id': id })
 *   return await repo.obtener(id)
 * })
 * ```
 */
export async function withSpan<T>(
  tracer: Tracer,
  operationName: string,
  fn: (span: Span) => Promise<T>,
  options: SpanOptions = {}
): Promise<T> {
  return tracer.startActiveSpan(
    operationName,
    { kind: options.kind ?? SpanKind.INTERNAL, attributes: options.attributes },
    async (span: Span) => {
      try {
        const result = await fn(span)
        span.setStatus({ code: SpanStatusCode.OK })
        return result
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err))

        // recordException crea un evento "exception" con:
        //   exception.type, exception.message, exception.stacktrace
        span.recordException(error)
        span.setStatus({ code: SpanStatusCode.ERROR, message: error.message })

        throw err
      } finally {
        span.end()
      }
    }
  )
}
