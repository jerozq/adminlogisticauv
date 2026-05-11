import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { BalanceFinanciero } from '@/src/core/domain/entities/BalanceFinanciero'
import type { BalanceFinancieroProps } from '@/src/core/domain/entities/BalanceFinanciero'
import type {
  IReportingRepository,
  FiltrosReporte,
  AgregadoPorMes,
  AgregadoPorSocio,
  AgregadoPorFuente,
} from '@/src/core/domain/ports/IReportingRepository'
import type { EstadoActividad, FuenteFinanciacion } from '@/src/types/domain'
import type { SocioParticipacionProps } from '@/src/core/domain/value-objects/SocioParticipacion'

// ============================================================
// SupabaseReportingRepository
//
// Implementa IReportingRepository usando las tablas existentes:
//   - requerimientos        → actividad base + estado + fechas
//   - cotizaciones          → cotizacion_id por requerimiento
//   - cotizacion_items      → total cotizado (SUM precio_total)
//   - costos_reales         → total gasto real (SUM monto)
//   - actividad_participaciones → socios y capital
//   - reembolsos_detalle    → total reembolsos (valor_transporte + valor_otros)
//
// Estrategia de consulta: 6 queries en paralelo con `.in()` para
// evitar N+1. Todo el cálculo de agregados se hace en TypeScript.
// ============================================================

// ---------------------------------------------------------------
// Singleton de proceso
// ---------------------------------------------------------------

let _instance: SupabaseReportingRepository | null = null

export function getSupabaseReportingRepository(): IReportingRepository {
  if (!_instance) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    _instance = new SupabaseReportingRepository(createClient(url, key))
  }
  return _instance
}

// ---------------------------------------------------------------
// Repositorio
// ---------------------------------------------------------------

class SupabaseReportingRepository implements IReportingRepository {
  constructor(private readonly sb: SupabaseClient) {}

  // ---------------------------------------------------------------
  // Método principal: carga todos los datos en 6 queries paralelas
  // ---------------------------------------------------------------

  private async _cargarBalances(filtros?: FiltrosReporte): Promise<BalanceFinancieroProps[]> {
    // 1. Requerimientos (con filtros de fecha, estado y municipio)
    let reqQ = this.sb
      .from('requerimientos')
      .select('id, nombre_actividad, municipio, fecha_inicio, estado')
      .order('fecha_inicio', { ascending: false })

    if (filtros?.desde)           reqQ = reqQ.gte('fecha_inicio', filtros.desde)
    if (filtros?.hasta)           reqQ = reqQ.lte('fecha_inicio', filtros.hasta)
    if (filtros?.estadoActividad) reqQ = reqQ.eq('estado', filtros.estadoActividad)
    if (filtros?.municipio)       reqQ = reqQ.ilike('municipio', `%${filtros.municipio}%`)

    const { data: reqs, error: errReqs } = await reqQ
    if (errReqs) throw new Error(`[ReportingRepo] requerimientos: ${errReqs.message}`)
    if (!reqs?.length) return []

    const reqIds = reqs.map((r) => r.id as string)

    // 2–4. Datos financieros en paralelo (sin cotizaciones/cotizacion_items/reembolsos_detalle)
    const [itemsRes, costoRows, partRows] = await Promise.all([
      // items_requerimiento agrupa cotizados y reembolsos por requerimiento_id
      this.sb
        .from('items_requerimiento')
        .select('requerimiento_id, precio_total, tipo')
        .in('requerimiento_id', reqIds)
        .eq('estado', 'ACTIVO'),

      // Costos reales
      this.sb
        .from('ejecucion_costos')
        .select('actividad_id, monto')
        .in('actividad_id', reqIds),

      // Participaciones
      this.sb
        .from('actividad_participaciones')
        .select('actividad_id, socio_id, nombre_socio, porcentaje, monto_aportado')
        .in('actividad_id', reqIds),
    ])

    if (costoRows.error) throw new Error(`[ReportingRepo] ejecucion_costos: ${costoRows.error.message}`)
    if (partRows.error)  throw new Error(`[ReportingRepo] participaciones: ${partRows.error.message}`)

    // Mapas de suma por req_id
    const cotizadoPor:   Record<string, number> = {}
    const reembolsosPor: Record<string, number> = {}

    for (const item of itemsRes.data ?? []) {
      const rid = item.requerimiento_id as string
      if (item.tipo === 'REEMBOLSO') {
        reembolsosPor[rid] = (reembolsosPor[rid] ?? 0) + Number(item.precio_total)
      } else {
        cotizadoPor[rid] = (cotizadoPor[rid] ?? 0) + Number(item.precio_total)
      }
    }

    const costoPorReq: Record<string, number> = {}
    for (const c of costoRows.data ?? []) {
      const rid = c.actividad_id as string
      costoPorReq[rid] = (costoPorReq[rid] ?? 0) + Number(c.monto)
    }

    const partPorReq: Record<string, SocioParticipacionProps[]> = {}
    for (const p of partRows.data ?? []) {
      const rid = p.actividad_id as string
      partPorReq[rid] = partPorReq[rid] ?? []
      partPorReq[rid].push({
        socioId:       p.socio_id as string,
        nombreSocio:   p.nombre_socio as string,
        porcentaje:    Number(p.porcentaje),
        montoAportado: Number(p.monto_aportado),
      })
    }

    // Construir BalanceFinancieroProps
    const balances: BalanceFinancieroProps[] = []

    for (const req of reqs) {
      const rid               = req.id as string
      const totalCotizado     = cotizadoPor[rid]   ?? 0
      const totalCostosReales = costoPorReq[rid]   ?? 0
      const totalReembolsos   = reembolsosPor[rid] ?? 0
      const participaciones   = partPorReq[rid]    ?? []

      // fuenteFinanciacion: cuando no hay columna DB, se usa 'Fondo Propio'.
      // Cuando se agregue la columna, leerla aquí.
      const fuenteFinanciacion: FuenteFinanciacion = 'Fondo Propio'

      const props: BalanceFinancieroProps = {
        actividadId:       rid,
        nombreActividad:   req.nombre_actividad as string,
        municipio:         req.municipio as string | null,
        fechaActividad:    req.fecha_inicio as string | null,
        fuenteFinanciacion,
        totalCotizado,
        totalCostosReales,
        totalReembolsos,
        costosOperativos:  0,
        participaciones,
      }

      // Validar que BalanceFinanciero puede construirse
      try {
        new BalanceFinanciero(props) // throws si valores negativos
      } catch {
        continue
      }

      // Filtro por fuente (no disponible en DB aún, se aplica aquí)
      if (filtros?.fuenteFinanciacion && fuenteFinanciacion !== filtros.fuenteFinanciacion) {
        continue
      }

      balances.push(props)
    }

    return balances
  }

  // ---------------------------------------------------------------
  // IReportingRepository — métodos públicos
  // ---------------------------------------------------------------

  async obtenerBalancesDetalle(filtros?: FiltrosReporte): Promise<BalanceFinancieroProps[]> {
    return this._cargarBalances(filtros)
  }

  async obtenerAgregadosPorMes(filtros?: FiltrosReporte): Promise<AgregadoPorMes[]> {
    const balances = await this._cargarBalances(filtros)
    const mesMap   = new Map<string, AgregadoPorMes>()

    for (const props of balances) {
      const b   = new BalanceFinanciero(props)
      const mes = props.fechaActividad?.slice(0, 7) ?? 'sin-fecha'
      const e   = mesMap.get(mes) ?? {
        mes,
        totalCotizado:       0,
        totalCostosReales:   0,
        totalReembolsos:     0,
        utilidadBruta:       0,
        utilidadNeta:        0,
        cantidadActividades: 0,
      }
      e.totalCotizado      += b.totalCotizado
      e.totalCostosReales  += b.totalCostosReales
      e.totalReembolsos    += b.totalReembolsos
      e.utilidadBruta      += b.utilidadBruta
      e.utilidadNeta       += b.utilidadNeta
      e.cantidadActividades += 1
      mesMap.set(mes, e)
    }

    return [...mesMap.values()].sort((a, b) => a.mes.localeCompare(b.mes))
  }

  async obtenerAgregadosPorSocio(filtros?: FiltrosReporte): Promise<AgregadoPorSocio[]> {
    const balances  = await this._cargarBalances(filtros)
    const socioMap  = new Map<string, AgregadoPorSocio>()

    for (const props of balances) {
      const b = new BalanceFinanciero(props)

      // Acumular aportes
      for (const p of b.participaciones) {
        const e = socioMap.get(p.socioId) ?? {
          socioId:             p.socioId,
          nombreSocio:         p.nombreSocio,
          totalRecibido:       0,
          totalAportado:       0,
          cantidadActividades: 0,
        }
        e.totalAportado       += p.montoAportado
        e.cantidadActividades += 1
        socioMap.set(p.socioId, e)
      }

      // Acumular recibidos via reparto
      if (b.participaciones.length > 0) {
        try {
          const dist = b.repartirUtilidades()
          for (const d of dist) {
            const e = socioMap.get(d.socioId)
            if (e) e.totalRecibido += d.totalRecibe
          }
        } catch { /* skip */ }
      }
    }

    return [...socioMap.values()]
  }

  async obtenerAgregadosPorFuente(filtros?: FiltrosReporte): Promise<AgregadoPorFuente[]> {
    const balances  = await this._cargarBalances(filtros)
    const fuenteMap = new Map<FuenteFinanciacion, AgregadoPorFuente>()

    for (const props of balances) {
      const b      = new BalanceFinanciero(props)
      const fuente = props.fuenteFinanciacion
      const e = fuenteMap.get(fuente) ?? {
        fuenteFinanciacion: fuente,
        totalCotizado:       0,
        totalCostosReales:   0,
        utilidadBruta:       0,
        utilidadNeta:        0,
        cantidadActividades: 0,
      }
      e.totalCotizado      += b.totalCotizado
      e.totalCostosReales  += b.totalCostosReales
      e.utilidadBruta      += b.utilidadBruta
      e.utilidadNeta       += b.utilidadNeta
      e.cantidadActividades += 1
      fuenteMap.set(fuente, e)
    }

    return [...fuenteMap.values()]
  }
}
