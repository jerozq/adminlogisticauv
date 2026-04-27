export type TarifarioItem = {
  id: string
  codigo_item: string
  categoria: string
  descripcion: string
  unidad_medida: string
  precio_venta: number
  activo: boolean
  es_personalizado: boolean
  notas: string | null
  created_at: string
}

export type TarifarioHistorial = {
  id: string
  tarifario_id: string
  precio_anterior: number
  precio_nuevo: number
  usuario: string
  motivo: string | null
  cambiado_en: string
}

export const CATEGORIAS_TARIFARIO = [
  'Alimentación',
  'Logística',
  'Transporte',
  'Alojamiento',
  'Personal',
  'Otro',
] as const

export type CategoriaTarifario = (typeof CATEGORIAS_TARIFARIO)[number]
