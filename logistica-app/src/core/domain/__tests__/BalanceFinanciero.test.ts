// ============================================================
// __tests__/BalanceFinanciero.test.ts
//
// Pruebas unitarias de la entidad de dominio BalanceFinanciero.
//
// Cubre:
//   - Cálculos derivados: utilidadBruta, utilidadNeta, remanente
//   - Reglas de invariante (valores negativos → throw)
//   - repartirUtilidades(): caso normal, capital parcial, pérdida
//   - repartirUtilidades(): errores de configuración inválida
// ============================================================

import { describe, it, expect } from 'vitest'
import { BalanceFinanciero, type BalanceFinancieroProps } from '../entities/BalanceFinanciero'

// ---------------------------------------------------------------
// Helpers de fábrica
// ---------------------------------------------------------------

function makeProps(overrides: Partial<BalanceFinancieroProps> = {}): BalanceFinancieroProps {
  return {
    actividadId:       'act-001',
    nombreActividad:   'Taller de Paz',
    municipio:         'Cali',
    fechaActividad:    '2026-04-10',
    fuenteFinanciacion: 'Fondo Propio',
    totalCotizado:     10_000_000,
    totalCostosReales:  6_000_000,
    totalReembolsos:      500_000,
    costosOperativos:     200_000,
    participaciones: [
      { socioId: 's1', nombreSocio: 'Ana', porcentaje: 60, montoAportado: 3_000_000 },
      { socioId: 's2', nombreSocio: 'Luis', porcentaje: 40, montoAportado: 2_000_000 },
    ],
    ...overrides,
  }
}

// ---------------------------------------------------------------
// Suite: Cálculos derivados
// ---------------------------------------------------------------

describe('BalanceFinanciero — cálculos derivados', () => {
  it('calcula utilidadBruta correctamente', () => {
    const b = new BalanceFinanciero(makeProps())
    // 10_000_000 - 6_000_000
    expect(b.utilidadBruta).toBe(4_000_000)
  })

  it('calcula utilidadNeta correctamente', () => {
    const b = new BalanceFinanciero(makeProps())
    // 4_000_000 - 500_000 - 200_000
    expect(b.utilidadNeta).toBe(3_300_000)
  })

  it('totalCapitalAportado es la suma de montoAportado de todos los socios', () => {
    const b = new BalanceFinanciero(makeProps())
    expect(b.totalCapitalAportado).toBe(5_000_000)
  })

  it('remanente = utilidadNeta - totalCapitalAportado', () => {
    const b = new BalanceFinanciero(makeProps())
    // 3_300_000 - 5_000_000 = -1_700_000
    expect(b.remanente).toBe(-1_700_000)
  })

  it('remanente positivo cuando utilidadNeta supera el capital', () => {
    const b = new BalanceFinanciero(makeProps({
      totalCostosReales: 1_000_000,
      totalReembolsos:   0,
      costosOperativos:  0,
      // utilidadNeta = 9_000_000, capital = 5_000_000 → remanente = 4_000_000
    }))
    expect(b.remanente).toBe(4_000_000)
  })

  it('utilidadNeta sin costosOperativos usa default 0', () => {
    const b = new BalanceFinanciero(makeProps({ costosOperativos: undefined }))
    // 4_000_000 - 500_000 - 0
    expect(b.utilidadNeta).toBe(3_500_000)
  })
})

// ---------------------------------------------------------------
// Suite: Invariantes del constructor
// ---------------------------------------------------------------

describe('BalanceFinanciero — invariantes del constructor', () => {
  it('lanza error si totalCotizado es negativo', () => {
    expect(() => new BalanceFinanciero(makeProps({ totalCotizado: -1 }))).toThrow(
      'totalCotizado no puede ser negativo',
    )
  })

  it('lanza error si totalCostosReales es negativo', () => {
    expect(() => new BalanceFinanciero(makeProps({ totalCostosReales: -1 }))).toThrow(
      'totalCostosReales no puede ser negativo',
    )
  })

  it('lanza error si totalReembolsos es negativo', () => {
    expect(() => new BalanceFinanciero(makeProps({ totalReembolsos: -1 }))).toThrow(
      'totalReembolsos no puede ser negativo',
    )
  })

  it('lanza error si costosOperativos es negativo', () => {
    expect(() => new BalanceFinanciero(makeProps({ costosOperativos: -1 }))).toThrow(
      'costosOperativos no puede ser negativo',
    )
  })

  it('acepta totalCotizado = 0 (actividad sin ingresos)', () => {
    expect(() => new BalanceFinanciero(makeProps({ totalCotizado: 0 }))).not.toThrow()
  })
})

// ---------------------------------------------------------------
// Suite: repartirUtilidades — caso normal (remanente ≥ 0)
// ---------------------------------------------------------------

describe('BalanceFinanciero — repartirUtilidades: caso normal', () => {
  it('devuelve capital íntegro + porción del remanente por %', () => {
    const b = new BalanceFinanciero(makeProps({
      totalCostosReales: 1_000_000,
      totalReembolsos:   0,
      costosOperativos:  0,
      // utilidadNeta = 9_000_000, capital = 5_000_000, remanente = 4_000_000
    }))

    const dist = b.repartirUtilidades()

    // Ana (60%): capital 3_000_000 + 60% de 4_000_000 = 3_000_000 + 2_400_000
    expect(dist[0].devolucionCapital).toBe(3_000_000)
    expect(dist[0].porcionRemanente).toBe(2_400_000)
    expect(dist[0].totalRecibe).toBe(5_400_000)

    // Luis (40%): capital 2_000_000 + 40% de 4_000_000 = 2_000_000 + 1_600_000
    expect(dist[1].devolucionCapital).toBe(2_000_000)
    expect(dist[1].porcionRemanente).toBe(1_600_000)
    expect(dist[1].totalRecibe).toBe(3_600_000)
  })

  it('la suma de totalRecibe no supera utilidadNeta + capital', () => {
    const b = new BalanceFinanciero(makeProps({
      totalCostosReales: 1_000_000,
      totalReembolsos:   0,
      costosOperativos:  0,
    }))
    const dist = b.repartirUtilidades()
    const total = dist.reduce((s, d) => s + d.totalRecibe, 0)
    expect(total).toBe(b.utilidadNeta)
  })
})

// ---------------------------------------------------------------
// Suite: repartirUtilidades — capital parcial (0 ≤ uNeta < capital)
// ---------------------------------------------------------------

describe('BalanceFinanciero — repartirUtilidades: capital parcial', () => {
  it('distribuye lo disponible pro-rata al capital, sin remanente', () => {
    // utilidadNeta = 2_000_000, capital = 5_000_000 → capital parcial
    const b = new BalanceFinanciero(makeProps({
      totalCostosReales: 7_000_000,
      totalReembolsos:   1_000_000,
      costosOperativos:  0,
      // utilidadNeta = 10M - 7M - 1M = 2_000_000
    }))

    const dist = b.repartirUtilidades()

    // Ana aporta 3M / 5M del total = 60% del capital → 0.6 * 2_000_000 = 1_200_000
    expect(dist[0].devolucionCapital).toBe(1_200_000)
    expect(dist[0].porcionRemanente).toBe(0)

    // Luis aporta 2M / 5M = 40% → 0.4 * 2_000_000 = 800_000
    expect(dist[1].devolucionCapital).toBe(800_000)
    expect(dist[1].porcionRemanente).toBe(0)
  })
})

// ---------------------------------------------------------------
// Suite: repartirUtilidades — pérdida neta (utilidadNeta < 0)
// ---------------------------------------------------------------

describe('BalanceFinanciero — repartirUtilidades: pérdida neta', () => {
  it('absorbe la pérdida por porcentaje de participación', () => {
    // utilidadNeta negativa
    const b = new BalanceFinanciero(makeProps({
      totalCostosReales: 11_000_000,
      totalReembolsos:   0,
      costosOperativos:  0,
      // utilidadNeta = 10M - 11M = -1_000_000
    }))

    const dist = b.repartirUtilidades()

    // Ana (60%): -1_000_000 * 0.60 = -600_000
    expect(dist[0].devolucionCapital).toBe(0)
    expect(dist[0].porcionRemanente).toBe(-600_000)
    expect(dist[0].totalRecibe).toBe(-600_000)

    // Luis (40%): -1_000_000 * 0.40 = -400_000
    expect(dist[1].porcionRemanente).toBe(-400_000)
    expect(dist[1].totalRecibe).toBe(-400_000)
  })
})

// ---------------------------------------------------------------
// Suite: repartirUtilidades — errores de configuración
// ---------------------------------------------------------------

describe('BalanceFinanciero — repartirUtilidades: errores de config', () => {
  it('lanza error si no hay participaciones', () => {
    const b = new BalanceFinanciero(makeProps({ participaciones: [] }))
    expect(() => b.repartirUtilidades()).toThrow('no hay socios configurados')
  })

  it('lanza error si la suma de porcentajes no es 100', () => {
    const b = new BalanceFinanciero(makeProps({
      participaciones: [
        { socioId: 's1', nombreSocio: 'Ana',  porcentaje: 60, montoAportado: 3_000_000 },
        { socioId: 's2', nombreSocio: 'Luis', porcentaje: 30, montoAportado: 2_000_000 },
        // suma = 90, no 100
      ],
    }))
    expect(() => b.repartirUtilidades()).toThrow('suma de porcentajes debe ser 100')
  })

  it('acepta suma de porcentajes con tolerancia de ±0.01', () => {
    const b = new BalanceFinanciero(makeProps({
      participaciones: [
        { socioId: 's1', nombreSocio: 'Ana',  porcentaje: 33.34, montoAportado: 2_000_000 },
        { socioId: 's2', nombreSocio: 'Luis', porcentaje: 33.33, montoAportado: 2_000_000 },
        { socioId: 's3', nombreSocio: 'Sara', porcentaje: 33.33, montoAportado: 2_000_000 },
        // suma = 100.00, dentro de tolerancia
      ],
    }))
    expect(() => b.repartirUtilidades()).not.toThrow()
  })
})
