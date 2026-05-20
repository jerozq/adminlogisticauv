// ============================================================
// src/__tests__/cambiar-estado-reembolso.test.ts
//
// Tests para cambiarEstadoReembolso — flujo 3-estados.
//
// Verifica que:
//   PENDIENTE → PAGADO   crea un movimiento GASTO
//   PAGADO    → PENDIENTE anula el movimiento GASTO previo
//   PENDIENTE → DEVOLUCION crea una deuda en devoluciones_deuda
//   DEVOLUCION → PENDIENTE elimina la deuda PENDIENTE
//   Mismo estado → no hace nada (idempotente)
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mocks globales ──────────────────────────────────────────
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

// Capturamos las operaciones que el cliente Supabase ejecuta
const insertedMovimientos: any[] = []
const insertedDeudas: any[]      = []
const updatedItems: any[]        = []
const deletedDeudas: any[]       = []
const updatedMovimientos: any[]  = []

/**
 * Construye un mock de Supabase que responde según la tabla y el
 * escenario del test. Las mutaciones se capturan en los arrays de arriba.
 */
function buildMockSupabase(overrides: {
  item?: Record<string, unknown>
  cuentaVirtual?: Record<string, unknown>
  movimientoInsertId?: string
  existingDeuda?: Record<string, unknown> | null
} = {}) {
  const {
    item            = defaultItem(),
    cuentaVirtual   = { id: 'cuenta-1', numero_cuenta: 'CTA-001', nombre: 'Proyecto Test' },
    movimientoInsertId = 'mov-nuevo-1',
    existingDeuda   = null,
  } = overrides

  /**
   * Crear un QueryBuilder fluido con soporte para las cadenas
   * usadas en cambiarEstadoReembolso.
   */
  function qb(table: string) {
    const chain: any = {
      _data: null as any,
      _error: null as any,

      select:       (_cols: string) => chain,
      eq:           (_col: string, _val: unknown) => chain,
      in:           (_col: string, _vals: unknown[]) => chain,
      maybeSingle:  () => Promise.resolve({ data: resolveData(table, chain), error: null }),
      single:       () => Promise.resolve({ data: resolveData(table, chain), error: null }),

      update: (payload: any) => {
        if (table === 'items_requerimiento')  updatedItems.push(payload)
        if (table === 'movimientos_bancarios') updatedMovimientos.push(payload)
        if (table === 'devoluciones_deuda')    deletedDeudas.push({ _update: payload })
        return chain
      },

      insert: (payload: any) => {
        if (table === 'movimientos_bancarios') {
          insertedMovimientos.push(payload)
          chain._data = { id: movimientoInsertId }
        }
        if (table === 'devoluciones_deuda') insertedDeudas.push(payload)
        return chain
      },

      delete: () => {
        if (table === 'devoluciones_deuda') deletedDeudas.push({ _delete: true })
        if (table === 'movimientos_bancarios') updatedMovimientos.push({ _delete: true })
        return chain
      },
    }

    function resolveData(t: string, _c: any) {
      if (t === 'items_requerimiento') return item
      if (t === 'cuentas_virtuales')   return cuentaVirtual
      if (t === 'requerimientos')      return { numero_requerimiento: 'TEST-001', nombre_actividad: 'Actividad Test' }
      if (t === 'devoluciones_deuda')  return existingDeuda
      if (t === 'movimientos_bancarios') return chain._data ?? null
      return null
    }

    return chain
  }

  return {
    from: (table: string) => qb(table),
  }
}

function defaultItem(overrides: Partial<{
  estado: string
  movimiento_reembolso_id: string | null
  precio_total: number
  precio_unitario: number
  cantidad: number
  beneficiario_nombre: string
  descripcion: string
}> = {}) {
  return {
    id:                      'item-1',
    estado:                  'PENDIENTE',
    precio_total:            150_000,
    precio_unitario:         150_000,
    cantidad:                1,
    beneficiario_nombre:     'Juan Pérez',
    descripcion:             'Transporte Cali–Bogotá',
    movimiento_reembolso_id: null,
    ...overrides,
  }
}

// ── Importar la función bajo prueba ─────────────────────────
// Mockeamos createClient ANTES de importar la acción para que
// el módulo la reciba ya sustituida.
let mockSb: ReturnType<typeof buildMockSupabase>

vi.mock('@/utils/supabase/server', () => ({
  createClient: () => Promise.resolve(mockSb),
}))

// Importación diferida (después del mock)
const { cambiarEstadoReembolso } = await import('@/actions/liquidaciones')

// ────────────────────────────────────────────────────────────

describe('cambiarEstadoReembolso', () => {
  beforeEach(() => {
    insertedMovimientos.length  = 0
    insertedDeudas.length       = 0
    updatedItems.length         = 0
    deletedDeudas.length        = 0
    updatedMovimientos.length   = 0
    vi.clearAllMocks()
  })

  // ── PENDIENTE → PAGADO ────────────────────────────────────
  describe('PENDIENTE → PAGADO', () => {
    it('crea un movimiento GASTO en tesorería', async () => {
      mockSb = buildMockSupabase({ item: defaultItem({ estado: 'PENDIENTE' }) })

      const result = await cambiarEstadoReembolso('item-1', 'act-1', 'PAGADO')

      expect(result.ok).toBe(true)
      expect(insertedMovimientos).toHaveLength(1)
      expect(insertedMovimientos[0]).toMatchObject({
        tipo:    'GASTO',
        estado:  'EJECUTADO',
        monto:   150_000,
        origen_id: 'cuenta-1',
      })
    })

    it('el movimiento incluye referencia al reembolso en notas', async () => {
      mockSb = buildMockSupabase({ item: defaultItem({ estado: 'PENDIENTE' }) })

      await cambiarEstadoReembolso('item-1', 'act-1', 'PAGADO')

      const notas = insertedMovimientos[0]?.notas
      expect(notas?.tipo_egreso).toBe('REEMBOLSO')
      expect(notas?.reembolso_id).toBe('item-1')
    })

    it('actualiza items_requerimiento con estado PAGADO y movimiento_reembolso_id', async () => {
      mockSb = buildMockSupabase({
        item: defaultItem({ estado: 'PENDIENTE' }),
        movimientoInsertId: 'mov-nuevo-42',
      })

      await cambiarEstadoReembolso('item-1', 'act-1', 'PAGADO')

      expect(updatedItems).toHaveLength(1)
      expect(updatedItems[0]).toMatchObject({
        estado:                  'PAGADO',
        pagado:                  true,
        movimiento_reembolso_id: 'mov-nuevo-42',
      })
    })
  })

  // ── PAGADO → PENDIENTE ────────────────────────────────────
  describe('PAGADO → PENDIENTE', () => {
    it('anula el movimiento GASTO previo', async () => {
      mockSb = buildMockSupabase({
        item: defaultItem({ estado: 'PAGADO', movimiento_reembolso_id: 'mov-previo-1' }),
      })

      const result = await cambiarEstadoReembolso('item-1', 'act-1', 'PENDIENTE')

      expect(result.ok).toBe(true)
      expect(updatedMovimientos).toHaveLength(1)
      expect(updatedMovimientos[0]).toMatchObject({ estado: 'ANULADO' })
    })

    it('limpia movimiento_reembolso_id en el ítem', async () => {
      mockSb = buildMockSupabase({
        item: defaultItem({ estado: 'PAGADO', movimiento_reembolso_id: 'mov-previo-1' }),
      })

      await cambiarEstadoReembolso('item-1', 'act-1', 'PENDIENTE')

      expect(updatedItems).toHaveLength(1)
      expect(updatedItems[0]).toMatchObject({
        estado:                  'PENDIENTE',
        pagado:                  false,
        movimiento_reembolso_id: null,
      })
    })
  })

  // ── PENDIENTE → DEVOLUCION ────────────────────────────────
  describe('PENDIENTE → DEVOLUCION', () => {
    it('crea una deuda en devoluciones_deuda con estado PENDIENTE', async () => {
      mockSb = buildMockSupabase({
        item: defaultItem({ estado: 'PENDIENTE' }),
        existingDeuda: null,
      })

      const result = await cambiarEstadoReembolso('item-1', 'act-1', 'DEVOLUCION')

      expect(result.ok).toBe(true)
      expect(insertedDeudas).toHaveLength(1)
      expect(insertedDeudas[0]).toMatchObject({
        estado_deuda:     'PENDIENTE',
        tipo:             'TERCERO',
        monto_total:      150_000,
        item_origen_id:   'item-1',
      })
    })

    it('no crea deuda duplicada si ya existe una PENDIENTE', async () => {
      mockSb = buildMockSupabase({
        item: defaultItem({ estado: 'PENDIENTE' }),
        existingDeuda: { id: 'deuda-existente' },
      })

      await cambiarEstadoReembolso('item-1', 'act-1', 'DEVOLUCION')

      expect(insertedDeudas).toHaveLength(0)
    })

    it('no crea movimiento de tesorería (ningún GASTO)', async () => {
      mockSb = buildMockSupabase({ item: defaultItem({ estado: 'PENDIENTE' }) })

      await cambiarEstadoReembolso('item-1', 'act-1', 'DEVOLUCION')

      expect(insertedMovimientos).toHaveLength(0)
    })
  })

  // ── DEVOLUCION → PENDIENTE ────────────────────────────────
  describe('DEVOLUCION → PENDIENTE', () => {
    it('elimina la deuda PENDIENTE asociada al ítem', async () => {
      mockSb = buildMockSupabase({
        item: defaultItem({ estado: 'DEVOLUCION' }),
      })

      const result = await cambiarEstadoReembolso('item-1', 'act-1', 'PENDIENTE')

      expect(result.ok).toBe(true)
      expect(deletedDeudas).toHaveLength(1)
    })
  })

  // ── Idempotencia ─────────────────────────────────────────
  describe('mismo estado → no hace nada', () => {
    it('retorna ok sin realizar cambios si el estado ya es igual', async () => {
      mockSb = buildMockSupabase({ item: defaultItem({ estado: 'PAGADO' }) })

      const result = await cambiarEstadoReembolso('item-1', 'act-1', 'PAGADO')

      expect(result.ok).toBe(true)
      expect(insertedMovimientos).toHaveLength(0)
      expect(updatedItems).toHaveLength(0)
    })
  })

  // ── Error: ítem no encontrado ─────────────────────────────
  describe('ítem no encontrado', () => {
    it('lanza error si el ítem no existe', async () => {
      mockSb = buildMockSupabase({ item: null as any })

      await expect(
        cambiarEstadoReembolso('item-inexistente', 'act-1', 'PAGADO')
      ).rejects.toThrow('Reembolso no encontrado')
    })
  })
})
