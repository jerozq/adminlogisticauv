import { describe, it, expect } from 'vitest'
import { Actividad } from '@/src/core/domain/entities/Actividad'
import type { ReembolsoBeneficiario, ItemCotizado } from '@/src/types/domain'

// ============================================================
// Test: Lógica Estricta de Reembolsos — Separación de Conceptos
//
// Si una misma persona recibe dinero por 'Transporte' Y también
// por 'Inhumación', el sistema DEBE generar DOS entidades
// completamente independientes (filas separadas).
// ============================================================

const baseItems: ItemCotizado[] = [
  {
    id: 'item-1',
    actividadId: 'act-1',
    tarifarioId: null,
    codigoItem: 'INHUMACION',
    descripcion: 'Servicios de inhumación',
    categoria: 'INHUMACION',
    unidadMedida: 'und',
    cantidad: 2,
    precioUnitario: 531_000,
    precioTotal: 1_062_000,
    esPassthrough: true,
  },
  {
    id: 'item-2',
    actividadId: 'act-1',
    tarifarioId: null,
    codigoItem: 'LOG-001',
    descripcion: 'Salón para 30 personas',
    categoria: 'Logística',
    unidadMedida: 'und',
    cantidad: 1,
    precioUnitario: 500_000,
    precioTotal: 500_000,
    esPassthrough: false,
  },
]

describe('Actividad.extraerReembolsos() — Separación de Conceptos', () => {
  it('debe generar UNA fila para persona con solo TRANSPORTE', () => {
    const beneficiarios: ReembolsoBeneficiario[] = [
      {
        nombreBeneficiario: 'María López',
        documentoIdentidad: '1001',
        celular: null,
        municipioOrigen: 'Cali',
        municipioDestino: 'Bogotá',
        valorTransporte: 150_000,
        valorAlojamiento: 0,
        valorAlimentacion: 0,
        valorOtros: 0,
      },
    ]

    const actividad = new Actividad({
      id: 'act-1',
      numeroRequerimiento: 'TEST-001',
      nombreActividad: 'Test Separación',
      municipio: 'Cali',
      fechaInicio: '2026-05-01',
      fechaFin: '2026-05-01',
      horaInicio: '08:00',
      estado: 'en_ejecucion',
      items: baseItems,
      costos: [],
      entregas: [],
      reembolsosRequerimiento: beneficiarios,
    })

    const result = actividad.extraerReembolsos()

    expect(result).toHaveLength(1)
    expect(result[0].tipo).toBe('TRANSPORTE')
    expect(result[0].personaNombre).toBe('María López')
    expect(result[0].valor).toBe(150_000)
  })

  it('debe generar DOS filas independientes para persona con TRANSPORTE + INHUMACIÓN', () => {
    const beneficiarios: ReembolsoBeneficiario[] = [
      {
        nombreBeneficiario: 'Juan Pérez',
        documentoIdentidad: '2002',
        celular: null,
        municipioOrigen: 'Medellín',
        municipioDestino: 'Cali',
        valorTransporte: 200_000,
        valorAlojamiento: 0,
        valorAlimentacion: 0,
        valorOtros: 531_000, // Inhumación
      },
    ]

    const actividad = new Actividad({
      id: 'act-2',
      numeroRequerimiento: 'TEST-002',
      nombreActividad: 'Test Doble Concepto',
      municipio: 'Medellín',
      fechaInicio: '2026-05-02',
      fechaFin: '2026-05-02',
      horaInicio: '09:00',
      estado: 'en_ejecucion',
      items: baseItems,
      costos: [],
      entregas: [],
      reembolsosRequerimiento: beneficiarios,
    })

    const result = actividad.extraerReembolsos()

    // CRITICAL: Must generate exactly 2 rows
    expect(result).toHaveLength(2)

    const transporte = result.find((r) => r.tipo === 'TRANSPORTE')
    const inhumacion = result.find((r) => r.tipo === 'INHUMACION')

    expect(transporte).toBeDefined()
    expect(inhumacion).toBeDefined()

    // They must be the SAME person
    expect(transporte!.personaNombre).toBe('Juan Pérez')
    expect(inhumacion!.personaNombre).toBe('Juan Pérez')
    expect(transporte!.documento).toBe('2002')
    expect(inhumacion!.documento).toBe('2002')

    // But with DIFFERENT IDs
    expect(transporte!.id).not.toBe(inhumacion!.id)

    // And DIFFERENT values
    expect(transporte!.valor).toBe(200_000)
    expect(inhumacion!.valor).toBe(531_000)

    // IDs should include the type for traceability
    expect(transporte!.id).toContain('TRANSPORTE')
    expect(inhumacion!.id).toContain('INHUMACION')
  })

  it('debe generar filas separadas para múltiples personas con conceptos mixtos', () => {
    const beneficiarios: ReembolsoBeneficiario[] = [
      {
        nombreBeneficiario: 'Ana García',
        documentoIdentidad: '3003',
        celular: null,
        municipioOrigen: 'Pasto',
        municipioDestino: 'Cali',
        valorTransporte: 100_000,
        valorAlojamiento: 0,
        valorAlimentacion: 0,
        valorOtros: 0, // Solo transporte
      },
      {
        nombreBeneficiario: 'Pedro Ruiz',
        documentoIdentidad: '4004',
        celular: null,
        municipioOrigen: 'Popayán',
        municipioDestino: 'Bogotá',
        valorTransporte: 250_000,
        valorAlojamiento: 0,
        valorAlimentacion: 0,
        valorOtros: 531_000, // Transporte + Inhumación
      },
    ]

    const actividad = new Actividad({
      id: 'act-3',
      numeroRequerimiento: 'TEST-003',
      nombreActividad: 'Test Mixto',
      municipio: 'Cali',
      fechaInicio: '2026-05-03',
      fechaFin: '2026-05-03',
      horaInicio: '07:00',
      estado: 'en_ejecucion',
      items: baseItems,
      costos: [],
      entregas: [],
      reembolsosRequerimiento: beneficiarios,
    })

    const result = actividad.extraerReembolsos()

    // Ana = 1 (transporte), Pedro = 2 (transporte + inhumación) = 3 total
    expect(result).toHaveLength(3)

    const anaRows = result.filter((r) => r.documento === '3003')
    const pedroRows = result.filter((r) => r.documento === '4004')

    expect(anaRows).toHaveLength(1)
    expect(pedroRows).toHaveLength(2)

    expect(anaRows[0].tipo).toBe('TRANSPORTE')
    expect(pedroRows.map((r) => r.tipo).sort()).toEqual(['INHUMACION', 'TRANSPORTE'])
  })

  it('no debe generar reembolso de inhumación si no hay ítems de esa categoría', () => {
    const itemsSinInhumacion: ItemCotizado[] = [
      {
        id: 'item-x',
        actividadId: 'act-4',
        tarifarioId: null,
        codigoItem: 'LOG-001',
        descripcion: 'Salón',
        categoria: 'Logística',
        unidadMedida: 'und',
        cantidad: 1,
        precioUnitario: 500_000,
        precioTotal: 500_000,
        esPassthrough: false,
      },
    ]

    const beneficiarios: ReembolsoBeneficiario[] = [
      {
        nombreBeneficiario: 'Carlos',
        documentoIdentidad: '5005',
        celular: null,
        municipioOrigen: 'A',
        municipioDestino: 'B',
        valorTransporte: 100_000,
        valorAlojamiento: 0,
        valorAlimentacion: 0,
        valorOtros: 531_000, // tiene valorOtros pero NO hay ítem de inhumación
      },
    ]

    const actividad = new Actividad({
      id: 'act-4',
      numeroRequerimiento: 'TEST-004',
      nombreActividad: 'Test Sin Inhumación',
      municipio: 'X',
      fechaInicio: '2026-05-04',
      fechaFin: '2026-05-04',
      horaInicio: '08:00',
      estado: 'en_ejecucion',
      items: itemsSinInhumacion,
      costos: [],
      entregas: [],
      reembolsosRequerimiento: beneficiarios,
    })

    const result = actividad.extraerReembolsos()

    // Solo transporte, NO inhumación (no hay ítems de esa categoría)
    expect(result).toHaveLength(1)
    expect(result[0].tipo).toBe('TRANSPORTE')
  })
})

describe('Actividad.extraerReembolsos() — Propagación de celular', () => {
  it('propaga celular al Reembolso cuando está presente', () => {
    const beneficiarios: ReembolsoBeneficiario[] = [
      {
        nombreBeneficiario: 'Laura Mora',
        documentoIdentidad: '6006',
        celular: '3001234567',
        municipioOrigen: 'Cali',
        municipioDestino: 'Bogotá',
        valorTransporte: 180_000,
        valorAlojamiento: 0,
        valorAlimentacion: 0,
        valorOtros: 0,
      },
    ]

    const actividad = new Actividad({
      id: 'act-cel-1',
      numeroRequerimiento: 'TEST-CEL-001',
      nombreActividad: 'Test Celular',
      municipio: 'Cali',
      fechaInicio: '2026-05-10',
      fechaFin: '2026-05-10',
      horaInicio: '08:00',
      estado: 'en_ejecucion',
      items: baseItems,
      costos: [],
      entregas: [],
      reembolsosRequerimiento: beneficiarios,
    })

    const result = actividad.extraerReembolsos()
    expect(result).toHaveLength(1)
    expect(result[0].celular).toBe('3001234567')
  })

  it('celular es null cuando no está disponible', () => {
    const beneficiarios: ReembolsoBeneficiario[] = [
      {
        nombreBeneficiario: 'Sin Celular',
        documentoIdentidad: '7007',
        celular: null,
        municipioOrigen: 'Medellín',
        municipioDestino: 'Cali',
        valorTransporte: 120_000,
        valorAlojamiento: 0,
        valorAlimentacion: 0,
        valorOtros: 0,
      },
    ]

    const actividad = new Actividad({
      id: 'act-cel-2',
      numeroRequerimiento: 'TEST-CEL-002',
      nombreActividad: 'Test Sin Celular',
      municipio: 'Medellín',
      fechaInicio: '2026-05-10',
      fechaFin: '2026-05-10',
      horaInicio: '09:00',
      estado: 'en_ejecucion',
      items: baseItems,
      costos: [],
      entregas: [],
      reembolsosRequerimiento: beneficiarios,
    })

    const result = actividad.extraerReembolsos()
    expect(result).toHaveLength(1)
    expect(result[0].celular).toBeNull()
  })

  it('propaga celular a AMBAS filas cuando persona tiene TRANSPORTE + INHUMACIÓN', () => {
    const beneficiarios: ReembolsoBeneficiario[] = [
      {
        nombreBeneficiario: 'Doble Concepto',
        documentoIdentidad: '8008',
        celular: '3119876543',
        municipioOrigen: 'Pasto',
        municipioDestino: 'Cali',
        valorTransporte: 200_000,
        valorAlojamiento: 0,
        valorAlimentacion: 0,
        valorOtros: 531_000,
      },
    ]

    const actividad = new Actividad({
      id: 'act-cel-3',
      numeroRequerimiento: 'TEST-CEL-003',
      nombreActividad: 'Test Celular Doble',
      municipio: 'Pasto',
      fechaInicio: '2026-05-10',
      fechaFin: '2026-05-10',
      horaInicio: '10:00',
      estado: 'en_ejecucion',
      items: baseItems,
      costos: [],
      entregas: [],
      reembolsosRequerimiento: beneficiarios,
    })

    const result = actividad.extraerReembolsos()
    expect(result).toHaveLength(2)
    result.forEach((r) => {
      expect(r.celular).toBe('3119876543')
    })
  })
})
