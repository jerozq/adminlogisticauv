import { Reembolso } from '@/src/core/domain/entities/Reembolso'
import type { IReembolsoRepository } from '@/src/core/domain/ports/IReembolsoRepository'
import { getSupabase } from '@/lib/supabase'

interface ReembolsoManualRow {
  id: string
  actividad_id: string
  tipo: 'TRANSPORTE' | 'INHUMACION'
  persona_nombre: string
  documento: string
  celular: string | null
  ruta_origen: string
  ruta_destino: string
  fecha: string
  valor: number
}

function toEntity(row: ReembolsoManualRow): Reembolso {
  return new Reembolso({
    id: row.id,
    actividadId: row.actividad_id,
    tipo: row.tipo,
    personaNombre: row.persona_nombre,
    documento: row.documento,
    celular: row.celular,
    rutaOrigen: row.ruta_origen,
    rutaDestino: row.ruta_destino,
    fecha: row.fecha,
    valor: Number(row.valor),
  })
}

function toRow(reembolso: Reembolso) {
  const props = reembolso.toProps()
  return {
    id: props.id,
    actividad_id: props.actividadId,
    tipo: props.tipo,
    persona_nombre: props.personaNombre,
    documento: props.documento,
    celular: props.celular,
    ruta_origen: props.rutaOrigen,
    ruta_destino: props.rutaDestino,
    fecha: props.fecha,
    valor: props.valor,
  }
}

export class SupabaseReembolsoRepository implements IReembolsoRepository {
  async listarPorActividad(actividadId: string): Promise<Reembolso[]> {
    const sb = getSupabase()

    const { data, error } = await sb
      .from('reembolsos_manuales')
      .select('id, actividad_id, tipo, persona_nombre, documento, celular, ruta_origen, ruta_destino, fecha, valor')
      .eq('actividad_id', actividadId)
      .order('updated_at', { ascending: true })

    if (error || !data) return []

    return (data as unknown as ReembolsoManualRow[]).map(toEntity)
  }

  async guardar(reembolso: Reembolso): Promise<Reembolso> {
    const sb = getSupabase()

    const { data: existing } = await sb
      .from('reembolsos_manuales')
      .select('id')
      .eq('id', reembolso.id)
      .maybeSingle()

    if (existing?.id) {
      throw new Error(`Reembolso '${reembolso.id}' ya existe. Usa actualizar() para modificarlo.`)
    }

    const { error } = await sb
      .from('reembolsos_manuales')
      .insert(toRow(reembolso))

    if (error) {
      throw new Error(`No se pudo guardar el reembolso: ${error.message}`)
    }

    return reembolso
  }

  async actualizar(reembolso: Reembolso): Promise<Reembolso> {
    const sb = getSupabase()

    const { data: existing } = await sb
      .from('reembolsos_manuales')
      .select('id')
      .eq('id', reembolso.id)
      .maybeSingle()

    if (!existing?.id) {
      throw new Error(`Reembolso '${reembolso.id}' no encontrado en el repositorio.`)
    }

    const { error } = await sb
      .from('reembolsos_manuales')
      .update(toRow(reembolso))
      .eq('id', reembolso.id)

    if (error) {
      throw new Error(`No se pudo actualizar el reembolso: ${error.message}`)
    }

    return reembolso
  }

  async eliminar(id: string): Promise<void> {
    const sb = getSupabase()
    await sb.from('reembolsos_manuales').delete().eq('id', id)
  }
}

let _instance: SupabaseReembolsoRepository | null = null

export function getSupabaseReembolsoRepository(): SupabaseReembolsoRepository {
  if (!_instance) _instance = new SupabaseReembolsoRepository()
  return _instance
}
