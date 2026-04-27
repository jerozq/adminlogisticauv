// ============================================================
// __tests__/Actividad.test.ts
//
// Pruebas unitarias de la entidad de dominio Actividad.
//
// Cubre:
//   1. Máquina de estados — transición ilegal desde 'liquidado'
//   2. Liquidación — cálculo exacto de distribución con porcentajes
//      reales: Jero $100k (40%) + Socio $200k (60%), utilidadNeta $500k
// ============================================================

import { describe, it, expect } from 'vitest'
import { Actividad, type ActividadProps } from '../entities/Actividad'
import { SocioParticipacion } from '../value-objects/SocioParticipacion'
import type { ItemCotizado, CostoReal } from '@/src/types/domain'

// ---------------------------------------------------------------
// Helpers de fábrica
// ---------------------------------------------------------------

/** Item cotizado mínimo: contribuye `precioTotal` al ingresoTotal. */
function makeItem(precioTotal: number, id = 'item-01'): ItemCotizado {
  return {
    id,
    actividadId:    'act-001',
    tarifarioId:    null,
    codigoItem:     'ALO-001',
    descripcion:    'Alojamiento',
    categoria:      'ALOJAMIENTO',
    unidadMedida:   'noche',
    cantidad:       1,
    precioUnitario: precioTotal,
    precioTotal,
    esPassthrough:  false,
  }
}

/** Costo real mínimo: contribuye `monto` a gastosTotales. */
function makeCosto(monto: number, pagador: 'jero' | 'socio' | 'caja_proyecto', id = 'costo-01'): CostoReal {
  return {
    id,
    actividadId: 'act-001',
    itemId:      null,
    descripcion: 'Gasto operativo',
    monto,
    pagador,
    soporteUrl:  null,
    notas:       null,
    creadoEn:    '2026-04-10T08:00:00Z',
    modoRegistro: 'por_item',
    cantidad: 1,
    precioUnitario: monto,
    concepto: 'Gasto operativo',
  }
}

/** Props base válidas de una Actividad. */
function makeActividadProps(overrides: Partial<ActividadProps> = {}): ActividadProps {
  return {
    id:                    'act-001',
    numeroRequerimiento:   'REQ-2026-001',
    nombreActividad:       'Taller de Paz',
    municipio:             'Cali',
    fechaInicio:           '2026-04-10',
    fechaFin:              '2026-04-11',
    horaInicio:            '08:00',
    estado:                'generado',
    items:                 [],
    costos:                [],
    entregas:              [],
    participaciones:       [],
    fuenteFinanciacion:    'Fondo Propio',
    ...overrides,
  }
}

// ---------------------------------------------------------------
// Suite 1: Máquina de estados — estado 'liquidado'
// ---------------------------------------------------------------

describe('Actividad — máquina de estados: liquidado', () => {
  it('lanza error al intentar pasar de liquidado a en_ejecucion', () => {
    const actividad = new Actividad(makeActividadProps({ estado: 'liquidado' }))

    expect(() => actividad.transicionarA('en_ejecucion')).toThrow(
      'Transición inválida: liquidado → en_ejecucion',
    )
  })

  it('lanza error al intentar cualquier transición desde liquidado', () => {
    const actividad = new Actividad(makeActividadProps({ estado: 'liquidado' }))

    // liquidado tiene 0 transiciones válidas — todo debe fallar
    for (const estado of ['generado', 'en_ejecucion', 'aplazado', 'cancelado'] as const) {
      expect(
        () => actividad.transicionarA(estado),
        `Se esperaba error al intentar ${estado} desde liquidado`,
      ).toThrow('Transición inválida')
    }
  })

  it('puedeTransicionarA devuelve false para en_ejecucion desde liquidado', () => {
    const actividad = new Actividad(makeActividadProps({ estado: 'liquidado' }))
    expect(actividad.puedeTransicionarA('en_ejecucion')).toBe(false)
  })

  it('transicionesDisponibles devuelve array vacío desde liquidado', () => {
    const actividad = new Actividad(makeActividadProps({ estado: 'liquidado' }))
    expect(actividad.transicionesDisponibles()).toEqual([])
  })

  it('no muta el objeto al transicionar — devuelve una nueva instancia', () => {
    const original = new Actividad(makeActividadProps({ estado: 'generado' }))
    const siguiente = original.transicionarA('en_ejecucion')

    expect(original.estado).toBe('generado')
    expect(siguiente.estado).toBe('en_ejecucion')
    expect(siguiente).not.toBe(original)
  })
})

// ---------------------------------------------------------------
// Suite 2: calcularDistribucion — reparto exacto
//
// Escenario:
//   Jero  → montoAportado = $100 000, porcentaje = 40 %
//   Socio → montoAportado = $200 000, porcentaje = 60 %
//
//   ingresoTotal  = $800 000   (1 ítem)
//   gastosTotales = $300 000   (Jero $100k + Socio $200k)
//   utilidadNeta  = $500 000
//
//   Jero  recibe: $100 000 + 40 % × $500 000 = $300 000
//   Socio recibe: $200 000 + 60 % × $500 000 = $500 000
//   Total        = $800 000 ✓ (= ingresoTotal, capital recuperado + utilidad)
// ---------------------------------------------------------------

describe('Actividad — calcularDistribucion: Jero $100k (40%) + Socio $200k (60%)', () => {
  function makeActividadConDistribucion(): Actividad {
    return new Actividad(makeActividadProps({
      estado: 'en_ejecucion',
      items:  [makeItem(800_000)],
      costos: [
        makeCosto(100_000, 'jero',  'costo-jero'),
        makeCosto(200_000, 'socio', 'costo-socio'),
      ],
      participaciones: [
        new SocioParticipacion({ socioId: 'jero-id',  nombreSocio: 'Jero',  porcentaje: 40, montoAportado: 100_000 }),
        new SocioParticipacion({ socioId: 'socio-id', nombreSocio: 'Socio', porcentaje: 60, montoAportado: 200_000 }),
      ],
    }))
  }

  it('ingresoTotal es $800 000', () => {
    expect(makeActividadConDistribucion().ingresoTotal).toBe(800_000)
  })

  it('utilidadNeta es $500 000 (800k − 300k en costos)', () => {
    const a = makeActividadConDistribucion()
    const gastos = a.costos.reduce((s, c) => s + c.monto, 0)
    expect(a.ingresoTotal - gastos).toBe(500_000)
  })

  it('Jero recibe exactamente $300 000', () => {
    const dist = makeActividadConDistribucion().calcularDistribucion()
    const jero = dist.find((d) => d.socioId === 'jero-id')!

    expect(jero.montoAportado).toBe(100_000)
    expect(jero.porcionUtilidad).toBe(200_000)   // 40% × 500k
    expect(jero.totalRecibe).toBe(300_000)
  })

  it('Socio recibe exactamente $500 000', () => {
    const dist = makeActividadConDistribucion().calcularDistribucion()
    const socio = dist.find((d) => d.socioId === 'socio-id')!

    expect(socio.montoAportado).toBe(200_000)
    expect(socio.porcionUtilidad).toBe(300_000)  // 60% × 500k
    expect(socio.totalRecibe).toBe(500_000)
  })

  it('la suma de totalRecibe iguala ingresoTotal ($800 000)', () => {
    const a    = makeActividadConDistribucion()
    const dist = a.calcularDistribucion()
    const suma = dist.reduce((s, d) => s + d.totalRecibe, 0)
    expect(suma).toBe(a.ingresoTotal)
  })

  it('los porcentajes asignados son 40 y 60', () => {
    const dist = makeActividadConDistribucion().calcularDistribucion()
    expect(dist[0].porcentaje).toBe(40)
    expect(dist[1].porcentaje).toBe(60)
  })

  it('lanza error si no hay participaciones configuradas', () => {
    const a = new Actividad(makeActividadProps({
      items:  [makeItem(800_000)],
      costos: [makeCosto(300_000, 'jero')],
    }))
    expect(() => a.calcularDistribucion()).toThrow('No hay socios configurados')
  })

  it('lanza error si los porcentajes no suman 100', () => {
    const a = new Actividad(makeActividadProps({
      items:  [makeItem(800_000)],
      participaciones: [
        new SocioParticipacion({ socioId: 'j', nombreSocio: 'Jero', porcentaje: 40, montoAportado: 0 }),
        new SocioParticipacion({ socioId: 's', nombreSocio: 'Socio', porcentaje: 40, montoAportado: 0 }),
        // suma = 80, no 100
      ],
    }))
    expect(() => a.calcularDistribucion()).toThrow('suma de porcentajes')
  })
})
