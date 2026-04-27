// ============================================================
// Tipos del módulo de Ejecución y Costos Reales
// ============================================================

export type EstadoEntrega = 'pendiente' | 'listo'
/** Identificador del origen de fondos. Puede ser el ID de un socio ('pago_unidad', o IDs de Supabase) */
export type Pagador = string
export type ModoRegistroCosto = 'por_item' | 'delegado'

// ---------------------------------------------------------------
// Bitácora de entregas (hitos del cronograma)
// ---------------------------------------------------------------
export interface BitacoraEntregaRow {
  id: string
  actividad_id: string
  descripcion: string
  fecha_hora_limite: string   // ISO timestamptz
  estado: EstadoEntrega
  evidencia_url: string | null
  created_at: string
  updated_at: string
}

// ---------------------------------------------------------------
// Costos reales de operación
// ---------------------------------------------------------------
export interface EjecucionCostoRow {
  id: string
  actividad_id: string
  item_id: string | null
  descripcion: string | null
  monto: number
  pagador: Pagador
  soporte_url: string | null
  notas: string | null
  /** Modo de registro: granular por ítem o total delegado */
  modo_registro: ModoRegistroCosto
  /** Cantidad de unidades (modo por_item) */
  cantidad: number
  /** Precio por unidad (modo por_item). monto = cantidad × precio_unitario */
  precio_unitario: number | null
  /** Etiqueta de variación libre (ej: "Almuerzo ejecutivo") */
  concepto: string | null
  created_at: string
  updated_at: string
}

// Con datos del ítem cotizado (JOIN) para calcular utilidad por ítem
export interface EjecucionCostoConItem extends EjecucionCostoRow {
  cotizacion_items?: {
    descripcion: string
    precio_total: number
    categoria: string | null
  } | null
}

// ---------------------------------------------------------------
// Formularios (estado local del cliente)
// ---------------------------------------------------------------
export interface NuevaEntregaForm {
  descripcion: string
  fecha_hora_limite: string   // datetime-local string
}

export interface NuevoCostoForm {
  item_id: string | null
  descripcion: string
  monto: number
  pagador: Pagador
  soporte_url?: string
  modo_registro?: ModoRegistroCosto
  cantidad?: number
  precio_unitario?: number | null
  concepto?: string | null
}

// ---------------------------------------------------------------
// Resumen de Liquidación (calculado en cliente)
// ---------------------------------------------------------------
export interface ResumenLiquidacionData {
  ingreso_total: number
  gastos_totales: number
  pagado_jero: number
  pagado_socio: number
  pagado_caja: number
  utilidad_neta: number
  jero_recibe: number
  socio_recibe: number
}

// ---------------------------------------------------------------
// Datos de actividad para el Kanban
// ---------------------------------------------------------------
export interface ActividadKanban {
  id: string
  numero_requerimiento: string | null
  nombre_actividad: string
  municipio: string | null
  fecha_inicio: string | null
  fecha_fin: string | null
  hora_inicio: string | null
  estado: string
  total_entregas: number
  entregas_listas: number
  ingreso_cotizado: number | null
}

// ---------------------------------------------------------------
// Ítem cotizado simplificado (para dropdown de costos)
// ---------------------------------------------------------------
export interface ItemCotizado {
  id: string
  descripcion: string
  cantidad: number
  precio_unitario: number
  precio_total: number
  categoria: string | null
}

// ---------------------------------------------------------------
// Calendario Maestro (todos los cronogramas activos)
// ---------------------------------------------------------------
export interface CronogramaCalendarioItem {
  entregable_id: string | null
  fecha: string
  hora: string
  descripcion_item: string
  cantidad: number
}

export interface ActividadCalendarioMaestro {
  id: string
  nombre_actividad: string
  estado: string
  cronograma_items: CronogramaCalendarioItem[]
}
