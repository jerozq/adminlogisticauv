/**
 * Conversor de número a letras en español colombiano.
 * Resultado en mayúsculas con sufijo "PESOS M/CTE."
 * Soporta hasta 999.999.999.999 (casi un billón).
 */

const U30 = [
  '',
  'UN',
  'DOS',
  'TRES',
  'CUATRO',
  'CINCO',
  'SEIS',
  'SIETE',
  'OCHO',
  'NUEVE',
  'DIEZ',
  'ONCE',
  'DOCE',
  'TRECE',
  'CATORCE',
  'QUINCE',
  'DIECISÉIS',
  'DIECISIETE',
  'DIECIOCHO',
  'DIECINUEVE',
  'VEINTE',
  'VEINTIÚN',
  'VEINTIDÓS',
  'VEINTITRÉS',
  'VEINTICUATRO',
  'VEINTICINCO',
  'VEINTISÉIS',
  'VEINTISIETE',
  'VEINTIOCHO',
  'VEINTINUEVE',
]

const DECENAS = [
  '',
  '',
  'VEINTE',
  'TREINTA',
  'CUARENTA',
  'CINCUENTA',
  'SESENTA',
  'SETENTA',
  'OCHENTA',
  'NOVENTA',
]

const CENTENAS = [
  '',
  'CIENTO',
  'DOSCIENTOS',
  'TRESCIENTOS',
  'CUATROCIENTOS',
  'QUINIENTOS',
  'SEISCIENTOS',
  'SETECIENTOS',
  'OCHOCIENTOS',
  'NOVECIENTOS',
]

/** Convierte 1–999 a texto. */
function menorMil(n: number): string {
  if (n === 0) return ''
  if (n < 30) return U30[n]

  if (n < 100) {
    const d = Math.floor(n / 10)
    const u = n % 10
    if (u === 0) return DECENAS[d]
    return `${DECENAS[d]} Y ${U30[u]}`
  }

  // 100 sola → CIEN; 101-999 → CIENTO / DOSCIENTOS…
  const c = Math.floor(n / 100)
  const resto = n % 100
  if (n === 100) return 'CIEN'
  if (resto === 0) return CENTENAS[c]
  return `${CENTENAS[c]} ${menorMil(resto)}`
}

/**
 * Convierte un número entero positivo a su representación en palabras
 * en español de Colombia (mayúsculas) con el sufijo "PESOS M/CTE."
 *
 * @example
 *   numeroALetras(1500000)  // "UN MILLÓN QUINIENTOS MIL PESOS M/CTE."
 *   numeroALetras(250)      // "DOSCIENTOS CINCUENTA PESOS M/CTE."
 */
export function numeroALetras(valor: number): string {
  const entero = Math.max(0, Math.floor(Math.abs(valor)))

  if (entero === 0) return 'CERO PESOS M/CTE.'

  const miles_millones = Math.floor(entero / 1_000_000_000)
  const millones       = Math.floor((entero % 1_000_000_000) / 1_000_000)
  const miles          = Math.floor((entero % 1_000_000) / 1_000)
  const unidades       = entero % 1_000

  const partes: string[] = []

  // Miles de millones
  if (miles_millones > 0) {
    if (miles_millones === 1) {
      partes.push('MIL MILLONES')
    } else {
      partes.push(`${menorMil(miles_millones)} MIL MILLONES`)
    }
  }

  // Millones
  if (millones > 0) {
    if (millones === 1) {
      partes.push('UN MILLÓN')
    } else {
      partes.push(`${menorMil(millones)} MILLONES`)
    }
  }

  // Miles
  if (miles > 0) {
    if (miles === 1) {
      partes.push('MIL')
    } else {
      partes.push(`${menorMil(miles)} MIL`)
    }
  }

  // Unidades
  if (unidades > 0) {
    partes.push(menorMil(unidades))
  }

  return partes.join(' ') + ' PESOS M/CTE.'
}
