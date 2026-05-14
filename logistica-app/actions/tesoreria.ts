'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { getLogger } from '@/src/infrastructure/observability/logger'
import { getCorrelationId } from '@/src/infrastructure/observability/correlation'
import { InsufficientFundsError, ConcurrencyError } from '@/src/core/domain/entities'

// ============================================================
// CONSTANTES
// ============================================================
const CTA_GENERAL_ID = '00000000-0000-4000-a000-000000000001'

// ============================================================
// TIPOS
// ============================================================
export interface UsuarioRegistrado {
  id: string
  email: string
  nombre: string
  created_at: string
}

export interface CuentaVirtual {
  id: string
  numero_cuenta: string
  nombre: string
  tipo: 'PROYECTO' | 'GENERAL' | 'SOCIO'
  saldo: number
  requerimiento_id: string | null
  user_id: string | null
  created_at: string
  updated_at: string
  // Datos enriquecidos (JOIN)
  numero_requerimiento?: string | null
  nombre_actividad?: string | null
  // DEPRECATED — mantener para compatibilidad temporal con componentes que aún lo leen
  user_email?: string | null
  user_nombre?: string | null
}

export type TipoMovimiento =
  | 'INYECCION'
  | 'PAGO_UNIDAD'
  | 'TRANSFERENCIA'
  | 'GASTO'
  | 'REPARTO_50_50'
  | 'RETIRO'
  | 'DEVOLUCION'

export interface MovimientoBancario {
  id: string
  origen_id: string | null
  destino_id: string | null
  monto: number
  tipo: TipoMovimiento
  descripcion: string | null
  soporte_url: string | null
  fecha: string
  registrado_por: string | null
  created_at: string
  // JOIN
  cuenta_origen: { numero_cuenta: string; nombre: string; tipo: string } | null
  cuenta_destino: { numero_cuenta: string; nombre: string; tipo: string } | null
}

export interface ResumenDevolucionesUnidad {
  deudaPendienteUnidad: number
  totalDevuelto: number
  totalMovimientosDevolucion: number
}

// ============================================================
// CONSULTAS
// ============================================================

/**
 * Lista todos los usuarios registrados via función PostgreSQL SECURITY DEFINER.
 */
export async function listarUsuarios(): Promise<UsuarioRegistrado[]> {
  const sb = await createClient()
  const { data, error } = await sb.rpc('listar_usuarios_registrados')
  if (error) throw new Error(error.message)
  return (data || []) as UsuarioRegistrado[]
}

/**
 * Lista todas las cuentas virtuales con datos enriquecidos de requerimiento y usuario.
 * El saldo se calcula en tiempo real desde movimientos_bancarios (solo EJECUTADO).
 */
export async function listarCuentas(): Promise<CuentaVirtual[]> {
  const sb = await createClient()

  const [cuentasRes, usuariosRes, movsRes] = await Promise.all([
    sb
      .from('cuentas_virtuales')
      .select('*, requerimientos!requerimiento_id(numero_requerimiento, nombre_actividad)')
      .order('tipo')
      .order('created_at'),
    sb.rpc('listar_usuarios_registrados'),
    sb.from('movimientos_bancarios')
      .select('origen_id, destino_id, monto, estado'),
  ])

  if (cuentasRes.error) throw new Error(cuentasRes.error.message)

  const usuarios: UsuarioRegistrado[] = (usuariosRes.data || []) as UsuarioRegistrado[]
  const userMap = new Map(usuarios.map((u) => [u.id, u]))

  // Calcular saldos reales desde movimientos (solo EJECUTADO)
  const saldos = _calcularSaldosDesdeMovimientos(movsRes.data ?? [])

  return (cuentasRes.data || []).map((c: any) => {
    const user = c.user_id ? userMap.get(c.user_id) : undefined
    return {
      id:                   c.id,
      numero_cuenta:        c.numero_cuenta,
      nombre:               c.nombre,
      tipo:                 c.tipo,
      saldo:                saldos[c.id] ?? 0,
      requerimiento_id:     c.requerimiento_id,
      user_id:              c.user_id,
      created_at:           c.created_at,
      updated_at:           c.updated_at,
      numero_requerimiento: c.requerimientos?.numero_requerimiento ?? null,
      nombre_actividad:     c.requerimientos?.nombre_actividad ?? null,
      user_email:           user?.email ?? null,
      user_nombre:          user?.nombre ?? null,
    } satisfies CuentaVirtual
  })
}

/**
 * Calcula saldos de todas las cuentas a partir de movimientos bancarios.
 * Solo cuenta movimientos con estado EJECUTADO (o sin campo estado para backward compat).
 * Fórmula: Σ(entradas) − Σ(salidas)
 */
function _calcularSaldosDesdeMovimientos(
  movimientos: Array<{ origen_id: string | null; destino_id: string | null; monto: number; estado?: string }>
): Record<string, number> {
  const saldos: Record<string, number> = {}
  for (const m of movimientos) {
    // Solo contar movimientos EJECUTADO (o sin estado para backward compat)
    if (m.estado && m.estado !== 'EJECUTADO') continue
    const monto = Number(m.monto)
    if (m.destino_id) {
      saldos[m.destino_id] = (saldos[m.destino_id] ?? 0) + monto
    }
    if (m.origen_id) {
      saldos[m.origen_id] = (saldos[m.origen_id] ?? 0) - monto
    }
  }
  return saldos
}

/**
 * Calcula el saldo real de una cuenta individual.
 */
export async function calcularSaldoCuenta(cuentaId: string): Promise<number> {
  const sb = await createClient()
  const { data: movs } = await sb
    .from('movimientos_bancarios')
    .select('origen_id, destino_id, monto, estado')
    .or(`origen_id.eq.${cuentaId},destino_id.eq.${cuentaId}`)

  const saldos = _calcularSaldosDesdeMovimientos(movs ?? [])
  return saldos[cuentaId] ?? 0
}

/**
 * Lista movimientos bancarios con JOIN en ambas cuentas.
 */
export async function listarMovimientos(params?: {
  cuentaId?: string
  tipo?: TipoMovimiento
  limit?: number
}): Promise<MovimientoBancario[]> {
  const sb = await createClient()

  let query = sb
    .from('movimientos_bancarios')
    .select(`
      *,
      cuenta_origen:cuentas_virtuales!movimientos_bancarios_origen_id_fkey(numero_cuenta, nombre, tipo),
      cuenta_destino:cuentas_virtuales!movimientos_bancarios_destino_id_fkey(numero_cuenta, nombre, tipo)
    `)
    .order('fecha', { ascending: false })
    .limit(params?.limit ?? 150)

  if (params?.cuentaId) {
    query = query.or(
      `origen_id.eq.${params.cuentaId},destino_id.eq.${params.cuentaId}`
    )
  }
  if (params?.tipo) {
    query = query.eq('tipo', params.tipo)
  }

  const { data, error } = await query
  if (error) throw new Error(error.message)

  return (data || []).map((m: any) => ({
    ...m,
    monto:          Number(m.monto),
    cuenta_origen:  m.cuenta_origen ?? null,
    cuenta_destino: m.cuenta_destino ?? null,
  })) as MovimientoBancario[]
}

/**
 * Resume el estado global de devoluciones a la Unidad.
 * - deudaPendienteUnidad: suma de requerimientos.devoluciones_pendientes_unidad
 * - totalDevuelto: suma de movimientos tipo DEVOLUCION ejecutados
 */
export async function obtenerResumenDevolucionesUnidad(): Promise<ResumenDevolucionesUnidad> {
  const sb = await createClient()

  const [reqRes, movRes] = await Promise.all([
    sb.from('requerimientos').select('devoluciones_pendientes_unidad'),
    sb
      .from('movimientos_bancarios')
      .select('monto, estado')
      .eq('tipo', 'DEVOLUCION'),
  ])

  if (reqRes.error) throw new Error(reqRes.error.message)
  if (movRes.error) throw new Error(movRes.error.message)

  const deudaPendienteUnidad = (reqRes.data ?? []).reduce(
    (s: number, r: any) => s + Number(r.devoluciones_pendientes_unidad ?? 0),
    0,
  )

  const movimientosDevueltos = (movRes.data ?? []).filter(
    (m: any) => !m.estado || m.estado === 'EJECUTADO',
  )

  const totalDevuelto = movimientosDevueltos.reduce(
    (s: number, m: any) => s + Number(m.monto ?? 0),
    0,
  )

  return {
    deudaPendienteUnidad,
    totalDevuelto,
    totalMovimientosDevolucion: movimientosDevueltos.length,
  }
}

/**
 * Devuelve la cuenta virtual de un requerimiento (PROYECTO).
 * Retorna null si aún no tiene cuenta asignada.
 * El saldo se calcula en tiempo real desde movimientos.
 */
export async function obtenerCuentaProyecto(
  requerimientoId: string
): Promise<CuentaVirtual | null> {
  const sb = await createClient()
  const { data, error } = await sb
    .from('cuentas_virtuales')
    .select('*')
    .eq('requerimiento_id', requerimientoId)
    .eq('tipo', 'PROYECTO')
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!data) return null
  const saldoReal = await calcularSaldoCuenta(data.id)
  return { ...data, saldo: saldoReal } as CuentaVirtual
}

// ============================================================
// MUTACIONES — Gestión de cuentas
// ============================================================

/**
 * Crea cuenta SOCIO para un usuario real de auth.users.
 * Idempotente: si el usuario ya tiene cuenta la retorna.
 */
export async function crearCuentaSocio(
  userId: string,
  nombre: string,
): Promise<CuentaVirtual> {
  const sb = await createClient()

  const { data: existing } = await sb
    .from('cuentas_virtuales')
    .select('*')
    .eq('user_id', userId)
    .eq('tipo', 'SOCIO')
    .maybeSingle()

  if (existing) {
    const saldo = await calcularSaldoCuenta(existing.id)
    return { ...existing, saldo } as CuentaVirtual
  }

  const numeroCuenta = `CTA-SOCIO-${userId.substring(0, 4).toUpperCase()}`

  const { data, error } = await sb
    .from('cuentas_virtuales')
    .insert({ numero_cuenta: numeroCuenta, nombre, tipo: 'SOCIO', user_id: userId })
    .select()
    .single()

  if (error) throw new Error(error.message)
  revalidatePath('/tesoreria')
  return { ...data, saldo: 0 } as CuentaVirtual
}

/**
 * Crea cuenta PROYECTO vinculada a un requerimiento.
 * Idempotente: si ya existe la retorna sin crear otra.
 */
export async function crearCuentaProyecto(
  requerimientoId: string,
  nombreActividad: string,
  numeroRequerimiento: string,
): Promise<CuentaVirtual> {
  const sb = await createClient()

  const { data: existing } = await sb
    .from('cuentas_virtuales')
    .select('*')
    .eq('requerimiento_id', requerimientoId)
    .eq('tipo', 'PROYECTO')
    .maybeSingle()

  if (existing) {
    const saldo = await calcularSaldoCuenta(existing.id)
    return { ...existing, saldo } as CuentaVirtual
  }

  const numeroCuenta = `CTA-${numeroRequerimiento || requerimientoId.substring(0, 8).toUpperCase()}`

  const { data, error } = await sb
    .from('cuentas_virtuales')
    .insert({
      numero_cuenta:    numeroCuenta,
      nombre:           nombreActividad,
      tipo:             'PROYECTO',
      requerimiento_id: requerimientoId,
    })
    .select()
    .single()

  if (error) throw new Error(error.message)
  revalidatePath('/tesoreria')
  return { ...data, saldo: 0 } as CuentaVirtual
}

// ============================================================
// MUTACIONES — Movimientos financieros
// ============================================================

/**
 * Inyección de capital de un socio.
 * Flujo: Externo → CTA-SOCIO.
 * Si se indica cuentaProyectoId, también transfiere del socio al proyecto (paso 2 opcional).
 */
export async function inyectarCapital(params: {
  cuentaSocioId: string
  cuentaProyectoId?: string
  monto: number
  descripcion?: string
  soporteUrl?: string
}): Promise<{ ok: boolean }> {
  if (params.monto <= 0) throw new Error('El monto debe ser mayor a cero')

  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()

  // Movimiento 1: INYECCION — efectivo externo → cuenta del socio (sin origen)
  const { error: e1 } = await sb.from('movimientos_bancarios').insert({
    origen_id:      null,
    destino_id:     params.cuentaSocioId,
    monto:          params.monto,
    tipo:           'INYECCION',
    descripcion:    params.descripcion ?? 'Aporte de capital del socio',
    soporte_url:    params.soporteUrl ?? null,
    registrado_por: user?.id ?? null,
  })
  if (e1) throw new Error(`Error al registrar inyección: ${e1.message}`)

  // Movimiento 2 (opcional): TRANSFERENCIA — socio → proyecto
  if (params.cuentaProyectoId) {
    const { error: e2 } = await sb.from('movimientos_bancarios').insert({
      origen_id:      params.cuentaSocioId,
      destino_id:     params.cuentaProyectoId,
      monto:          params.monto,
      tipo:           'TRANSFERENCIA',
      descripcion:    params.descripcion ?? 'Transferencia del aporte al proyecto',
      soporte_url:    params.soporteUrl ?? null,
      registrado_por: user?.id ?? null,
    })
    if (e2) throw new Error(`Error al transferir al proyecto: ${e2.message}`)
  }

  revalidatePath('/tesoreria')
  return { ok: true }
}

/**
 * Registra el pago de la UV hacia el proyecto y calcula la retención automáticamente.
 *
 * Retención = cotizado_operativo − (abonos_previos + montoPagado).
 * Considera todos los abonos OPERATIVOS previos para el cálculo acumulativo.
 */
export async function registrarAbonoConRetencion(params: {
  cuentaProyectoId: string
  requerimientoId: string
  montoPagado: number
  descripcion?: string
  soporteUrl?: string
}): Promise<{ ok: boolean; retencion: number; totalCotizado: number }> {
  const correlationId = await getCorrelationId()
  const log = getLogger('registrarAbonoConRetencion')

  if (params.montoPagado <= 0) {
    const err = new Error('El monto pagado debe ser mayor a cero')
    const sb = await createClient()
    const { data: { user } } = await sb.auth.getUser()
    log.error({
      correlationId,
      userId: user?.id ?? 'anonymous',
      operation: 'registrarAbonoConRetencion',
      errorCode: 'VALIDATION_ERROR',
      metadata: { params },
    }, err, 'Validación: monto inválido')
    throw err
  }

  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  const userId = user?.id ?? 'anonymous'

  log.info({
    correlationId,
    userId,
    operation: 'registrarAbonoConRetencion',
    metadata: { cuentaProyectoId: params.cuentaProyectoId, montoPagado: params.montoPagado },
  }, 'Iniciando registro de abono con retención')

  // Calcular total cotizado operativo (ítems SERVICIO activos)
  const { data: items, error: itemsError } = await sb
    .from('items_requerimiento')
    .select('precio_total')
    .eq('requerimiento_id', params.requerimientoId)
    .eq('tipo', 'SERVICIO')
    .eq('estado', 'ACTIVO')

  if (itemsError) {
    log.error({
      correlationId,
      userId,
      operation: 'registrarAbonoConRetencion',
      errorCode: 'DB_ERROR',
      metadata: { stage: 'items_query', error: itemsError.message },
    }, itemsError, 'Error al consultar items cotizados')
    throw new Error(`Error al calcular cotizado: ${itemsError.message}`)
  }

  const totalCotizado = (items ?? []).reduce(
    (sum: number, it: any) => sum + Number(it.precio_total ?? 0),
    0
  )

  // Sumar abonos OPERATIVOS previos
  const { data: movsPrevios } = await sb
    .from('movimientos_bancarios')
    .select('monto, notas')
    .eq('destino_id', params.cuentaProyectoId)

  let abonosPreviosOp = 0
  for (const m of (movsPrevios ?? [])) {
    const notas = (m.notas ?? {}) as any
    if ((notas.tipo_abono ?? 'OPERATIVO') === 'OPERATIVO') {
      abonosPreviosOp += Number(m.monto)
    }
  }

  const retencion = Math.max(0, totalCotizado - (abonosPreviosOp + params.montoPagado))

  const descripcionMovimiento =
    params.descripcion ??
    `Pago UV. Cotizado: $${totalCotizado.toLocaleString('es-CO')} | Banco: $${params.montoPagado.toLocaleString('es-CO')} | Retención: $${retencion.toLocaleString('es-CO')}`

  // monto = lo que llegó al banco (valor real)
  const { error } = await sb.from('movimientos_bancarios').insert({
    origen_id:      null,
    destino_id:     params.cuentaProyectoId,
    monto:          params.montoPagado,
    tipo:           'PAGO_UNIDAD',
    descripcion:    descripcionMovimiento,
    soporte_url:    params.soporteUrl ?? null,
    registrado_por: userId,
    notas: {
      tipo_abono: 'OPERATIVO',
      monto_banco: params.montoPagado,
      retencion_aplicada: retencion,
      cotizado_operativo: totalCotizado,
      abonos_previos_operativo: abonosPreviosOp,
    },
  })
  if (error) {
    log.error({
      correlationId,
      userId,
      operation: 'registrarAbonoConRetencion',
      errorCode: 'DB_ERROR',
      metadata: { error: error.message, stage: 'insert_movimiento' },
    }, error, 'Error al registrar movimiento de abono')
    throw new Error(`Error al registrar abono: ${error.message}`)
  }

  log.info({
    correlationId,
    userId,
    operation: 'registrarAbonoConRetencion',
    metadata: {
      cuentaProyectoId: params.cuentaProyectoId,
      montoPagado: params.montoPagado,
      retencion,
      totalCotizado,
    },
  }, 'Abono registrado exitosamente')

  revalidatePath('/tesoreria')
  revalidatePath('/liquidaciones')
  return { ok: true, retencion, totalCotizado }
}

export async function obtenerBaseRepartoProyecto(cuentaProyectoId: string): Promise<{
  saldoDisponible: number
  devolucionesPendientes: number
  utilidadNeta: number
}> {
  const sb = await createClient()

  const { data: cuenta, error: cuentaError } = await sb
    .from('cuentas_virtuales')
    .select('requerimiento_id, tipo')
    .eq('id', cuentaProyectoId)
    .single()

  if (cuentaError) throw new Error(`Error al leer cuenta del proyecto: ${cuentaError.message}`)
  if (cuenta.tipo !== 'PROYECTO') {
    throw new Error('El reparto solo se permite para cuentas de tipo PROYECTO.')
  }

  const saldoDisponible = await calcularSaldoCuenta(cuentaProyectoId)

  let devolucionesPendientes = 0
  if (cuenta.requerimiento_id) {
    const { data: req, error: reqErr } = await sb
      .from('requerimientos')
      .select('devoluciones_pendientes_unidad')
      .eq('id', cuenta.requerimiento_id)
      .maybeSingle()

    if (reqErr) {
      throw new Error(`Error al leer devoluciones pendientes del proyecto: ${reqErr.message}`)
    }
    devolucionesPendientes = Number(req?.devoluciones_pendientes_unidad ?? 0)
  }

  return {
    saldoDisponible,
    devolucionesPendientes,
    utilidadNeta: Math.max(0, saldoDisponible - devolucionesPendientes),
  }
}

/**
 * Reparto 50/50 de la utilidad disponible del proyecto.
 * Genera 2 movimientos REPARTO_50_50: CTA-PROYECTO → CTA-SOCIO-A y CTA-PROYECTO → CTA-SOCIO-B.
 * El centavo sobrante (si monto impar) permanece en la cuenta del proyecto.
 */
export async function liquidarUtilidad5050(params: {
  cuentaProyectoId: string
  cuentaSocioAId: string
  cuentaSocioBId: string
  descripcion?: string
}): Promise<{ ok: boolean; montoParaCadaSocio: number }> {
  const result = await repartirUtilidadVariable({
    cuentaProyectoId: params.cuentaProyectoId,
    cuentaSocioAId: params.cuentaSocioAId,
    cuentaSocioBId: params.cuentaSocioBId,
    modo: 'PORCENTAJE',
    porcentajeSocioA: 50,
    porcentajeSocioB: 50,
    descripcion: params.descripcion,
  })

  return {
    ok: true,
    montoParaCadaSocio: result.montoSocioA,
  }
}

export async function repartirUtilidadVariable(params: {
  cuentaProyectoId: string
  cuentaSocioAId: string
  cuentaSocioBId: string
  modo: 'PORCENTAJE' | 'MONTO'
  porcentajeSocioA?: number
  porcentajeSocioB?: number
  montoSocioA?: number
  descripcion?: string
}): Promise<{
  ok: boolean
  montoSocioA: number
  montoSocioB: number
  porcentajeSocioA: number
  porcentajeSocioB: number
  utilidadNeta: number
}> {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()

  const { data: cuenta, error: cuentaError } = await sb
    .from('cuentas_virtuales')
    .select('numero_cuenta, requerimiento_id, tipo')
    .eq('id', params.cuentaProyectoId)
    .single()

  if (cuentaError) throw new Error(`Error al leer cuenta del proyecto: ${cuentaError.message}`)

  if (cuenta.tipo !== 'PROYECTO') {
    throw new Error('La liquidacion 50/50 solo se permite para cuentas de tipo PROYECTO.')
  }

  const { saldoDisponible, devolucionesPendientes, utilidadNeta } = await obtenerBaseRepartoProyecto(params.cuentaProyectoId)
  if (saldoDisponible <= 0) {
    throw new Error(
      `Sin saldo disponible en ${cuenta.numero_cuenta}. Saldo actual: $0`
    )
  }
  if (utilidadNeta <= 0) {
    throw new Error(
      `No hay utilidad neta para repartir. Saldo: $${saldoDisponible.toLocaleString('es-CO')} | Devoluciones pendientes: $${devolucionesPendientes.toLocaleString('es-CO')}`
    )
  }

  const utilidadCentavos = Math.round(utilidadNeta * 100)
  if (utilidadCentavos <= 0) {
    throw new Error(`Utilidad neta insuficiente para dividir: $${utilidadNeta.toLocaleString('es-CO')}`)
  }

  let montoACentavos = 0
  let montoBCentavos = 0

  if (params.modo === 'PORCENTAJE') {
    const porcentajeA = Math.max(0, Math.min(100, Number(params.porcentajeSocioA ?? 50)))
    // El porcentaje B siempre se ajusta para cerrar en 100
    const porcentajeB = Math.max(0, 100 - porcentajeA)

    // Redondeo: ajuste/sobrante hacia Socio A (decisión de negocio)
    montoBCentavos = Math.round(utilidadCentavos * (porcentajeB / 100))
    montoACentavos = utilidadCentavos - montoBCentavos
  } else {
    const montoA = Math.max(0, Number(params.montoSocioA ?? 0))
    montoACentavos = Math.max(0, Math.min(utilidadCentavos, Math.round(montoA * 100)))
    // El monto B siempre se ajusta al remanente para cerrar exacto
    montoBCentavos = utilidadCentavos - montoACentavos
  }

  if (montoACentavos <= 0 && montoBCentavos <= 0) {
    throw new Error('La distribución debe asignar un monto mayor a cero.')
  }

  const montoA = montoACentavos / 100
  const montoB = montoBCentavos / 100
  const porcentajeAReal = utilidadCentavos > 0 ? (montoACentavos / utilidadCentavos) * 100 : 0
  const porcentajeBReal = utilidadCentavos > 0 ? (montoBCentavos / utilidadCentavos) * 100 : 0

  const desc = params.descripcion ?? `Reparto de utilidad — ${cuenta.numero_cuenta}`

  const { error: eA } = await sb.from('movimientos_bancarios').insert({
    origen_id:      params.cuentaProyectoId,
    destino_id:     params.cuentaSocioAId,
    monto:          montoA,
    tipo:           'REPARTO_50_50',
    descripcion:    `${desc} [Socio A ${porcentajeAReal.toFixed(2)}%]`,
    registrado_por: user?.id ?? null,
    notas: {
      reparto_modo: params.modo,
      utilidad_neta: utilidadNeta,
      porcentaje_socio_a: porcentajeAReal,
      porcentaje_socio_b: porcentajeBReal,
      monto_socio_a: montoA,
      monto_socio_b: montoB,
    },
  })
  if (eA) throw new Error(`Error al repartir a Socio A: ${eA.message}`)

  const { error: eB } = await sb.from('movimientos_bancarios').insert({
    origen_id:      params.cuentaProyectoId,
    destino_id:     params.cuentaSocioBId,
    monto:          montoB,
    tipo:           'REPARTO_50_50',
    descripcion:    `${desc} [Socio B ${porcentajeBReal.toFixed(2)}%]`,
    registrado_por: user?.id ?? null,
    notas: {
      reparto_modo: params.modo,
      utilidad_neta: utilidadNeta,
      porcentaje_socio_a: porcentajeAReal,
      porcentaje_socio_b: porcentajeBReal,
      monto_socio_a: montoA,
      monto_socio_b: montoB,
    },
  })
  if (eB) throw new Error(`Error al repartir a Socio B: ${eB.message}`)

  revalidatePath('/tesoreria')
  return {
    ok: true,
    montoSocioA: montoA,
    montoSocioB: montoB,
    porcentajeSocioA: porcentajeAReal,
    porcentajeSocioB: porcentajeBReal,
    utilidadNeta,
  }
}

/**
 * Retiro de fondos: CTA-SOCIO → efectivo externo (destino null).
 */
export async function registrarRetiro(params: {
  cuentaSocioId: string
  monto: number
  descripcion?: string
  soporteUrl?: string
}): Promise<{ ok: boolean }> {
  if (params.monto <= 0) throw new Error('El monto debe ser mayor a cero')

  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()

  const { error } = await sb.from('movimientos_bancarios').insert({
    origen_id:      params.cuentaSocioId,
    destino_id:     null,
    monto:          params.monto,
    tipo:           'RETIRO',
    descripcion:    params.descripcion ?? 'Retiro de fondos del socio',
    soporte_url:    params.soporteUrl ?? null,
    registrado_por: user?.id ?? null,
  })
  if (error) throw new Error(error.message)

  revalidatePath('/tesoreria')
  return { ok: true }
}

/**
 * Transferencia genérica entre dos cuentas virtuales.
 */
export async function transferirEntreCuentas(params: {
  origenId: string
  destinoId: string
  monto: number
  tipo?: 'TRANSFERENCIA' | 'GASTO'
  descripcion?: string
  soporteUrl?: string
}): Promise<{ ok: boolean }> {
  if (params.monto <= 0) throw new Error('El monto debe ser mayor a cero')

  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()

  const { error } = await sb.from('movimientos_bancarios').insert({
    origen_id:      params.origenId,
    destino_id:     params.destinoId,
    monto:          params.monto,
    tipo:           params.tipo ?? 'TRANSFERENCIA',
    descripcion:    params.descripcion ?? null,
    soporte_url:    params.soporteUrl ?? null,
    registrado_por: user?.id ?? null,
  })
  if (error) throw new Error(error.message)

  revalidatePath('/tesoreria')
  return { ok: true }
}
