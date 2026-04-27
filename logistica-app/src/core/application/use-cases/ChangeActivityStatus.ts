import type { IActivityRepository } from '@/src/core/domain/ports/IActivityRepository'
import type { EstadoActividad } from '@/src/types/domain'
import { getTracer, withSpan } from '@/src/infrastructure/observability/tracer'

// ============================================================
// Caso de Uso: ChangeActivityStatus
//
// Orquesta el cambio de estado de una Actividad aplicando:
//   1. Carga de la entidad desde el repositorio.
//   2. Validación de la transición en el dominio (Actividad.transicionarA).
//   3. Persistencia del nuevo estado + motivo.
//
// Cada paso se instrumenta con un Span de OpenTelemetry.
// Los errores se registran como eventos dentro del trace padre.
// ============================================================

export interface ChangeActivityStatusInput {
  /** ID de la actividad cuyo estado se desea cambiar. */
  actividadId: string
  /** Estado destino. Debe ser una transición válida según el dominio. */
  nuevoEstado: EstadoActividad
  /** Motivo del cambio (requerido para aplazar/cancelar). Opcional para otros. */
  motivo?: string
  /**
   * Identificador del usuario que solicita el cambio.
   * Se registra en el span de OTel para auditoría y correlación de trazas.
   * Cuando no hay autenticación activa usar 'anonymous'.
   */
  userId?: string
}

export interface ChangeActivityStatusOutput {
  actividadId: string
  estadoAnterior: EstadoActividad
  estadoNuevo: EstadoActividad
}

// Tracer con scope propio del caso de uso.
const tracer = getTracer('use-case.ChangeActivityStatus')

export class ChangeActivityStatus {
  constructor(private readonly repo: IActivityRepository) {}

  /**
   * Ejecuta el caso de uso.
   *
   * @throws {Error} Si la actividad no existe.
   * @throws {Error} Si la transición de estado es inválida en el dominio.
   */
  async execute(input: ChangeActivityStatusInput): Promise<ChangeActivityStatusOutput> {
    return withSpan(
      tracer,
      'ChangeActivityStatus.execute',
      async (span) => {
        // Atributos iniciales del span raíz del caso de uso.
        span.setAttributes({
          'actividad.id':          input.actividadId,
          'actividad.nuevoEstado': input.nuevoEstado,
          'actividad.tieneMotivo': String(input.motivo !== undefined),
          'enduser.id':            input.userId ?? 'anonymous',
        })

        // ── Paso 1: Cargar entidad ──────────────────────────────
        const actividad = await withSpan(
          tracer,
          'ChangeActivityStatus.cargarActividad',
          async (loadSpan) => {
            loadSpan.setAttributes({ 'actividad.id': input.actividadId })
            const found = await this.repo.obtenerPorId(input.actividadId)
            if (!found) {
              throw new Error(
                `Actividad '${input.actividadId}' no encontrada.`
              )
            }
            loadSpan.setAttributes({ 'actividad.estadoActual': found.estado })
            return found
          }
        )

        const estadoAnterior = actividad.estado

        // ── Paso 2: Validar transición en el dominio ────────────
        // transicionarA() lanza un Error descriptivo si la transición
        // no está permitida por la máquina de estados.
        actividad.transicionarA(input.nuevoEstado)

        // ── Paso 3: Persistir ───────────────────────────────────
        await withSpan(
          tracer,
          'ChangeActivityStatus.persistir',
          async (persistSpan) => {
            persistSpan.setAttributes({
              'actividad.id':          input.actividadId,
              'actividad.estadoNuevo': input.nuevoEstado,
            })
            await this.repo.cambiarEstado(
              input.actividadId,
              input.nuevoEstado,
              input.motivo
            )
          }
        )

        // ── Evento de éxito en el span raíz ────────────────────
        span.addEvent('actividad.estado.cambiado', {
          'actividad.estadoAnterior': estadoAnterior,
          'actividad.estadoNuevo':    input.nuevoEstado,
          ...(input.motivo ? { 'actividad.motivo': input.motivo } : {}),
        })

        return {
          actividadId:    input.actividadId,
          estadoAnterior,
          estadoNuevo:    input.nuevoEstado,
        }
      },
      {
        attributes: {
          // Atributos de convención semántica para "business transactions"
          'usecase.name': 'ChangeActivityStatus',
        },
      }
    )
  }
}
