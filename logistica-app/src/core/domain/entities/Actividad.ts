import { TRANSICIONES_VALIDAS as TRANS } from '@/src/types/domain'
import type {
  CostoReal,
  EntregaHito,
  EstadoActividad,
  FuenteFinanciacion,
  ItemCotizado,
  ResumenLiquidacion,
  DistribucionSocio,
  ReembolsoBeneficiario,
} from '@/src/types/domain'
import {
  SocioParticipacion,
  validarSumaParticipaciones,
  validarSociosDuplicados,
} from '@/src/core/domain/value-objects/SocioParticipacion'
import { Reembolso } from '@/src/core/domain/entities/Reembolso'

// ============================================================
// Entidad de dominio: Actividad
//
// Encapsula las invariantes del negocio:
//   1. Máquina de estados del ciclo de vida de la actividad.
//   2. Regla de distribución de utilidades variable por socio:
//      cada socio define su % de participación. Los aportes de
//      capital se devuelven antes de repartir la utilidad neta.
// ============================================================

export interface ActividadProps {
  id: string
  numeroRequerimiento: string | null
  nombreActividad: string
  municipio: string | null
  fechaInicio: string | null
  fechaFin: string | null
  horaInicio: string | null
  estado: EstadoActividad
  items: ItemCotizado[]
  costos: CostoReal[]
  entregas: EntregaHito[]
  /** Configuración de participación por socio. Puede estar vacía mientras no se defina. */
  participaciones?: SocioParticipacion[]
  /**
   * Beneficiarios de reembolso extraídos del requerimiento (hoja Excel).
   * Se usa como fuente de datos para extraerReembolsos().
   */
  reembolsosRequerimiento?: ReembolsoBeneficiario[]
  /**
   * Mecanismo de fondeo de la actividad.
   * Por defecto 'Fondo Propio' cuando no se especifica.
   */
  fuenteFinanciacion?: FuenteFinanciacion
}

export class Actividad {
  readonly id: string
  readonly numeroRequerimiento: string | null
  readonly nombreActividad: string
  readonly municipio: string | null
  readonly fechaInicio: string | null
  readonly fechaFin: string | null
  readonly horaInicio: string | null
  readonly estado: EstadoActividad
  readonly items: ReadonlyArray<ItemCotizado>
  readonly costos: ReadonlyArray<CostoReal>
  readonly entregas: ReadonlyArray<EntregaHito>
  readonly participaciones: ReadonlyArray<SocioParticipacion>
  readonly reembolsosRequerimiento: ReadonlyArray<ReembolsoBeneficiario>
  readonly fuenteFinanciacion: FuenteFinanciacion

  constructor(props: ActividadProps) {
    this.id = props.id
    this.numeroRequerimiento = props.numeroRequerimiento
    this.nombreActividad = props.nombreActividad
    this.municipio = props.municipio
    this.fechaInicio = props.fechaInicio
    this.fechaFin = props.fechaFin
    this.horaInicio = props.horaInicio
    this.estado = props.estado
    this.items = Object.freeze([...props.items])
    this.costos = Object.freeze([...props.costos])
    this.entregas = Object.freeze([...props.entregas])
    this.participaciones = Object.freeze([...(props.participaciones ?? [])])
    this.reembolsosRequerimiento = Object.freeze([...(props.reembolsosRequerimiento ?? [])])
    this.fuenteFinanciacion = props.fuenteFinanciacion ?? 'Fondo Propio'
  }

  // ---------------------------------------------------------------
  // Máquina de estados
  // ---------------------------------------------------------------

  /** Verifica si la transición hacia `nuevoEstado` es válida según las reglas del dominio. */
  puedeTransicionarA(nuevoEstado: EstadoActividad): boolean {
    return (TRANS[this.estado] as EstadoActividad[]).includes(nuevoEstado)
  }

  /**
   * Retorna el estado resultado de la transición, o lanza un error si es inválida.
   * No muta el objeto; retorna una nueva instancia.
   */
  transicionarA(nuevoEstado: EstadoActividad): Actividad {
    if (!this.puedeTransicionarA(nuevoEstado)) {
      throw new Error(
        `Transición inválida: ${this.estado} → ${nuevoEstado}. ` +
        `Estados permitidos desde '${this.estado}': [${TRANS[this.estado].join(', ')}]`
      )
    }
    return new Actividad({ ...this._toProps(), estado: nuevoEstado })
  }

  /** Transiciones disponibles desde el estado actual. */
  transicionesDisponibles(): EstadoActividad[] {
    return [...TRANS[this.estado]]
  }

  // ---------------------------------------------------------------
  // Regla de negocio: Distribución de utilidades variable
  //
  // Fórmula general:
  //   utilidadNeta = ingresoTotal - gastosTotales
  //   socio[i].recibe = socio[i].montoAportado
  //                   + utilidadNeta * (socio[i].porcentaje / 100)
  //
  // Los aportes de capital se devuelven antes de repartir
  // la utilidad neta. La distribución es proporcional al % acordado.
  // ---------------------------------------------------------------

  /** Ingreso total según los ítems cotizados (suma de precioTotal). */
  get ingresoTotal(): number {
    return this.items.reduce((sum, it) => sum + it.precioTotal, 0)
  }

  /**
   * Calcula cuánto recibe cada socio según los porcentajes de participación.
   *
   * Requiere que la suma de participaciones sea exactamente 100 %.
   * Si no hay participaciones definidas, lanza un error.
   *
   * @throws {Error} Si la suma de porcentajes no es 100 %.
   * @throws {Error} Si no hay participaciones configuradas.
   */
  calcularDistribucion(): DistribucionSocio[] {
    if (this.participaciones.length === 0) {
      throw new Error(
        'No hay socios configurados para esta actividad. ' +
        'Define las participaciones antes de calcular la distribución.'
      )
    }
    validarSumaParticipaciones([...this.participaciones])

    const gastosTotales = this.costos.reduce((s, c) => s + c.monto, 0)
    const utilidadNeta  = this.ingresoTotal - gastosTotales

    return this.participaciones.map((s) => ({
      socioId:        s.socioId,
      nombreSocio:    s.nombreSocio,
      porcentaje:     s.porcentaje,
      montoAportado:  s.montoAportado,
      porcionUtilidad: s.calcularPorcionUtilidad(utilidadNeta),
      totalRecibe:    s.calcularMontoFinal(utilidadNeta),
    }))
  }

  /**
   * Calcula el resumen financiero global de la actividad.
   * Remplaza al antiguo calcularLiquidacion() 50/50.
   */
  calcularResumenFinanciero(): ResumenLiquidacion {
    const gastosTotales = this.costos.reduce((s, c) => s + c.monto, 0)
    const pagadoJero    = this.costos
      .filter((c) => c.pagador === 'jero')
      .reduce((s, c) => s + c.monto, 0)
    const pagadoSocio   = this.costos
      .filter((c) => c.pagador === 'socio')
      .reduce((s, c) => s + c.monto, 0)
    const pagadoCaja    = this.costos
      .filter((c) => c.pagador === 'caja_proyecto')
      .reduce((s, c) => s + c.monto, 0)

    const utilidadNeta = this.ingresoTotal - gastosTotales

    // Si hay participaciones definidas y suman 100%, calcular distribución.
    // Si no, caer de vuelta al 50/50 para retrocompatibilidad.
    let jeroRecibe  = pagadoJero  + utilidadNeta / 2
    let socioRecibe = pagadoSocio + utilidadNeta / 2

    if (this.participaciones.length === 2) {
      try {
        const dist = this.calcularDistribucion()
        const p0 = dist[0]
        const p1 = dist[1]
        jeroRecibe  = p0.totalRecibe
        socioRecibe = p1.totalRecibe
      } catch { /* Mantener 50/50 si los porcentajes no suman 100 */ }
    }

    return {
      ingresoTotal: this.ingresoTotal,
      gastosTotales,
      pagadoJero,
      pagadoSocio,
      pagadoCaja,
      utilidadNeta,
      jeroRecibe,
      socioRecibe,
    }
  }

  /**
   * @deprecated Usa calcularResumenFinanciero() o calcularDistribucion().
   * Mantenido por retrocompatibilidad. Aplica la regla 50/50.
   */
  calcularLiquidacion(): ResumenLiquidacion {
    return this.calcularResumenFinanciero()
  }

  // ---------------------------------------------------------------
  // Reembolsos: extracción automática desde el requerimiento
  // ---------------------------------------------------------------

  /**
   * Identifica automáticamente quiénes aplican a un reembolso según
   * los datos del requerimiento y los ítems cotizados de la actividad.
   *
   * Reglas de clasificación:
   *   - TRANSPORTE  → beneficiarios con valorTransporte > 0.
   *   - INHUMACION  → beneficiarios con valorOtros > 0 cuando la
   *     actividad incluye ítems de la categoría "INHUMACION".
   *
   * Si no hay datos de beneficiarios cargados en el requerimiento,
   * retorna un arreglo vacío.
   *
   * @returns Lista de entidades Reembolso derivadas automáticamente.
   */
  extraerReembolsos(): Reembolso[] {
    if (this.reembolsosRequerimiento.length === 0) return []

    const fecha = this.fechaInicio ?? new Date().toISOString().split('T')[0]
    const tieneItemsInhumacion = this.items.some(
      (item) => item.categoria.toUpperCase().includes('INHUMACION')
    )

    const result: Reembolso[] = []

    for (const ben of this.reembolsosRequerimiento) {
      if (ben.valorTransporte > 0) {
        result.push(
          new Reembolso({
            id:            `${this.id}-TRANSPORTE-${ben.documentoIdentidad}`,
            actividadId:   this.id,
            tipo:          'TRANSPORTE',
            personaNombre: ben.nombreBeneficiario,
            documento:     ben.documentoIdentidad,
            celular:       null,
            rutaOrigen:    ben.municipioOrigen,
            rutaDestino:   ben.municipioDestino,
            fecha,
            valor:         ben.valorTransporte,
          })
        )
      }

      if (tieneItemsInhumacion) {
        result.push(
          new Reembolso({
            id:            `${this.id}-INHUMACION-${ben.documentoIdentidad}`,
            actividadId:   this.id,
            tipo:          'INHUMACION',
            personaNombre: ben.nombreBeneficiario,
            documento:     ben.documentoIdentidad,
            celular:       null,
            rutaOrigen:    ben.municipioOrigen,
            rutaDestino:   ben.municipioDestino,
            fecha,
            valor:         ben.valorOtros > 0 ? ben.valorOtros : 531000,
          })
        )
      }
    }

    return result
  }

  // ---------------------------------------------------------------
  // Consultas sobre entregas
  // ---------------------------------------------------------------

  get totalEntregas(): number   { return this.entregas.length }
  get entregasListas(): number  { return this.entregas.filter((e) => e.estado === 'listo').length }
  get entregasPendientes(): number { return this.totalEntregas - this.entregasListas }

  get porcentajeAvance(): number {
    if (this.totalEntregas === 0) return 0
    return Math.round((this.entregasListas / this.totalEntregas) * 100)
  }

  // ---------------------------------------------------------------
  // Validaciones de integridad
  // ---------------------------------------------------------------

  /**
   * Verifica que la actividad cumpla las invariantes mínimas de dominio.
   * Lanza un error descriptivo si alguna falla.
   */
  validar(): void {
    if (!this.id.trim()) {
      throw new Error('Actividad debe tener un ID válido.')
    }
    if (!this.nombreActividad.trim()) {
      throw new Error('Actividad debe tener un nombre.')
    }
    for (const costo of this.costos) {
      if (costo.monto < 0) {
        throw new Error(`Costo "${costo.descripcion}" no puede ser negativo.`)
      }
    }
    for (const item of this.items) {
      if (item.cantidad <= 0) {
        throw new Error(`Ítem "${item.descripcion}": la cantidad debe ser mayor a cero.`)
      }
      if (item.precioUnitario < 0) {
        throw new Error(`Ítem "${item.descripcion}": el precio unitario no puede ser negativo.`)
      }
    }
  }

  // ---------------------------------------------------------------
  // Utilidades internas
  // ---------------------------------------------------------------

  private _toProps(): ActividadProps {
    return {
      id:                   this.id,
      numeroRequerimiento:  this.numeroRequerimiento,
      nombreActividad:      this.nombreActividad,
      municipio:            this.municipio,
      fechaInicio:          this.fechaInicio,
      fechaFin:             this.fechaFin,
      horaInicio:           this.horaInicio,
      estado:               this.estado,
      items:                [...this.items],
      costos:               [...this.costos],
      entregas:             [...this.entregas],
      participaciones:           [...this.participaciones],
      reembolsosRequerimiento:   [...this.reembolsosRequerimiento],
      fuenteFinanciacion:        this.fuenteFinanciacion,
    }
  }
}
