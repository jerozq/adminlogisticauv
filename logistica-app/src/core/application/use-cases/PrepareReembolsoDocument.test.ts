import { describe, it, expect } from 'vitest'
import { Reembolso } from '@/src/core/domain/entities/Reembolso'
import type { IReembolsoRepository } from '@/src/core/domain/ports/IReembolsoRepository'
import { PrepareReembolsoDocument } from '@/src/core/application/use-cases/PrepareReembolsoDocument'

class ReembolsoRepoStub implements IReembolsoRepository {
  private readonly store = new Map<string, Reembolso>()

  async listarPorActividad(actividadId: string): Promise<Reembolso[]> {
    return [...this.store.values()].filter((r) => r.actividadId === actividadId)
  }

  async guardar(reembolso: Reembolso): Promise<Reembolso> {
    if (this.store.has(reembolso.id)) {
      throw new Error(`Reembolso '${reembolso.id}' ya existe. Usa actualizar() para modificarlo.`)
    }
    this.store.set(reembolso.id, reembolso)
    return reembolso
  }

  async actualizar(reembolso: Reembolso): Promise<Reembolso> {
    if (!this.store.has(reembolso.id)) {
      throw new Error(`Reembolso '${reembolso.id}' no encontrado en el repositorio.`)
    }
    this.store.set(reembolso.id, reembolso)
    return reembolso
  }

  async eliminar(id: string): Promise<void> {
    this.store.delete(id)
  }
}

describe('PrepareReembolsoDocument', () => {
  it('actualiza tipo de TRANSPORTE a INHUMACION en una edición existente', async () => {
    const repo = new ReembolsoRepoStub()

    const original = new Reembolso({
      id: 'reemb-1',
      actividadId: 'act-1',
      tipo: 'TRANSPORTE',
      personaNombre: 'Laura Mora',
      documento: 'CC 123',
      celular: '3001234567',
      rutaOrigen: 'Cali',
      rutaDestino: 'Palmira',
      fecha: '2026-05-14',
      valor: 120000,
    })

    await repo.guardar(original)

    const uc = new PrepareReembolsoDocument(repo)
    const output = await uc.execute({
      reembolso: {
        ...original.toProps(),
        tipo: 'INHUMACION',
        valor: 510000,
      },
    })

    expect(output.operacion).toBe('edicion')
    expect(output.reembolso.tipo).toBe('INHUMACION')
    expect(output.reembolso.valor).toBe(510000)

    const persisted = await repo.listarPorActividad('act-1')
    expect(persisted).toHaveLength(1)
    expect(persisted[0].id).toBe('reemb-1')
    expect(persisted[0].tipo).toBe('INHUMACION')
  })

  it('falla si el valor queda en cero al editar tipo y no persiste cambios', async () => {
    const repo = new ReembolsoRepoStub()

    const original = new Reembolso({
      id: 'reemb-2',
      actividadId: 'act-2',
      tipo: 'TRANSPORTE',
      personaNombre: 'Carlos Ruiz',
      documento: 'CC 999',
      celular: null,
      rutaOrigen: 'Neiva',
      rutaDestino: 'Cali',
      fecha: '2026-05-14',
      valor: 220000,
    })

    await repo.guardar(original)

    const uc = new PrepareReembolsoDocument(repo)

    await expect(
      uc.execute({
        reembolso: {
          ...original.toProps(),
          tipo: 'INHUMACION',
          valor: 0,
        },
      }),
    ).rejects.toThrow('el valor debe ser mayor a cero')

    const persisted = await repo.listarPorActividad('act-2')
    expect(persisted).toHaveLength(1)
    expect(persisted[0].tipo).toBe('TRANSPORTE')
    expect(persisted[0].valor).toBe(220000)
  })
})
