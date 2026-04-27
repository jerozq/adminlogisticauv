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
      'id, numero_requerimiento, nombre_actividad, municipio, departamento, fecha_inicio, fecha_fin, hora_inicio, responsable_nombre'
    )
    .eq('id', requerimientoId)
    .single()

  if (errReq || !req) throw new Error('Requerimiento no encontrado')

  // 2. Cotización más reciente / aprobada
  const { data: cots } = await sb
    .from('cotizaciones')
    .select('id, version, subtotal_servicios, total_reembolsos, total_general, estado, created_at')
    .eq('requerimiento_id', requerimientoId)
    .order('version', { ascending: false })
    .limit(5)

  const cotizacion =
    cots?.find((c) => c.estado === 'aprobada') ??
    cots?.[0] ??
    null

  // 3. Ítems (si hay cotización)
  const items: DatosExportacion['items'] = []
  if (cotizacion) {
    const { data: dbItems } = await sb
      .from('cotizacion_items')
      .select(
        'id, descripcion, categoria, unidad_medida, cantidad, precio_unitario, precio_total, es_passthrough, excluir_de_finanzas, ocultar_en_cotizacion'
      )
      .eq('cotizacion_id', cotizacion.id)
      .order('categoria')
      .order('descripcion')

    for (const i of dbItems ?? []) {
      items.push({
        id: i.id,
        descripcion: i.descripcion,
        categoria: i.categoria,
        unidad_medida: i.unidad_medida,
        cantidad: Number(i.cantidad),
        precio_unitario: Number(i.precio_unitario),
        precio_total: Number(i.precio_total),
        es_passthrough: i.es_passthrough,
        excluir_de_finanzas: i.excluir_de_finanzas,
        ocultar_en_cotizacion: i.ocultar_en_cotizacion,
      })
    }
  }

  // 4. Reembolsos
  const reembolsos: DatosExportacion['reembolsos'] = []
  if (cotizacion) {
    const { data: dbReem } = await sb
      .from('reembolsos_detalle')
      .select(
        'id, nombre_beneficiario, valor_transporte, valor_alojamiento, valor_alimentacion, valor_otros, total_reembolso'
      )
      .eq('cotizacion_id', cotizacion.id)

    for (const r of dbReem ?? []) {
      reembolsos.push({
        id: r.id,
        nombre_beneficiario: r.nombre_beneficiario,
        valor_transporte: Number(r.valor_transporte),
        valor_alojamiento: Number(r.valor_alojamiento),
        valor_alimentacion: Number(r.valor_alimentacion),
        valor_otros: Number(r.valor_otros),
        total_reembolso: Number(r.total_reembolso),
      })
    }
  }

  return {
    requerimiento: {
      id: req.id,
      numero_requerimiento: req.numero_requerimiento,
      nombre_actividad: req.nombre_actividad,
      municipio: req.municipio,
      departamento: req.departamento,
      fecha_inicio: req.fecha_inicio,
      fecha_fin: req.fecha_fin,
      hora_inicio: req.hora_inicio,
      responsable_nombre: req.responsable_nombre,
    },
    cotizacion,
    items,
    reembolsos,
  }
}
