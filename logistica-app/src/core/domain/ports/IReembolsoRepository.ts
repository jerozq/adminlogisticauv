import type { Reembolso } from '@/src/core/domain/entities/Reembolso'

// ============================================================
// Puerto de dominio: IReembolsoRepository
//
// Define el contrato de persistencia para los Reembolsos.
// Cuando el usuario ajusta manualmente un reembolso generado
// automáticamente (p. ej. corrige el valor, agrega celular)
// la capa de aplicación usa este puerto para guardarlo.
//
// La implementación concreta vive en src/infrastructure/adapters/
// y puede apoyarse en Supabase, una BD local, o un repositorio
// en memoria para pruebas.
// ============================================================

export interface IReembolsoRepository {
  /**
   * Devuelve todos los reembolsos asociados a una actividad.
   * Si no hay registros persistidos, retorna arreglo vacío.
   */
  listarPorActividad(actividadId: string): Promise<Reembolso[]>

  /**
   * Persiste un reembolso nuevo.
   * Si ya existe uno con el mismo id, lanza un error.
   */
  guardar(reembolso: Reembolso): Promise<Reembolso>

  /**
   * Actualiza un reembolso existente (modificación manual).
   * Si el reembolso no existe, lanza un error.
   */
  actualizar(reembolso: Reembolso): Promise<Reembolso>

  /**
   * Elimina un reembolso por su id.
   * Si no existe, la operación es idempotente (no lanza error).
   */
  eliminar(id: string): Promise<void>
}
