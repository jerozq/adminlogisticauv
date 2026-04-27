import type { EstadoActividad, FuenteFinanciacion } from '@/src/types/domain'
import type { BalanceFinancieroProps } from '../entities/BalanceFinanciero'

// ============================================================
// Puerto: IReportingRepository
//
// Define el contrato para obtener agregados financieros desde
// cualquier fuente de datos (Supabase, memoria, etc.).
//
// Los agregados se calculan sobre las actividades liquidadas o
// en ejecución y se pueden filtrar por rango de fechas, socio
// y fuente de financiación.
// ============================================================

// ---------------------------------------------------------------
// Filtros de consulta
// ---------------------------------------------------------------

export interface FiltrosReporte {
  /** Fecha de inicio del período (inclusive). Formato YYYY-MM-DD. */
  desde?: string

  /** Fecha de fin del período (inclusive). Formato YYYY-MM-DD. */
  hasta?: string

  /** Filtra por socio específico. */
  socioId?: string

  /** Filtra por fuente de financiación. */
  fuenteFinanciacion?: FuenteFinanciacion

  /** Filtra por estado de la actividad. */
  estadoActividad?: EstadoActividad

  /** Filtra por municipio. */
  municipio?: string
}

// ---------------------------------------------------------------
// Modelos de agregado
// ---------------------------------------------------------------

/** Totales financieros agrupados por mes (YYYY-MM). */
export interface AgregadoPorMes {
  /** Mes en formato YYYY-MM. */
  mes: string
  totalCotizado: number
  totalCostosReales: number
  totalReembolsos: number
  utilidadBruta: number
  utilidadNeta: number
  cantidadActividades: number
}

/** Totales financieros agrupados por socio. */
export interface AgregadoPorSocio {
  socioId: string
  nombreSocio: string
  /** Suma de devolucionCapital + porcionRemanente en todas las actividades. */
  totalRecibido: number
  /** Suma de montoAportado en todas las actividades. */
  totalAportado: number
  cantidadActividades: number
}

/** Totales financieros agrupados por fuente de financiación. */
export interface AgregadoPorFuente {
  fuenteFinanciacion: FuenteFinanciacion
  totalCotizado: number
  totalCostosReales: number
  utilidadBruta: number
  utilidadNeta: number
  cantidadActividades: number
}

// ---------------------------------------------------------------
// Puerto
// ---------------------------------------------------------------

export interface IReportingRepository {
  /**
   * Retorna los totales financieros agrupados mes a mes.
   * Ordena el resultado de más reciente a más antiguo.
   */
  obtenerAgregadosPorMes(filtros?: FiltrosReporte): Promise<AgregadoPorMes[]>

  /**
   * Retorna cuánto ha recibido y aportado cada socio en total,
   * opcionalmente acotado por el período del filtro.
   */
  obtenerAgregadosPorSocio(filtros?: FiltrosReporte): Promise<AgregadoPorSocio[]>

  /**
   * Retorna totales agrupados por fuente de financiación
   * (Fondo Propio / Anticipo Unidad / Crédito).
   */
  obtenerAgregadosPorFuente(filtros?: FiltrosReporte): Promise<AgregadoPorFuente[]>

  /**
   * Retorna el detalle de cada BalanceFinanciero individual,
   * ya serializado como props planas para la UI.
   * Permite paginar o filtrar antes de construir objetos de dominio.
   */
  obtenerBalancesDetalle(filtros?: FiltrosReporte): Promise<BalanceFinancieroProps[]>
}
