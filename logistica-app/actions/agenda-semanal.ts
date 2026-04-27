'use server'

import { getSupabase } from '@/lib/supabase'
import { revalidatePath } from 'next/cache'
import type { HitoCronogramaIA } from '@/actions/cronograma-ia'

// ============================================================
// Types
// ============================================================

export interface EntregableEditable extends HitoCronogramaIA {
  id?: string
  estado?: 'pendiente' | 'listo'
}

export interface ReferenciaEntregable {
  fecha: string
  hora: string
  descripcion_item: string
  cantidad: number
}

// ============================================================
// agregarItemCronograma: Crear nuevo entregable
// ============================================================

export async function agregarItemCronograma(
  actividadId: string,
  item: EntregableEditable
): Promise<{ ok: boolean; id?: string; error?: string }> {
  try {
    const sb = getSupabase()

    // 1. Insertar en bitacora_entregas
    const { data: newRow, error: insertError } = await sb
      .from('bitacora_entregas')
      .insert({
        actividad_id: actividadId,
        descripcion: `${item.descripcion_item} (x${item.cantidad})`,
        fecha_hora_limite: new Date(`${item.fecha}T${item.hora}:00`).toISOString(),
        estado: item.estado || 'pendiente',
      })
      .select('id')
      .single()

    if (insertError) {
      console.error('[agregarItemCronograma] insert', insertError)
      return { ok: false, error: insertError.message }
    }

    const entregableId = newRow?.id

    // 2. Actualizar cronograma_ia JSONB en requerimientos
    const { data: req, error: selectError } = await sb
      .from('requerimientos')
      .select('cronograma_ia')
      .eq('id', actividadId)
      .single()

    if (selectError || !req) {
      console.error('[agregarItemCronograma] select', selectError)
      return {
        ok: false,
        error: selectError?.message || 'Actividad no encontrada',
      }
    }

    const cronograma: HitoCronogramaIA[] = Array.isArray(req.cronograma_ia)
      ? req.cronograma_ia
      : []

    // Agregar nuevo item (sin id, ya que el id es de bitacora_entregas)
    cronograma.push({
      fecha: item.fecha,
      hora: item.hora,
      descripcion_item: item.descripcion_item,
      cantidad: item.cantidad,
    })

    await sb
      .from('requerimientos')
      .update({ cronograma_ia: cronograma })
      .eq('id', actividadId)

    // Sincronizar a actividades si existe
    try {
      await sb
        .from('actividades')
        .update({ cronograma_ia: cronograma })
        .eq('id', actividadId)
    } catch {
      // Ignorar si la tabla/registro de actividades no existe
    }

    revalidatePath(`/ejecucion/${actividadId}`)

    return { ok: true, id: entregableId }
  } catch (err) {
    console.error('[agregarItemCronograma]', err)
    return { ok: false, error: 'Error inesperado' }
  }
}

// ============================================================
// actualizarItemCronograma: Editar un entregable existente
// ============================================================

export async function actualizarItemCronograma(
  actividadId: string,
  entregableId: string,
  updates: Partial<EntregableEditable>
): Promise<{ ok: boolean; error?: string }> {
  try {
    const sb = getSupabase()

    // 1. Obtener el registro actual de bitacora_entregas
    const { data: current, error: fetchError } = await sb
      .from('bitacora_entregas')
      .select('*')
      .eq('id', entregableId)
      .single()

    if (fetchError || !current) {
      console.error('[actualizarItemCronograma] fetch', fetchError)
      return {
        ok: false,
        error: fetchError?.message || 'Entregable no encontrado',
      }
    }

    // 2. Construir descripción actualizada
    const descripcion_item = updates.descripcion_item || current.descripcion?.split(' (x')[0]
    const cantidad = updates.cantidad || 1
    const nuevoDescripcion = `${descripcion_item} (x${cantidad})`
    const nuevaFechaHora = updates.fecha && updates.hora
      ? new Date(`${updates.fecha}T${updates.hora}:00`).toISOString()
      : current.fecha_hora_limite

    // 3. Actualizar en bitacora_entregas
    const { error: updateError } = await sb
      .from('bitacora_entregas')
      .update({
        descripcion: nuevoDescripcion,
        fecha_hora_limite: nuevaFechaHora,
        estado: updates.estado || current.estado,
      })
      .eq('id', entregableId)

    if (updateError) {
      console.error('[actualizarItemCronograma] update', updateError)
      return { ok: false, error: updateError.message }
    }

    // 4. Leer cronograma_ia actual
    const { data: req, error: selectError } = await sb
      .from('requerimientos')
      .select('cronograma_ia')
      .eq('id', actividadId)
      .single()

    if (selectError || !req) {
      console.error('[actualizarItemCronograma] select', selectError)
      return {
        ok: false,
        error: selectError?.message || 'Actividad no encontrada',
      }
    }

    // 5. Actualizar el item en el array cronograma_ia
    let cronograma: HitoCronogramaIA[] = Array.isArray(req.cronograma_ia)
      ? req.cronograma_ia
      : []

    cronograma = cronograma.map((e) => {
      // Buscar por fecha+hora del item original (antes de actualizar)
      if (e.fecha === current.fecha_hora_limite?.split('T')[0] &&
          e.hora === current.fecha_hora_limite?.split('T')[1]?.substring(0, 5)) {
        return {
          fecha: updates.fecha || e.fecha,
          hora: updates.hora || e.hora,
          descripcion_item: updates.descripcion_item || e.descripcion_item,
          cantidad: updates.cantidad !== undefined ? updates.cantidad : e.cantidad,
        }
      }
      return e
    })

    await sb
      .from('requerimientos')
      .update({ cronograma_ia: cronograma })
      .eq('id', actividadId)

    // Sincronizar a actividades si existe
    try {
      await sb
        .from('actividades')
        .update({ cronograma_ia: cronograma })
        .eq('id', actividadId)
    } catch {
      // Ignorar si la tabla/registro de actividades no existe
    }

    revalidatePath(`/ejecucion/${actividadId}`)

    return { ok: true }
  } catch (err) {
    console.error('[actualizarItemCronograma]', err)
    return { ok: false, error: 'Error inesperado' }
  }
}

export async function actualizarItemCronogramaPorReferencia(
  actividadId: string,
  referencia: ReferenciaEntregable,
  updates: Partial<EntregableEditable>
): Promise<{ ok: boolean; error?: string }> {
  try {
    const sb = getSupabase()

    const isoBase = new Date(`${referencia.fecha}T${referencia.hora}:00`)
    if (Number.isNaN(isoBase.getTime())) {
      return { ok: false, error: 'Referencia de fecha/hora inválida' }
    }

    const descripcionBitacora = `${referencia.descripcion_item} (x${referencia.cantidad})`
    const iso = isoBase.toISOString()

    const { data: row, error: fetchError } = await sb
      .from('bitacora_entregas')
      .select('id')
      .eq('actividad_id', actividadId)
      .eq('fecha_hora_limite', iso)
      .eq('descripcion', descripcionBitacora)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (fetchError) {
      return { ok: false, error: fetchError.message }
    }

    if (!row?.id) {
      return {
        ok: false,
        error: 'No se encontró el ítem en bitácora para esta referencia',
      }
    }

    return actualizarItemCronograma(actividadId, row.id, updates)
  } catch (err) {
    console.error('[actualizarItemCronogramaPorReferencia]', err)
    return { ok: false, error: 'Error inesperado' }
  }
}

// ============================================================
// eliminarItemCronograma: Borrar un entregable
// ============================================================

export async function eliminarItemCronograma(
  actividadId: string,
  entregableId: string,
  fecha?: string,
  hora?: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const sb = getSupabase()

    // 1. Obtener datos antes de borrar (para sincronizar cronograma_ia)
    const { data: current } = await sb
      .from('bitacora_entregas')
      .select('fecha_hora_limite')
      .eq('id', entregableId)
      .single()

    // 2. Eliminar de bitacora_entregas
    const { error: deleteError } = await sb
      .from('bitacora_entregas')
      .delete()
      .eq('id', entregableId)

    if (deleteError) {
      console.error('[eliminarItemCronograma] delete', deleteError)
      return { ok: false, error: deleteError.message }
    }

    // 3. Extraer fecha y hora para sincronizar
    const fechaFromDB = current?.fecha_hora_limite?.split('T')[0]
    const horaFromDB = current?.fecha_hora_limite?.split('T')[1]?.substring(0, 5)
    const targetFecha = fecha || fechaFromDB
    const targetHora = hora || horaFromDB

    // 4. Actualizar cronograma_ia (remover del array)
    const { data: req, error: selectError } = await sb
      .from('requerimientos')
      .select('cronograma_ia')
      .eq('id', actividadId)
      .single()

    if (selectError || !req) {
      console.error('[eliminarItemCronograma] select', selectError)
      return {
        ok: false,
        error: selectError?.message || 'Actividad no encontrada',
      }
    }

    let cronograma: HitoCronogramaIA[] = Array.isArray(req.cronograma_ia)
      ? req.cronograma_ia
      : []

    cronograma = cronograma.filter(
      (e) => !(e.fecha === targetFecha && e.hora === targetHora)
    )

    await sb
      .from('requerimientos')
      .update({ cronograma_ia: cronograma })
      .eq('id', actividadId)

    // Sincronizar a actividades si existe
    try {
      await sb
        .from('actividades')
        .update({ cronograma_ia: cronograma })
        .eq('id', actividadId)
    } catch {
      // Ignorar si la tabla/registro de actividades no existe
    }

    revalidatePath(`/ejecucion/${actividadId}`)

    return { ok: true }
  } catch (err) {
    console.error('[eliminarItemCronograma]', err)
    return { ok: false, error: 'Error inesperado' }
  }
}

// ============================================================
// subirEvidenciaEntregable: Guardar URL de evidencia (foto/factura)
// ============================================================

export async function subirEvidenciaEntregable(
  entregableId: string,
  evidenciaUrl: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const sb = getSupabase()

    const { error } = await sb
      .from('bitacora_entregas')
      .update({ evidencia_url: evidenciaUrl })
      .eq('id', entregableId)

    if (error) {
      console.error('[subirEvidenciaEntregable]', error)
      return { ok: false, error: error.message }
    }

    return { ok: true }
  } catch (err) {
    console.error('[subirEvidenciaEntregable]', err)
    return { ok: false, error: 'Error inesperado' }
  }
}

// ============================================================
// obtenerCronogramaIA: Leer cronograma_ia actualizado
// ============================================================

export async function obtenerCronogramaIA(
  actividadId: string
): Promise<{ ok: boolean; cronograma?: HitoCronogramaIA[]; error?: string }> {
  try {
    const sb = getSupabase()

    const { data: req, error } = await sb
      .from('requerimientos')
      .select('cronograma_ia')
      .eq('id', actividadId)
      .single()

    if (error || !req) {
      return { ok: false, error: error?.message || 'Actividad no encontrada' }
    }

    return {
      ok: true,
      cronograma: Array.isArray(req.cronograma_ia) ? req.cronograma_ia : [],
    }
  } catch (err) {
    console.error('[obtenerCronogramaIA]', err)
    return { ok: false, error: 'Error inesperado' }
  }
}

export async function subirArchivoEvidencia(formData: FormData): Promise<{ ok: boolean; url?: string; error?: string }> {
  try {
    const file = formData.get('file') as File | null;
    const id = formData.get('id') as string | null;
    if (!file || !id) {
      return { ok: false, error: 'Archivo o ID faltante' };
    }
    const { getSupabase } = await import('@/lib/supabase');
    const sb = getSupabase();
    const fileName = id + '-' + Date.now() + '-' + file.name;
    const { error } = await sb.storage.from('evidencias').upload(fileName, file, { upsert: true });
    if (error) {
      return { ok: false, error: error.message };
    }
    const { data: publicUrl } = sb.storage.from('evidencias').getPublicUrl(fileName);
    return { ok: true, url: publicUrl.publicUrl };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Error al subir archivo' };
  }
}
