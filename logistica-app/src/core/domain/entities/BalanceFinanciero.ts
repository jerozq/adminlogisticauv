import type { FuenteFinanciacion, DistribucionFinanciero } from '@/src/types/domain'
import type { SocioParticipacionProps } from '@/src/core/domain/value-objects/SocioParticipacion'
import type { Actividad } from './Actividad'
import type { Reembolso } from './Reembolso'

// ============================================================
// Entidad de dominio: BalanceFinanciero
//
// Agrega los números financieros de una Actividad en un objeto
// de solo lectura e inmutable. Expone:
//   - utilidadBruta   = totalCotizado - totalCostosReales
//   - utilidadNeta    = utilidadBruta  - totalReembolsos - costosOperativos
//   - repartirUtilidades() → DistribucionFinanciero[]
//
// Regla de reparto (hexagonal / single-responsibility):
//   1. Se devuelve primero el "Capital Aportado" de cada socio.
//   2. El remanente (utilidadNeta - totalCapital) se reparte
//      según el % de participación configurado para la actividad.
//
// Casos borde:
//   - remanente < 0  y  utilidadNeta >= 0:
//       No hay suficiente para devolver todo el capital.
//       Se distribuye el disponible pro-rata al capital aportado.
//   - utilidadNeta < 0 (pérdida neta):
//       Cada socio absorbe la pérdida proporcionalmente a su %.
// ============================================================

// ---------------------------------------------------------------
// Props de construcción
// ---------------------------------------------------------------

export interface BalanceFinancieroProps {
  /** ID de la Actividad a la que pertenece este balance. */
  actividadId: string

  /** Nombre legible de la actividad (desnormalizado para reportes). */
  nombreActividad: string

  /** Municipio donde se ejecutó la actividad. */
  municipio: string | null

  /**
   * Fecha de inicio de la actividad (YYYY-MM-DD).
   * Se usa como clave de agrupación mensual en IReportingRepository.
   */
  fechaActividad: string | null

  /** Mecanismo de fondeo de la actividad. */
  fuenteFinanciacion: FuenteFinanciacion

  /** Suma de precioTotal de todos los ítems cotizados (ingresos esperados). */
  totalCotizado: number

  /** Suma de monto de todos los costos reales registrados. */
  totalCostosReales: number

  /** Suma del valor de todos los reembolsos aplicados a la actividad. */
  totalReembolsos: number

  /**
   * Costos operativos / administrativos adicionales (ej. papelería, comunicaciones).
   * Por defecto 0 cuando no se especifica.
   */
  costosOperativos?: number

  /**
   * Participaciones de los socios para el reparto de utilidades.
   * Si está vacío, repartirUtilidades() lanza un error descriptivo.
   */
  participaciones: SocioParticipacionProps[]
}

// ---------------------------------------------------------------
// Entidad
// ---------------------------------------------------------------

export class BalanceFinanciero {
  readonly actividadId:      string
  readonly nombreActividad:  string
  readonly municipio:        string | null
  readonly fechaActividad:   string | null
  readonly fuenteFinanciacion: FuenteFinanciacion
  readonly totalCotizado:    number
  readonly totalCostosReales: number
  readonly totalReembolsos:  number
  readonly costosOperativos: number
  readonly participaciones:  ReadonlyArray<SocioParticipacionProps>

  constructor(props: BalanceFinancieroProps) {
    if (props.totalCotizado < 0) {
      throw new Error('BalanceFinanciero: totalCotizado no puede ser negativo.')
    }
    if (props.totalCostosReales < 0) {
      throw new Error('BalanceFinanciero: totalCostosReales no puede ser negativo.')
    }
    if (props.totalReembolsos < 0) {
      throw new Error('BalanceFinanciero: totalReembolsos no puede ser negativo.')
    }
    if ((props.costosOperativos ?? 0) < 0) {
      throw new Error('BalanceFinanciero: costosOperativos no puede ser negativo.')
    }

    this.actividadId       = props.actividadId
    this.nombreActividad   = props.nombreActividad
    this.municipio         = props.municipio
    this.fechaActividad    = props.fechaActividad
    this.fuenteFinanciacion = props.fuenteFinanciacion
    this.totalCotizado     = props.totalCotizado
    this.totalCostosReales = props.totalCostosReales
    this.totalReembolsos   = props.totalReembolsos
    this.costosOperativos  = props.costosOperativos ?? 0
    this.participaciones   = Object.freeze([...props.participaciones])
  }

  // ---------------------------------------------------------------
  // Computed — utilidades
  // ---------------------------------------------------------------

  /**
   * Diferencia entre lo cotizado y los costos reales.
   * utilidadBruta = totalCotizado - totalCostosReales
   */
  get utilidadBruta(): number {
    return this.totalCotizado - this.totalCostosReales
  }

  /**
   * Utilidad después de descontar reembolsos y costos operativos.
   * utilidadNeta = utilidadBruta - totalReembolsos - costosOperativos
   */
  get utilidadNeta(): number {
    return this.utilidadBruta - this.totalReembolsos - this.costosOperativos
  }

  /**
   * Suma de todo el capital aportado por los socios.
   * Este monto se devuelve antes de repartir el remanente.
   */
  get totalCapitalAportado(): number {
    return this.participaciones.reduce((s, p) => s + p.montoAportado, 0)
  }

  /**
   * Remanente disponible después de devolver todo el capital.
   * Si es positivo: existe ganancia para repartir.
   * Si es negativo: el capital no alcanza a recuperarse en su totalidad.
   */
  get remanente(): number {
    return this.utilidadNeta - this.totalCapitalAportado
  }

  // ---------------------------------------------------------------
  // Regla de negocio: Reparto de Utilidades
  // ---------------------------------------------------------------

  /**
   * Calcula cómo se distribuye la utilidad neta entre los socios,
   * aplicando la regla "capital primero, remanente por %".
   *
   * Casos de borde manejados:
   *   - Remanente ≥ 0: capital devuelto íntegro + remanente por %.
   *   - 0 ≤ utilidadNeta < totalCapital: capital devuelto pro-rata.
   *   - utilidadNeta < 0 (pérdida): pérdida absorbida por % de participación.
   *
   * @throws {Error} Si no hay participaciones configuradas.
   * @throws {Error} Si la suma de porcentajes no es exactamente 100.
   */
  repartirUtilidades(): DistribucionFinanciero[] {
    if (this.participaciones.length === 0) {
      throw new Error(
        'BalanceFinanciero: no hay socios configurados para repartir utilidades. ' +
        'Define participaciones antes de llamar a repartirUtilidades().',
      )
    }

    const sumaPorc = this.participaciones.reduce((s, p) => s + p.porcentaje, 0)
    if (Math.abs(sumaPorc - 100) > 0.01) {
      throw new Error(
        `BalanceFinanciero: la suma de porcentajes debe ser 100 %. ` +
        `Suma actual: ${sumaPorc.toFixed(2)} %.`,
      )
    }

    const totalCapital = this.totalCapitalAportado
    const remanente    = this.remanente
    const utilidadNeta = this.utilidadNeta

    return this.participaciones.map((p) => {
      let devolucionCapital: number
      let porcionRemanente: number

      if (remanente >= 0) {
        // Caso normal: capital devuelto íntegro + porción del remanente
        devolucionCapital = p.montoAportado
        porcionRemanente  = remanente * (p.porcentaje / 100)
      } else if (utilidadNeta >= 0 && totalCapital > 0) {
        // Capital parcial: se distribuye lo disponible pro-rata al capital aportado
        devolucionCapital = utilidadNeta * (p.montoAportado / totalCapital)
        porcionRemanente  = 0
      } else {
        // Pérdida neta: cada socio absorbe por % de participación
        devolucionCapital = 0
        porcionRemanente  = utilidadNeta * (p.porcentaje / 100)
      }

      return {
        socioId:          p.socioId,
        nombreSocio:      p.nombreSocio,
        porcentaje:       p.porcentaje,
        montoAportado:    p.montoAportado,
        devolucionCapital: Math.round(devolucionCapital),
        porcionRemanente:  Math.round(porcionRemanente),
        totalRecibe:       Math.round(devolucionCapital + porcionRemanente),
      }
    })
  }

  // ---------------------------------------------------------------
  // Serialización
  // ---------------------------------------------------------------

  toProps(): BalanceFinancieroProps {
    return {
      actividadId:       this.actividadId,
      nombreActividad:   this.nombreActividad,
      municipio:         this.municipio,
      fechaActividad:    this.fechaActividad,
      fuenteFinanciacion: this.fuenteFinanciacion,
      totalCotizado:     this.totalCotizado,
      totalCostosReales: this.totalCostosReales,
      totalReembolsos:   this.totalReembolsos,
      costosOperativos:  this.costosOperativos,
      participaciones:   [...this.participaciones],
    }
  }

  // ---------------------------------------------------------------
  // Factory estático
  // ---------------------------------------------------------------

  /**
   * Construye un BalanceFinanciero directamente desde una Actividad y
   * sus reembolsos resueltos, evitando repetir la suma manual.
   *
   * @param actividad         - Entidad Actividad con costos e ítems cargados.
   * @param reembolsos        - Lista de reembolsos aplicados a la actividad.
   * @param fuenteFinanciacion - Puede sobreescribir el valor guardado en Actividad.
   * @param costosOperativos  - Costos extra opcionales (papelería, etc.).
   */
  static desdeActividad(
    actividad:         Actividad,
    reembolsos:        Reembolso[],
    fuenteFinanciacion?: FuenteFinanciacion,
    costosOperativos?:  number,
  ): BalanceFinanciero {
    const totalCotizado    = actividad.items.reduce((s, it) => s + it.precioTotal, 0)
    const totalCostosReales = actividad.costos.reduce((s, c) => s + c.monto, 0)
    const totalReembolsos  = reembolsos.reduce((s, r) => s + r.valor, 0)

    const participaciones = actividad.participaciones.map((p) => ({
      socioId:      p.socioId,
      nombreSocio:  p.nombreSocio,
      porcentaje:   p.porcentaje,
      montoAportado: p.montoAportado,
    }))

    return new BalanceFinanciero({
      actividadId:       actividad.id,
      nombreActividad:   actividad.nombreActividad,
      municipio:         actividad.municipio,
      fechaActividad:    actividad.fechaInicio,
      fuenteFinanciacion: fuenteFinanciacion ?? actividad.fuenteFinanciacion,
      totalCotizado,
      totalCostosReales,
      totalReembolsos,
      costosOperativos:  costosOperativos ?? 0,
      participaciones,
    })
  }
}
