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
import type { FuenteFinanciacion } from '@/src/types/domain'
import type { SocioParticipacionProps } from '@/src/core/domain/value-objects/SocioParticipacion'
import { getLogger } from '@/src/infrastructure/observability/logger'

// ============================================================
// SupabaseFinancialAdapter
//
// Adaptador optimizado para el Dashboard Financiero.
//
// Diferencias clave vs SupabaseReportingRepository:
//
//   1. QUERY ÚNICA con relaciones embebidas (PostgREST):
//      En lugar de 6 queries en serie/paralelo, ejecuta UN SOLO
//      SELECT con embedded relations. PostgREST genera internamente
//      un SQL con JOINs, reduciendo los round-trips a Supabase de
//      6+ a 1.
//
//   2. AUDITORÍA DE SEGURIDAD (OWASP A09):
//      Cada operación registra en Pino:
//        - userId:              quién realizó la consulta
//        - filtros:             qué rango / estado / fuente pidió
//        - cantidadActividades: resultado de la consulta
//        - duracionMs:          latencia de la operación
//      Esto genera un trail de auditoría completo para datos financieros.
//
//   3. NO ES SINGLETON:
//      Se crea una instancia por request para capturar el userId
//      del usuario autenticado. El SupabaseClient subyacente SÍ
//      es un singleton a nivel de módulo (reutilización de conexión).
//
// Uso desde el container:
//   const adapter = createSupabaseFinancialAdapter(userId)
//   const uc      = new GetFinancialSummary(actividadRepo, adapter)
// ============================================================

const log = getLogger('SupabaseFinancialAdapter')

// ---------------------------------------------------------------
// Tipos de fila — resultado del select con embedded relations
// ---------------------------------------------------------------

interface ReqRow {
  id:                        string
  nombre_actividad:          string
  municipio:                 string | null
  fecha_inicio:              string | null
  estado:                    string
  costos_reales:             Array<{ monto: number }> | null
  actividad_participaciones: Array<{
    socio_id:      string
    nombre_socio:  string
    porcentaje:    number
    monto_aportado: number
  }> | null
}

// ---------------------------------------------------------------
// Singleton del SupabaseClient (se reutiliza entre requests)
// ---------------------------------------------------------------

let _supabaseClient: SupabaseClient | null = null

function getSupabaseClient(): SupabaseClient {
  if (!_supabaseClient) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    _supabaseClient = createClient(url, key)
  }
  return _supabaseClient
}

// ---------------------------------------------------------------
// Factory — una instancia ligera por request con el userId correcto
// ---------------------------------------------------------------

/**
 * Crea un adaptador financiero optimizado vinculado al usuario
 * autenticado del request actual.
 *
 * @param userId — ID del usuario para el audit log de seguridad.
 */
export function createSupabaseFinancialAdapter(userId?: string): IReportingRepository {
  return new SupabaseFinancialAdapter(getSupabaseClient(), userId)
}

// ---------------------------------------------------------------
// Adaptador
// ---------------------------------------------------------------

class SupabaseFinancialAdapter implements IReportingRepository {
  constructor(
    private readonly sb: SupabaseClient,
    private readonly userId?: string,
  ) {}

  // ---------------------------------------------------------------
  // Query central — 1 round-trip con PostgREST embedded relations
  // ---------------------------------------------------------------

  private async _cargarConRelaciones(filtros?: FiltrosReporte): Promise<BalanceFinancieroProps[]> {
    const t0        = Date.now()
    const operation = '_cargarConRelaciones'
    const actor     = this.userId ?? 'system'

    log.info(
      { userId: actor, filtros: filtros ?? {}, operation },
      '[Auditoría] Consulta financiera iniciada',
    )

    // ── Construir query sin relaciones cotizaciones (tablas eliminadas) ─
    let q = this.sb
      .from('requerimientos')
      .select(`
        id,
        nombre_actividad,
        municipio,
        fecha_inicio,
        estado,
        costos_reales(monto),
        actividad_participaciones(socio_id, nombre_socio, porcentaje, monto_aportado)
      `)
      .order('fecha_inicio', { ascending: false })

    // Filtros que sí se pueden aplicar en DB
    if (filtros?.desde)           q = q.gte('fecha_inicio', filtros.desde)
    if (filtros?.hasta)           q = q.lte('fecha_inicio', filtros.hasta)
    if (filtros?.estadoActividad) q = q.eq('estado', filtros.estadoActividad)
    if (filtros?.municipio)       q = q.ilike('municipio', `%${filtros.municipio}%`)

    const { data, error } = await q

    if (error) {
      log.error(
        { userId: actor, operation, error: error.message, filtros: filtros ?? {} },
        '[Auditoría] Error en consulta financiera',
      )
      throw new Error(`[SupabaseFinancialAdapter] ${error.message}`)
    }

    const rows = (data ?? []) as unknown as ReqRow[]

    // Agregar items_requerimiento en una sola query adicional
    const reqIds = rows.map(r => r.id)
    const cotizadoPor:   Record<string, number> = {}
    const reembolsosPor: Record<string, number> = {}

    if (reqIds.length > 0) {
      const { data: itemsData } = await this.sb
        .from('items_requerimiento')
        .select('requerimiento_id, precio_total, tipo')
        .in('requerimiento_id', reqIds)
        .eq('estado', 'ACTIVO')

      for (const item of itemsData ?? []) {
        const rid = item.requerimiento_id as string
        if (item.tipo === 'REEMBOLSO') {
          reembolsosPor[rid] = (reembolsosPor[rid] ?? 0) + Number(item.precio_total)
        } else {
          cotizadoPor[rid] = (cotizadoPor[rid] ?? 0) + Number(item.precio_total)
        }
      }
    }

    // ── Mapear filas → BalanceFinancieroProps ────────────────
    const balances: BalanceFinancieroProps[] = []

    for (const req of rows) {
      const totalCotizado   = cotizadoPor[req.id]   ?? 0
      const totalReembolsos = reembolsosPor[req.id] ?? 0

      const totalCostosReales = (req.costos_reales ?? [])
        .reduce((s, c) => s + Number(c.monto), 0)

      const participaciones: SocioParticipacionProps[] = (req.actividad_participaciones ?? [])
        .map((p) => ({
          socioId:       p.socio_id,
          nombreSocio:   p.nombre_socio,
          porcentaje:    Number(p.porcentaje),
          montoAportado: Number(p.monto_aportado),
        }))

      // fuenteFinanciacion: 'Fondo Propio' mientras no exista columna DB.
      // Cuando se agregue la columna a requerimientos, leerla aquí.
      const fuenteFinanciacion: FuenteFinanciacion = 'Fondo Propio'

      // Filtro de fuente (se aplica en memoria hasta que exista columna DB)
      if (filtros?.fuenteFinanciacion && fuenteFinanciacion !== filtros.fuenteFinanciacion) {
        continue
      }

      const props: BalanceFinancieroProps = {
        actividadId:       req.id,
        nombreActividad:   req.nombre_actividad,
        municipio:         req.municipio,
        fechaActividad:    req.fecha_inicio,
        fuenteFinanciacion,
        totalCotizado,
        totalCostosReales,
        totalReembolsos,
        costosOperativos:  0,
        participaciones,
      }

      // Validar que la entidad puede construirse sin errores
      try {
        new BalanceFinanciero(props)
        balances.push(props)
      } catch { /* saltamos filas con datos inválidos */ }
    }

    const duracionMs = Date.now() - t0

    // ── Audit log de seguridad ──────────────────────────────
    log.info(
      {
        userId:              actor,
        filtros:             filtros ?? {},
        operation,
        cantidadActividades: balances.length,
        duracionMs,
        // Campos de auditoría de acceso financiero
        accesoFinanciero:    true,
        entidad:             'BalanceFinanciero',
        timestamp:           new Date().toISOString(),
      },
      '[Auditoría] Consulta financiera completada',
    )

    return balances
  }

  // ---------------------------------------------------------------
  // IReportingRepository — implementación pública
  // ---------------------------------------------------------------

  async obtenerBalancesDetalle(filtros?: FiltrosReporte): Promise<BalanceFinancieroProps[]> {
    return this._cargarConRelaciones(filtros)
  }

  async obtenerAgregadosPorMes(filtros?: FiltrosReporte): Promise<AgregadoPorMes[]> {
    const balances = await this._cargarConRelaciones(filtros)
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
      e.totalCotizado       += b.totalCotizado
      e.totalCostosReales   += b.totalCostosReales
      e.totalReembolsos     += b.totalReembolsos
      e.utilidadBruta       += b.utilidadBruta
      e.utilidadNeta        += b.utilidadNeta
      e.cantidadActividades += 1
      mesMap.set(mes, e)
    }

    return [...mesMap.values()].sort((a, b) => a.mes.localeCompare(b.mes))
  }

  async obtenerAgregadosPorSocio(filtros?: FiltrosReporte): Promise<AgregadoPorSocio[]> {
    const balances = await this._cargarConRelaciones(filtros)
    const socioMap = new Map<string, AgregadoPorSocio>()

    for (const props of balances) {
      const b = new BalanceFinanciero(props)

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

      if (b.participaciones.length > 0) {
        try {
          const dist = b.repartirUtilidades()
          for (const d of dist) {
            const e = socioMap.get(d.socioId)
            if (e) e.totalRecibido += d.totalRecibe
          }
        } catch { /* participaciones inválidas */ }
      }
    }

    return [...socioMap.values()]
  }

  async obtenerAgregadosPorFuente(filtros?: FiltrosReporte): Promise<AgregadoPorFuente[]> {
    const balances  = await this._cargarConRelaciones(filtros)
    const fuenteMap = new Map<FuenteFinanciacion, AgregadoPorFuente>()

    for (const props of balances) {
      const b      = new BalanceFinanciero(props)
      const fuente = props.fuenteFinanciacion
      const e      = fuenteMap.get(fuente) ?? {
        fuenteFinanciacion:  fuente,
        totalCotizado:       0,
        totalCostosReales:   0,
        utilidadBruta:       0,
        utilidadNeta:        0,
        cantidadActividades: 0,
      }
      e.totalCotizado       += b.totalCotizado
      e.totalCostosReales   += b.totalCostosReales
      e.utilidadBruta       += b.utilidadBruta
      e.utilidadNeta        += b.utilidadNeta
      e.cantidadActividades += 1
      fuenteMap.set(fuente, e)
    }

    return [...fuenteMap.values()]
  }
}
