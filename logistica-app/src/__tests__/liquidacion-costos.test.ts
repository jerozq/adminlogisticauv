import { describe, expect, it } from 'vitest'
import { calcularTotalCostosRegistrados } from '../utils/liquidacion-costos'

describe('calcularTotalCostosRegistrados', () => {
  it('suma solo costos directos y excluye pagos de grupo', () => {
    const total = calcularTotalCostosRegistrados([
      { monto: 830_000, grupo_id: null },
      { monto: 660_000, grupo_id: 'grupo-1' },
      { monto: '0', grupo_id: null },
    ])

    expect(total).toBe(830_000)
  })

  it('devuelve cero cuando no hay costos directos', () => {
    const total = calcularTotalCostosRegistrados([
      { monto: 100_000, grupo_id: 'grupo-1' },
      { monto: 50_000, grupo_id: 'grupo-2' },
    ])

    expect(total).toBe(0)
  })
})