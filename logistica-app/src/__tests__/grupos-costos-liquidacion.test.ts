// ============================================================
// src/__tests__/grupos-costos-liquidacion.test.ts
//
// Tests para crearGrupoCostos, actualizarGrupoCostos, eliminarGrupoCostos
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

// ── Captured mutations ─────────────────────────────────────
const insertedGrupos: any[] = []
const updatedGrupos: any[] = []
const deletedGrupos: any[] = []

// ── Supabase mock factory ──────────────────────────────────
let mockCreateClient: ReturnType<typeof vi.fn>

vi.mock('@/utils/supabase/server', () => ({
  createClient: () => mockCreateClient(),
}))

function buildSupabaseOk() {
  return {
    from: (_table: string) => ({
      insert: (payload: any) => {
        insertedGrupos.push(payload)
        return {
          select: () => ({
            single: () => Promise.resolve({ data: { id: 'grupo-new-1' }, error: null }),
          }),
        }
      },
      update: (payload: any) => {
        updatedGrupos.push(payload)
        return {
          eq: () => ({
            eq: () => Promise.resolve({ data: { id: 'grupo-1' }, error: null }),
          }),
        }
      },
      delete: () => {
        deletedGrupos.push(true)
        return {
          eq: () => ({
            eq: () => Promise.resolve({ data: null, error: null }),
          }),
        }
      },
    }),
  }
}

function buildSupabaseError(msg: string) {
  return {
    from: (_table: string) => ({
      insert: (_payload: any) => ({
        select: () => ({
          single: () => Promise.resolve({ data: null, error: { message: msg } }),
        }),
      }),
      update: (_payload: any) => ({
        eq: () => ({
          eq: () => Promise.resolve({ data: null, error: { message: msg } }),
        }),
      }),
      delete: () => ({
        eq: () => ({
          eq: () => Promise.resolve({ data: null, error: { message: msg } }),
        }),
      }),
    }),
  }
}

import {
  crearGrupoCostos,
  actualizarGrupoCostos,
  eliminarGrupoCostos,
  registrarPagoGrupo,
  eliminarPagoGrupo,
} from '@/actions/liquidaciones'

const ACTIVIDAD_ID = 'actividad-uuid-1'
const GRUPO_ID = 'grupo-uuid-1'

const VALID_INPUT = {
  nombre: 'Alimentación',
  montoTotal: 500_000,
  itemsIds: ['item-1', 'item-2'],
}

beforeEach(() => {
  insertedGrupos.length = 0
  updatedGrupos.length = 0
  deletedGrupos.length = 0
  vi.clearAllMocks()
})

// ── crearGrupoCostos ──────────────────────────────────────

describe('crearGrupoCostos', () => {
  it('inserta el grupo y retorna { ok: true, id } en éxito', async () => {
    mockCreateClient = vi.fn().mockResolvedValue(buildSupabaseOk())
    const { revalidatePath } = await import('next/cache')

    const result = await crearGrupoCostos(ACTIVIDAD_ID, VALID_INPUT)

    expect(result).toEqual({ ok: true, id: 'grupo-new-1' })
    expect(insertedGrupos).toHaveLength(1)
    expect(insertedGrupos[0]).toMatchObject({
      actividad_id: ACTIVIDAD_ID,
      nombre: 'Alimentación',
      monto_total: 500_000,
      items_ids: ['item-1', 'item-2'],
    })
    expect(revalidatePath).toHaveBeenCalledWith(`/liquidaciones/${ACTIVIDAD_ID}`)
  })

  it('lanza error cuando el nombre está vacío', async () => {
    mockCreateClient = vi.fn().mockResolvedValue(buildSupabaseOk())

    await expect(
      crearGrupoCostos(ACTIVIDAD_ID, { ...VALID_INPUT, nombre: '   ' })
    ).rejects.toThrow('El nombre del grupo es obligatorio.')
  })

  it('lanza error cuando el monto es 0', async () => {
    mockCreateClient = vi.fn().mockResolvedValue(buildSupabaseOk())

    await expect(
      crearGrupoCostos(ACTIVIDAD_ID, { ...VALID_INPUT, montoTotal: 0 })
    ).rejects.toThrow('El monto del grupo debe ser mayor a cero.')
  })

  it('lanza error cuando no hay ítems seleccionados', async () => {
    mockCreateClient = vi.fn().mockResolvedValue(buildSupabaseOk())

    await expect(
      crearGrupoCostos(ACTIVIDAD_ID, { ...VALID_INPUT, itemsIds: [] })
    ).rejects.toThrow('Selecciona al menos un ítem para el grupo.')
  })

  it('lanza error cuando Supabase falla', async () => {
    mockCreateClient = vi.fn().mockResolvedValue(buildSupabaseError('DB connection error'))

    await expect(crearGrupoCostos(ACTIVIDAD_ID, VALID_INPUT)).rejects.toThrow(
      'Error al crear grupo: DB connection error'
    )
  })
})

// ── actualizarGrupoCostos ─────────────────────────────────

describe('actualizarGrupoCostos', () => {
  it('actualiza el grupo y retorna { ok: true } en éxito', async () => {
    mockCreateClient = vi.fn().mockResolvedValue(buildSupabaseOk())
    const { revalidatePath } = await import('next/cache')

    const result = await actualizarGrupoCostos(GRUPO_ID, ACTIVIDAD_ID, {
      nombre: 'Transporte',
      montoTotal: 200_000,
      itemsIds: ['item-3'],
    })

    expect(result).toEqual({ ok: true })
    expect(updatedGrupos).toHaveLength(1)
    expect(updatedGrupos[0]).toMatchObject({
      nombre: 'Transporte',
      monto_total: 200_000,
      items_ids: ['item-3'],
    })
    expect(revalidatePath).toHaveBeenCalledWith(`/liquidaciones/${ACTIVIDAD_ID}`)
  })

  it('lanza error cuando Supabase falla', async () => {
    mockCreateClient = vi.fn().mockResolvedValue(buildSupabaseError('update failed'))

    await expect(
      actualizarGrupoCostos(GRUPO_ID, ACTIVIDAD_ID, VALID_INPUT)
    ).rejects.toThrow('Error al actualizar grupo: update failed')
  })
})

// ── eliminarGrupoCostos ───────────────────────────────────

describe('eliminarGrupoCostos', () => {
  it('elimina el grupo y retorna { ok: true } en éxito', async () => {
    mockCreateClient = vi.fn().mockResolvedValue(buildSupabaseOk())
    const { revalidatePath } = await import('next/cache')

    const result = await eliminarGrupoCostos(GRUPO_ID, ACTIVIDAD_ID)

    expect(result).toEqual({ ok: true })
    expect(deletedGrupos).toHaveLength(1)
    expect(revalidatePath).toHaveBeenCalledWith(`/liquidaciones/${ACTIVIDAD_ID}`)
  })

  it('lanza error cuando Supabase falla', async () => {
    mockCreateClient = vi.fn().mockResolvedValue(buildSupabaseError('delete failed'))

    await expect(eliminarGrupoCostos(GRUPO_ID, ACTIVIDAD_ID)).rejects.toThrow(
      'Error al eliminar grupo: delete failed'
    )
  })
})

// ── registrarPagoGrupo ────────────────────────────────────

describe('registrarPagoGrupo', () => {
  it('inserta pago PENDIENTE y retorna { ok: true, costoId }', async () => {
    const insertados: any[] = []
    // PENDIENTE: _sincronizarMovimientoCosto no hace nada (no movimiento_id, no PAGADO)
    mockCreateClient = vi.fn().mockResolvedValue({
      from: (_table: string) => ({
        insert: (payload: any) => {
          insertados.push(payload)
          return {
            select: () => ({
              single: () => Promise.resolve({
                data: { id: 'pago-1', estado_pago: 'PENDIENTE', movimiento_id: null, actividad_id: ACTIVIDAD_ID, descripcion: 'Alimentación', monto: 200_000 },
                error: null,
              }),
            }),
          }
        },
        select: () => ({ eq: () => ({ eq: () => ({ single: () => Promise.resolve({ data: null, error: null }) }) }) }),
        update: () => ({ eq: () => Promise.resolve({ error: null }) }),
        delete: () => ({ eq: () => ({ eq: () => Promise.resolve({ error: null }) }) }),
      }),
    })
    const { revalidatePath } = await import('next/cache')

    const result = await registrarPagoGrupo({
      grupoId: GRUPO_ID,
      actividadId: ACTIVIDAD_ID,
      descripcion: 'Alimentación',
      monto: 200_000,
      estadoPago: 'PENDIENTE',
    })

    expect(result).toEqual({ ok: true, costoId: 'pago-1' })
    expect(insertados).toHaveLength(1)
    expect(insertados[0]).toMatchObject({
      actividad_id: ACTIVIDAD_ID,
      grupo_id: GRUPO_ID,
      item_id: null,
      monto: 200_000,
      descripcion: 'Alimentación',
      estado_pago: 'PENDIENTE',
      modo_registro: 'global',
      cantidad: 1,
    })
    expect(revalidatePath).toHaveBeenCalledWith(`/liquidaciones/${ACTIVIDAD_ID}`)
  })

  it('lanza error cuando la descripción está vacía', async () => {
    mockCreateClient = vi.fn().mockResolvedValue(buildSupabaseOk())

    await expect(registrarPagoGrupo({
      grupoId: GRUPO_ID,
      actividadId: ACTIVIDAD_ID,
      descripcion: '   ',
      monto: 200_000,
    })).rejects.toThrow('La descripción del pago es obligatoria.')
  })

  it('lanza error cuando el monto es 0', async () => {
    mockCreateClient = vi.fn().mockResolvedValue(buildSupabaseOk())

    await expect(registrarPagoGrupo({
      grupoId: GRUPO_ID,
      actividadId: ACTIVIDAD_ID,
      descripcion: 'Pago test',
      monto: 0,
    })).rejects.toThrow('El monto del pago debe ser mayor a cero.')
  })

  it('lanza error cuando monto es negativo', async () => {
    mockCreateClient = vi.fn().mockResolvedValue(buildSupabaseOk())

    await expect(registrarPagoGrupo({
      grupoId: GRUPO_ID,
      actividadId: ACTIVIDAD_ID,
      descripcion: 'Pago test',
      monto: -100,
    })).rejects.toThrow('El monto del pago debe ser mayor a cero.')
  })

  it('lanza error cuando Supabase falla al insertar', async () => {
    mockCreateClient = vi.fn().mockResolvedValue({
      from: (_table: string) => ({
        insert: (_payload: any) => ({
          select: () => ({
            single: () => Promise.resolve({ data: null, error: { message: 'insert failed' } }),
          }),
        }),
        select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: null, error: null }) }) }),
        update: () => ({ eq: () => Promise.resolve({ error: null }) }),
        delete: () => ({ eq: () => ({ eq: () => Promise.resolve({ error: null }) }) }),
      }),
    })

    await expect(registrarPagoGrupo({
      grupoId: GRUPO_ID,
      actividadId: ACTIVIDAD_ID,
      descripcion: 'Pago test',
      monto: 100_000,
    })).rejects.toThrow('Error al registrar el pago: insert failed')
  })
})

// ── eliminarPagoGrupo ─────────────────────────────────────

describe('eliminarPagoGrupo', () => {
  it('elimina el pago (sin movimiento) y retorna { ok: true }', async () => {
    const eliminados: string[] = []
    // Costo sin movimiento_id (PENDIENTE) → no toca movimientos_bancarios
    mockCreateClient = vi.fn().mockResolvedValue({
      from: (table: string) => ({
        select: (_cols: string) => ({
          eq: (col: string, val: string) => ({
            single: () => Promise.resolve({
              data: { id: val, movimiento_id: null, estado_pago: 'PENDIENTE', actividad_id: ACTIVIDAD_ID },
              error: null,
            }),
          }),
        }),
        delete: () => ({
          eq: (_col: string, id: string) => {
            eliminados.push(id)
            return Promise.resolve({ error: null })
          },
        }),
        insert: (_p: any) => ({ select: () => ({ single: () => Promise.resolve({ data: { id: 'x' }, error: null }) }) }),
        update: () => ({ eq: () => ({ eq: () => Promise.resolve({ error: null }) }) }),
      }),
    })

    const result = await eliminarPagoGrupo('pago-uuid-1', ACTIVIDAD_ID)

    expect(result).toEqual({ ok: true })
    expect(eliminados).toContain('pago-uuid-1')
  })

  it('lanza error cuando Supabase falla al leer el pago', async () => {
    mockCreateClient = vi.fn().mockResolvedValue({
      from: (_table: string) => ({
        select: () => ({
          eq: () => ({
            single: () => Promise.resolve({ data: null, error: { message: 'not found' } }),
          }),
        }),
        delete: () => ({ eq: () => Promise.resolve({ error: null }) }),
        insert: (_p: any) => ({ select: () => ({ single: () => Promise.resolve({ data: { id: 'x' }, error: null }) }) }),
        update: () => ({ eq: () => ({ eq: () => Promise.resolve({ error: null }) }) }),
      }),
    })

    await expect(eliminarPagoGrupo('pago-uuid-1', ACTIVIDAD_ID)).rejects.toThrow(
      'Error al leer el costo: not found'
    )
  })
})
