import { describe, it, expect } from 'vitest'
import { calcularTiempoRestante } from '../core/domain/calculators/vencimientos'

describe('Domain: calcularTiempoRestante (IA de Vencimientos)', () => {
  it('retorna "Completado" si isDone es verdadero, sin importar fechas', () => {
    const res = calcularTiempoRestante('2026-05-01T10:00:00', Date.now(), true)
    expect(res).toEqual({ label: 'Completado', isLate: false })
  })

  it('retorna null si targetTime es inválido', () => {
    expect(calcularTiempoRestante('', Date.now(), false)).toBeNull()
    expect(calcularTiempoRestante('invalid-date', Date.now(), false)).toBeNull()
  })

  it('calcula cuenta regresiva correcta (futuro)', () => {
    // Escenario: Faltan 2 días y 5 horas exactas
    const now = new Date('2026-04-20T10:00:00').getTime()
    const target = new Date('2026-04-22T15:00:00').getTime() // + 2d 5h

    const res = calcularTiempoRestante(target, now, false)
    expect(res).toEqual({ label: 'Faltan 2d 5h', isLate: false })
  })

  it('calcula cuenta regresiva correcta (menos de 1 día, futuro)', () => {
    // Escenario: Faltan 14 horas y 30 minutos
    const now = new Date('2026-04-20T10:00:00').getTime()
    const target = new Date('2026-04-21T00:30:00').getTime() 

    const res = calcularTiempoRestante(target, now, false)
    expect(res).toEqual({ label: 'Faltan 14h 30m', isLate: false })
  })

  it('calcula atraso correcto (pasado)', () => {
    // Escenario: Pasaron 3 días y 2 horas
    const target = new Date('2026-04-20T10:00:00').getTime()
    const now = new Date('2026-04-23T12:00:00').getTime()

    const res = calcularTiempoRestante(target, now, false)
    expect(res).toEqual({ label: 'Hace 3d 2h', isLate: true })
  })

  it('calcula atraso correcto (menos de 1 día, pasado)', () => {
    // Escenario: Pasaron 5 horas y 15 minutos
    const target = new Date('2026-04-20T10:00:00').getTime()
    const now = new Date('2026-04-20T15:15:00').getTime()

    const res = calcularTiempoRestante(target, now, false)
    expect(res).toEqual({ label: 'Hace 5h 15m', isLate: true })
  })
})
