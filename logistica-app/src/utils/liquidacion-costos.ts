export interface CostoRegistradoResumen {
  monto?: number | string | null
  grupo_id?: string | null
}

export function calcularTotalCostosRegistrados(costos: CostoRegistradoResumen[]): number {
  return costos.reduce((acc, costo) => {
    if (costo.grupo_id) return acc
    return acc + Number(costo.monto ?? 0)
  }, 0)
}