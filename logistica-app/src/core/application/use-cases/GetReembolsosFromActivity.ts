import type { IActivityRepository } from '@/src/core/domain/ports/IActivityRepository'
import type { IReembolsoRepository } from '@/src/core/domain/ports/IReembolsoRepository'
import type { Reembolso } from '@/src/core/domain/entities/Reembolso'
import { getTracer, withSpan } from '@/src/infrastructure/observability/tracer'

// ============================================================
// Caso de Uso: GetReembolsosFromActivity
//
// Devuelve la lista definitiva de reembolsos para una actividad,
// combinando dos fuentes de datos:
//
//   1. Auto-generados: entidades derivadas de los datos del
//      requerimiento (Excel) mediante Actividad.extraerReembolsos().
//   2. Manuales: reembolsos persistidos en IReembolsoRepository
//      que el usuario editó antes de exportar.
//
// Estrategia de merge:
//   - Los reembolsos persistidos tienen precedencia sobre los
//     auto-generados cuando comparten el mismo ID.
//   - Se incluyen reembolsos persistidos que no tengan
//     contraparte auto-generada (ej. altas manuales).
//   - Se preservan los auto-generados sin edición manual.
//
// OTel: emite un span raíz con el total de reembolsos por fuente.
// ============================================================

export interface GetReembolsosFromActivityInput {
  /** ID de la actividad de la cual extraer los reembolsos. */
  actividadId: string
  /**
   * Identificador del usuario que solicita la operación.
   * Se registra en el span de OTel para auditoría.
   */
  userId?: string
}

export interface GetReembolsosFromActivityOutput {
  /** Lista definitiva de reembolsos (manuales tienen precedencia). */
  reembolsos: Reembolso[]
  /** Cuántos reembolsos se obtuvieron automáticamente del requerimiento. */
  totalAutoGenerados: number
  /** Cuántos reembolsos provienen de ediciones manuales persistidas. */
  totalManuales: number
}

const tracer = getTracer('use-case.GetReembolsosFromActivity')

export class GetReembolsosFromActivity {
  constructor(
    private readonly actividadRepo: IActivityRepository,
    private readonly reembolsoRepo: IReembolsoRepository,
  ) {}

  /**
   * Ejecuta el caso de uso.
   *
   * @throws {Error} Si la actividad no existe.
   */
  async execute(
    input: GetReembolsosFromActivityInput,
  ): Promise<GetReembolsosFromActivityOutput> {
    return withSpan(
      tracer,
      'GetReembolsosFromActivity.execute',
      async (span) => {
        span.setAttributes({
          'actividad.id': input.actividadId,
          'enduser.id':   input.userId ?? 'anonymous',
        })

        // ── Paso 1: Cargar la entidad Actividad ─────────────────
        const actividad = await withSpan(
          tracer,
          'GetReembolsosFromActivity.cargarActividad',
          async (loadSpan) => {
            loadSpan.setAttributes({ 'actividad.id': input.actividadId })
            const found = await this.actividadRepo.obtenerPorId(input.actividadId)
            if (!found) {
              throw new Error(
                `Actividad '${input.actividadId}' no encontrada.`,
              )
            }
            loadSpan.setAttributes({
              'actividad.nombre':                 found.nombreActividad,
              'actividad.reembolsosBeneficiarios': found.reembolsosRequerimiento.length,
            })
            return found
          },
        )

        // ── Paso 2: Extraer reembolsos auto-generados ───────────
        const autoGenerados: Reembolso[] = await withSpan(
          tracer,
          'GetReembolsosFromActivity.extraerReembolsos',
          async (extractSpan) => {
            const lista = actividad.extraerReembolsos()
            extractSpan.setAttributes({
              'reembolsos.autoGenerados': lista.length,
              'reembolsos.tiposDistintos': [
                ...new Set(lista.map((r) => r.tipo)),
              ].join(','),
            })
            return lista
          },
        )

        // ── Paso 3: Cargar reembolsos editados manualmente ──────
        const manuales: Reembolso[] = await withSpan(
          tracer,
          'GetReembolsosFromActivity.cargarManuales',
          async (manualSpan) => {
            const lista = await this.reembolsoRepo.listarPorActividad(
              input.actividadId,
            )
            manualSpan.setAttributes({ 'reembolsos.manuales': lista.length })
            return lista
          },
        )

        // ── Paso 4: Merge (manuales tienen precedencia por ID) ──
        const manualesById = new Map(manuales.map((r) => [r.id, r]))

        const mergeados: Reembolso[] = autoGenerados.map((auto) =>
          manualesById.has(auto.id) ? manualesById.get(auto.id)! : auto,
        )

        // Incluir manuales sin contraparte auto-generada (altas manuales)
        const idsAutoGenerados = new Set(autoGenerados.map((r) => r.id))
        for (const manual of manuales) {
          if (!idsAutoGenerados.has(manual.id)) {
            mergeados.push(manual)
          }
        }

        // ── Span raíz: atributos de resultado ───────────────────
        span.setAttributes({
          'reembolsos.total':         mergeados.length,
          'reembolsos.autoGenerados': autoGenerados.length,
          'reembolsos.manuales':      manuales.length,
        })

        span.addEvent('logistica.reembolsos.extraidos', {
          actividadId:               input.actividadId,
          totalAutoGenerados:        autoGenerados.length,
          totalManuales:             manuales.length,
          totalFinal:                mergeados.length,
          tiposPresentes: [...new Set(mergeados.map((r) => r.tipo))].join(','),
        })

        return {
          reembolsos:         mergeados,
          totalAutoGenerados: autoGenerados.length,
          totalManuales:      manuales.length,
        }
      },
    )
  }
}
