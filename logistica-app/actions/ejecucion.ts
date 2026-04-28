'use server'

import { revalidatePath, revalidateTag } from 'next/cache'
import { getSupabase } from '@/lib/supabase'
import { makeChangeActivityStatus, makeRedefinirParticipacion, getActivityRepository } from '@/src/infrastructure/container'
import type { EstadoActividad, NuevaParticipacion } from '@/src/types/domain'
import type {
  ActividadKanban,
  ActividadCalendarioMaestro,
  BitacoraEntregaRow,
  CronogramaCalendarioItem,
  EjecucionCostoConItem,
  EjecucionCostoRow,
  ItemCotizado,
  NuevoCostoForm,
  NuevaEntregaForm,
} from '@/types/ejecucion'
import type { HitoCronogramaIA } from '@/actions/cronograma-ia'

// Re-export para compatibilidad con componentes que importan EstadoActividad desde aquí
export type { EstadoActividad } from '@/src/types/domain'

// ============================================================
// Helper: detectar tablas que aún no han sido migradas
// ============================================================
function isMissingTable(err: { message?: string; code?: string }): boolean {
  const msg = err.message ?? ''
  return (
    msg.includes('schema cache') ||
    msg.includes('does not exist') ||
    err.code === '42P01' ||
    err.code === 'PGRST200'
  )
}

// ============================================================
// KANBAN: listar actividades (generado / en_ejecucion / liquidado / etc.)
// ============================================================

export async function listarActividadesKanban(): Promise<ActividadKanban[]> {
  const repo = getActivityRepository()
  const resumenes = await repo.listarResumenes([
    'generado',
    'en_ejecucion',
    'liquidado',
    'aplazado',
    'cancelado',
  ])

  // Adaptador de presentación: mapea dominio (camelCase) → tipo UI legacy (snake_case)
  return resumenes.map((r) => ({
    id: r.id,
    numero_requerimiento: r.numeroRequerimiento,
    nombre_actividad: r.nombreActividad,
    municipio: r.municipio,
    fecha_inicio: r.fechaInicio,
    fecha_fin: r.fechaFin,
    hora_inicio: r.horaInicio,
    estado: r.estado,
    total_entregas: r.totalEntregas,
    entregas_listas: r.entregasListas,
    ingreso_cotizado: r.ingresoCotizado,
  }))
}

// ============================================================
// CALENDARIO MAESTRO: actividades activas con cronograma_ia
// ============================================================

function parseDescCantidad(desc: string): { descripcion: string; cantidad: number } {
  const match = desc.match(/^(.*)\s*\(x(\d+)\)$/)
  if (!match) {
    return { descripcion: desc.trim(), cantidad: 1 }
  }
  return {
    descripcion: match[1].trim(),
    cantidad: Number(match[2]) || 1,
  }
}

function makeCronogramaKey(
  actividadId: string,
  fecha: string,
  hora: string,
  descripcionItem: string,
  cantidad: number
): string {
  return [
    actividadId,
    fecha,
    hora.substring(0, 5),
    descripcionItem.trim().toLowerCase(),
    String(cantidad),
  ].join('|')
}

export async function listarActividadesCalendarioMaestro(): Promise<ActividadCalendarioMaestro[]> {
  const sb = getSupabase()

  const { data: actividades, error: actividadesError } = await sb
    .from('requerimientos')
    .select('id, nombre_actividad, estado, cronograma_ia') // Solo campos necesarios
    .in('estado', ['generado', 'en_ejecucion', 'aplazado'])
    .order('fecha_inicio', { ascending: true })

  if (actividadesError) {
    throw new Error(actividadesError.message)
  }

  const actividadIds = (actividades ?? []).map((a) => a.id)
  if (actividadIds.length === 0) return []

  const { data: bitacora, error: bitacoraError } = await sb
    .from('bitacora_entregas')
    .select('id, actividad_id, descripcion, fecha_hora_limite')
    .in('actividad_id', actividadIds)

  if (bitacoraError && !isMissingTable(bitacoraError)) {
    throw new Error(bitacoraError.message)
  }

  const bitacoraByKey = new Map<string, string>()

  for (const row of bitacora ?? []) {
    const dt = new Date(row.fecha_hora_limite)
    if (Number.isNaN(dt.getTime())) continue

    const fecha = dt.toISOString().split('T')[0]
    const hora = dt.toISOString().split('T')[1]?.substring(0, 5) ?? '00:00'
    const parsed = parseDescCantidad(row.descripcion)
    const key = makeCronogramaKey(
      row.actividad_id,
      fecha,
      hora,
      parsed.descripcion,
      parsed.cantidad
    )
    bitacoraByKey.set(key, row.id)
  }

  return (actividades ?? []).map((actividad) => {
    // Manejar nueva estructura { data, updated_at } o array legacy
    const rawCronograma = actividad.cronograma_ia
    const cronograma = Array.isArray(rawCronograma)
      ? rawCronograma
      : (rawCronograma as { data?: unknown })?.data && Array.isArray((rawCronograma as { data?: unknown }).data)
      ? (rawCronograma as { data: unknown[] }).data
      : []

    const cronogramaItems: CronogramaCalendarioItem[] = (cronograma as HitoCronogramaIA[]).map((item) => {
      const key = makeCronogramaKey(
        actividad.id,
        item.fecha,
        item.hora,
        item.descripcion_item,
        item.cantidad
      )

      return {
        entregable_id: bitacoraByKey.get(key) ?? null,
        fecha: item.fecha,
        hora: item.hora,
        descripcion_item: item.descripcion_item,
        cantidad: item.cantidad,
      }
    })

    return {
      id: actividad.id,
      nombre_actividad: actividad.nombre_actividad,
      estado: actividad.estado,
      cronograma_items: cronogramaItems,
    }
  })
}

// ============================================================
// BITÁCORA DE ENTREGAS
// ============================================================

export async function listarEntregas(actividadId: string): Promise<BitacoraEntregaRow[]> {
  const repo = getActivityRepository()
  const entregas = await repo.listarEntregas(actividadId)

  return entregas.map((e) => ({
    id: e.id,
    actividad_id: e.actividadId,
    descripcion: e.descripcion,
    fecha_hora_limite: e.fechaHoraLimite,
    estado: e.estado,
    evidencia_url: e.evidenciaUrl ?? null,
    created_at: e.creadoEn,
    updated_at: e.creadoEn,
  }))
}

export async function crearEntrega(
  actividadId: string,
  form: NuevaEntregaForm
): Promise<BitacoraEntregaRow> {
  const repo = getActivityRepository()
  const entrega = await repo.agregarEntrega(actividadId, {
    descripcion: form.descripcion,
    fechaHoraLimite: form.fecha_hora_limite,
  })

  revalidatePath('/ejecucion')
  // @ts-expect-error -- revalidateTag not yet in Next.js types
  revalidateTag(`entregas:${actividadId}`)
  return {
    id: entrega.id,
    actividad_id: entrega.actividadId,
    descripcion: entrega.descripcion,
    fecha_hora_limite: entrega.fechaHoraLimite,
    estado: entrega.estado,
    evidencia_url: entrega.evidenciaUrl ?? null,
    created_at: entrega.creadoEn,
    updated_at: entrega.creadoEn,
  }
}

export async function marcarEntregaLista(
  entregaId: string,
  evidenciaUrl: string | null,
  actividadId?: string
): Promise<void> {
  const repo = getActivityRepository()
  await repo.actualizarEstadoEntrega(entregaId, 'listo', evidenciaUrl ?? undefined)
  revalidatePath('/ejecucion')
  // @ts-expect-error -- revalidateTag not yet in Next.js types
  if (actividadId) revalidateTag(`entregas:${actividadId}`)
}

export async function marcarEntregaPendiente(
  entregaId: string,
  actividadId?: string
): Promise<void> {
  const repo = getActivityRepository()
  await repo.actualizarEstadoEntrega(entregaId, 'pendiente')
  revalidatePath('/ejecucion')
  // @ts-expect-error -- revalidateTag not yet in Next.js types
  if (actividadId) revalidateTag(`entregas:${actividadId}`)
}

// ============================================================
// COSTOS REALES
// ============================================================

/**
 * listarCostos mantiene la query directa a Supabase porque el componente UI
 * requiere el JOIN con cotizacion_items (descripcion, precio_total, categoria).
 * Es una query de presentación que no tiene equivalente en el dominio puro.
 * TODO: Considerar un ReadModel/Proyección dedicada si crece la complejidad.
 */
export async function listarCostos(actividadId: string): Promise<EjecucionCostoConItem[]> {
  const sb = getSupabase()
  const { data, error } = await sb
    .from('ejecucion_costos')
    .select('*, cotizacion_items(descripcion, precio_total, categoria)')
    .eq('actividad_id', actividadId)
    .order('created_at', { ascending: true })

  if (error) {
    if (isMissingTable(error)) return []
    throw new Error(error.message)
  }
  return data ?? []
}

export async function agregarCosto(
  actividadId: string,
  form: NuevoCostoForm
): Promise<EjecucionCostoRow> {
  const repo = getActivityRepository()
  const costo = await repo.agregarCosto(actividadId, {
    itemId: form.item_id,
    descripcion: form.descripcion,
    monto: form.monto,
    pagador: form.pagador,
    soporteUrl: form.soporte_url,
    modoRegistro: form.modo_registro ?? 'por_item',
    cantidad: form.cantidad ?? 1,
    precioUnitario: form.precio_unitario ?? null,
    concepto: form.concepto ?? null,
  })

  revalidatePath('/ejecucion')
  revalidatePath(`/ejecucion/${actividadId}`)
  // @ts-expect-error -- revalidateTag not yet in Next.js types
  revalidateTag(`costos:${actividadId}`)
  return {
    id: costo.id,
    actividad_id: costo.actividadId,
    item_id: costo.itemId,
    descripcion: costo.descripcion,
    monto: costo.monto,
    pagador: costo.pagador,
    soporte_url: costo.soporteUrl ?? null,
    notas: costo.notas ?? null,
    modo_registro: costo.modoRegistro,
    cantidad: costo.cantidad,
    precio_unitario: costo.precioUnitario,
    concepto: costo.concepto,
    created_at: costo.creadoEn,
    updated_at: costo.creadoEn,
  }
}

/**
 * Inserta múltiples filas de costo en un solo server action.
 * Usado por el modo "Por Ítem" cuando hay variaciones de precio.
 */
export async function agregarCostoBatch(
  actividadId: string,
  filas: NuevoCostoForm[]
): Promise<EjecucionCostoRow[]> {
  const results: EjecucionCostoRow[] = []
  for (const form of filas) {
    const row = await agregarCosto(actividadId, form)
    results.push(row)
  }
  revalidatePath(`/ejecucion/${actividadId}`)
  // @ts-expect-error -- revalidateTag not yet in Next.js types
  revalidateTag(`costos:${actividadId}`)
  return results
}

export async function eliminarCosto(costoId: string, actividadId?: string): Promise<void> {
  const repo = getActivityRepository()
  await repo.eliminarCosto(costoId)
  revalidatePath('/ejecucion')
  if (actividadId) {
    revalidatePath(`/ejecucion/${actividadId}`)
    // @ts-expect-error -- revalidateTag not yet in Next.js types
    revalidateTag(`costos:${actividadId}`)
  }
}

// ============================================================
// ÍTEMS COTIZADOS (para dropdown de costos)
// Query de presentación UI; no tiene equivalente en el dominio.
// ============================================================

export async function listarItemsCotizados(actividadId: string): Promise<ItemCotizado[]> {
  const sb = getSupabase()

  const { data: cots } = await sb
    .from('cotizaciones')
    .select('id')
    .eq('requerimiento_id', actividadId)
    .order('version', { ascending: false })
    .limit(1)

  if (!cots?.length) return []

  const { data, error } = await sb
    .from('cotizacion_items')
    .select('id, descripcion, cantidad, precio_unitario, precio_total, categoria')
    .eq('cotizacion_id', cots[0].id)
    .order('categoria')

  if (error) return []
  return data ?? []
}

// ============================================================
// TRANSICIÓN DE ESTADO — delegada al caso de uso del dominio
// ============================================================

/**
 * Cambia el estado de una actividad a través del caso de uso ChangeActivityStatus.
 *
 * El caso de uso valida la transición en el dominio, persiste a través del
 * adaptador Supabase (RPC `cambiar_estado_requerimiento`) y registra un span
 * de OpenTelemetry con actividadId, nuevoEstado y userId para auditoría.
 *
 * @param motivo  Obligatorio cuando se pasa a 'aplazado' o 'cancelado'.
 */
export async function cambiarEstadoActividad(
  actividadId: string,
  nuevoEstado: EstadoActividad,
  motivo?: string
): Promise<void> {
  const repo = getActivityRepository()
  const actividadAntes = await repo.obtenerPorId(actividadId)
  
  const uc = makeChangeActivityStatus()
  await uc.execute({ actividadId, nuevoEstado, motivo, userId: 'anonymous' })
  
  // Automatización inteligente: si arranca operación, generar hitos.
  if (
    actividadAntes && 
    actividadAntes.estado === 'generado' && 
    nuevoEstado === 'en_ejecucion'
  ) {
    const fn = actividadAntes.fechaInicio || new Date().toISOString().split('T')[0]
    const hi = actividadAntes.horaInicio || '08:00'
    const offset = new Date(`${fn}T${hi}`)
    
    // Generar horas sugeridas:
    const t0 = new Date(offset)
    const t2 = new Date(offset.getTime() + 2 * 60 * 60 * 1000)
    const t中午 = new Date(offset.getFullYear(), offset.getMonth(), offset.getDate(), 12, 0, 0)
    
    try {
      const entregasToCreate = [
        { descripcion: 'Toma de control y arribo', fechaHoraLimite: t0.toISOString() },
        { descripcion: 'Refrigerio AM (Sugerido)', fechaHoraLimite: t2.toISOString() },
      ]
      if (hi < '12:00') {
        entregasToCreate.push(
          { descripcion: 'Almuerzo de trabajo', fechaHoraLimite: t中午.toISOString() }
        )
      }
      await Promise.all(
        entregasToCreate.map((e) => repo.agregarEntrega(actividadId, e))
      )
    } catch(err) {
      console.error(err)
    }
  }
  
  revalidatePath('/ejecucion')
  revalidatePath(`/ejecucion/${actividadId}`)
  // @ts-expect-error -- revalidateTag not yet in Next.js types
  revalidateTag(`act:${actividadId}`)
}

// ============================================================
// Participaciones de socios
// ============================================================

export async function listarParticipaciones(
  actividadId: string
): Promise<{ socioId: string; nombreSocio: string; porcentaje: number; montoAportado: number }[]> {
  const repo = getActivityRepository()
  const socios = await repo.listarParticipaciones(actividadId)
  return socios.map((s) => ({
    socioId:       s.socioId,
    nombreSocio:   s.nombreSocio,
    porcentaje:    s.porcentaje,
    montoAportado: s.montoAportado,
  }))
}

export async function guardarParticipacionesActividad(
  actividadId: string,
  participaciones: NuevaParticipacion[]
): Promise<void> {
  const uc = makeRedefinirParticipacion()
  await uc.execute({ actividadId, participaciones, userId: 'anonymous' })
  revalidatePath(`/ejecucion/${actividadId}`)
  // @ts-expect-error -- revalidateTag not yet in Next.js types
  revalidateTag(`participaciones:${actividadId}`)
}

export async function actualizarAporteSocio(
  actividadId: string,
  socioId: string,
  nuevoMonto: number
): Promise<void> {
  const repo = getActivityRepository()
  await repo.actualizarAporteSocio(actividadId, socioId, nuevoMonto)
  revalidatePath(`/ejecucion/${actividadId}`)
  // @ts-expect-error -- revalidateTag not yet in Next.js types
  revalidateTag(`participaciones:${actividadId}`)
}

// ============================================================
// DASHBOARD: estadísticas de la página de inicio
// ============================================================

export interface DashboardStats {
  actividadesEnCampo: number
  actividadesHoy: number
  cotizacionesBorrador: number
  cotizacionesTotal: number
  tarifarioTotal: number
  ingresosLiquidados: number
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const sb = getSupabase()
  const today = new Date().toISOString().split('T')[0]

  const [
    { count: actividadesEnCampo },
    { count: actividadesHoy },
    { count: cotizacionesBorrador },
    { count: cotizacionesTotal },
    { count: tarifarioTotal },
    { data: liquidadas },
  ] = await Promise.all([
    sb.from('requerimientos').select('id', { count: 'exact', head: true }).eq('estado', 'en_ejecucion'),
    sb.from('requerimientos').select('id', { count: 'exact', head: true }).eq('fecha_inicio', today),
    sb.from('requerimientos').select('id', { count: 'exact', head: true }).eq('estado', 'generado'),
    sb.from('requerimientos').select('id', { count: 'exact', head: true }),
    sb.from('tarifario').select('id', { count: 'exact', head: true }).eq('activo', true),
    sb.from('requerimientos').select('valor_total_cotizado').eq('estado', 'liquidado'),
  ])

  const ingresosLiquidados = (liquidadas ?? []).reduce(
    (s: number, r: { valor_total_cotizado?: number | null }) => s + (r.valor_total_cotizado ?? 0),
    0
  )

  return {
    actividadesEnCampo: actividadesEnCampo ?? 0,
    actividadesHoy: actividadesHoy ?? 0,
    cotizacionesBorrador: cotizacionesBorrador ?? 0,
    cotizacionesTotal: cotizacionesTotal ?? 0,
    tarifarioTotal: tarifarioTotal ?? 0,
    ingresosLiquidados,
  }
}

// ============================================================
// REEMBOLSOS: datos básicos de actividad (para página cliente)
// ============================================================

export interface ActividadBasica {
  id: string
  nombre_actividad: string | null
  numero_requerimiento: string | null
  fecha_inicio: string | null
}

export async function getActividadBasica(actividadId: string): Promise<ActividadBasica | null> {
  const sb = getSupabase()
  const { data, error } = await sb
    .from('requerimientos')
    .select('id, nombre_actividad, numero_requerimiento, fecha_inicio')
    .eq('id', actividadId)
    .single()

  if (error) return null
  return data as ActividadBasica
}
