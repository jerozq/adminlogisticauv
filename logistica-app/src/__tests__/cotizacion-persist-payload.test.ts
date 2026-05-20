import { describe, expect, it } from 'vitest'
import { buildGuardarCotizacionPayload } from '@/src/utils/cotizacion-persist-payload'
import type { ParsedRequerimiento } from '@/types/cotizacion'

const makeParsed = (): ParsedRequerimiento => ({
  encabezado: {
    numeroRequerimiento: '629PE',
    nombreActividad: 'Jornada de atención',
    objeto: 'Observaciones operativas',
    direccionTerritorial: 'Eje Cafetero',
    municipio: 'Pereira',
    departamento: 'Risaralda',
    lugarDetalle: 'Auditorio central',
    fechaSolicitud: '2026-05-16',
    fechaInicio: '2026-05-20',
    fechaFin: '2026-05-20',
    horaInicio: '08:00',
    horaFin: '17:00',
    responsableNombre: 'Ana Ruiz',
    responsableCedula: '12345678',
    responsableCelular: '3001234567',
    responsableCorreo: 'ana@correo.com',
    numVictimas: 35,
    montoReembolsoDeclarado: 530000,
  },
  items: [
    {
      id: 'item-1',
      tarifarioId: null,
      codigoItem: 'ALM001',
      descripcion: 'Almuerzo',
      categoria: 'Alimentación',
      unidadMedida: 'Unidad',
      cantidad: 35,
      precioUnitario: 20000,
      esPassthrough: false,
      excluirDeFinanzas: false,
      ocultarEnCotizacion: false,
      fuente: 'excel',
      opcionesTarifario: [
        {
          id: 't-1',
          codigoItem: 'ALM001',
          descripcion: 'Almuerzo ejecutivo',
          precioVenta: 20000,
          unidadMedida: 'Unidad',
          categoria: 'Alimentación',
        },
      ],
    },
  ],
  reembolsos: [
    {
      id: 'reb-1',
      nombreBeneficiario: 'Carlos Perez',
      documentoIdentidad: 'CC 111',
      celularBeneficiario: '3100000000',
      municipioOrigen: 'Dosquebradas',
      municipioDestino: 'Pereira',
      valorTransporte: 50000,
      valorAlojamiento: 0,
      valorAlimentacion: 0,
      valorOtros: 0,
    },
  ],
  cronogramaSugerido: [
    {
      descripcion: 'Entrega de refrigerios',
      fechaHoraLimite: '2026-05-20T10:00:00.000Z',
    },
  ],
})

describe('buildGuardarCotizacionPayload', () => {
  it('preserva reembolsos y cronograma para generación operativa automática', () => {
    const parsed = makeParsed()

    const payload = buildGuardarCotizacionPayload(parsed, 'REQ-629PE.xlsx')

    expect(payload.reembolsos).toHaveLength(1)
    expect(payload.reembolsos[0].nombreBeneficiario).toBe('Carlos Perez')
    expect(payload.cronogramaSugerido).toHaveLength(1)
    expect(payload.fileName).toBe('REQ-629PE.xlsx')
  })

  it('limpia opcionesTarifario para evitar payload excesivo en server actions', () => {
    const parsed = makeParsed()

    const payload = buildGuardarCotizacionPayload(parsed, 'REQ-629PE.xlsx')

    expect(payload.items).toHaveLength(1)
    expect(payload.items[0].opcionesTarifario).toEqual([])
  })
})
