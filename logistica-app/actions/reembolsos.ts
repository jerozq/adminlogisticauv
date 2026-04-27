'use server'

import { revalidatePath } from 'next/cache'
import {
  makeGetReembolsosFromActivity,
  makePrepareReembolsoDocument,
  getInMemoryReembolsoRepository,
} from '@/src/infrastructure/container'
import { Reembolso } from '@/src/core/domain/entities/Reembolso'
import type { ReembolsoProps } from '@/src/core/domain/entities/Reembolso'

// ============================================================
// Server Actions — Módulo de Reembolsos
// ============================================================

/**
 * Devuelve la lista de reembolsos de una actividad combinando
 * los auto-generados del requerimiento y los editados manualmente.
 *
 * Retorna datos serializables (plain objects) aptos para ser
 * pasados como props a Client Components.
 */
export async function obtenerReembolsos(actividadId: string): Promise<{
  reembolsos: ReembolsoProps[]
  totalAutoGenerados: number
  totalManuales: number
}> {
  const uc = makeGetReembolsosFromActivity()
  const result = await uc.execute({ actividadId })

  return {
    reembolsos:         result.reembolsos.map((r) => r.toProps()),
    totalAutoGenerados: result.totalAutoGenerados,
    totalManuales:      result.totalManuales,
  }
}

/**
 * Guarda o actualiza los datos editados de un reembolso antes
 * de la exportación a PDF.
 *
 * Retorna el reembolso persistido como plain object y la
 * operación realizada ('alta' | 'edicion').
 */
export async function guardarReembolso(props: ReembolsoProps): Promise<{
  reembolso: ReembolsoProps
  operacion: 'alta' | 'edicion'
}> {
  const uc = makePrepareReembolsoDocument()
  const result = await uc.execute({ reembolso: props })

  return {
    reembolso:  result.reembolso.toProps(),
    operacion:  result.operacion,
  }
}

/**
 * Crea un nuevo formato de reembolso manual (no auto-generado).
 * Genera un ID único y persiste en el repositorio de reembolsos.
 */
export async function crearReembolso(
  props: Omit<ReembolsoProps, 'id'>,
): Promise<{ reembolso: ReembolsoProps }> {
  const id = crypto.randomUUID()
  const reembolso = new Reembolso({ ...props, id })
  const repo = getInMemoryReembolsoRepository()
  const saved = await repo.guardar(reembolso)
  revalidatePath(`/ejecucion/${props.actividadId}`)
  return { reembolso: saved.toProps() }
}

/**
 * Elimina un formato de reembolso por su ID.
 * No lanza error si el ID no existe (idempotente).
 */
export async function eliminarReembolso(
  id: string,
  actividadId: string,
): Promise<void> {
  const repo = getInMemoryReembolsoRepository()
  await repo.eliminar(id)
  revalidatePath(`/ejecucion/${actividadId}`)
}
