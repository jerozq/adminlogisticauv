'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'

export interface LiquidacionResumen {
  id: string
  numeroRequerimiento: string | null
  nombreActividad: string
  municipio: string | null
  cotizado: number
  abonado: number
  costosEjecutados: number
  devolucionesPendientes: number
  estado: string
}

type ModoCostoUI = 'UNITARIO' | 'TOTAL'
type EstadoPagoCosto = 'PENDIENTE' | 'PAGADO'
type PagadorCosto = 'jero' | 'socio' | 'caja_proyecto'

interface CostoLiquidacionDetalle {
  id: string
  actividad_id: string
  item_id: string | null
  descripcion: string | null
  monto: number
  pagador: PagadorCosto
  soporte_url: string | null
  notas: string | null
  modo_registro: string | null
  cantidad: number
  precio_unitario: number | null
  concepto: string | null
  estado_pago: EstadoPagoCosto | 'ANULADO' | null
  movimiento_id: string | null
  transferencia_id: string | null
  cuenta_origen_id: string | null
  observaciones: string | null
  created_at: string
  updated_at?: string | null
}

export interface GuardarCostoLiquidacionInput {
  costoId?: string | null
  actividadId: string
  itemId: string | null
  descripcion: string
  modo: ModoCostoUI
  cantidad: number
  valor: number
  cuentaOrigenId?: string | null
  estadoPago?: EstadoPagoCosto
  observaciones?: string | null
  concepto?: string | null
  pagador?: string | null
}

function _normalizarMontoCosto(input: GuardarCostoLiquidacionInput): { monto: number; precioUnitario: number } {
  const cantidad = Number(input.cantidad || 0)

  if (cantidad <= 0) {
    throw new Error('La cantidad del costo debe ser mayor a cero')
  }

  if (input.modo === 'UNITARIO') {
    const precioUnitario = Number(input.valor || 0)
    if (precioUnitario <= 0) {
      throw new Error('El costo unitario debe ser mayor a cero')
    }
    return { monto: cantidad * precioUnitario, precioUnitario }
  }

  const monto = Number(input.valor || 0)
  if (monto <= 0) {
    throw new Error('El costo total debe ser mayor a cero')
  }

  return {
    monto,
    precioUnitario: monto / cantidad,
  }
}

function _esPagadorValido(valor: unknown): valor is PagadorCosto {
  return valor === 'jero' || valor === 'socio' || valor === 'caja_proyecto'
}

async function _resolverPagadorCosto(
  sb: Awaited<ReturnType<typeof createClient>>,
  input: GuardarCostoLiquidacionInput,
  costoExistente?: CostoLiquidacionDetalle | null,
): Promise<PagadorCosto> {
  if (_esPagadorValido(input.pagador)) {
    return input.pagador
  }

  if (costoExistente && _esPagadorValido(costoExistente.pagador)) {
    return costoExistente.pagador
  }

  const cuentaOrigenId = input.cuentaOrigenId ?? costoExistente?.cuenta_origen_id ?? null
  if (!cuentaOrigenId) {
    return 'caja_proyecto'
  }

  const { data: cuenta, error } = await sb
    .from('cuentas_virtuales')
    .select('tipo')
    .eq('id', cuentaOrigenId)
    .maybeSingle()

  if (error || !cuenta) {
    return 'caja_proyecto'
  }

  return cuenta.tipo === 'SOCIO' ? 'socio' : 'caja_proyecto'
}

async function _obtenerOCrearCuentaProyecto(sb: Awaited<ReturnType<typeof createClient>>, actividadId: string) {
  const { data: existente, error: cuentaErr } = await sb
    .from('cuentas_virtuales')
    .select('id, numero_cuenta, nombre')
    .eq('requerimiento_id', actividadId)
    .eq('tipo', 'PROYECTO')
    .maybeSingle()

  if (cuentaErr) {
    throw new Error(`Error al leer cuenta del proyecto: ${cuentaErr.message}`)
  }

  if (existente) return existente

  const { data: req, error: reqErr } = await sb
    .from('requerimientos')
    .select('numero_requerimiento, nombre_actividad')
    .eq('id', actividadId)
    .single()

  if (reqErr) {
    throw new Error(`Error al leer requerimiento: ${reqErr.message}`)
  }

  const numeroCuenta = `CTA-${req?.numero_requerimiento || actividadId.substring(0, 8).toUpperCase()}`

  const { data: creada, error: insertErr } = await sb
    .from('cuentas_virtuales')
    .insert({
      numero_cuenta: numeroCuenta,
      nombre: req?.nombre_actividad ?? 'Proyecto',
      tipo: 'PROYECTO',
      requerimiento_id: actividadId,
    })
    .select('id, numero_cuenta, nombre')
    .single()

  if (insertErr) {
    throw new Error(`Error al crear cuenta del proyecto: ${insertErr.message}`)
  }

  return creada
}

function _armarNotasMovimientoCosto(costo: CostoLiquidacionDetalle, extras: Record<string, unknown> = {}) {
  return {
    costo_id: costo.id,
    actividad_id: costo.actividad_id,
    item_id: costo.item_id,
    monto: costo.monto,
    cantidad: costo.cantidad,
    precio_unitario: costo.precio_unitario,
    estado_pago: costo.estado_pago ?? 'PENDIENTE',
    modo_registro: costo.modo_registro,
    observaciones: costo.observaciones,
    concepto: costo.concepto,
    pagador: costo.pagador,
    ...extras,
  }
}

async function _sincronizarMovimientoCosto(
  sb: Awaited<ReturnType<typeof createClient>>,
  costo: CostoLiquidacionDetalle,
  cuentaOrigenId?: string | null,
) {
  const estadoDeseado = costo.estado_pago === 'PAGADO' ? 'EJECUTADO' : 'ANULADO'
  const descripcionMovimiento = costo.descripcion?.trim()
    ? `Costo ${costo.descripcion.trim()}`
    : `Costo de actividad ${costo.actividad_id}`

  if (costo.estado_pago === 'PAGADO') {
    const cuentaOrigen = cuentaOrigenId ?? costo.cuenta_origen_id ?? (await _obtenerOCrearCuentaProyecto(sb, costo.actividad_id)).id

    // Pre-validar saldo suficiente antes de crear el movimiento (evita violacion de constraint en DB)
    const { data: cuentaCheck, error: saldoCheckErr } = await sb
      .from('cuentas_virtuales')
      .select('saldo')
      .eq('id', cuentaOrigen)
      .single()

    if (!saldoCheckErr && cuentaCheck) {
      const saldoActual = Number(cuentaCheck.saldo)
      const montoRequerido = Number(costo.monto || 0)
      if (saldoActual < montoRequerido) {
        throw new Error(`SALDO_INSUFICIENTE|${JSON.stringify({
          saldoActual,
          montoRequerido,
          deficit: montoRequerido - saldoActual,
          cuentaId: cuentaOrigen,
        })}`)
      }
    }

    const payloadMovimiento = {
      origen_id: cuentaOrigen,
      destino_id: null,
      monto: costo.monto,
      tipo: 'GASTO' as const,
      estado: estadoDeseado,
      descripcion: descripcionMovimiento,
      notas: _armarNotasMovimientoCosto(costo, {
        cuenta_origen_id: cuentaOrigen,
        estado_movimiento: estadoDeseado,
      }),
    }

    if (costo.movimiento_id) {
      const { error } = await sb
        .from('movimientos_bancarios')
        .update(payloadMovimiento)
        .eq('id', costo.movimiento_id)
      if (error) throw new Error(`Error al actualizar movimiento del costo: ${error.message}`)
    } else {
      const { data: movimiento, error } = await sb
        .from('movimientos_bancarios')
        .insert(payloadMovimiento)
        .select('id')
        .single()
      if (error) throw new Error(`Error al crear movimiento del costo: ${error.message}`)

      const { error: updateCostoError } = await sb
        .from('ejecucion_costos')
        .update({ movimiento_id: movimiento.id, cuenta_origen_id: cuentaOrigen, estado_pago: 'PAGADO' })
        .eq('id', costo.id)
      if (updateCostoError) throw new Error(`Error al enlazar movimiento del costo: ${updateCostoError.message}`)
    }
  } else if (costo.movimiento_id) {
    const { error } = await sb
      .from('movimientos_bancarios')
      .update({
        estado: estadoDeseado,
        descripcion: `${descripcionMovimiento} (anulado)`,
        notas: _armarNotasMovimientoCosto(costo, {
          cuenta_origen_id: cuentaOrigenId ?? costo.cuenta_origen_id ?? null,
          estado_movimiento: estadoDeseado,
        }),
      })
      .eq('id', costo.movimiento_id)
    if (error) throw new Error(`Error al anular movimiento del costo: ${error.message}`)
  }
}

export async function listarLiquidaciones(): Promise<LiquidacionResumen[]> {
  const sb = await createClient()

  // 1. Requerimientos base + costos ejecutados (join)
  // 2. Items cotizados activos (para calcular "Cotizado")
  // 3. Cuentas virtuales (para derivar abonos reales desde movimientos_bancarios)
  const [reqResult, itemsResult, cuentasResult] = await Promise.all([
    sb.from('requerimientos').select(
      'id, numero_requerimiento, nombre_actividad, municipio, estado, devoluciones_pendientes_unidad, ejecucion_costos(monto)'
    ).order('created_at', { ascending: false }),
    sb.from('items_requerimiento')
      .select('requerimiento_id, precio_total')
      .in('tipo', ['SERVICIO', 'PASIVO_TERCERO'])
      .eq('estado', 'ACTIVO'),
    sb.from('cuentas_virtuales')
      .select('id, requerimiento_id'),
  ])

  if (reqResult.error) {
    console.error('Error fetching liquidaciones:', reqResult.error)
    return []
  }

  // Mapa: requerimiento_id ? cuenta_virtual_id
  const cuentaPorReq: Record<string, string> = {}
  for (const c of (cuentasResult.data ?? [])) {
    if (c.requerimiento_id) cuentaPorReq[c.requerimiento_id] = c.id
  }

  // Obtener todos los IDs de cuentas virtuales para buscar movimientos en un solo query
  const cuentaIds = Object.values(cuentaPorReq)

  // Buscar todos los movimientos de entrada (abonos) a las cuentas virtuales
  // Solo contar movimientos EJECUTADO (o sin estado para backward compat)
  let abonosPorCuenta: Record<string, number> = {}
  if (cuentaIds.length > 0) {
    const { data: movimientos } = await sb
      .from('movimientos_bancarios')
      .select('destino_id, monto, estado')
      .in('destino_id', cuentaIds)

    for (const m of (movimientos ?? [])) {
      if ((m as any).estado && (m as any).estado !== 'EJECUTADO') continue
      const cid = m.destino_id as string
      abonosPorCuenta[cid] = (abonosPorCuenta[cid] ?? 0) + Number(m.monto)
    }
  }

  // Mapa invertido: cuenta_id ? requerimiento_id
  const reqPorCuenta: Record<string, string> = {}
  for (const [reqId, cuentaId] of Object.entries(cuentaPorReq)) {
    reqPorCuenta[cuentaId] = reqId
  }

  // Mapa final: requerimiento_id ? total abonado
  const abonadoPorReq: Record<string, number> = {}
  for (const [cuentaId, total] of Object.entries(abonosPorCuenta)) {
    const reqId = reqPorCuenta[cuentaId]
    if (reqId) abonadoPorReq[reqId] = total
  }

  // Cotizado: suma de items activos por requerimiento
  const totalesPor: Record<string, number> = {}
  for (const item of (itemsResult.data ?? [])) {
    const rid = item.requerimiento_id as string
    totalesPor[rid] = (totalesPor[rid] ?? 0) + Number(item.precio_total)
  }

  return (reqResult.data || []).map((req: any) => {
    const costos = req.ejecucion_costos || []
    const costosEjecutados = costos.reduce((acc: number, cur: any) => acc + Number(cur.monto), 0)
    return {
      id: req.id,
      numeroRequerimiento: req.numero_requerimiento,
      nombreActividad: req.nombre_actividad,
      municipio: req.municipio ?? null,
      cotizado: totalesPor[req.id] ?? 0,
      abonado: abonadoPorReq[req.id] ?? 0,
      costosEjecutados,
      devolucionesPendientes: Number(req.devoluciones_pendientes_unidad || 0),
      estado: req.estado,
    }
  })
}

export async function getLiquidacionDetalle(actividadId: string) {
  const sb = await createClient()

  // Cuenta virtual del proyecto (para derivar abonos/devoluciones desde movimientos_bancarios)
  const { data: cuenta } = await sb
    .from('cuentas_virtuales')
    .select('id')
    .eq('requerimiento_id', actividadId)
    .maybeSingle()

  const [reqRes, movimientosRes, costosRes, itemsRes, reembolsosRes, deudasRes] = await Promise.all([
    sb.from('requerimientos').select('*').eq('id', actividadId).single(),
    cuenta
      ? sb.from('movimientos_bancarios')
          .select('*')
          .or(`origen_id.eq.${cuenta.id},destino_id.eq.${cuenta.id}`)
          .order('fecha', { ascending: true })
      : Promise.resolve({ data: [] as any[], error: null }),
    sb.from('ejecucion_costos').select('*').eq('actividad_id', actividadId).order('created_at', { ascending: false }),
    sb.from('items_requerimiento')
      .select('*')
      .eq('requerimiento_id', actividadId)
      .in('tipo', ['SERVICIO', 'PASIVO_TERCERO'])
      .order('created_at', { ascending: true }),
    sb.from('items_requerimiento')
      .select('*')
      .eq('requerimiento_id', actividadId)
      .eq('tipo', 'REEMBOLSO')
      .order('created_at', { ascending: true }),
    sb.from('devoluciones_deuda')
      .select('*')
      .eq('requerimiento_id', actividadId)
      .order('created_at', { ascending: false }),
  ])

  const movimientos = (movimientosRes.data || []) as any[]

  // Mapear abonos: monto = lo que llego al banco (lo que el usuario ingreso)
  // retencion_aplicada = desde notas (calculada al registrar)
  // tipo_abono = OPERATIVO | PASIVO_TERCERO desde notas
  const abonos = movimientos
    .filter(m => m.destino_id === cuenta?.id && m.tipo === 'PAGO_UNIDAD')
    .map(m => {
      const notas = (m.notas ?? {}) as any
      return {
        id:                 m.id,
        actividad_id:       actividadId,
        // monto = valor real del banco (lo que ingreso el usuario)
        monto:              Number(m.monto),
        retencion_aplicada: Number(notas.retencion_aplicada ?? 0),
        tipo_abono:         notas.tipo_abono ?? 'OPERATIVO',
        fecha_abono:        m.fecha,
      }
    })

  const devoluciones = movimientos
    .filter(m => m.origen_id === cuenta?.id && (m.tipo === 'RETIRO' || m.tipo === 'DEVOLUCION'))
    .map(m => ({
      id:           m.id,
      actividad_id: actividadId,
      monto:        m.monto,
      fecha_salida: m.fecha,
      evidencia_url: m.soporte_url,
    }))

  const movimientosProyecto = movimientos
    .map(m => {
      const esEntrada = m.destino_id === cuenta?.id && m.origen_id !== cuenta?.id
      const esSalida = m.origen_id === cuenta?.id && m.destino_id !== cuenta?.id
      const impactoNeto = esEntrada ? Number(m.monto ?? 0) : esSalida ? -Number(m.monto ?? 0) : 0
      return {
        ...m,
        monto: Number(m.monto ?? 0),
        impacto_neto: impactoNeto,
        direccion: esEntrada ? 'ENTRADA' : esSalida ? 'SALIDA' : 'INTERNO',
      }
    })
    .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())

  return {
    actividad:     reqRes.data,
    abonos,
    movimientosProyecto,
    devoluciones,
    deudas:        deudasRes.data || [],
    costos:        costosRes.data || [],
    itemsCotizados: itemsRes.data || [],
    reembolsos:    reembolsosRes.data || [],
  }
}

/**
 * Registra un abono de la Unidad al proyecto.
 *
 * Logica de retencion (solo para OPERATIVO):
 *   1. Obtener cotizado operativo (items SERVICIO activos)
 *   2. Sumar todos los abonos OPERATIVOS previos ya registrados en movimientos_bancarios
 *   3. retencion = cotizado_operativo - (abonos_previos + monto_actual)
 *   4. Si retencion < 0 ? 0
 *
 * Lo que se almacena en movimientos_bancarios:
 *   - monto = lo que el usuario ingreso (el valor real del banco)
 *   - notas = { tipo_abono, monto_banco, retencion_aplicada, cotizado_operativo, abonos_previos }
 *
 * Para PASIVO_TERCERO: monto = valor ingresado, retencion = 0.
 */
export async function registrarAbonoUnidad(
  actividadId: string,
  montoBanco: number,
  _retencionIgnorada: number,  // ? se ignora, se auto-calcula
  tipo_abono: 'OPERATIVO' | 'PASIVO_TERCERO' = 'OPERATIVO',
) {
  const sb = await createClient()

  // Cargar requerimiento
  const { data: req } = await sb
    .from('requerimientos')
    .select('numero_requerimiento, nombre_actividad')
    .eq('id', actividadId)
    .single()

  // Obtener o crear la cuenta virtual del proyecto
  let { data: cuenta } = await sb
    .from('cuentas_virtuales')
    .select('id')
    .eq('requerimiento_id', actividadId)
    .maybeSingle()

  if (!cuenta) {
    const numeroCuenta = `CTA-${req?.numero_requerimiento || actividadId.substring(0, 8).toUpperCase()}`
    const { data: nuevaCuenta } = await sb
      .from('cuentas_virtuales')
      .insert({
        numero_cuenta:    numeroCuenta,
        nombre:           req?.nombre_actividad ?? actividadId,
        tipo:             'PROYECTO',
        requerimiento_id: actividadId,
      })
      .select('id')
      .single()
    cuenta = nuevaCuenta
  }

  if (!cuenta) throw new Error('No se pudo obtener/crear la cuenta virtual del proyecto')

  // -- Auto-cálculo de retencion para OPERATIVO --
  let retencionCalculada = 0
  let cotizadoOperativo = 0
  let abonosPreviosOp = 0

  if (tipo_abono === 'OPERATIVO') {
    // 1. Cotizado operativo = items SERVICIO activos
    const { data: items } = await sb
      .from('items_requerimiento')
      .select('precio_total')
      .eq('requerimiento_id', actividadId)
      .eq('tipo', 'SERVICIO')
      .eq('estado', 'ACTIVO')

    cotizadoOperativo = (items ?? []).reduce((s: number, i: any) => s + Number(i.precio_total), 0)

    // 2. Sumar abonos OPERATIVOS previos desde movimientos_bancarios
    const { data: movsPrevios } = await sb
      .from('movimientos_bancarios')
      .select('monto, notas, tipo, estado')
      .eq('destino_id', cuenta.id)

    for (const m of (movsPrevios ?? [])) {
      if ((m as any).tipo !== 'PAGO_UNIDAD') continue
      if ((m as any).estado && (m as any).estado !== 'EJECUTADO') continue
      const notas = (m.notas ?? {}) as any
      if ((notas.tipo_abono ?? 'OPERATIVO') === 'OPERATIVO') {
        abonosPreviosOp += Number(m.monto)
      }
    }

    // 3. Retencion = cotizado - (previos + actual)
    retencionCalculada = Math.max(0, cotizadoOperativo - (abonosPreviosOp + montoBanco))
  }

  // -- Insertar movimiento bancario --
  // monto = lo que llego al banco (valor real)
  const { error: movErr } = await sb.from('movimientos_bancarios').insert({
    origen_id:   null,
    destino_id:  cuenta.id,
    tipo:        'PAGO_UNIDAD',
    monto:       montoBanco,
    descripcion: tipo_abono === 'OPERATIVO'
      ? `Abono OPERATIVO | Banco: ${montoBanco} | Retencion: ${retencionCalculada}`
      : `Abono TERCEROS | Banco: ${montoBanco}`,
    notas: {
      tipo_abono,
      monto_banco: montoBanco,
      retencion_aplicada: retencionCalculada,
      cotizado_operativo: cotizadoOperativo,
      abonos_previos_operativo: abonosPreviosOp,
    },
  })
  if (movErr) throw new Error(`Error al registrar movimiento: ${movErr.message}`)

  revalidatePath(`/liquidaciones/${actividadId}`)
  revalidatePath('/liquidaciones')
  revalidatePath('/tesoreria')
  return { ok: true }
}

/**
 * Repara abonos huerfanos: detecta la diferencia entre abonos_recibidos
 * (campo denormalizado en requerimientos) y la suma real de movimientos_bancarios.
 * Crea un movimiento correctivo por la diferencia si existe descuadre.
 */
export async function repararAbonosHuerfanos(actividadId: string): Promise<{ ok: boolean; montoReparado: number; error?: string }> {
  const sb = await createClient()

  const { data: req } = await sb
    .from('requerimientos')
    .select('numero_requerimiento, nombre_actividad, abonos_recibidos')
    .eq('id', actividadId)
    .single()

  const totalDenormalizado = Number(req?.abonos_recibidos ?? 0)

  // Obtener o crear la cuenta virtual
  let { data: cuenta } = await sb
    .from('cuentas_virtuales')
    .select('id')
    .eq('requerimiento_id', actividadId)
    .maybeSingle()

  if (!cuenta) {
    const numeroCuenta = `CTA-${req?.numero_requerimiento || actividadId.substring(0, 8).toUpperCase()}`
    const { data: nuevaCuenta, error: cuentaErr } = await sb
      .from('cuentas_virtuales')
      .insert({
        numero_cuenta:    numeroCuenta,
        nombre:           req?.nombre_actividad ?? actividadId,
        tipo:             'PROYECTO',
        requerimiento_id: actividadId,
      })
      .select('id')
      .single()
    if (cuentaErr) return { ok: false, montoReparado: 0, error: `Error al crear cuenta virtual: ${cuentaErr.message}` }
    cuenta = nuevaCuenta
  }

  if (!cuenta) return { ok: false, montoReparado: 0, error: 'No se pudo obtener la cuenta virtual' }

  // Sumar movimientos reales existentes (entradas a la cuenta del proyecto)
  const { data: movs } = await sb
    .from('movimientos_bancarios')
    .select('monto')
    .eq('destino_id', cuenta.id)

  const totalMovimientos = (movs ?? []).reduce((acc, m) => acc + Number(m.monto), 0)
  const diferencia = Math.round(totalDenormalizado - totalMovimientos)

  if (diferencia <= 0) return { ok: true, montoReparado: 0 }

  // Crear movimiento correctivo por la diferencia
  const { error: movErr } = await sb.from('movimientos_bancarios').insert({
    origen_id:   null,
    destino_id:  cuenta.id,
    tipo:        'PAGO_UNIDAD',
    monto:       diferencia,
    descripcion: 'Correccion: abono registrado antes de crear cuenta virtual',
  })
  if (movErr) return { ok: false, montoReparado: 0, error: `Error al insertar movimiento: ${movErr.message}` }

  revalidatePath(`/liquidaciones/${actividadId}`)
  revalidatePath('/liquidaciones')
  revalidatePath('/tesoreria')
  return { ok: true, montoReparado: diferencia }
}

export async function registrarCostoReal(input: GuardarCostoLiquidacionInput): Promise<{ ok: true; costoId: string }> {
  const sb = await createClient()
  const { monto, precioUnitario } = _normalizarMontoCosto(input)

  const observacionesBase = input.observaciones?.trim() || null
  const estadoPago = input.estadoPago ?? 'PENDIENTE'

  if (input.costoId) {
    const { data: existente, error: existenteError } = await sb
      .from('ejecucion_costos')
      .select('*')
      .eq('id', input.costoId)
      .single()

    if (existenteError) throw new Error(`Error al leer el costo: ${existenteError.message}`)

    const pagador = await _resolverPagadorCosto(sb, input, existente as CostoLiquidacionDetalle)

    const costoActualizado: CostoLiquidacionDetalle = {
      ...(existente as CostoLiquidacionDetalle),
      item_id: input.itemId,
      descripcion: input.descripcion,
      monto,
      pagador,
      modo_registro: input.modo === 'UNITARIO' ? 'por_item' : 'global',
      cantidad: Number(input.cantidad),
      precio_unitario: precioUnitario,
      concepto: input.concepto ?? null,
      estado_pago: estadoPago,
      cuenta_origen_id: input.cuentaOrigenId ?? (existente as any)?.cuenta_origen_id ?? null,
      observaciones: observacionesBase,
    }

    const notas = [
      observacionesBase,
      input.concepto?.trim() ? `Concepto: ${input.concepto.trim()}` : null,
    ].filter(Boolean)

    const { error: updateError } = await sb
      .from('ejecucion_costos')
      .update({
        item_id: input.itemId,
        descripcion: input.descripcion,
        monto,
        pagador,
        modo_registro: costoActualizado.modo_registro,
        cantidad: Number(input.cantidad),
        precio_unitario: precioUnitario,
        concepto: input.concepto ?? null,
        estado_pago: estadoPago,
        cuenta_origen_id: input.cuentaOrigenId ?? (existente as any)?.cuenta_origen_id ?? null,
        observaciones: notas.join(' · ') || null,
      })
      .eq('id', input.costoId)

    if (updateError) throw new Error(`Error al actualizar el costo: ${updateError.message}`)

    const costoConId: CostoLiquidacionDetalle = {
      ...costoActualizado,
      id: input.costoId,
      observaciones: notas.join(' · ') || null,
    }

    await _sincronizarMovimientoCosto(sb, costoConId, input.cuentaOrigenId ?? null)

    revalidatePath(`/liquidaciones/${input.actividadId}`)
    revalidatePath('/liquidaciones')
    revalidatePath('/tesoreria')
    return { ok: true, costoId: input.costoId }
  }

  const pagador = await _resolverPagadorCosto(sb, input)

  const { data: insertado, error } = await sb
    .from('ejecucion_costos')
    .insert({
      actividad_id: input.actividadId,
      item_id: input.itemId,
      descripcion: input.descripcion,
      monto,
      pagador,
      modo_registro: input.modo === 'UNITARIO' ? 'por_item' : 'global',
      cantidad: Number(input.cantidad),
      precio_unitario: precioUnitario,
      concepto: input.concepto ?? null,
      estado_pago: estadoPago,
      cuenta_origen_id: input.cuentaOrigenId ?? null,
      observaciones: observacionesBase,
    })
    .select('*')
    .single()

  if (error) throw new Error(`Error al registrar el costo: ${error.message}`)

  const costoCreado: CostoLiquidacionDetalle = insertado as CostoLiquidacionDetalle
  await _sincronizarMovimientoCosto(sb, costoCreado, input.cuentaOrigenId ?? null)

  revalidatePath(`/liquidaciones/${input.actividadId}`)
  revalidatePath('/liquidaciones')
  revalidatePath('/tesoreria')
  return { ok: true, costoId: insertado.id }
}

export async function cambiarEstadoPagoCosto(
  costoId: string,
  actividadId: string,
  estadoPago: EstadoPagoCosto,
  cuentaOrigenId?: string | null,
): Promise<{ ok: true }> {
  const sb = await createClient()

  const { data: costo, error } = await sb
    .from('ejecucion_costos')
    .select('*')
    .eq('id', costoId)
    .single()

  if (error) throw new Error(`Error al leer el costo: ${error.message}`)

  const costoBase = costo as CostoLiquidacionDetalle
  const cuentaFinalId = cuentaOrigenId ?? costoBase.cuenta_origen_id ?? (await _obtenerOCrearCuentaProyecto(sb, actividadId)).id

  // Si se marca como PAGADO, validar fondos suficientes
  if (estadoPago === 'PAGADO') {
    const { data: cuenta, error: fetchError } = await sb
      .from('cuentas_virtuales')
      .select('saldo')
      .eq('id', cuentaFinalId)
      .single()

    if (fetchError || !cuenta) {
      throw new Error(`SALDO_INSUFICIENTE|Cuenta no encontrada`)
    }

    const saldoActual = Number(cuenta.saldo)
    const montoRequerido = Number(costoBase.monto || 0)

    if (saldoActual < montoRequerido) {
      const error = new Error(`SALDO_INSUFICIENTE|${JSON.stringify({
        saldoActual,
        montoRequerido,
        deficit: montoRequerido - saldoActual,
        cuentaId: cuentaFinalId,
      })}`)
      throw error
    }
  }

  const costoActualizado: CostoLiquidacionDetalle = {
    ...costoBase,
    estado_pago: estadoPago,
    cuenta_origen_id: cuentaFinalId,
  }

  const { error: updateError } = await sb
    .from('ejecucion_costos')
    .update({
      estado_pago: estadoPago,
      cuenta_origen_id: cuentaFinalId,
    })
    .eq('id', costoId)

  if (updateError) throw new Error(`Error al cambiar estado del costo: ${updateError.message}`)

  await _sincronizarMovimientoCosto(sb, costoActualizado, cuentaFinalId)

  revalidatePath(`/liquidaciones/${actividadId}`)
  revalidatePath('/liquidaciones')
  revalidatePath('/tesoreria')
  return { ok: true }
}

export async function eliminarCostoReal(costoId: string, actividadId: string): Promise<{ ok: true }> {
  const sb = await createClient()

  const { data: costo, error } = await sb
    .from('ejecucion_costos')
    .select('id, movimiento_id, estado_pago, actividad_id, cuenta_origen_id, descripcion, monto, pagador, modo_registro, cantidad, precio_unitario, concepto, observaciones, item_id')
    .eq('id', costoId)
    .single()

  if (error) throw new Error(`Error al leer el costo: ${error.message}`)

  const costoBase = costo as CostoLiquidacionDetalle
  if (costoBase.movimiento_id) {
    await _sincronizarMovimientoCosto(sb, {
      ...costoBase,
      estado_pago: 'PENDIENTE',
    }, costoBase.cuenta_origen_id ?? null)
  }

  const { error: deleteError } = await sb
    .from('ejecucion_costos')
    .delete()
    .eq('id', costoId)

  if (deleteError) throw new Error(`Error al eliminar el costo: ${deleteError.message}`)

  revalidatePath(`/liquidaciones/${actividadId}`)
  revalidatePath('/liquidaciones')
  revalidatePath('/tesoreria')
  return { ok: true }
}

// --- Helper privado --------------------------------------------------------
// Recalcula devoluciones_pendientes_unidad desde cero:
//   (items CANCELADOS + reembolsos NO_ASISTIO) - salidas ya registradas
async function _recalcPendientes(sb: any, actividadId: string): Promise<number> {
  // Cuenta virtual del proyecto (para buscar retiros y devoluciones)
  const { data: cuenta } = await sb
    .from('cuentas_virtuales')
    .select('id')
    .eq('requerimiento_id', actividadId)
    .maybeSingle()

  const [
    { data: cancelados },
    { data: noAsistieron },
    { data: salidas },
    { data: deudasPendientes },
  ] = await Promise.all([
    // Ítems operativos cancelados (flujo "Cancelar" clásico)
    sb.from('items_requerimiento')
      .select('precio_total')
      .eq('requerimiento_id', actividadId)
      .in('tipo', ['SERVICIO', 'PASIVO_TERCERO'])
      .eq('estado', 'CANCELADO'),
    // Reembolsos NO_ASISTIO (flujo "Alternar" clásico)
    sb.from('items_requerimiento')
      .select('precio_total')
      .eq('requerimiento_id', actividadId)
      .eq('tipo', 'REEMBOLSO')
      .eq('estado', 'NO_ASISTIO'),
    // Movimientos de salida: RETIRO (legacy) + DEVOLUCION (nuevo)
    cuenta
      ? sb.from('movimientos_bancarios')
          .select('monto')
          .eq('origen_id', cuenta.id)
          .in('tipo', ['RETIRO', 'DEVOLUCION'])
      : Promise.resolve({ data: [] as any[] }),
    // Deudas parciales registradas vía "+ Devolución"
    sb.from('devoluciones_deuda')
      .select('monto_total')
      .eq('requerimiento_id', actividadId)
      .eq('estado_deuda', 'PENDIENTE'),
  ])

  const conceptos =
    (cancelados || []).reduce((s: number, i: any) => s + Number(i.precio_total), 0) +
    (noAsistieron || []).reduce((s: number, r: any) => s + Number(r.precio_total), 0) +
    (deudasPendientes || []).reduce((s: number, d: any) => s + Number(d.monto_total), 0)

  const totalSalidas = (salidas || []).reduce((s: number, d: any) => s + Number(d.monto), 0)

  return Math.max(0, conceptos - totalSalidas)
}
// ----------------------------------------------------------------------------

export async function marcarItemEstado(itemId: string, actividadId: string, estado: 'EJECUTADO' | 'CANCELADO', _valorCotizado?: number) {
  const sb = await createClient()
  // items_requerimiento.estado soporta 'ACTIVO' | 'CANCELADO' | 'NO_ASISTIO'
  // 'EJECUTADO' → 'ACTIVO' (estado normal activo)
  const nuevoEstado = estado === 'CANCELADO' ? 'CANCELADO' : 'ACTIVO'
  await sb.from('items_requerimiento').update({ estado: nuevoEstado }).eq('id', itemId)

  if (estado === 'EJECUTADO') {
    // Al reactivar un ítem: borrar sus deudas PENDIENTE (cancelación revertida)
    await sb.from('devoluciones_deuda')
      .delete()
      .eq('item_origen_id', itemId)
      .eq('estado_deuda', 'PENDIENTE')
  }

  const pendientes = await _recalcPendientes(sb, actividadId)
  await sb.from('requerimientos').update({ devoluciones_pendientes_unidad: pendientes }).eq('id', actividadId)

  revalidatePath(`/liquidaciones/${actividadId}`)
  return { ok: true }
}

export async function toggleAsistenciaReembolso(reembolsoId: string, actividadId: string, asiste: boolean, _valorAsignado?: number) {
  const sb = await createClient()
  const estado = asiste ? 'ACTIVO' : 'NO_ASISTIO'
  await sb.from('items_requerimiento').update({ estado }).eq('id', reembolsoId)

  if (!asiste) {
    // Si NO asistió: limpiar flag pagado y registrar deuda de devolución si no existe
    await sb.from('items_requerimiento').update({ pagado: false }).eq('id', reembolsoId)

    const { data: item } = await sb
      .from('items_requerimiento')
      .select('precio_total, precio_unitario, cantidad, requerimiento_id')
      .eq('id', reembolsoId)
      .maybeSingle()

    const montoDeuda = Number(item?.precio_total ?? item?.precio_unitario ?? 0)
    if (montoDeuda > 0) {
      const { data: existing } = await sb
        .from('devoluciones_deuda')
        .select('id')
        .eq('item_origen_id', reembolsoId)
        .eq('estado_deuda', 'PENDIENTE')
        .maybeSingle()

      if (!existing) {
        await sb.from('devoluciones_deuda').insert({
          requerimiento_id:  actividadId,
          item_origen_id:    reembolsoId,
          cantidad_cancelada: Number(item?.cantidad ?? 1),
          monto_total:       montoDeuda,
          tipo:              'TERCERO',
          motivo:            'Beneficiario no asistió',
          estado_deuda:      'PENDIENTE',
        })
      }
    }
  } else {
    // Al marcar que SÍ asistió: borrar deudas PENDIENTE de no-asistencia
    await sb.from('devoluciones_deuda')
      .delete()
      .eq('item_origen_id', reembolsoId)
      .eq('estado_deuda', 'PENDIENTE')
  }

  const pendientes = await _recalcPendientes(sb, actividadId)
  await sb.from('requerimientos').update({ devoluciones_pendientes_unidad: pendientes }).eq('id', actividadId)

  revalidatePath(`/liquidaciones/${actividadId}`)
  return { ok: true }
}

export async function registrarSalidaDevolucion(actividadId: string, monto: number, evidencia_url?: string) {
  const sb = await createClient()

  const { data: cuenta } = await sb
    .from('cuentas_virtuales')
    .select('id')
    .eq('requerimiento_id', actividadId)
    .maybeSingle()

  if (cuenta) {
    await sb.from('movimientos_bancarios').insert({
      origen_id:   cuenta.id,
      destino_id:  null,
      tipo:        'RETIRO',
      monto,
      descripcion: 'Salida devolucion unidad',
      soporte_url: evidencia_url ?? null,
    })
  }

  const pendientes = await _recalcPendientes(sb, actividadId)
  await sb.from('requerimientos').update({ devoluciones_pendientes_unidad: pendientes }).eq('id', actividadId)

  revalidatePath(`/liquidaciones/${actividadId}`)
  revalidatePath('/liquidaciones')
  return { ok: true }
}

export async function eliminarAbono(abonoId: string, actividadId: string) {
  const sb = await createClient()
  const { data: mov, error: movErr } = await sb
    .from('movimientos_bancarios')
    .select('id, tipo')
    .eq('id', abonoId)
    .maybeSingle()

  if (movErr) throw new Error(`Error al consultar abono: ${movErr.message}`)
  if (!mov || mov.tipo !== 'PAGO_UNIDAD') {
    throw new Error('Solo se pueden eliminar movimientos de tipo PAGO_UNIDAD desde Liquidaciones.')
  }

  await sb.from('movimientos_bancarios').delete().eq('id', abonoId)

  revalidatePath(`/liquidaciones/${actividadId}`)
  revalidatePath('/liquidaciones')
  revalidatePath('/tesoreria')
  return { ok: true }
}

export async function actualizarAbono(
  abonoId: string,
  actividadId: string,
  montoBanco: number,
  _retencionIgnorada: number,
  tipo_abono: 'OPERATIVO' | 'PASIVO_TERCERO',
) {
  const sb = await createClient()

  // Obtener cuenta virtual del proyecto
  const { data: cuenta } = await sb
    .from('cuentas_virtuales')
    .select('id')
    .eq('requerimiento_id', actividadId)
    .maybeSingle()

  let retencionCalculada = 0
  let cotizadoOperativo = 0

  if (tipo_abono === 'OPERATIVO' && cuenta) {
    // Cotizado operativo
    const { data: items } = await sb
      .from('items_requerimiento')
      .select('precio_total')
      .eq('requerimiento_id', actividadId)
      .eq('tipo', 'SERVICIO')
      .eq('estado', 'ACTIVO')

    cotizadoOperativo = (items ?? []).reduce((s: number, i: any) => s + Number(i.precio_total), 0)

    // Sumar todos los abonos OPERATIVOS EXCEPTO el que se está editando
    const { data: movs } = await sb
      .from('movimientos_bancarios')
      .select('id, monto, notas, tipo, estado')
      .eq('destino_id', cuenta.id)

    let otrosAbonos = 0
    for (const m of (movs ?? [])) {
      if (m.id === abonoId) continue
      if ((m as any).tipo !== 'PAGO_UNIDAD') continue
      if ((m as any).estado && (m as any).estado !== 'EJECUTADO') continue
      const notas = (m.notas ?? {}) as any
      if ((notas.tipo_abono ?? 'OPERATIVO') === 'OPERATIVO') {
        otrosAbonos += Number(m.monto)
      }
    }

    retencionCalculada = Math.max(0, cotizadoOperativo - (otrosAbonos + montoBanco))
  }

  // Actualizar movimiento: monto = valor real del banco
  const { data: movActual, error: movActualErr } = await sb
    .from('movimientos_bancarios')
    .select('id, tipo')
    .eq('id', abonoId)
    .maybeSingle()

  if (movActualErr) throw new Error(`Error al consultar abono: ${movActualErr.message}`)
  if (!movActual || movActual.tipo !== 'PAGO_UNIDAD') {
    throw new Error('Solo se pueden editar movimientos de tipo PAGO_UNIDAD desde Liquidaciones.')
  }

  await sb.from('movimientos_bancarios').update({
    monto:       montoBanco,
    descripcion: tipo_abono === 'OPERATIVO'
      ? `Abono OPERATIVO | Banco: ${montoBanco} | Retencion: ${retencionCalculada}`
      : `Abono TERCEROS | Banco: ${montoBanco}`,
    notas: {
      tipo_abono,
      monto_banco: montoBanco,
      retencion_aplicada: retencionCalculada,
      cotizado_operativo: cotizadoOperativo,
    },
  }).eq('id', abonoId)

  revalidatePath(`/liquidaciones/${actividadId}`)
  revalidatePath('/liquidaciones')
  revalidatePath('/tesoreria')
  return { ok: true }
}

// Recalcula devoluciones_pendientes_unidad desde el estado real (items + reembolsos - salidas).
export async function recalcularDevolucionesPendientes(actividadId: string) {
  const sb = await createClient()
  const pendientes = await _recalcPendientes(sb, actividadId)
  await sb.from('requerimientos').update({ devoluciones_pendientes_unidad: pendientes }).eq('id', actividadId)
  revalidatePath(`/liquidaciones/${actividadId}`)
  return { pendientes }
}

// ============================================================
// obtenerInsightsRetenciones
//
// Calcula el patrÃ³n histÃ³rico de retenciones a partir de todos
// los abonos OPERATIVOS que tienen retenciÃ³n > 0.
// No requiere join con cotizacion_items: el "bruto esperado"
// se deduce como  banco + retenciÃ³n  (lo que el pagador debÃ­a
// girar antes de los descuentos).
// ============================================================
export async function obtenerInsightsRetenciones(): Promise<{
  muestras: Array<{
    actividad: string
    cotizado: number
    banco: number
    retencion: number
    pct: number
  }>
  promedioPct: number | null
  totalMuestras: number
}> {
  const sb = await createClient()

  // Regla de negocio: agrupar primero por actividad y luego calcular
  // Retenido = Valor Cotizado - Llegó al Banco
  const [movRes, cuentasRes, reqRes, itemsRes] = await Promise.all([
    sb
      .from('movimientos_bancarios')
      .select('destino_id, monto, estado, notas')
      .eq('tipo', 'PAGO_UNIDAD'),
    sb
      .from('cuentas_virtuales')
      .select('id, requerimiento_id')
      .eq('tipo', 'PROYECTO'),
    sb
      .from('requerimientos')
      .select('id, numero_requerimiento, nombre_actividad'),
    sb
      .from('items_requerimiento')
      .select('requerimiento_id, precio_total')
      .eq('tipo', 'SERVICIO')
      .eq('estado', 'ACTIVO'),
  ])

  const cuentaARequerimiento: Record<string, string> = {}
  for (const c of (cuentasRes.data ?? [])) {
    if (c.requerimiento_id) cuentaARequerimiento[c.id] = c.requerimiento_id
  }

  const bancoPorActividad: Record<string, number> = {}
  for (const m of (movRes.data ?? [])) {
    if ((m as any).estado && (m as any).estado !== 'EJECUTADO') continue
    const tipoAbono = ((m as any).notas?.tipo_abono ?? 'OPERATIVO') as 'OPERATIVO' | 'PASIVO_TERCERO'
    if (tipoAbono !== 'OPERATIVO') continue
    const reqId = cuentaARequerimiento[m.destino_id as string]
    if (!reqId) continue
    bancoPorActividad[reqId] = (bancoPorActividad[reqId] ?? 0) + Number(m.monto ?? 0)
  }

  const cotizadoPorActividad: Record<string, number> = {}
  for (const item of (itemsRes.data ?? [])) {
    const reqId = item.requerimiento_id as string
    cotizadoPorActividad[reqId] = (cotizadoPorActividad[reqId] ?? 0) + Number(item.precio_total ?? 0)
  }

  const actividadPorId: Record<string, string> = {}
  for (const r of (reqRes.data ?? [])) {
    actividadPorId[r.id] = r.numero_requerimiento || r.nombre_actividad || '—'
  }

  const ids = Array.from(
    new Set([
      ...Object.keys(cotizadoPorActividad),
      ...Object.keys(bancoPorActividad),
    ])
  )

  const muestras = ids
    .map((id) => {
      const cotizado = Number(cotizadoPorActividad[id] ?? 0)
      const banco = Number(bancoPorActividad[id] ?? 0)
      const retencion = cotizado - banco
      const pct = cotizado > 0 ? (retencion / cotizado) * 100 : 0
      return {
        actividad: actividadPorId[id] ?? id,
        cotizado,
        banco,
        retencion,
        pct,
      }
    })
    .filter((m) => m.cotizado > 0 || m.banco > 0)
    .sort((a, b) => Math.abs(b.retencion) - Math.abs(a.retencion))

  const promedioPct = muestras.length > 0
    ? muestras.reduce((s, m) => s + m.pct, 0) / muestras.length
    : null

  return { muestras, promedioPct, totalMuestras: muestras.length }
}

// ============================================================
// CHECKLIST DE REEMBOLSOS / TERCEROS
// ============================================================

/**
 * Marca o desmarca el flag `pagado` de un ítem de reembolso/tercero.
 * La fuente de verdad es el checklist manual; el movimiento bancario
 * sirve como validación adicional (no bloquea).
 */
export async function marcarReembolsoPagado(
  reembolsoId: string,
  actividadId: string,
  pagado: boolean,
): Promise<{ ok: true }> {
  const sb = await createClient()
  const { error } = await sb
    .from('items_requerimiento')
    .update({ pagado })
    .eq('id', reembolsoId)

  if (error) throw new Error(`Error al actualizar checklist pagado: ${error.message}`)

  revalidatePath(`/liquidaciones/${actividadId}`)
  return { ok: true }
}

// ============================================================
// DEVOLUCIONES PARCIALES — REGISTRO DE DEUDA
// ============================================================

/**
 * Registra una deuda de devolución a la Unidad por cancelación
 * parcial o total de un ítem cotizado.
 *
 * El estado inicial siempre es PENDIENTE y suma a la tarjeta roja
 * de "Deuda Pendiente" en el panel de liquidación.
 */
export async function registrarDeudaDevolucion(
  actividadId: string,
  itemOrigenId: string | null,
  cantidadCancelada: number,
  montoTotal: number,
  tipo: 'OPERATIVO' | 'TERCERO',
  motivo: string,
): Promise<{ ok: true; deudaId: string }> {
  if (montoTotal <= 0) throw new Error('El monto de la devolución debe ser mayor a cero.')
  if (cantidadCancelada <= 0) throw new Error('La cantidad cancelada debe ser mayor a cero.')

  const sb = await createClient()

  const { data: deuda, error } = await sb
    .from('devoluciones_deuda')
    .insert({
      requerimiento_id:  actividadId,
      item_origen_id:    itemOrigenId,
      cantidad_cancelada: cantidadCancelada,
      monto_total:       montoTotal,
      tipo,
      motivo:            motivo.trim() || 'Sin motivo especificado',
      estado_deuda:      'PENDIENTE',
    })
    .select('id')
    .single()

  if (error) throw new Error(`Error al registrar deuda: ${error.message}`)

  // Recalcular devoluciones_pendientes_unidad
  const pendientes = await _recalcPendientes(sb, actividadId)
  await sb.from('requerimientos').update({ devoluciones_pendientes_unidad: pendientes }).eq('id', actividadId)

  revalidatePath(`/liquidaciones/${actividadId}`)
  revalidatePath('/liquidaciones')
  return { ok: true, deudaId: deuda.id }
}

/**
 * Salda una deuda de devolución: crea un movimiento bancario de
 * tipo DEVOLUCION (egreso físico) y marca la deuda como SALDADO.
 *
 * La operación es atómica: si falla el movimiento, la deuda
 * permanece PENDIENTE.
 */
export async function saldarDeudaDevolucion(
  deudaId: string,
  actividadId: string,
  cuentaOrigenId: string,
  monto: number,
  motivo?: string,
): Promise<{ ok: true }> {
  if (monto <= 0) throw new Error('El monto de salida debe ser mayor a cero.')

  const sb = await createClient()

  // Leer deuda
  const { data: deuda, error: deudaErr } = await sb
    .from('devoluciones_deuda')
    .select('id, estado_deuda, requerimiento_id, tipo, motivo')
    .eq('id', deudaId)
    .single()

  if (deudaErr || !deuda) throw new Error('Deuda de devolución no encontrada.')
  if (deuda.estado_deuda === 'SALDADO') throw new Error('Esta deuda ya fue saldada.')

  const descripcionMovimiento = motivo?.trim()
    ? `Devolución a Unidad: ${motivo.trim()}`
    : `Devolución a Unidad (${deuda.tipo})`

  // Crear movimiento bancario tipo DEVOLUCION
  const { data: movimiento, error: movErr } = await sb
    .from('movimientos_bancarios')
    .insert({
      origen_id:   cuentaOrigenId,
      destino_id:  null,
      tipo:        'DEVOLUCION',
      monto,
      estado:      'EJECUTADO',
      descripcion: descripcionMovimiento,
      notas: {
        deuda_id:         deudaId,
        actividad_id:     actividadId,
        tipo_devolucion:  deuda.tipo,
        motivo_deuda:     deuda.motivo,
      },
    })
    .select('id')
    .single()

  if (movErr) throw new Error(`Error al registrar movimiento de devolución: ${movErr.message}`)

  // Marcar deuda como SALDADO y enlazar movimiento
  const { error: updateErr } = await sb
    .from('devoluciones_deuda')
    .update({
      estado_deuda: 'SALDADO',
      movimiento_id: movimiento.id,
      updated_at:   new Date().toISOString(),
    })
    .eq('id', deudaId)

  if (updateErr) throw new Error(`Error al actualizar deuda: ${updateErr.message}`)

  // Recalcular pendientes
  const pendientes = await _recalcPendientes(sb, actividadId)
  await sb.from('requerimientos').update({ devoluciones_pendientes_unidad: pendientes }).eq('id', actividadId)

  revalidatePath(`/liquidaciones/${actividadId}`)
  revalidatePath('/liquidaciones')
  revalidatePath('/tesoreria')
  return { ok: true }
}

/**
 * Elimina una deuda PENDIENTE (no se puede eliminar una SALDADA).
 * Útil para corregir registros erróneos.
 */
export async function eliminarDeudaDevolucion(
  deudaId: string,
  actividadId: string,
): Promise<{ ok: true }> {
  const sb = await createClient()

  const { data: deuda } = await sb
    .from('devoluciones_deuda')
    .select('estado_deuda')
    .eq('id', deudaId)
    .maybeSingle()

  if (deuda?.estado_deuda === 'SALDADO') {
    throw new Error('No se puede eliminar una deuda ya saldada. Si hay un error, revisa el movimiento bancario asociado.')
  }

  await sb.from('devoluciones_deuda').delete().eq('id', deudaId)

  const pendientes = await _recalcPendientes(sb, actividadId)
  await sb.from('requerimientos').update({ devoluciones_pendientes_unidad: pendientes }).eq('id', actividadId)

  revalidatePath(`/liquidaciones/${actividadId}`)
  revalidatePath('/liquidaciones')
  return { ok: true }
}

// --- Galeria de Comprobantes ----------------------------------

export interface SoporteProyecto {
  id: string
  requerimiento_id: string
  tipo_archivo: 'IMAGEN' | 'PDF' | 'EXCEL' | 'OTRO'
  url: string
  nombre_archivo: string | null
  descripcion: string | null
  created_at: string
}

export async function listarSoportes(requerimientoId: string): Promise<SoporteProyecto[]> {
  const sb = await createClient()
  const { data, error } = await sb
    .from('soportes_proyecto')
    .select('id, requerimiento_id, tipo_archivo, url, nombre_archivo, descripcion, created_at')
    .eq('requerimiento_id', requerimientoId)
    .order('created_at', { ascending: false })
  if (error) { console.error('listarSoportes:', error); return [] }
  return (data ?? []) as SoporteProyecto[]
}

export async function registrarSoporte(
  requerimientoId: string,
  url: string,
  nombreArchivo: string,
  tipoArchivo: 'IMAGEN' | 'PDF' | 'EXCEL' | 'OTRO',
  descripcion?: string,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const sb = await createClient()
  const { data, error } = await sb
    .from('soportes_proyecto')
    .insert({
      requerimiento_id: requerimientoId,
      url,
      nombre_archivo: nombreArchivo,
      tipo_archivo: tipoArchivo,
      descripcion: descripcion ?? null,
    })
    .select('id')
    .single()
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/liquidaciones/${requerimientoId}`)
  return { ok: true, id: data.id }
}

// --- TESORERiA: Inyectar capital y transferir fondos ------------------------

  export async function inyectarCapital(
    socioId: string,
    monto: number,
    descripcion?: string,
  ): Promise<{ ok: boolean; nuevoSaldo?: number; error?: string }> {
    if (monto <= 0) {
      return { ok: false, error: 'El monto debe ser mayor a cero' }
    }

    const sb = await createClient()

    // Validar que la cuenta existe y es SOCIO
    const { data: cuenta, error: fetchError } = await sb
      .from('cuentas_virtuales')
      .select('id, saldo, tipo')
      .eq('id', socioId)
      .single()

    if (fetchError || !cuenta) {
      return { ok: false, error: 'Cuenta SOCIO no encontrada' }
    }

    if (cuenta.tipo !== 'SOCIO') {
      return { ok: false, error: 'Solo se pueden inyectar fondos a cuentas SOCIO' }
    }

    const nuevoSaldo = Number(cuenta.saldo) + monto

    // 1. Actualizar saldo de la cuenta
    const { error: updateError } = await sb
      .from('cuentas_virtuales')
      .update({ saldo: nuevoSaldo })
      .eq('id', socioId)

    if (updateError) {
      return { ok: false, error: `Error al actualizar saldo: ${updateError.message}` }
    }

    // 2. Registrar transaccion en libro mayor
    const { error: transError } = await sb
      .from('transacciones')
      .insert({
        cuenta_destino_id: socioId,
        cuenta_origen_id: null,
        monto,
        tipo: 'INYECCION',
        descripcion: descripcion || 'Inyeccion de capital del socio',
      })

    if (transError) {
      console.error('Error registrando transaccion (no bloqueante):', transError)
    }

    revalidatePath('/tesoreria')
    revalidatePath('/liquidaciones')
    return { ok: true, nuevoSaldo }
  }

  export async function transferirFondos(
    origenId: string,
    destinoId: string,
    monto: number,
    descripcion?: string,
  ): Promise<{ ok: boolean; origenSaldo?: number; destinoSaldo?: number; error?: string }> {
    if (monto <= 0) {
      return { ok: false, error: 'El monto debe ser mayor a cero' }
    }

    if (origenId === destinoId) {
      return { ok: false, error: 'No puedes transferir fondos a la misma cuenta' }
    }

    const sb = await createClient()

    // 1. Validar que ambas cuentas existen
    const { data: origen, error: fetchOrigenError } = await sb
      .from('cuentas_virtuales')
      .select('saldo, tipo')
      .eq('id', origenId)
      .single()

    if (fetchOrigenError || !origen) {
      return { ok: false, error: 'Cuenta de origen no encontrada' }
    }

    const { data: destino, error: fetchDestinoError } = await sb
      .from('cuentas_virtuales')
      .select('saldo, tipo')
      .eq('id', destinoId)
      .single()

    if (fetchDestinoError || !destino) {
      return { ok: false, error: 'Cuenta de destino no encontrada' }
    }

    // Bloquear cruces directos proyecto -> proyecto (deben pasar por SOCIO o GENERAL)
    if (origen.tipo === 'PROYECTO' && destino.tipo === 'PROYECTO') {
      return {
        ok: false,
        error: 'No se permite transferir directo entre cuentas de proyecto. Usa Caja General o cuenta SOCIO como puente.',
      }
    }

    // 2. Validar que hay saldo suficiente
    const origenSaldoActual = Number(origen.saldo)
    if (origenSaldoActual < monto) {
      return {
        ok: false,
        error: `Saldo insuficiente. Disponible: $${origenSaldoActual.toLocaleString('es-CO')}`,
      }
    }

    const nuevoSaldoOrigen = origenSaldoActual - monto
    const nuevoSaldoDestino = Number(destino.saldo) + monto

    // 3. Actualizar ambos saldos
    const { error: updateOrigenError } = await sb
      .from('cuentas_virtuales')
      .update({ saldo: nuevoSaldoOrigen })
      .eq('id', origenId)

    if (updateOrigenError) {
      return { ok: false, error: `Error al debitar origen: ${updateOrigenError.message}` }
    }

    const { error: updateDestinoError } = await sb
      .from('cuentas_virtuales')
      .update({ saldo: nuevoSaldoDestino })
      .eq('id', destinoId)

    if (updateDestinoError) {
      // Revertir cambio en origen
      await sb.from('cuentas_virtuales').update({ saldo: origenSaldoActual }).eq('id', origenId)
      return { ok: false, error: `Error al acreditar destino: ${updateDestinoError.message}` }
    }

    // 4. Registrar transaccion en libro mayor
    const { error: transError } = await sb
      .from('transacciones')
      .insert({
        cuenta_origen_id: origenId,
        cuenta_destino_id: destinoId,
        monto,
        tipo: 'TRANSFERENCIA',
        descripcion: descripcion || 'Transferencia entre cuentas',
      })

    if (transError) {
      console.error('Error registrando transaccion (no bloqueante):', transError)
    }

    revalidatePath('/tesoreria')
    revalidatePath('/liquidaciones')
    return { ok: true, origenSaldo: nuevoSaldoOrigen, destinoSaldo: nuevoSaldoDestino }
  }


export async function eliminarSoporte(
  soporteId: string,
  requerimientoId: string,
): Promise<{ ok: boolean; error?: string }> {
  const sb = await createClient()
  const { error } = await sb
    .from('soportes_proyecto')
    .delete()
    .eq('id', soporteId)
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/liquidaciones/${requerimientoId}`)
  return { ok: true }
}
