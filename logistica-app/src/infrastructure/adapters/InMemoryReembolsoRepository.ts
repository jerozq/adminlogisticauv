import { Reembolso } from '@/src/core/domain/entities/Reembolso'
import type { IReembolsoRepository } from '@/src/core/domain/ports/IReembolsoRepository'

// ============================================================
// InMemoryReembolsoRepository
//
// Implementación transitoria de IReembolsoRepository que persiste
// los reembolsos editados manualmente en un Map de proceso.
//
// Alcance: los datos sobreviven entre requests dentro del mismo
// proceso Node.js, pero se pierden al reiniciar el servidor.
// Reemplazar por SupabaseReembolsoRepository cuando se agregue
// la tabla `reembolsos_manuales` a la base de datos.
// ============================================================

// Mapa compartido entre todas las instancias del módulo
const _store = new Map<string, Reembolso>()

export class InMemoryReembolsoRepository implements IReembolsoRepository {
  async listarPorActividad(actividadId: string): Promise<Reembolso[]> {
    return [..._store.values()].filter((r) => r.actividadId === actividadId)
  }

  async guardar(reembolso: Reembolso): Promise<Reembolso> {
    if (_store.has(reembolso.id)) {
      throw new Error(
        `Reembolso '${reembolso.id}' ya existe. Usa actualizar() para modificarlo.`,
      )
    }
    _store.set(reembolso.id, reembolso)
    return reembolso
  }

  async actualizar(reembolso: Reembolso): Promise<Reembolso> {
    if (!_store.has(reembolso.id)) {
      throw new Error(
        `Reembolso '${reembolso.id}' no encontrado en el repositorio.`,
      )
    }
    _store.set(reembolso.id, reembolso)
    return reembolso
  }

  async eliminar(id: string): Promise<void> {
    _store.delete(id)
  }
}

// ---------------------------------------------------------------
// Singleton de proceso
// ---------------------------------------------------------------

let _instance: InMemoryReembolsoRepository | null = null

export function getInMemoryReembolsoRepository(): InMemoryReembolsoRepository {
  if (!_instance) _instance = new InMemoryReembolsoRepository()
  return _instance
}
