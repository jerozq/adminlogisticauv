import type { TarifarioItem } from '@/types/tarifario'

// ─────────────────────────────────────────────────────────────────────────────
// Puerto de dominio: ITarifarioRepository
//
// Define el contrato de paginación y consulta del Tarifario.
// Las implementaciones concretas (adaptadores) viven en
// src/infrastructure/adapters/.
// ─────────────────────────────────────────────────────────────────────────────

export interface TarifarioPageParams {
  /** Número de página (1-indexed) */
  page: number
  /** Ítems por página */
  pageSize: number
  /** Texto libre para buscar en descripción, código o unidad */
  search?: string
  /** Filtro exacto por categoría ('all' o vacío = sin filtro) */
  categoria?: string
}

export interface TarifarioPage {
  items: TarifarioItem[]
  /** Total de ítems que coinciden con los filtros (ignora paginación) */
  totalCount: number
}

export interface ITarifarioRepository {
  listar(params: TarifarioPageParams): Promise<TarifarioPage>
  buscarSugerencias(query: string): Promise<TarifarioItem[]>
}
