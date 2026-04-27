'use server'

import { makeGetFinancialSummary } from '@/src/infrastructure/container'
import { BalanceFinanciero } from '@/src/core/domain/entities/BalanceFinanciero'
import type { GetFinancialSummaryFilters, GetFinancialSummaryOutput, DistribucionAcumulada } from '@/src/core/application/use-cases/GetFinancialSummary'
import type { AgregadoPorMes, AgregadoPorSocio, AgregadoPorFuente } from '@/src/core/domain/ports/IReportingRepository'
import type { DistribucionFinanciero, EstadoActividad, FuenteFinanciacion } from '@/src/types/domain'

// ============================================================
// Server Actions — Módulo Financiero
// ============================================================

// ---------------------------------------------------------------
// Tipos de presentación (plain objects, JSON-serializable)
// ---------------------------------------------------------------

/** Balance por actividad enriquecido con métricas derivadas. */
export interface ActividadFinanciera {
  actividadId:      string
  nombreActividad:  string
  municipio:        string | null
  fechaActividad:   string | null
  fuenteFinanciacion: FuenteFinanciacion
  totalCotizado:    number
  totalCostosReales: number
  totalReembolsos:  number
  utilidadBruta:    number
  utilidadNeta:     number
  /** Margen sobre lo cotizado: (utilidadNeta / totalCotizado) * 100. NaN cuando totalCotizado = 0. */
  margenPorcentaje: number
  /** Reparto de utilidad entre socios para esta actividad específica. */
  distribucion: DistribucionFinanciero[]
}

/** Salida completa del reporte financiero listo para la UI. */
export interface DatosFinanciero {
  // KPI
  totalCotizado:       number
  totalGastoReal:      number
  totalReembolsos:     number
  utilidadBruta:       number
  utilidadNeta:        number
  dineroEnCaja:        number
  utilidadPorCobrar:   number
  margenPromedio:      number   // 0–100 (o negativo)
  cantidadActividades: number
  // Agregados
  agregadosPorMes:     AgregadoPorMes[]
  agregadosPorSocio:   AgregadoPorSocio[]
  agregadosPorFuente:  AgregadoPorFuente[]
  distribucionTotal:   DistribucionAcumulada[]
  // Detalle por actividad
  actividades:         ActividadFinanciera[]
  // Echo
  filtrosAplicados:    GetFinancialSummaryFilters
}

// ---------------------------------------------------------------
// obtenerResumenFinanciero
// ---------------------------------------------------------------

export async function obtenerResumenFinanciero(
  filters: GetFinancialSummaryFilters = {},
): Promise<DatosFinanciero> {
  const output: GetFinancialSummaryOutput = await makeGetFinancialSummary().execute(filters)

  // Construir ActividadFinanciera[] desde balancesDetalle usando BalanceFinanciero
  const actividades: ActividadFinanciera[] = output.balancesDetalle.map((props) => {
    const balance = new BalanceFinanciero(props)

    let distribucion: DistribucionFinanciero[] = []
    if (balance.participaciones.length > 0) {
      try {
        distribucion = balance.repartirUtilidades()
      } catch { /* participaciones inválidas */ }
    }

    const margenPorcentaje =
      balance.totalCotizado > 0
        ? Math.round((balance.utilidadNeta / balance.totalCotizado) * 100 * 100) / 100
        : 0

    return {
      actividadId:       props.actividadId,
      nombreActividad:   props.nombreActividad,
      municipio:         props.municipio,
      fechaActividad:    props.fechaActividad,
      fuenteFinanciacion: props.fuenteFinanciacion,
      totalCotizado:     balance.totalCotizado,
      totalCostosReales: balance.totalCostosReales,
      totalReembolsos:   balance.totalReembolsos,
      utilidadBruta:     balance.utilidadBruta,
      utilidadNeta:      balance.utilidadNeta,
      margenPorcentaje,
      distribucion,
    }
  })

  const margenPromedio =
    output.totalCotizado > 0
      ? Math.round((output.utilidadNeta / output.totalCotizado) * 100 * 100) / 100
      : 0

  return {
    totalCotizado:       output.totalCotizado,
    totalGastoReal:      output.totalGastoReal,
    totalReembolsos:     output.totalReembolsos,
    utilidadBruta:       output.utilidadBruta,
    utilidadNeta:        output.utilidadNeta,
    dineroEnCaja:        output.dineroEnCaja,
    utilidadPorCobrar:   output.utilidadPorCobrar,
    margenPromedio,
    cantidadActividades: output.cantidadActividades,
    agregadosPorMes:     output.agregadosPorMes,
    agregadosPorSocio:   output.agregadosPorSocio,
    agregadosPorFuente:  output.agregadosPorFuente,
    distribucionTotal:   output.distribucionTotal,
    actividades,
    filtrosAplicados:    output.filtrosAplicados,
  }
}
