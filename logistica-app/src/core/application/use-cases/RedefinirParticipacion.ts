import type { IActivityRepository } from '@/src/core/domain/ports/IActivityRepository'
import type { ConfiguracionParticipaciones, NuevaParticipacion } from '@/src/types/domain'
import type { SocioParticipacion } from '@/src/core/domain/value-objects/SocioParticipacion'
import { getTracer, withSpan } from '@/src/infrastructure/observability/tracer'

// ============================================================
// Caso de Uso: RedefinirParticipacion
//
// Permite reemplazar en bloque la configuración de socios de
// una actividad. Emite el evento OTel logistica.participacion.redefinida
// con la configuración anterior y la nueva, para auditoría.
//
// Reglas de dominio:
//  - La suma de porcentajes debe ser exactamente 100 % (±0.01 tolerancia).
//  - No puede haber dos socios con el mismo socioId.
//  - Las validaciones se aplican en el repositorio (y también en el VO).
// ============================================================

export interface RedefinirParticipacionInput {
  actividadId: string
  participaciones: NuevaParticipacion[]
  userId?: string
}

export interface RedefinirParticipacionOutput {
  actividadId: string
  participaciones: SocioParticipacion[]
}

const tracer = getTracer('use-case.RedefinirParticipacion')

export class RedefinirParticipacion {
  constructor(private readonly repo: IActivityRepository) {}

  async execute(input: RedefinirParticipacionInput): Promise<RedefinirParticipacionOutput> {
    return withSpan(
      tracer,
      'RedefinirParticipacion.execute',
      async (span) => {
        span.setAttributes({
          'actividad.id':         input.actividadId,
          'participacion.count':  String(input.participaciones.length),
          'enduser.id':           input.userId ?? 'anonymous',
        })

        // 1. Cargar configuración anterior (para el evento OTel)
        const anterior = await this.repo.listarParticipaciones(input.actividadId)

        // 2. Redefinir — la validación de suma y duplicados ocurre en el repositorio
        const config: ConfiguracionParticipaciones = {
          actividadId:     input.actividadId,
          participaciones: input.participaciones,
        }
        const nuevas = await this.repo.redefinirParticipaciones(config)

        // 3. Emitir evento OTel con la configuración anterior y la nueva
        span.addEvent('logistica.participacion.redefinida', {
          actividadId:         input.actividadId,
          configuracionAnterior: JSON.stringify(
            anterior.map((s) => ({
              socioId:       s.socioId,
              nombreSocio:   s.nombreSocio,
              porcentaje:    s.porcentaje,
              montoAportado: s.montoAportado,
            }))
          ),
          configuracionNueva: JSON.stringify(
            nuevas.map((s) => ({
              socioId:       s.socioId,
              nombreSocio:   s.nombreSocio,
              porcentaje:    s.porcentaje,
              montoAportado: s.montoAportado,
            }))
          ),
        })

        return {
          actividadId:     input.actividadId,
          participaciones: nuevas,
        }
      }
    )
  }
}
