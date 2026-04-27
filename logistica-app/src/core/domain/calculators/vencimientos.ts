export interface CalculoVencimiento {
  label: string
  isLate: boolean
}

/**
 * Calcula el tiempo restante o atrasado (vencimiento) de una actividad.
 * Función pura de dominio para la Arquitectura Hexagonal.
 * 
 * @param targetTime - Fecha y hora objetivo (ej. inicio de actividad)
 * @param nowTime    - Tiempo actual (para tests, normalmente Date.now())
 * @param isDone     - Si la actividad ya fue completada
 * @returns {CalculoVencimiento | null} Etiqueta calculada y bandera de atraso. Null si target es inválido.
 */
export function calcularTiempoRestante(
  targetTime: string | number | Date | null | undefined,
  nowTime: number,
  isDone: boolean
): CalculoVencimiento | null {
  if (!targetTime) return null

  const targetDate = new Date(targetTime)
  const targetMs = targetDate.getTime()

  if (isNaN(targetMs)) return null

  if (isDone) {
    return { label: 'Completado', isLate: false }
  }

  const diffMs = targetMs - nowTime
  const absDiff = Math.abs(diffMs)

  const d = Math.floor(absDiff / (1000 * 60 * 60 * 24))
  const h = Math.floor((absDiff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  const m = Math.floor((absDiff % (1000 * 60 * 60)) / (1000 * 60))

  if (diffMs > 0) {
    // Futuro (cuenta regresiva)
    if (d > 0) return { label: `Faltan ${d}d ${h}h`, isLate: false }
    return { label: `Faltan ${h}h ${m}m`, isLate: false }
  } else {
    // Pasado (lleva x tiempo o es un atraso)
    if (d > 0) return { label: `Hace ${d}d ${h}h`, isLate: true }
    return { label: `Hace ${h}h ${m}m`, isLate: true }
  }
}
