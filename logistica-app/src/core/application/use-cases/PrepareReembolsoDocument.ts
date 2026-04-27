import type { IReembolsoRepository } from '@/src/core/domain/ports/IReembolsoRepository'
import { Reembolso, type ReembolsoProps } from '@/src/core/domain/entities/Reembolso'
import { getTracer, withSpan } from '@/src/infrastructure/observability/tracer'

// ============================================================
// Caso de Uso: PrepareReembolsoDocument
//
// Permite editar los datos de un reembolso específico antes de
// exportarlo a PDF. Soporta dos modos de operación:
//
//   - Alta manual:    El reembolso aún no está en el repositorio
//     (fue auto-generado en memoria). Se guarda por primera vez.
//   - Edición:        El reembolso ya fue guardado previamente.
//     Se actualiza con los nuevos datos.
//
// La elección del modo se realiza automáticamente consultando
// el repositorio por el ID del reembolso antes de operar.
//
// Validaciones de dominio:
//   - El constructor de Reembolso valida valor > 0, nombre y
//     documento no vacíos. Si alguna falla, el caso de uso
//     propaga la excepción sin persistir nada.
//
// OTel: emite un span raíz con la operación realizada (alta | edicion)
// y un evento de auditoría con los campos modificados.
// ============================================================

export interface PrepareReembolsoDocumentInput {
  /**
   * Props completas del reembolso con los valores deseados.
   * Se construye una entidad Reembolso a partir de estos datos
   * (el dominio valida invariantes antes de persistir).
   */
  reembolso: ReembolsoProps
  /**
   * Identificador del usuario que edita el documento.
   * Se registra en el span de OTel para auditoría.
   */
  userId?: string
}

export interface PrepareReembolsoDocumentOutput {
  /** La entidad Reembolso tal como quedó guardada. */
  reembolso: Reembolso
  /** Indica si el reembolso fue creado por primera vez o actualizado. */
  operacion: 'alta' | 'edicion'
}

const tracer = getTracer('use-case.PrepareReembolsoDocument')

export class PrepareReembolsoDocument {
  constructor(private readonly reembolsoRepo: IReembolsoRepository) {}

  /**
   * Ejecuta el caso de uso.
   *
   * @throws {Error} Si los datos del reembolso violan invariantes de dominio
   *   (valor ≤ 0, personaNombre o documento vacíos).
   */
  async execute(
    input: PrepareReembolsoDocumentInput,
  ): Promise<PrepareReembolsoDocumentOutput> {
    return withSpan(
      tracer,
      'PrepareReembolsoDocument.execute',
      async (span) => {
        span.setAttributes({
          'reembolso.id':         input.reembolso.id,
          'reembolso.actividadId': input.reembolso.actividadId,
          'reembolso.tipo':        input.reembolso.tipo,
          'enduser.id':            input.userId ?? 'anonymous',
        })

        // ── Paso 1: Construir entidad (valida invariantes) ──────
        // Si los datos son inválidos el constructor lanza antes de
        // tocar el repositorio.
        const entidad = new Reembolso(input.reembolso)

        // ── Paso 2: Detectar si el reembolso ya existe ──────────
        const existentes = await withSpan(
          tracer,
          'PrepareReembolsoDocument.verificarExistencia',
          async (checkSpan) => {
            const lista = await this.reembolsoRepo.listarPorActividad(
              input.reembolso.actividadId,
            )
            const yaExiste = lista.some((r) => r.id === input.reembolso.id)
            checkSpan.setAttributes({
              'reembolso.yaExistia': yaExiste,
              'reembolso.totalEnActividad': lista.length,
            })
            return yaExiste
          },
        )

        // ── Paso 3: Guardar o actualizar ─────────────────────────
        const operacion: 'alta' | 'edicion' = existentes ? 'edicion' : 'alta'

        const guardado = await withSpan(
          tracer,
          `PrepareReembolsoDocument.${operacion}`,
          async (persistSpan) => {
            persistSpan.setAttributes({
              'reembolso.id':    entidad.id,
              'reembolso.valor': entidad.valor,
              'reembolso.tipo':  entidad.tipo,
            })

            if (operacion === 'alta') {
              return this.reembolsoRepo.guardar(entidad)
            } else {
              return this.reembolsoRepo.actualizar(entidad)
            }
          },
        )

        // ── Span raíz: evento de auditoría ───────────────────────
        span.setAttributes({ 'reembolso.operacion': operacion })

        span.addEvent('logistica.reembolso.preparado', {
          reembolsoId:    guardado.id,
          actividadId:    guardado.actividadId,
          tipo:           guardado.tipo,
          operacion,
          personaNombre:  guardado.personaNombre,
          documento:      guardado.documento,
          rutaOrigen:     guardado.rutaOrigen,
          rutaDestino:    guardado.rutaDestino,
          valor:          guardado.valor,
          valorEnLetras:  guardado.valorEnLetras(),
        })

        return { reembolso: guardado, operacion }
      },
    )
  }
}
