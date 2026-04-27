import { getSupabase } from '@/lib/supabase'
import type {
  ITarifarioRepository,
  TarifarioPage,
  TarifarioPageParams,
} from '@/src/core/domain/ports/ITarifarioRepository'
import type { TarifarioItem } from '@/types/tarifario'

// ─────────────────────────────────────────────────────────────────────────────
// Adaptador Supabase para ITarifarioRepository
//
// Usa .range(from, to) para paginación eficiente a nivel de DB
// y { count: 'exact' } para obtener el total sin cargar todos los ítems.
// ─────────────────────────────────────────────────────────────────────────────

export class SupabaseTarifarioRepository implements ITarifarioRepository {
  async listar({
    page,
    pageSize,
    search,
    categoria,
  }: TarifarioPageParams): Promise<TarifarioPage> {
    const supabase = getSupabase()
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    // Sanitize search: remove characters that could break PostgREST filter syntax
    const safeTerm = search?.trim().replace(/[,()]/g, '') ?? ''

    let query = supabase
      .from('tarifario_2026')
      .select('*', { count: 'exact' })
      .eq('activo', true)
      .order('categoria', { ascending: true })
      .order('codigo_item', { ascending: true })

    if (safeTerm) {
      query = query.or(
        `descripcion.ilike.%${safeTerm}%,codigo_item.ilike.%${safeTerm}%,unidad_medida.ilike.%${safeTerm}%`
      )
    }

    if (categoria && categoria !== 'all') {
      query = query.eq('categoria', categoria)
    }

    const { data, error, count } = await query.range(from, to)

    if (error) throw new Error(error.message)

    return {
      items: (data ?? []) as TarifarioItem[],
      totalCount: count ?? 0,
    }
  }

  async buscarSugerencias(query: string): Promise<TarifarioItem[]> {
    const supabase = getSupabase()
    const { data, error } = await supabase
      .from('tarifario_2026')
      .select('*')
      .ilike('descripcion', `%${query}%`)
      .limit(8)

    if (error) throw new Error(error.message)
    return (data ?? []) as TarifarioItem[]
  }
}
