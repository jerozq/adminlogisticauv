import { describe, expect, it } from 'vitest'
import { obtenerTipoVisualReembolso } from '@/lib/informe-utils'

describe('obtenerTipoVisualReembolso', () => {
  it('marca inhumacion cuando el tipo es INHUMACION', () => {
    expect(obtenerTipoVisualReembolso('INHUMACION', 'Reembolso')).toBe('inhumacion')
  })

  it('marca inhumacion cuando el tipo legado es PASIVO_TERCERO', () => {
    expect(obtenerTipoVisualReembolso('PASIVO_TERCERO', 'Reembolso')).toBe('inhumacion')
  })

  it('marca transporte para otros tipos', () => {
    expect(obtenerTipoVisualReembolso('TRANSPORTE', 'Reembolso')).toBe('transporte')
  })
})