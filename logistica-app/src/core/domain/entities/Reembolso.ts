// ============================================================
// Entidad de dominio: Reembolso
//
// Representa el reconocimiento económico que la UV hace a una
// persona (víctima, funcionario o tercero) por concepto de
// transporte o inhumación, dentro de una actividad logística.
//
// Invariantes:
//   - El tipo es TRANSPORTE o INHUMACION.
//   - El valor debe ser mayor a cero.
//   - valorEnLetras() convierte el monto a texto en español
//     para ser impreso en el formato oficial.
// ============================================================

export type TipoReembolso = 'TRANSPORTE' | 'INHUMACION'

export interface ReembolsoProps {
  /** Identificador único del reembolso (puede ser generado localmente). */
  id: string
  /** Actividad a la que pertenece este reembolso. */
  actividadId: string
  /** Clasificación del reconocimiento económico. */
  tipo: TipoReembolso
  /** Nombre completo de la persona beneficiaria. */
  personaNombre: string
  /** Número de documento de identidad de la persona beneficiaria. */
  documento: string
  /** Número de celular de contacto (puede ser nulo si no se dispone). */
  celular: string | null
  /** Municipio o lugar de origen del desplazamiento / servicio. */
  rutaOrigen: string
  /** Municipio o lugar de destino del desplazamiento / servicio. */
  rutaDestino: string
  /** Fecha del desplazamiento o prestación del servicio (YYYY-MM-DD). */
  fecha: string
  /** Valor del reembolso en COP (número entero positivo). */
  valor: number
}

// ---------------------------------------------------------------
// Listas de conversión numérica (español colombiano)
// ---------------------------------------------------------------
const UNIDADES = [
  '', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve',
  'diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete',
  'dieciocho', 'diecinueve',
]

const VEINTIS = [
  'veinte', 'veintiuno', 'veintidós', 'veintitrés', 'veinticuatro',
  'veinticinco', 'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve',
]

const DECENAS = [
  '', '', 'veinte', 'treinta', 'cuarenta', 'cincuenta',
  'sesenta', 'setenta', 'ochenta', 'noventa',
]

const CENTENAS = [
  '', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos',
  'seiscientos', 'setecientos', 'ochocientos', 'novecientos',
]

// ---------------------------------------------------------------
// Funciones auxiliares de conversión (módulo-nivel, no exportadas)
// ---------------------------------------------------------------

function menorCien(n: number): string {
  if (n < 20) return UNIDADES[n]
  if (n < 30) return VEINTIS[n - 20]
  const d = Math.floor(n / 10)
  const u = n % 10
  return u === 0 ? DECENAS[d] : `${DECENAS[d]} y ${UNIDADES[u]}`
}

function menorMil(n: number): string {
  if (n === 0) return ''
  if (n < 100) return menorCien(n)
  if (n === 100) return 'cien'
  const c = Math.floor(n / 100)
  const resto = n % 100
  const centena = CENTENAS[c]
  return resto === 0 ? centena : `${centena} ${menorCien(resto)}`
}

function convertirALetras(n: number): string {
  if (n === 0) return 'cero'
  if (n < 1000) return menorMil(n)
  if (n < 1_000_000) {
    const miles = Math.floor(n / 1000)
    const resto = n % 1000
    const prefijo = miles === 1 ? 'mil' : `${menorMil(miles)} mil`
    return resto === 0 ? prefijo : `${prefijo} ${menorMil(resto)}`
  }
  // millones
  const mill = Math.floor(n / 1_000_000)
  const resto = n % 1_000_000
  const prefijo = mill === 1 ? 'un millón' : `${convertirALetras(mill)} millones`
  return resto === 0 ? prefijo : `${prefijo} ${convertirALetras(resto)}`
}

// ---------------------------------------------------------------
// Entidad
// ---------------------------------------------------------------

export class Reembolso {
  readonly id: string
  readonly actividadId: string
  readonly tipo: TipoReembolso
  readonly personaNombre: string
  readonly documento: string
  readonly celular: string | null
  readonly rutaOrigen: string
  readonly rutaDestino: string
  readonly fecha: string
  readonly valor: number

  constructor(props: ReembolsoProps) {
    if (props.valor <= 0) {
      throw new Error(
        `Reembolso de "${props.personaNombre}": el valor debe ser mayor a cero (recibido: ${props.valor}).`
      )
    }
    if (!props.personaNombre.trim()) {
      throw new Error('Reembolso: personaNombre no puede estar vacío.')
    }
    if (!props.documento.trim()) {
      throw new Error('Reembolso: documento no puede estar vacío.')
    }

    this.id            = props.id
    this.actividadId   = props.actividadId
    this.tipo          = props.tipo
    this.personaNombre = props.personaNombre.trim()
    this.documento     = props.documento.trim()
    this.celular       = props.celular
    this.rutaOrigen    = props.rutaOrigen
    this.rutaDestino   = props.rutaDestino
    this.fecha         = props.fecha
    this.valor         = Math.round(props.valor)
  }

  // ---------------------------------------------------------------
  // Método de dominio: valor en letras
  // ---------------------------------------------------------------

  /**
   * Convierte el valor del reembolso a su representación en texto
   * en español colombiano, lista para ser impresa en el documento oficial.
   *
   * Ejemplo: 250_000 → "DOSCIENTOS CINCUENTA MIL PESOS M/CTE"
   */
  valorEnLetras(): string {
    const letras = convertirALetras(this.valor)
    return `${letras.toUpperCase()} PESOS M/CTE`
  }

  toProps(): ReembolsoProps {
    return {
      id:            this.id,
      actividadId:   this.actividadId,
      tipo:          this.tipo,
      personaNombre: this.personaNombre,
      documento:     this.documento,
      celular:       this.celular,
      rutaOrigen:    this.rutaOrigen,
      rutaDestino:   this.rutaDestino,
      fecha:         this.fecha,
      valor:         this.valor,
    }
  }
}
