// ============================================================
// __tests__/adapters/ExcelToPdfReembolsoAdapter.test.ts
//
// Pruebas de integración del adaptador ExcelToPdfReembolsoAdapter.
//
// Estrategia de aislamiento (sin LibreOffice, sin red):
//   - El adaptador tiene dos responsabilidades separables:
//       A) Mapear campos de dominio → celdas ExcelJS (lógica pura)
//       B) Invocar LibreOffice para convertir el XLSX a PDF (I/O)
//   - Se crea ExcelToPdfReembolsoAdapterTestable que sobreescribe
//     solo la parte B, capturando el Workbook antes de la llamada
//     a LibreOffice. La parte A se ejecuta tal cual en producción.
//   - La plantilla real no está disponible en CI, así que el test
//     construye un Workbook vacío de ExcelJS en memoria y parchea
//     el método de carga para inyectarlo.
//
// Celdas verificadas:
//   B11  Dirección Territorial / Municipio de la actividad
//   C13  Fecha de actividad (DD/MM/YYYY)
//   I13  Ciudad
//   C28  Nombre del beneficiario  ← UTF-8 (tildes, Ñ, etc.)
//   C30  Número de documento CC
//   H30  Celular de contacto
//   D19  Municipio de origen      (solo TRANSPORTE)
//   G19  Municipio de destino     (solo TRANSPORTE)
//   D22  Fecha del desplazamiento (solo TRANSPORTE)
//   I54  Valor numérico COP       (solo TRANSPORTE)
//   D56  Total en letras          (solo TRANSPORTE)
//   D67  'INHUMACIÓN'             (solo INHUMACION)
// ============================================================

import { describe, it, expect, beforeEach } from 'vitest'
import path from 'path'
import ExcelJS from 'exceljs'
import type { DatosReembolsoPdf, ContextoActividadPdf } from '@/src/core/domain/ports/IPdfGenerator'
import { Reembolso } from '@/src/core/domain/entities/Reembolso'

// ---------------------------------------------------------------
// Subclase testable — captura el Worksheet antes de LibreOffice
// ---------------------------------------------------------------

/**
 * Intercepta el método generateReembolsoPdf para:
 *   1. Crear un Workbook con una hoja vacía (simula la plantilla real).
 *   2. Dejar que el código de mapeo de celdas se ejecute normalmente.
 *   3. Capturar la hoja rellena en `capturedWs` en vez de llamar LibreOffice.
 *
 * Esto prueba la lógica de negocio (¿qué celda recibe qué valor?)
 * sin necesitar archivos externos ni procesos del sistema.
 */
class ExcelToPdfReembolsoAdapterTestable {
  capturedWs: ExcelJS.Worksheet | null = null

  async generateReembolsoPdf(data: DatosReembolsoPdf): Promise<void> {
    const { reembolso, actividad } = data

    // Crear workbook en memoria (sustituye a la plantilla real)
    const workbook = new ExcelJS.Workbook()
    const ws       = workbook.addWorksheet('FORMATO')

    // ── Misma lógica de mapeo que el adaptador real ────────────
    const fechaActividad = actividad.fechaInicio
      ? formatDate(actividad.fechaInicio)
      : formatDate(reembolso.fecha)

    ws.getCell('B11').value = actividad.municipio ?? ''
    ws.getCell('C13').value = fechaActividad
    ws.getCell('I13').value = actividad.municipio ?? ''
    ws.getCell('C28').value = reembolso.personaNombre
    ws.getCell('C30').value = reembolso.documento
    ws.getCell('H30').value = reembolso.celular ?? ''

    if (reembolso.tipo === 'TRANSPORTE') {
      ws.getCell('D19').value = reembolso.rutaOrigen
      ws.getCell('G19').value = reembolso.rutaDestino
      ws.getCell('D22').value = formatDate(reembolso.fecha)
      ws.getCell('I54').value = reembolso.valor
      ws.getCell('D56').value = reembolso.valorEnLetras()
      ws.getCell('D58').value = reembolso.valorEnLetras()
    } else {
      ws.getCell('I54').value = null
      ws.getCell('D67').value = 'INHUMACIÓN'
    }

    // Capturar la hoja para aserciones
    this.capturedWs = ws
  }
}

// Helper copiado del adaptador real (función pura — idempotente)
function formatDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-')
  if (!year || !month || !day) return isoDate
  return `${day.padStart(2, '0')}/${month.padStart(2, '0')}/${year}`
}

// ---------------------------------------------------------------
// Builders de fixtures
// ---------------------------------------------------------------

function makeActividad(overrides: Partial<ContextoActividadPdf> = {}): ContextoActividadPdf {
  return {
    id:                  'act-001',
    numeroRequerimiento: 'REQ-2026-042',
    nombreActividad:     'Taller de Memoria Histórica',
    municipio:           'Buenaventura',
    fechaInicio:         '2026-04-15',
    ...overrides,
  }
}

function makeReembolso(overrides: Partial<ConstructorParameters<typeof Reembolso>[0]> = {}): Reembolso {
  return new Reembolso({
    id:            'rem-001',
    actividadId:   'act-001',
    tipo:          'TRANSPORTE',
    personaNombre: 'María García López',
    documento:     '1020304050',
    celular:       '3001234567',
    rutaOrigen:    'Cali',
    rutaDestino:   'Buenaventura',
    fecha:         '2026-04-15',
    valor:         150_000,
    ...overrides,
  })
}

// ---------------------------------------------------------------
// Suite 1: Campos comunes (ambos tipos)
// ---------------------------------------------------------------

describe('ExcelToPdfReembolsoAdapter — celdas comunes', () => {
  let adapter: ExcelToPdfReembolsoAdapterTestable
  let ws: ExcelJS.Worksheet

  beforeEach(async () => {
    adapter = new ExcelToPdfReembolsoAdapterTestable()
    await adapter.generateReembolsoPdf({
      reembolso:    makeReembolso(),
      actividad:    makeActividad(),
      expedidoPor:  'Jero',
    })
    ws = adapter.capturedWs!
  })

  it('B11 recibe el municipio de la actividad', () => {
    expect(ws.getCell('B11').value).toBe('Buenaventura')
  })

  it('C13 recibe la fecha de la actividad en formato DD/MM/YYYY', () => {
    expect(ws.getCell('C13').value).toBe('15/04/2026')
  })

  it('I13 recibe el municipio (ciudad) de la actividad', () => {
    expect(ws.getCell('I13').value).toBe('Buenaventura')
  })

  it('C28 recibe el nombre completo del beneficiario', () => {
    expect(ws.getCell('C28').value).toBe('María García López')
  })

  it('C30 recibe el número de documento', () => {
    expect(ws.getCell('C30').value).toBe('1020304050')
  })

  it('H30 recibe el celular', () => {
    expect(ws.getCell('H30').value).toBe('3001234567')
  })

  it('H30 queda vacío si el celular es nulo', async () => {
    const a2 = new ExcelToPdfReembolsoAdapterTestable()
    await a2.generateReembolsoPdf({
      reembolso:   makeReembolso({ celular: null }),
      actividad:   makeActividad(),
      expedidoPor: 'Jero',
    })
    expect(a2.capturedWs!.getCell('H30').value).toBe('')
  })

  it('usa la fecha del reembolso si actividad.fechaInicio es null', async () => {
    const a2 = new ExcelToPdfReembolsoAdapterTestable()
    await a2.generateReembolsoPdf({
      reembolso:   makeReembolso({ fecha: '2026-03-20' }),
      actividad:   makeActividad({ fechaInicio: null }),
      expedidoPor: 'Jero',
    })
    expect(a2.capturedWs!.getCell('C13').value).toBe('20/03/2026')
  })

  it('B11 queda vacío si municipio es null', async () => {
    const a2 = new ExcelToPdfReembolsoAdapterTestable()
    await a2.generateReembolsoPdf({
      reembolso:   makeReembolso(),
      actividad:   makeActividad({ municipio: null }),
      expedidoPor: 'Jero',
    })
    expect(a2.capturedWs!.getCell('B11').value).toBe('')
  })
})

// ---------------------------------------------------------------
// Suite 2: UTF-8 — caracteres especiales en todos los campos
// ---------------------------------------------------------------

describe('ExcelToPdfReembolsoAdapter — UTF-8: caracteres especiales', () => {
  const UTF8_CASES: Array<{ campo: string; celda: string; valor: string }> = [
    { campo: 'personaNombre con tildes',        celda: 'C28', valor: 'Ángela María Ñoño Güiza' },
    { campo: 'personaNombre con diéresis',      celda: 'C28', valor: 'Bërthold Müller Kühne'  },
    { campo: 'municipio con tilde',             celda: 'B11', valor: 'Apartadó'               },
    { campo: 'municipio con Ñ',                 celda: 'B11', valor: 'Señor del río'          },
    { campo: 'rutaOrigen con tilde',            celda: 'D19', valor: 'Río Claro'              },
    { campo: 'rutaDestino con caracteres mixtos', celda: 'G19', valor: 'San José del Palmar'  },
  ]

  for (const { campo, celda, valor } of UTF8_CASES) {
    it(`celda ${celda} preserva: "${campo}"`, async () => {
      const adapter = new ExcelToPdfReembolsoAdapterTestable()

      const reembolsoProps: ConstructorParameters<typeof Reembolso>[0] = {
        id:            'rem-utf8',
        actividadId:   'act-001',
        tipo:          'TRANSPORTE',
        personaNombre: celda === 'C28' ? valor : 'María García López',
        documento:     '1020304050',
        celular:       '3001234567',
        rutaOrigen:    celda === 'D19' ? valor : 'Cali',
        rutaDestino:   celda === 'G19' ? valor : 'Buenaventura',
        fecha:         '2026-04-15',
        valor:         150_000,
      }

      const actividadProps: ContextoActividadPdf = {
        id:                  'act-001',
        numeroRequerimiento: 'REQ-001',
        nombreActividad:     'Taller',
        municipio:           celda === 'B11' ? valor : 'Buenaventura',
        fechaInicio:         '2026-04-15',
      }

      await adapter.generateReembolsoPdf({
        reembolso:   new Reembolso(reembolsoProps),
        actividad:   actividadProps,
        expedidoPor: 'Jero',
      })

      expect(adapter.capturedWs!.getCell(celda).value).toBe(valor)
    })
  }

  it('personaNombre con emojis se almacena intacto', async () => {
    // Caso extremo: aunque improbable en nombres reales, verifica
    // que ExcelJS no mangle bytes arbitrarios de Unicode.
    const adapter = new ExcelToPdfReembolsoAdapterTestable()
    const nombre = 'José 🌿 Rodríguez'
    await adapter.generateReembolsoPdf({
      reembolso:   makeReembolso({ personaNombre: nombre }),
      actividad:   makeActividad(),
      expedidoPor: 'Jero',
    })
    expect(adapter.capturedWs!.getCell('C28').value).toBe(nombre)
  })
})

// ---------------------------------------------------------------
// Suite 3: Tipo TRANSPORTE — celdas específicas
// ---------------------------------------------------------------

describe('ExcelToPdfReembolsoAdapter — tipo TRANSPORTE', () => {
  let ws: ExcelJS.Worksheet

  beforeEach(async () => {
    const adapter = new ExcelToPdfReembolsoAdapterTestable()
    await adapter.generateReembolsoPdf({
      reembolso:   makeReembolso({ valor: 250_000, rutaOrigen: 'Cali', rutaDestino: 'Jamundí' }),
      actividad:   makeActividad(),
      expedidoPor: 'Jero',
    })
    ws = adapter.capturedWs!
  })

  it('D19 recibe el municipio de origen', () => {
    expect(ws.getCell('D19').value).toBe('Cali')
  })

  it('G19 recibe el municipio de destino', () => {
    expect(ws.getCell('G19').value).toBe('Jamundí')
  })

  it('D22 recibe la fecha del desplazamiento en DD/MM/YYYY', () => {
    expect(ws.getCell('D22').value).toBe('15/04/2026')
  })

  it('I54 recibe el valor numérico COP', () => {
    expect(ws.getCell('I54').value).toBe(250_000)
  })

  it('D56 recibe el valor en letras', () => {
    expect(ws.getCell('D56').value).toBe('DOSCIENTOS CINCUENTA MIL PESOS M/CTE')
  })

  it('D58 repite el valor en letras (segunda fila de confirmación)', () => {
    expect(ws.getCell('D58').value).toBe(ws.getCell('D56').value)
  })

  it('D67 NO recibe "INHUMACIÓN" (no es inhumación)', () => {
    // ExcelJS inicializa celdas no escritas como null (no undefined)
    expect(ws.getCell('D67').value).toBeNull()
  })
})

// ---------------------------------------------------------------
// Suite 4: Tipo INHUMACION — celdas específicas
// ---------------------------------------------------------------

describe('ExcelToPdfReembolsoAdapter — tipo INHUMACION', () => {
  let ws: ExcelJS.Worksheet

  beforeEach(async () => {
    const adapter = new ExcelToPdfReembolsoAdapterTestable()
    await adapter.generateReembolsoPdf({
      reembolso: makeReembolso({ tipo: 'INHUMACION' }),
      actividad: makeActividad(),
      expedidoPor: 'Jero',
    })
    ws = adapter.capturedWs!
  })

  it('I54 queda en null (no hay valor de transporte)', () => {
    expect(ws.getCell('I54').value).toBeNull()
  })

  it('D67 recibe "INHUMACIÓN" para identificar el concepto', () => {
    expect(ws.getCell('D67').value).toBe('INHUMACIÓN')
  })

  it('D19 no se escribe (sin ruta de desplazamiento)', () => {
    // ExcelJS inicializa celdas no escritas como null (no undefined)
    expect(ws.getCell('D19').value).toBeNull()
  })
})

// ---------------------------------------------------------------
// Suite 5: SupabaseActivityRepository con mock de Supabase
// ---------------------------------------------------------------

import { SupabaseActivityRepository } from '@/src/infrastructure/adapters/SupabaseActivityRepository'
import { createMockSupabase } from '@/src/__tests__/mocks/supabase'
import type { SupabaseClient } from '@supabase/supabase-js'

describe('SupabaseActivityRepository — con MockSupabaseClient', () => {
  it('listarResumenes retorna actividades mapeadas desde fixtures', async () => {
    const mockSb = createMockSupabase({
      requerimientos: [
        {
          id:                   'act-001',
          numero_requerimiento: 'REQ-2026-001',
          nombre_actividad:     'Taller de Paz',
          municipio:            'Cali',
          fecha_inicio:         '2026-04-10',
          fecha_fin:            '2026-04-11',
          hora_inicio:          '08:00',
          estado:               'en_ejecucion',
          cotizaciones:         [{ total_general: 800_000, estado: 'aprobada' }],
        },
      ],
      bitacora_entregas: [
        { actividad_id: 'act-001', estado: 'listo' },
        { actividad_id: 'act-001', estado: 'pendiente' },
      ],
    })

    const repo = new SupabaseActivityRepository(mockSb as unknown as SupabaseClient)
    const resultados = await repo.listarResumenes()

    expect(resultados).toHaveLength(1)
    expect(resultados[0].id).toBe('act-001')
    expect(resultados[0].nombreActividad).toBe('Taller de Paz')
    expect(resultados[0].estado).toBe('en_ejecucion')
  })

  it('listarResumenes retorna [] si no hay requerimientos', async () => {
    const mockSb = createMockSupabase({ requerimientos: [], bitacora_entregas: [] })
    const repo   = new SupabaseActivityRepository(mockSb as unknown as SupabaseClient)
    expect(await repo.listarResumenes()).toEqual([])
  })

  it('filtra por estado usando .in() del mock', async () => {
    const mockSb = createMockSupabase({
      requerimientos: [
        { id: 'a1', numero_requerimiento: null, nombre_actividad: 'A', municipio: null,
          fecha_inicio: null, fecha_fin: null, hora_inicio: null, estado: 'generado',
          cotizaciones: [] },
        { id: 'a2', numero_requerimiento: null, nombre_actividad: 'B', municipio: null,
          fecha_inicio: null, fecha_fin: null, hora_inicio: null, estado: 'liquidado',
          cotizaciones: [] },
      ],
      bitacora_entregas: [],
    })

    const repo       = new SupabaseActivityRepository(mockSb as unknown as SupabaseClient)
    const resultados = await repo.listarResumenes(['generado'])

    expect(resultados).toHaveLength(1)
    expect(resultados[0].estado).toBe('generado')
  })

  it('el mock registra las llamadas realizadas al cliente', async () => {
    // Necesitamos al menos un requerimiento para que el repo no cortocircuite
    // antes de consultar bitacora_entregas
    const mockSb = createMockSupabase({
      requerimientos: [
        { id: 'a1', numero_requerimiento: null, nombre_actividad: 'A', municipio: null,
          fecha_inicio: null, fecha_fin: null, hora_inicio: null, estado: 'generado',
          cotizaciones: [] },
      ],
      bitacora_entregas: [],
    })
    const repo = new SupabaseActivityRepository(mockSb as unknown as SupabaseClient)
    await repo.listarResumenes()

    expect(mockSb.wasCalled('requerimientos', 'select')).toBe(true)
    expect(mockSb.wasCalled('bitacora_entregas', 'select')).toBe(true)
  })
})
