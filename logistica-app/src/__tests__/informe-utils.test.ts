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

  it('marca inhumacion cuando la categoria es Inhumación aunque el tipo sea REEMBOLSO', () => {
    // Caso real: el ítem auto-inyectado desde el Excel ("Servicios de inhumación")
    // llegaba con tipo REEMBOLSO y descripción sin la palabra "inhumación",
    // clasificándose siempre como transporte. La categoria es la señal confiable.
    expect(obtenerTipoVisualReembolso('REEMBOLSO', 'Reembolso: Juan Pérez', 'Inhumación')).toBe('inhumacion')
  })
})