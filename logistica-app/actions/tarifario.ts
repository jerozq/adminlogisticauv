'use server'

import { getSupabase } from '@/lib/supabase'
import { revalidatePath } from 'next/cache'
import type { TarifarioItem, TarifarioHistorial, CategoriaTarifario } from '@/types/tarifario'
import { SupabaseTarifarioRepository } from '@/src/infrastructure/adapters/SupabaseTarifarioRepository'
import type { TarifarioPage, TarifarioPageParams } from '@/src/core/domain/ports/ITarifarioRepository'

const repo = new SupabaseTarifarioRepository()

export async function listarTarifario(
  params: TarifarioPageParams = { page: 1, pageSize: 25 }
): Promise<TarifarioPage> {
  return repo.listar(params)
}

export async function buscarSugerenciasTarifario(query: string): Promise<TarifarioItem[]> {
  return repo.buscarSugerencias(query)
}

export async function actualizarPrecioTarifario(
  itemId: string,
  nuevoPrecio: number,
  usuario: string = 'Jero',
  motivo?: string
): Promise<{ ok: boolean; historial?: TarifarioHistorial; error?: string }> {
  const supabase = getSupabase()
  const { data, error } = await supabase.rpc('actualizar_precio_tarifario', {
    p_tarifario_id: itemId,
    p_precio_nuevo: nuevoPrecio,
    p_usuario: usuario,
    p_motivo: motivo ?? null,
  })
  if (error) return { ok: false, error: error.message }
  revalidatePath('/tarifario')
  return { ok: true, historial: data as TarifarioHistorial }
}

export async function agregarItemPersonalizado(params: {
  descripcion: string
  categoria: CategoriaTarifario
  unidad_medida: string
  precio_venta: number
  notas?: string
}): Promise<{ ok: boolean; item?: TarifarioItem; error?: string }> {
  const supabase = getSupabase()
  const prefixMap: Record<string, string> = {
    'Alimentación': 'ALI',
    'Logística': 'LOG',
    'Transporte': 'TRA',
    'Alojamiento': 'ALO',
    'Personal': 'PER',
  }
  const prefix = prefixMap[params.categoria] ?? 'OTR'
  const { data: existing } = await supabase
    .from('tarifario_2026')
    .select('codigo_item')
    .like('codigo_item', prefix + '-%')
    .order('codigo_item', { ascending: false })
    .limit(1)
  let nextNum = 1
  if (existing && existing.length > 0) {
    const lastCode = existing[0].codigo_item as string
    const parts = lastCode.split('-')
    const lastNum = parseInt(parts[parts.length - 1], 10)
    if (!isNaN(lastNum)) nextNum = lastNum + 1
  }
  const codigo_item = prefix + '-' + String(nextNum).padStart(3, '0')
  const { data, error } = await supabase
    .from('tarifario_2026')
    .insert({
      codigo_item,
      categoria: params.categoria,
      descripcion: params.descripcion,
      unidad_medida: params.unidad_medida,
      precio_venta: params.precio_venta,
      es_personalizado: true,
      notas: params.notas ?? null,
    })
    .select()
    .single()
  if (error) return { ok: false, error: error.message }
  revalidatePath('/tarifario')
  return { ok: true, item: data as TarifarioItem }
}

export async function listarHistorialItem(
  itemId: string
): Promise<TarifarioHistorial[]> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('tarifario_historial_precios')
    .select('*')
    .eq('tarifario_id', itemId)
    .order('cambiado_en', { ascending: false })
    .limit(20)
  if (error) throw new Error(error.message)
  return (data ?? []) as TarifarioHistorial[]
}

// ============================================================
// obtenerPromediosHistoricos
// Promedio de precio realmente pagado por ítem del tarifario, según
// lo registrado en actividades ya ejecutadas (items_requerimiento),
// global y desglosado por municipio — para comparar contra el precio
// de venta vigente y detectar sobreprecio.
// ============================================================

export type PromedioZona = { promedio: number; n: number }
export type PromedioItem = { promedio: number; n: number; porZona: Record<string, PromedioZona> }

export async function obtenerPromediosHistoricos(): Promise<Record<string, PromedioItem>> {
  const supabase = getSupabase()

  const [itemsResult, reqResult] = await Promise.all([
    supabase
      .from('items_requerimiento')
      .select('tarifario_id, precio_unitario, requerimiento_id')
      .not('tarifario_id', 'is', null)
      .in('tipo', ['SERVICIO', 'PASIVO_TERCERO'])
      .neq('estado', 'CANCELADO')
      .limit(5000),
    supabase.from('requerimientos').select('id, municipio').limit(5000),
  ])

  if (itemsResult.error || reqResult.error) {
    console.error('[obtenerPromediosHistoricos]', itemsResult.error ?? reqResult.error)
    return {}
  }

  const municipioPorReq = new Map<string, string>()
  for (const r of reqResult.data ?? []) {
    if (r.municipio) municipioPorReq.set(r.id as string, r.municipio as string)
  }

  // Acumuladores: { [tarifarioId]: { suma, n, zonas: { [municipio]: { suma, n } } } }
  const acc = new Map<string, { suma: number; n: number; zonas: Map<string, { suma: number; n: number }> }>()

  for (const row of itemsResult.data ?? []) {
    const tarifarioId = row.tarifario_id as string
    const precio = Number(row.precio_unitario ?? 0)
    if (!tarifarioId || precio <= 0) continue

    if (!acc.has(tarifarioId)) acc.set(tarifarioId, { suma: 0, n: 0, zonas: new Map() })
    const entry = acc.get(tarifarioId)!
    entry.suma += precio
    entry.n += 1

    const municipio = municipioPorReq.get(row.requerimiento_id as string)
    if (municipio) {
      if (!entry.zonas.has(municipio)) entry.zonas.set(municipio, { suma: 0, n: 0 })
      const zonaEntry = entry.zonas.get(municipio)!
      zonaEntry.suma += precio
      zonaEntry.n += 1
    }
  }

  const resultado: Record<string, PromedioItem> = {}
  for (const [tarifarioId, entry] of acc) {
    const porZona: Record<string, PromedioZona> = {}
    for (const [municipio, zonaEntry] of entry.zonas) {
      porZona[municipio] = { promedio: zonaEntry.suma / zonaEntry.n, n: zonaEntry.n }
    }
    resultado[tarifarioId] = { promedio: entry.suma / entry.n, n: entry.n, porZona }
  }

  return resultado
}

export async function desactivarItem(
  itemId: string
): Promise<{ ok: boolean; error?: string }> {
  const supabase = getSupabase()
  const { error } = await supabase
    .from('tarifario_2026')
    .update({ activo: false })
    .eq('id', itemId)
    .eq('es_personalizado', true)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/tarifario')
  return { ok: true }
}
