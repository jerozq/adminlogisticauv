import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { Actividad } from '@/src/core/domain/entities/Actividad'
import {
  SocioParticipacion,
  validarSumaParticipaciones,
  validarSociosDuplicados,
} from '@/src/core/domain/value-objects/SocioParticipacion'
import type { IActivityRepository } from '@/src/core/domain/ports/IActivityRepository'
import type {
  ActividadResumen,
  ConfiguracionParticipaciones,
  CostoReal,
  EntregaHito,
  EstadoActividad,
  NuevoCosto,
  NuevaEntrega,
  ReembolsoBeneficiario,
} from '@/src/types/domain'

// ============================================================
// SupabaseActivityRepository
//
// Adaptador de infraestructura: traduce entre el dominio (camelCase,
// tipos puros) y las tablas de Supabase (snake_case, tipos DB).
//
// Convenciones de traducción:
//   DB: actividad_id  ↔  Domain: actividadId
//   DB: created_at    ↔  Domain: creadoEn
//   DB: fecha_inicio  ↔  Domain: fechaInicio
// ============================================================

// ---------------------------------------------------------------
// Helpers de traducción DB → Domain
// ---------------------------------------------------------------

function toEntregaHito(row: Record<string, unknown>): EntregaHito {
  return {
    id:               row['id'] as string,
    actividadId:      row['actividad_id'] as string,
    descripcion:      row['descripcion'] as string,
    fechaHoraLimite:  row['fecha_hora_limite'] as string,
    estado:           row['estado'] as EntregaHito['estado'],
    evidenciaUrl:     (row['evidencia_url'] as string | null) ?? null,
    creadoEn:         row['created_at'] as string,
  }
}

function toCostoReal(row: Record<string, unknown>): CostoReal {
  return {
    id:             row['id'] as string,
    actividadId:    row['actividad_id'] as string,
    itemId:         (row['item_id'] as string | null) ?? null,
    descripcion:    (row['descripcion'] as string | null) ?? '',
    monto:          Number(row['monto']),
    pagador:        row['pagador'] as CostoReal['pagador'],
    soporteUrl:     (row['soporte_url'] as string | null) ?? null,
    notas:          (row['notas'] as string | null) ?? null,
    creadoEn:       row['created_at'] as string,
    modoRegistro:   ((row['modo_registro'] as string | null) ?? 'por_item') as CostoReal['modoRegistro'],
    cantidad:       Number((row['cantidad'] as number | null) ?? 1),
    precioUnitario: (row['precio_unitario'] as number | null) ?? null,
    concepto:       (row['concepto'] as string | null) ?? null,
  }
}

function toSocioParticipacion(row: Record<string, unknown>): SocioParticipacion {
  return new SocioParticipacion({
    socioId:       row['socio_id'] as string,
    nombreSocio:   row['nombre_socio'] as string,
    porcentaje:    Number(row['porcentaje']),
    montoAportado: Number(row['monto_aportado']),
  })
}

function normalizarPagador(pagador: string): 'jero' | 'socio' | 'caja_proyecto' {
  const valor = (pagador ?? '').trim().toLowerCase()
  if (valor === 'jero' || valor === 'socio' || valor === 'caja_proyecto') return valor
  if (valor.includes('jero')) return 'jero'
  if (valor.includes('socio')) return 'socio'
  return 'caja_proyecto'
}


export class SupabaseActivityRepository implements IActivityRepository {
  private readonly sb: SupabaseClient

  /**
   * @param client - Instancia de SupabaseClient.
   *   En producción se inyecta desde el Container usando variables de entorno.
   *   En tests se puede pasar un cliente mock.
   */
  constructor(client: SupabaseClient) {
    this.sb = client
  }

  // ──────────────────────────────────────────────────────────────
  // listarResumenes
  // ──────────────────────────────────────────────────────────────

  async listarResumenes(estados?: EstadoActividad[]): Promise<ActividadResumen[]> {
    let query = this.sb
      .from('requerimientos')
      .select(
        'id, numero_requerimiento, nombre_actividad, municipio, fecha_inicio, fecha_fin, hora_inicio, estado'
      )
      .order('fecha_inicio', { ascending: true })

    if (estados && estados.length > 0) {
      query = query.in('estado', estados)
    }

    const { data: reqs, error } = await query
    if (error) throw new Error(`[SupabaseRepo] listarResumenes: ${error.message}`)
    if (!reqs?.length) return []

    const ids = reqs.map((r) => r.id)

    // Conteos de entregas + totales cotizados en paralelo
    const [entregasRes, itemsRes] = await Promise.all([
      this.sb
        .from('bitacora_entregas')
        .select('actividad_id, estado')
        .in('actividad_id', ids),
      this.sb
        .from('items_requerimiento')
        .select('requerimiento_id, precio_total')
        .in('requerimiento_id', ids)
        .in('tipo', ['SERVICIO', 'PASIVO_TERCERO'])
        .eq('estado', 'ACTIVO'),
    ])

    const countMap: Record<string, { total: number; listos: number }> = {}
    for (const e of entregasRes.data ?? []) {
      if (!countMap[e.actividad_id]) countMap[e.actividad_id] = { total: 0, listos: 0 }
      countMap[e.actividad_id].total++
      if (e.estado === 'listo') countMap[e.actividad_id].listos++
    }

    const ingresoPor: Record<string, number> = {}
    for (const item of itemsRes.data ?? []) {
      const rid = item.requerimiento_id as string
      ingresoPor[rid] = (ingresoPor[rid] ?? 0) + Number(item.precio_total)
    }

    return reqs.map((req) => {
      const counts = countMap[req.id] ?? { total: 0, listos: 0 }
      return {
        id:                   req.id,
        numeroRequerimiento:  req.numero_requerimiento,
        nombreActividad:      req.nombre_actividad,
        municipio:            req.municipio,
        fechaInicio:          req.fecha_inicio,
        fechaFin:             req.fecha_fin,
        horaInicio:           req.hora_inicio,
        estado:               req.estado as EstadoActividad,
        totalEntregas:        counts.total,
        entregasListas:       counts.listos,
        ingresoCotizado:      ingresoPor[req.id] ?? null,
      }
    })
  }

  // ──────────────────────────────────────────────────────────────
  // obtenerRequerimientoRaw — para datos no mapeados en la entidad
  // ──────────────────────────────────────────────────────────────

  async obtenerRequerimientoRaw(id: string): Promise<Record<string, unknown> | null> {
    const { data, error } = await this.sb
      .from('requerimientos')
      .select('*')
      .eq('id', id)
      .single()

    if (error || !data) return null
    return data
  }

  // ──────────────────────────────────────────────────────────────
  // obtenerPorId — carga la entidad completa
  // ──────────────────────────────────────────────────────────────

  async obtenerPorId(id: string): Promise<Actividad | null> {
    const { data: req, error: errReq } = await this.sb
      .from('requerimientos')
      .select(
        'id, numero_requerimiento, nombre_actividad, municipio, fecha_inicio, fecha_fin, hora_inicio, estado'
      )
      .eq('id', id)
      .single()

    if (errReq || !req) return null

    // Items, costos, entregas, participaciones y reembolsos — todos en paralelo
    const [items, costos, entregas, participaciones, reembolsosRequerimiento] = await Promise.all([
      this._fetchItems(id),
      this.listarCostos(id),
      this.listarEntregas(id),
      this.listarParticipaciones(id),
      this._fetchReembolsosBeneficiarios(id),
    ])

    return new Actividad({
      id:                      req.id,
      numeroRequerimiento:     req.numero_requerimiento,
      nombreActividad:         req.nombre_actividad,
      municipio:               req.municipio,
      fechaInicio:             req.fecha_inicio,
      fechaFin:                req.fecha_fin,
      horaInicio:              req.hora_inicio,
      estado:                  req.estado as EstadoActividad,
      items,
      costos,
      entregas,
      participaciones,
      reembolsosRequerimiento,
    })
  }

  private async _fetchReembolsosBeneficiarios(requerimientoId: string): Promise<ReembolsoBeneficiario[]> {
    const { data, error } = await this.sb
      .from('items_requerimiento')
      .select(
        'beneficiario_nombre, beneficiario_documento, municipio_origen, precio_unitario'
      )
      .eq('requerimiento_id', requerimientoId)
      .eq('tipo', 'REEMBOLSO')
      .order('beneficiario_nombre')

    if (error || !data) return []

    return (data as unknown as Record<string, unknown>[])
      .map((row: Record<string, unknown>) => ({
        nombreBeneficiario: (row.beneficiario_nombre as string | null)?.trim() ?? '',
        documentoIdentidad: (row.beneficiario_documento as string | null)?.trim() ?? '',
        municipioOrigen:    (row.municipio_origen as string | null)?.trim() ?? '',
        municipioDestino:   '',
        valorTransporte:    Number(row.precio_unitario ?? 0),
        valorAlojamiento:   0,
        valorAlimentacion:  0,
        valorOtros:         0,
      }))
      .filter((b) => b.nombreBeneficiario.length > 0)
  }

  private async _fetchItems(requerimientoId: string) {
    const { data } = await this.sb
      .from('items_requerimiento')
      .select(
        'id, tarifario_id, codigo_item, descripcion, categoria, unidad_medida, cantidad, precio_unitario, precio_total, tipo'
      )
      .eq('requerimiento_id', requerimientoId)
      .in('tipo', ['SERVICIO', 'PASIVO_TERCERO'])
      .order('categoria')
      .order('descripcion')

    return (data ?? []).map((i) => ({
      id:             i.id,
      actividadId:    requerimientoId,
      tarifarioId:    i.tarifario_id ?? null,
      codigoItem:     i.codigo_item ?? '',
      descripcion:    i.descripcion,
      categoria:      i.categoria ?? '',
      unidadMedida:   i.unidad_medida ?? '',
      cantidad:       Number(i.cantidad),
      precioUnitario: Number(i.precio_unitario),
      precioTotal:    Number(i.precio_total),
      esPassthrough:  i.tipo === 'PASIVO_TERCERO',
    }))
  }

  // ──────────────────────────────────────────────────────────────
  // cambiarEstado — usa la RPC con validación de transiciones en DB
  // ──────────────────────────────────────────────────────────────

  async cambiarEstado(id: string, nuevoEstado: EstadoActividad, motivo?: string): Promise<void> {
    const { error } = await this.sb.rpc('cambiar_estado_requerimiento', {
      p_requerimiento_id: id,
      p_nuevo_estado:     nuevoEstado,
      p_motivo:           motivo ?? null,
    })
    if (error) throw new Error(`[SupabaseRepo] cambiarEstado: ${error.message}`)
  }

  // ──────────────────────────────────────────────────────────────
  // Costos reales
  // ──────────────────────────────────────────────────────────────

  async listarCostos(actividadId: string): Promise<CostoReal[]> {
    const { data, error } = await this.sb
      .from('ejecucion_costos')
      .select('id, actividad_id, item_id, descripcion, monto, pagador, soporte_url, notas, created_at, modo_registro, cantidad, precio_unitario, concepto')
      .eq('actividad_id', actividadId)
      .order('created_at', { ascending: true })

    if (error) throw new Error(`[SupabaseRepo] listarCostos: ${error.message}`)
    return (data ?? []).map(toCostoReal)
  }

  async agregarCosto(actividadId: string, costo: NuevoCosto): Promise<CostoReal> {
    const { data: { user } } = await this.sb.auth.getUser()
    const pagadorNormalizado = normalizarPagador(costo.pagador)
    
    const { data, error } = await this.sb
      .from('ejecucion_costos')
      .insert({
        actividad_id:     actividadId,
        item_id:          costo.itemId ?? null,
        descripcion:      costo.descripcion || null,
        monto:            costo.monto,
        pagador:          pagadorNormalizado,
        soporte_url:      costo.soporteUrl ?? null,
        notas:            costo.notas ?? null,
        modo_registro:    costo.modoRegistro ?? 'por_item',
        cantidad:         costo.cantidad ?? 1,
        precio_unitario:  costo.precioUnitario ?? null,
        concepto:         costo.concepto ?? null,
        actualizado_por:  user?.id || null,
      })
      .select()
      .single()

    if (error) throw new Error(`[SupabaseRepo] agregarCosto: ${error.message}`)
    return toCostoReal(data as Record<string, unknown>)
  }

  async eliminarCosto(costoId: string): Promise<void> {
    const { error } = await this.sb
      .from('ejecucion_costos')
      .delete()
      .eq('id', costoId)

    if (error) throw new Error(`[SupabaseRepo] eliminarCosto: ${error.message}`)
  }

  // ──────────────────────────────────────────────────────────────
  // Entregas / Hitos
  // ──────────────────────────────────────────────────────────────

  async listarEntregas(actividadId: string): Promise<EntregaHito[]> {
    const { data, error } = await this.sb
      .from('bitacora_entregas')
      .select('id, actividad_id, descripcion, fecha_hora_limite, estado, evidencia_url, created_at')
      .eq('actividad_id', actividadId)
      .order('fecha_hora_limite', { ascending: true })

    if (error) throw new Error(`[SupabaseRepo] listarEntregas: ${error.message}`)
    return (data ?? []).map(toEntregaHito)
  }

  async agregarEntrega(actividadId: string, entrega: NuevaEntrega): Promise<EntregaHito> {
    const { data: { user } } = await this.sb.auth.getUser()
    
    const { data, error } = await this.sb
      .from('bitacora_entregas')
      .insert({
        actividad_id:      actividadId,
        descripcion:       entrega.descripcion,
        fecha_hora_limite: entrega.fechaHoraLimite,
        actualizado_por:   user?.id || null,
      })
      .select()
      .single()

    if (error) throw new Error(`[SupabaseRepo] agregarEntrega: ${error.message}`)
    return toEntregaHito(data as Record<string, unknown>)
  }

  async actualizarEstadoEntrega(
    entregaId: string,
    estado: EntregaHito['estado'],
    evidenciaUrl?: string
  ): Promise<void> {
    const { data: { user } } = await this.sb.auth.getUser()
    
    const patch: Record<string, unknown> = { 
      estado,
      actualizado_por: user?.id || null
    }
    if (evidenciaUrl !== undefined) patch['evidencia_url'] = evidenciaUrl

    const { error } = await this.sb
      .from('bitacora_entregas')
      .update(patch)
      .eq('id', entregaId)

    if (error) throw new Error(`[SupabaseRepo] actualizarEstadoEntrega: ${error.message}`)
  }

  async eliminarEntrega(entregaId: string): Promise<void> {
    const { error } = await this.sb
      .from('bitacora_entregas')
      .delete()
      .eq('id', entregaId)

    if (error) throw new Error(`[SupabaseRepo] eliminarEntrega: ${error.message}`)
  }

  // ──────────────────────────────────────────────────────────────
  // Participaciones de socios
  // ──────────────────────────────────────────────────────────────

  async listarParticipaciones(actividadId: string): Promise<SocioParticipacion[]> {
    const { data, error } = await this.sb
      .from('actividad_participaciones')
      .select('socio_id, nombre_socio, porcentaje, monto_aportado')
      .eq('actividad_id', actividadId)
      .order('created_at', { ascending: true })

    if (error) {
      // La tabla puede no existir en entornos sin migrar: devolver vacío
      if (
        error.message.includes('does not exist') ||
        error.message.includes('schema cache') ||
        (error as unknown as { code?: string }).code === '42P01'
      ) {
        return []
      }
      throw new Error(`[SupabaseRepo] listarParticipaciones: ${error.message}`)
    }
    return (data ?? []).map(toSocioParticipacion)
  }

  async redefinirParticipaciones(
    config: ConfiguracionParticipaciones
  ): Promise<SocioParticipacion[]> {
    // Validar en dominio antes de ir a la BD
    const valueObjects = config.participaciones.map(
      (p) => new SocioParticipacion(p)
    )
    validarSociosDuplicados(valueObjects)
    validarSumaParticipaciones(valueObjects)

    const { error } = await this.sb.rpc('redefinir_participaciones', {
      p_actividad_id: config.actividadId,
      p_socios: config.participaciones.map((p) => ({
        socio_id:       p.socioId,
        nombre_socio:   p.nombreSocio,
        porcentaje:     p.porcentaje,
        monto_aportado: p.montoAportado,
      })),
    })

    if (error) throw new Error(`[SupabaseRepo] redefinirParticipaciones: ${error.message}`)
    return valueObjects
  }

  async actualizarAporteSocio(
    actividadId: string,
    socioId: string,
    nuevoMonto: number
  ): Promise<SocioParticipacion> {
    if (nuevoMonto < 0) {
      throw new Error('El monto aportado no puede ser negativo.')
    }
    
    const { data: { user } } = await this.sb.auth.getUser()
    
    const { data, error } = await this.sb
      .from('actividad_participaciones')
      .update({ 
        monto_aportado: nuevoMonto,
        actualizado_por: user?.id || null
      })
      .eq('actividad_id', actividadId)
      .eq('socio_id', socioId)
      .select('socio_id, nombre_socio, porcentaje, monto_aportado')
      .single()

    if (error) throw new Error(`[SupabaseRepo] actualizarAporteSocio: ${error.message}`)
    return toSocioParticipacion(data as Record<string, unknown>)
  }
}

// ---------------------------------------------------------------
// Factory: instancia lista para usar con variables de entorno
// ---------------------------------------------------------------

let _repo: SupabaseActivityRepository | null = null

/**
 * Devuelve un singleton de SupabaseActivityRepository.
 * Lee las credenciales de las variables de entorno de Next.js.
 */
export function getSupabaseActivityRepository(): SupabaseActivityRepository {
  if (!_repo) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!url || !key) {
      throw new Error(
        'Faltan variables de entorno: NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY'
      )
    }
    _repo = new SupabaseActivityRepository(createClient(url, key))
  }
  return _repo
}
