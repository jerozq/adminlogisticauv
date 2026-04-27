// ============================================================
// Value Object: SocioParticipacion
//
// Representa la participación de un socio en una actividad:
//   - socioId:             identificador único del socio
//   - nombreSocio:         nombre de display (desnormalizado para UI)
//   - porcentaje:          parte proporcional de la utilidad [0, 100]
//   - montoAportado:       capital adelantado de su bolsillo (se devuelve
//                          antes de repartir utilidad)
//
// Invariantes:
//   - porcentaje ∈ (0, 100]
//   - montoAportado ≥ 0
//
// Es inmutable: todas las propiedades son readonly.
// ============================================================

export interface SocioParticipacionProps {
  socioId: string
  nombreSocio: string
  porcentaje: number    // 0–100 (decimal; 50 = 50 %)
  montoAportado: number // COP, entero no negativo
}

export class SocioParticipacion {
  readonly socioId:      string
  readonly nombreSocio:  string
  readonly porcentaje:   number
  readonly montoAportado: number

  constructor(props: SocioParticipacionProps) {
    if (!props.socioId.trim()) {
      throw new Error('SocioParticipacion: socioId no puede estar vacío.')
    }
    if (props.porcentaje <= 0 || props.porcentaje > 100) {
      throw new Error(
        `SocioParticipacion: porcentaje debe estar entre 0 (exclusivo) y 100 (inclusivo). ` +
        `Recibido: ${props.porcentaje}`
      )
    }
    if (props.montoAportado < 0) {
      throw new Error(
        `SocioParticipacion: montoAportado no puede ser negativo. ` +
        `Recibido: ${props.montoAportado}`
      )
    }

    this.socioId       = props.socioId
    this.nombreSocio   = props.nombreSocio
    this.porcentaje    = props.porcentaje
    this.montoAportado = props.montoAportado
  }

  /** Calcula la porción de utilidad neta que corresponde a este socio. */
  calcularPorcionUtilidad(utilidadNeta: number): number {
    return utilidadNeta * (this.porcentaje / 100)
  }

  /**
   * Total que el socio recibe: se le devuelve lo que aportó
   * y además recibe su porción proporcional de la utilidad.
   */
  calcularMontoFinal(utilidadNeta: number): number {
    return this.montoAportado + this.calcularPorcionUtilidad(utilidadNeta)
  }

  /** Compara por socioId. */
  equals(other: SocioParticipacion): boolean {
    return this.socioId === other.socioId
  }
}

// ---------------------------------------------------------------
// Helpers de validación a nivel colección
// ---------------------------------------------------------------

/** Verifica que la suma de porcentajes sea exactamente 100 (tolerancia ±0.01). */
export function validarSumaParticipaciones(socios: SocioParticipacion[]): void {
  if (socios.length === 0) return // actividad sin socios definidos aún — se permite
  const suma = socios.reduce((acc, s) => acc + s.porcentaje, 0)
  if (Math.abs(suma - 100) > 0.01) {
    throw new Error(
      `La suma de porcentajes de participación debe ser 100 %. Suma actual: ${suma.toFixed(2)} %.`
    )
  }
}

/** Verifica que no existan socioIds duplicados. */
export function validarSociosDuplicados(socios: SocioParticipacion[]): void {
  const ids = socios.map((s) => s.socioId)
  const unicos = new Set(ids)
  if (unicos.size !== ids.length) {
    throw new Error('No puede haber socios duplicados en la misma actividad.')
  }
}
