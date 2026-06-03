export interface CostoRegistradoResumen {
  monto?: number | string | null
  grupo_id?: string | null
  item_id?: string | null
}

export function calcularTotalCostosRegistrados(
  costos: CostoRegistradoResumen[],
  itemIdsVigentes: Set<string>,
): number {
  return costos.reduce((acc, costo) => {
    if (costo.grupo_id) return acc
    if (costo.item_id && !itemIdsVigentes.has(costo.item_id)) return acc
    return acc + Number(costo.monto ?? 0)
  }, 0)
}

export function contarCostosHuerfanos(
  costos: CostoRegistradoResumen[],
  itemIdsVigentes: Set<string>,
): number {
  return costos.filter((costo) => Boolean(costo.item_id) && !itemIdsVigentes.has(costo.item_id as string)).length
}