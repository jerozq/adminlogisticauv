// ============================================================
// __tests__/Reembolso.test.ts
//
// Pruebas unitarias de la entidad de dominio Reembolso.
//
// Cubre:
//   - Invariantes del constructor (valor ≤ 0, nombre/doc vacíos)
//   - valorEnLetras(): valores comunes de reembolsos reales
//   - Redondeo de valor en el constructor
//   - toProps(): serialización de ida y vuelta
// ============================================================

import { describe, it, expect } from 'vitest'
import { Reembolso, type ReembolsoProps } from '../entities/Reembolso'

// ---------------------------------------------------------------
// Helper de fábrica
// ---------------------------------------------------------------

function makeReembolso(overrides: Partial<ReembolsoProps> = {}): ReembolsoProps {
  return {
    id:            'rem-001',
    actividadId:   'act-001',
    tipo:          'TRANSPORTE',
    personaNombre: 'María García López',
    documento:     '1234567890',
    celular:       '3001234567',
    rutaOrigen:    'Cali',
    rutaDestino:   'Buenaventura',
    fecha:         '2026-04-10',
    valor:         150_000,
    ...overrides,
  }
}

// ---------------------------------------------------------------
// Suite: Invariantes del constructor
// ---------------------------------------------------------------

describe('Reembolso — invariantes del constructor', () => {
  it('lanza error si valor es 0', () => {
    expect(() => new Reembolso(makeReembolso({ valor: 0 }))).toThrow(
      'el valor debe ser mayor a cero',
    )
  })

  it('lanza error si valor es negativo', () => {
    expect(() => new Reembolso(makeReembolso({ valor: -500 }))).toThrow(
      'el valor debe ser mayor a cero',
    )
  })

  it('lanza error si personaNombre está vacío', () => {
    expect(() => new Reembolso(makeReembolso({ personaNombre: '   ' }))).toThrow(
      'personaNombre no puede estar vacío',
    )
  })

  it('lanza error si documento está vacío', () => {
    expect(() => new Reembolso(makeReembolso({ documento: '' }))).toThrow(
      'documento no puede estar vacío',
    )
  })

  it('construye correctamente con props válidas', () => {
    const r = new Reembolso(makeReembolso())
    expect(r.id).toBe('rem-001')
    expect(r.tipo).toBe('TRANSPORTE')
    expect(r.valor).toBe(150_000)
  })

  it('recorta espacios en personaNombre y documento', () => {
    const r = new Reembolso(makeReembolso({
      personaNombre: '  Juan Pérez  ',
      documento:     '  9876543210  ',
    }))
    expect(r.personaNombre).toBe('Juan Pérez')
    expect(r.documento).toBe('9876543210')
  })

  it('acepta celular nulo', () => {
    const r = new Reembolso(makeReembolso({ celular: null }))
    expect(r.celular).toBeNull()
  })

  it('redondea el valor al entero más cercano', () => {
    const r = new Reembolso(makeReembolso({ valor: 150_500.75 }))
    expect(r.valor).toBe(150_501)
  })
})

// ---------------------------------------------------------------
// Suite: valorEnLetras
// ---------------------------------------------------------------

describe('Reembolso — valorEnLetras', () => {
  const casos: Array<[number, string]> = [
    [100_000,   'CIEN MIL PESOS M/CTE'],
    [150_000,   'CIENTO CINCUENTA MIL PESOS M/CTE'],
    [250_000,   'DOSCIENTOS CINCUENTA MIL PESOS M/CTE'],
    [500_000,   'QUINIENTOS MIL PESOS M/CTE'],
    [1_000_000, 'UN MILLÓN PESOS M/CTE'],
    [2_500_000, 'DOS MILLONES QUINIENTOS MIL PESOS M/CTE'],
    [50_000,    'CINCUENTA MIL PESOS M/CTE'],
    [21_000,    'VEINTIUNO MIL PESOS M/CTE'],
  ]

  for (const [valor, esperado] of casos) {
    it(`${valor.toLocaleString('es-CO')} → "${esperado}"`, () => {
      const r = new Reembolso(makeReembolso({ valor }))
      expect(r.valorEnLetras()).toBe(esperado)
    })
  }
})

// ---------------------------------------------------------------
// Suite: toProps — serialización
// ---------------------------------------------------------------

describe('Reembolso — toProps', () => {
  it('devuelve props equivalentes a las de entrada', () => {
    const props = makeReembolso()
    const r     = new Reembolso(props)
    const back  = r.toProps()

    expect(back.id).toBe(props.id)
    expect(back.actividadId).toBe(props.actividadId)
    expect(back.tipo).toBe(props.tipo)
    expect(back.valor).toBe(props.valor)
    expect(back.personaNombre).toBe(props.personaNombre.trim())
    expect(back.documento).toBe(props.documento.trim())
    expect(back.celular).toBe(props.celular)
    expect(back.rutaOrigen).toBe(props.rutaOrigen)
    expect(back.rutaDestino).toBe(props.rutaDestino)
    expect(back.fecha).toBe(props.fecha)
  })
})
