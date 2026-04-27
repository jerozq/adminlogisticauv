import type { Actividad } from '@/src/core/domain/entities/Actividad'
import type {
  ActividadResumen,
  ConfiguracionParticipaciones,
  CostoReal,
  EntregaHito,
  EstadoActividad,
  NuevoCosto,
  NuevaEntrega,
  NuevaParticipacion,
} from '@/src/types/domain'
import type { SocioParticipacion } from '@/src/core/domain/value-objects/SocioParticipacion'

// ============================================================
// Puerto de dominio: IActivityRepository
//
// Define el contrato de persistencia para Actividades y sus
// datos asociados (costos reales y entregas/hitos).
//
// Las implementaciones concretas (adaptadores) viven en
// src/infrastructure/adapters/ y pueden apoyarse en Supabase,
// una BD local, o un repositorio en memoria para pruebas.
// ============================================================

export interface IActivityRepository {
  // ---------------------------------------------------------------
  // Actividades
  // ---------------------------------------------------------------

  /** Devuelve todas las actividades en los estados dados (por defecto todos). */
  listarResumenes(estados?: EstadoActividad[]): Promise<ActividadResumen[]>

  /** Devuelve la entidad completa con ítems, costos y entregas. */
  obtenerPorId(id: string): Promise<Actividad | null>

  /** Devuelve los datos crudos del requerimiento (para campos adicionales como cronograma_ia) */
  obtenerRequerimientoRaw(id: string): Promise<Record<string, unknown> | null>

  /**
   * Persiste el nuevo estado de la actividad y registra el motivo
   * en el historial de transiciones.
   */
  cambiarEstado(
    id: string,
    nuevoEstado: EstadoActividad,
    motivo?: string
  ): Promise<void>

  // ---------------------------------------------------------------
  // Costos reales
  // ---------------------------------------------------------------

  /** Lista todos los costos asociados a una actividad. */
  listarCostos(actividadId: string): Promise<CostoReal[]>

  /** Registra un nuevo costo operativo. Retorna el costo creado. */
  agregarCosto(actividadId: string, costo: NuevoCosto): Promise<CostoReal>

  /** Elimina un costo por su ID. */
  eliminarCosto(costoId: string): Promise<void>

  // ---------------------------------------------------------------
  // Entregas / Hitos del cronograma
  // ---------------------------------------------------------------

  /** Lista todos los hitos de cronograma de una actividad. */
  listarEntregas(actividadId: string): Promise<EntregaHito[]>

  /** Crea un nuevo hito de entrega. Retorna el hito creado. */
  agregarEntrega(actividadId: string, entrega: NuevaEntrega): Promise<EntregaHito>

  /** Marca un hito como listo o pendiente. */
  actualizarEstadoEntrega(
    entregaId: string,
    estado: EntregaHito['estado'],
    evidenciaUrl?: string
  ): Promise<void>

  /** Elimina un hito del cronograma. */
  eliminarEntrega(entregaId: string): Promise<void>

  // ---------------------------------------------------------------
  // Participaciones de socios
  // ---------------------------------------------------------------

  /** Lista los socios y sus porcentajes para una actividad. */
  listarParticipaciones(actividadId: string): Promise<SocioParticipacion[]>

  /**
   * Reemplaza en bloque la configuración de participaciones de una actividad.
   * Borra las existentes e inserta las nuevas en una transacción atómica.
   *
   * @throws {Error} Si la suma de porcentajes no es exactamente 100 %.
   */
  redefinirParticipaciones(config: ConfiguracionParticipaciones): Promise<SocioParticipacion[]>

  /** Actualiza el montoAportado de un socio sin cambiar el porcentaje. */
  actualizarAporteSocio(
    actividadId: string,
    socioId: string,
    nuevoMonto: number
  ): Promise<SocioParticipacion>
}
