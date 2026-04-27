import type { IActivityRepository }    from '@/src/core/domain/ports/IActivityRepository'
import type { IReportingRepository, FiltrosReporte, AgregadoPorMes, AgregadoPorSocio, AgregadoPorFuente } from '@/src/core/domain/ports/IReportingRepository'
import type { BalanceFinancieroProps } from '@/src/core/domain/entities/BalanceFinanciero'
import type { EstadoActividad, FuenteFinanciacion, DistribucionFinanciero } from '@/src/types/domain'
import { BalanceFinanciero }           from '@/src/core/domain/entities/BalanceFinanciero'
import { getTracer, withSpan }         from '@/src/infrastructure/observability/tracer'
import { getLogger }                   from '@/src/infrastructure/observability/logger'

// ============================================================
// Caso de Uso: GetFinancialSummary
//
// Estrategia de consulta: una sola llamada a IReportingRepository
// para cargar balancesDetalle; todas las agregaciones se calculan
// en proceso (TypeScript) para evitar N+1 contra la DB.
//
// Salida:
//   - KPIs globales (totalCotizado, utilidadNeta, dineroEnCaja)
//   - Agregados (porMes, porSocio, porFuente)
//   - distribucionTotal  -- reparto acumulado por socio
//   - balancesDetalle    -- datos crudos por actividad (para tabla/grafica)
//
// OTel: span raiz con todos los filtros como atributos + span hijo
//       por cada fase (cargar, agregar).
// ============================================================

const log    = getLogger('GetFinancialSummary')
const tracer = getTracer('use-case.GetFinancialSummary')

// ---------------------------------------------------------------
// I/O
// ---------------------------------------------------------------

export interface GetFinancialSummaryFilters {
  desde?: string
  hasta?: string
  fuenteFinanciacion?: FuenteFinanciacion
  estadoActividad?: EstadoActividad
  socioId?: string
  municipio?: string
}

export interface DistribucionAcumulada extends DistribucionFinanciero {
  cantidadActividades: number
}

export interface GetFinancialSummaryOutput {
  // KPI
  totalCotizado:       number
  totalGastoReal:      number
  totalReembolsos:     number
  utilidadBruta:       number
  utilidadNeta:        number
  dineroEnCaja:        number
  utilidadPorCobrar:   number
  // Agregados para graficas
  agregadosPorMes:     AgregadoPorMes[]
  agregadosPorSocio:   AgregadoPorSocio[]
  agregadosPorFuente:  AgregadoPorFuente[]
  distribucionTotal:   DistribucionAcumulada[]
  // Detalle por actividad (para tabla + grafica de barras)
  balancesDetalle:     BalanceFinancieroProps[]
  // Meta
  cantidadActividades: number
  filtrosAplicados:    GetFinancialSummaryFilters
}

// ---------------------------------------------------------------
// Caso de uso
// ---------------------------------------------------------------

export class GetFinancialSummary {
  constructor(
    private readonly actividadRepo: IActivityRepository,
    private readonly reportingRepo: IReportingRepository,
  ) {}

  async execute(
    filters: GetFinancialSummaryFilters = {},
    userId?: string,
  ): Promise<GetFinancialSummaryOutput> {
    return withSpan(tracer, 'GetFinancialSummary.execute', async (rootSpan) => {
      rootSpan.setAttributes({
        'enduser.id':        userId ?? 'anonymous',
        'reporte.desde':     filters.desde             ?? '',
        'reporte.hasta':     filters.hasta             ?? '',
        'reporte.fuente':    filters.fuenteFinanciacion ?? 'todas',
        'reporte.estado':    filters.estadoActividad    ?? 'todos',
        'reporte.socioId':   filters.socioId            ?? 'todos',
        'reporte.municipio': filters.municipio          ?? 'todos',
      })

      const filtrosRepo: FiltrosReporte = {
        desde:              filters.desde,
        hasta:              filters.hasta,
        fuenteFinanciacion: filters.fuenteFinanciacion,
        estadoActividad:    filters.estadoActividad,
        municipio:          filters.municipio,
      }

      // Fase 1: una sola carga de datos
      const balancesProps = await withSpan(
        tracer,
        'GetFinancialSummary.cargarBalances',
        (span) => {
          span.setAttributes({ 'db.operation': 'obtenerBalancesDetalle' })
          return this.reportingRepo.obtenerBalancesDetalle(filtrosRepo)
        },
      )

      rootSpan.setAttribute('reporte.cantidadActividades', balancesProps.length)

      // Fase 2: agregacion en-proceso
      const resultado = await withSpan(
        tracer,
        'GetFinancialSummary.agregar',
        async (span) => {
          span.setAttribute('reporte.numBalances', balancesProps.length)

          let totalCotizado   = 0
          let totalGastoReal  = 0
          let totalReembolsos = 0
          let dineroEnCaja    = 0

          const mesMap    = new Map<string, AgregadoPorMes>()
          const fuenteMap = new Map<FuenteFinanciacion, AgregadoPorFuente>()
          const socioMap  = new Map<string, AgregadoPorSocio>()
          const distMap   = new Map<string, DistribucionAcumulada>()

          for (const props of balancesProps) {
            const balance = new BalanceFinanciero(props)
            const ub      = balance.utilidadBruta
            const un      = balance.utilidadNeta
            const capital = balance.totalCapitalAportado

            totalCotizado   += balance.totalCotizado
            totalGastoReal  += balance.totalCostosReales
            totalReembolsos += balance.totalReembolsos
            dineroEnCaja    += capital

            // -- Por mes --
            const mes = props.fechaActividad?.slice(0, 7) ?? 'sin-fecha'
            const mEntry = mesMap.get(mes) ?? {
              mes,
              totalCotizado:       0,
              totalCostosReales:   0,
              totalReembolsos:     0,
              utilidadBruta:       0,
              utilidadNeta:        0,
              cantidadActividades: 0,
            }
            mEntry.totalCotizado       += balance.totalCotizado
            mEntry.totalCostosReales   += balance.totalCostosReales
            mEntry.totalReembolsos     += balance.totalReembolsos
            mEntry.utilidadBruta       += ub
            mEntry.utilidadNeta        += un
            mEntry.cantidadActividades += 1
            mesMap.set(mes, mEntry)

            // -- Por fuente --
            const fuente = props.fuenteFinanciacion
            const fEntry = fuenteMap.get(fuente) ?? {
              fuenteFinanciacion:  fuente,
              totalCotizado:       0,
              totalCostosReales:   0,
              utilidadBruta:       0,
              utilidadNeta:        0,
              cantidadActividades: 0,
            }
            fEntry.totalCotizado       += balance.totalCotizado
            fEntry.totalCostosReales   += balance.totalCostosReales
            fEntry.utilidadBruta       += ub
            fEntry.utilidadNeta        += un
            fEntry.cantidadActividades += 1
            fuenteMap.set(fuente, fEntry)

            // -- Por socio (desde participaciones) --
            for (const p of balance.participaciones) {
              const sEntry = socioMap.get(p.socioId) ?? {
                socioId:             p.socioId,
                nombreSocio:         p.nombreSocio,
                totalRecibido:       0,
                totalAportado:       0,
                cantidadActividades: 0,
              }
              sEntry.totalAportado       += p.montoAportado
              sEntry.cantidadActividades += 1
              socioMap.set(p.socioId, sEntry)
            }

            // -- Distribucion acumulada (reparto de utilidad) --
            if (balance.participaciones.length > 0) {
              try {
                const dist = balance.repartirUtilidades()
                for (const d of dist) {
                  if (filters.socioId && d.socioId !== filters.socioId) continue
                  const dEntry = distMap.get(d.socioId) ?? {
                    ...d,
                    devolucionCapital:   0,
                    porcionRemanente:    0,
                    totalRecibe:         0,
                    montoAportado:       0,
                    cantidadActividades: 0,
                  }
                  dEntry.devolucionCapital   += d.devolucionCapital
                  dEntry.porcionRemanente    += d.porcionRemanente
                  dEntry.totalRecibe         += d.totalRecibe
                  dEntry.montoAportado       += d.montoAportado
                  dEntry.cantidadActividades += 1
                  distMap.set(d.socioId, dEntry)
                }
                for (const d of dist) {
                  const sEntry = socioMap.get(d.socioId)
                  if (sEntry) sEntry.totalRecibido += d.totalRecibe
                }
              } catch { /* participaciones invalidas -- omitir reparto */ }
            }
          }

          const utilidadBruta     = totalCotizado - totalGastoReal
          const utilidadNeta      = utilidadBruta - totalReembolsos
          const utilidadPorCobrar = utilidadNeta - dineroEnCaja

          return {
            totalCotizado,
            totalGastoReal,
            totalReembolsos,
            utilidadBruta,
            utilidadNeta,
            dineroEnCaja,
            utilidadPorCobrar,
            agregadosPorMes:    [...mesMap.values()].sort((a, b) => a.mes.localeCompare(b.mes)),
            agregadosPorSocio:  [...socioMap.values()],
            agregadosPorFuente: [...fuenteMap.values()],
            distribucionTotal:  [...distMap.values()],
          }
        },
      )

      rootSpan.setAttributes({
        'reporte.utilidadBruta':     resultado.utilidadBruta,
        'reporte.utilidadNeta':      resultado.utilidadNeta,
        'reporte.dineroEnCaja':      resultado.dineroEnCaja,
        'reporte.utilidadPorCobrar': resultado.utilidadPorCobrar,
      })

      log.info(
        {
          userId,
          filtros:             filters,
          cantidadActividades: balancesProps.length,
          totalCotizado:       resultado.totalCotizado,
          utilidadNeta:        resultado.utilidadNeta,
        },
        'Reporte financiero generado',
      )

      return {
        ...resultado,
        balancesDetalle:     balancesProps,
        cantidadActividades: balancesProps.length,
        filtrosAplicados:    filters,
      }
    })
  }
}
