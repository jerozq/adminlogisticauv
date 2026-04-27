/** Tipos de estado para actividades / requerimientos */
export type EstadoActividad = 'generado' | 'en_ejecucion' | 'liquidado' | 'aplazado' | 'cancelado'

/**
 * Transiciones de estado permitidas.
 * Espejadas en la función RPC `cambiar_estado_requerimiento` de Supabase.
 * Se usan en el cliente para filtrar el menú antes de llamar al servidor.
 */
export const TRANSICIONES_PERMITIDAS: Record<EstadoActividad, EstadoActividad[]> = {
  generado:     ['en_ejecucion', 'cancelado'],
  en_ejecucion: ['aplazado', 'liquidado', 'cancelado'],
  aplazado:     ['en_ejecucion'],
  liquidado:    [],
  cancelado:    [],
}
