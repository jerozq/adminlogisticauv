import { describe, expect, it } from 'vitest'
import { calcularTotalCostosRegistrados, contarCostosHuerfanos } from '../utils/liquidacion-costos'

describe('calcularTotalCostosRegistrados', () => {
  it('suma solo costos directos y excluye pagos de grupo', () => {
    const itemIdsVigentes = new Set(['item-1'])
    const total = calcularTotalCostosRegistrados([
      { monto: 830_000, grupo_id: null, item_id: 'item-1' },
      { monto: 660_000, grupo_id: 'grupo-1' },
      { monto: '0', grupo_id: null, item_id: 'item-1' },
    ], itemIdsVigentes)

    expect(total).toBe(830_000)
  })

  it('devuelve cero cuando no hay costos directos vigentes', () => {
    const itemIdsVigentes = new Set(['item-1'])
    const total = calcularTotalCostosRegistrados([
      { monto: 100_000, grupo_id: 'grupo-1' },
      { monto: 50_000, grupo_id: 'grupo-2' },
      { monto: 300_000, item_id: 'item-viejo' },
    ], itemIdsVigentes)

    expect(total).toBe(0)
  })

  it('cuenta costos huérfanos de ítems antiguos', () => {
    const itemIdsVigentes = new Set(['item-1'])
    const huerfanos = contarCostosHuerfanos([
      { monto: 830_000, grupo_id: null, item_id: 'item-1' },
      { monto: 660_000, grupo_id: null, item_id: 'item-viejo-a' },
      { monto: 120_000, grupo_id: null, item_id: 'item-viejo-b' },
      { monto: 400_000, grupo_id: 'grupo-1', item_id: null },
      { monto: 500_000, grupo_id: null, item_id: null },
    ], itemIdsVigentes)

    expect(huerfanos).toBe(2)
  })
})