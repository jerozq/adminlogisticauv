'use server'

import { getSupabase } from '@/lib/supabase'

// ============================================================
// Carga los datos necesarios para la previsualización/exportación
// Acepta el ID de un requerimiento y devuelve la cotización activa
// (aprobada > borrador, última versión).
// ============================================================

export interface DatosExportacion {
  requerimiento: {
    id: string
    numero_requerimiento: string | null
    nombre_actividad: string
    municipio: string | null
    departamento: string | null
    fecha_inicio: string | null
    fecha_fin: string | null
    hora_inicio: string | null
    hora_fin: string | null
    responsable_nombre: string | null
  }
  cotizacion: {
    id: string
    version: number
    created_at: string | null
    subtotal_servicios: number
    total_reembolsos: number
    total_general: number
  } | null
  items: {
    id: string
    descripcion: string
    categoria: string | null
    unidad_medida: string | null
    cantidad: number
    precio_unitario: number
    precio_total: number
    es_passthrough: boolean
    excluir_de_finanzas: boolean
    ocultar_en_cotizacion: boolean
  }[]
  reembolsos: {
    id: string
    nombre_beneficiario: string
    valor_transporte: number
    valor_alojamiento: number
    valor_alimentacion: number
    valor_otros: number
    total_reembolso: number
  }[]
}

export async function cargarDatosExportacion(
  requerimientoId: string
): Promise<DatosExportacion> {
  const sb = getSupabase()

  // 1. Requerimiento
  const { data: req, error: errReq } = await sb
    .from('requerimientos')
    .select(
      'id, numero_requerimiento, nombre_actividad, municipio, departamento, fecha_inicio, fecha_fin, hora_inicio, hora_fin, responsable_nombre, created_at'
    )
    .eq('id', requerimientoId)
    .single()

  if (errReq || !req) throw new Error('Requerimiento no encontrado')

  // 2. Ítems de servicio desde items_requerimiento
  const { data: dbItems } = await sb
    .from('items_requerimiento')
    .select('id, descripcion, categoria, unidad_medida, cantidad, precio_unitario, precio_total, tipo, estado')
    .eq('requerimiento_id', requerimientoId)
    .in('tipo', ['SERVICIO', 'PASIVO_TERCERO'])
    .neq('estado', 'CANCELADO')
    .order('categoria')
    .order('descripcion')

  const items: DatosExportacion['items'] = (dbItems ?? []).map(i => ({
    id:                   i.id,
    descripcion:          i.descripcion,
    categoria:            i.categoria,
    unidad_medida:        i.unidad_medida,
    cantidad:             Number(i.cantidad),
    precio_unitario:      Number(i.precio_unitario),
    precio_total:         Number(i.precio_total),
    es_passthrough:       i.tipo === 'PASIVO_TERCERO',
    excluir_de_finanzas:  false,
    ocultar_en_cotizacion: false,
  }))

  // 3. Reembolsos desde items_requerimiento
  const { data: dbReem } = await sb
    .from('items_requerimiento')
    .select('id, beneficiario_nombre, precio_unitario, notas')
    .eq('requerimiento_id', requerimientoId)
    .eq('tipo', 'REEMBOLSO')
    .neq('estado', 'CANCELADO')

  const reembolsos: DatosExportacion['reembolsos'] = (dbReem ?? []).map(r => ({
    id:                  r.id,
    nombre_beneficiario: r.beneficiario_nombre ?? '',
    valor_transporte:    Number(r.precio_unitario ?? 0),
    valor_alojamiento:   0,
    valor_alimentacion:  0,
    valor_otros:         0,
    total_reembolso:     Number(r.precio_unitario ?? 0),
  }))

  // 4. Cotizacion sintética para compatibilidad con la UI
  const subtotalServicios = items.reduce((s, i) => s + i.precio_total, 0)
  const totalReembolsos   = reembolsos.reduce((s, r) => s + r.total_reembolso, 0)
  const cotizacion: DatosExportacion['cotizacion'] = {
    id:                 requerimientoId,
    version:            1,
    created_at:         (req as Record<string, unknown>).created_at as string | null,
    subtotal_servicios: subtotalServicios,
    total_reembolsos:   totalReembolsos,
    total_general:      subtotalServicios + totalReembolsos,
  }

  return {
    requerimiento: {
      id:                    req.id,
      numero_requerimiento:  req.numero_requerimiento,
      nombre_actividad:      req.nombre_actividad,
      municipio:             req.municipio,
      departamento:          req.departamento,
      fecha_inicio:          req.fecha_inicio,
      fecha_fin:             req.fecha_fin,
      hora_inicio:           req.hora_inicio,
      hora_fin:              req.hora_fin,
      responsable_nombre:    req.responsable_nombre,
    },
    cotizacion,
    items,
    reembolsos,
  }
}
