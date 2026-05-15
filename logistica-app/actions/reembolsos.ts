'use server'

import { revalidatePath } from 'next/cache'
import {
  makeGetReembolsosFromActivity,
  makePrepareReembolsoDocument,
  getReembolsoRepository,
} from '@/src/infrastructure/container'
import { Reembolso } from '@/src/core/domain/entities/Reembolso'
import type { ReembolsoProps } from '@/src/core/domain/entities/Reembolso'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function isUuid(value: string): boolean {
  return UUID_RE.test(value)
}

async function getSupabaseForWrites() {
  const { createClient } = await import('@supabase/supabase-js')
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}

function toItemsRequerimientoRow(reembolso: ReembolsoProps) {
  return {
    id: reembolso.id,
    requerimiento_id:       reembolso.actividadId,
    descripcion:            `Reembolso ${reembolso.tipo}: ${reembolso.personaNombre}`,
    tipo:                   'REEMBOLSO',
    unidad_medida:          'und',
    cantidad:               1,
    precio_unitario:        reembolso.valor,
    estado:                 'ACTIVO',
    fuente:                 'manual',
    beneficiario_nombre:    reembolso.personaNombre || null,
    beneficiario_documento: reembolso.documento || null,
    beneficiario_celular:   reembolso.celular || null,
    municipio_origen:       reembolso.rutaOrigen || null,
    notas:                  reembolso.rutaDestino ? `Destino: ${reembolso.rutaDestino}` : null,
  }
}

// ============================================================
// Server Actions — Módulo de Reembolsos
// ============================================================

/**
 * Devuelve la lista de reembolsos de una actividad combinando
 * los auto-generados del requerimiento y los editados manualmente.
 *
 * Retorna datos serializables (plain objects) aptos para ser
 * pasados como props a Client Components.
 */
export async function obtenerReembolsos(actividadId: string): Promise<{
  reembolsos: ReembolsoProps[]
  totalAutoGenerados: number
  totalManuales: number
}> {
  const uc = makeGetReembolsosFromActivity()
  const result = await uc.execute({ actividadId })

  return {
    reembolsos:         result.reembolsos.map((r) => r.toProps()),
    totalAutoGenerados: result.totalAutoGenerados,
    totalManuales:      result.totalManuales,
  }
}

/**
 * Guarda o actualiza los datos editados de un reembolso antes
 * de la exportación a PDF.
 *
 * Retorna el reembolso persistido como plain object y la
 * operación realizada ('alta' | 'edicion').
 */
export async function guardarReembolso(props: ReembolsoProps): Promise<{
  reembolso: ReembolsoProps
  operacion: 'alta' | 'edicion'
}> {
  const uc = makePrepareReembolsoDocument()
  const result = await uc.execute({ reembolso: props })

  const reembolso = result.reembolso.toProps()

  // Los reembolsos con UUID son manuales y deben vivir también en BD
  // para que Tab Informe y Tab Formatos mantengan el mismo inventario.
  if (isUuid(reembolso.id)) {
    const sb = await getSupabaseForWrites()
    const { error } = await sb
      .from('items_requerimiento')
      .upsert(toItemsRequerimientoRow(reembolso), { onConflict: 'id' })

    if (error) {
      throw new Error(`No se pudo sincronizar el reembolso en base de datos: ${error.message}`)
    }
  }

  revalidatePath(`/ejecucion/${reembolso.actividadId}`)

  return {
    reembolso,
    operacion: result.operacion,
  }
}

/**
 * Crea un nuevo formato de reembolso manual (no auto-generado).
 * Genera un ID único y persiste en el repositorio de reembolsos.
 */
export async function crearReembolso(
  props: Omit<ReembolsoProps, 'id'>,
): Promise<{ reembolso: ReembolsoProps }> {
  const id = crypto.randomUUID()
  const reembolso = new Reembolso({ ...props, id })
  const repo = getReembolsoRepository()
  const saved = await repo.guardar(reembolso)

  const sb = await getSupabaseForWrites()
  const { error } = await sb
    .from('items_requerimiento')
    .upsert(toItemsRequerimientoRow(saved.toProps()), { onConflict: 'id' })

  if (error) {
    throw new Error(`No se pudo crear el formato en base de datos: ${error.message}`)
  }

  revalidatePath(`/ejecucion/${props.actividadId}`)
  return { reembolso: saved.toProps() }
}

/**
 * Elimina un formato de reembolso por su ID.
 * No lanza error si el ID no existe (idempotente).
 */
export async function eliminarReembolso(
  id: string,
  actividadId: string,
): Promise<void> {
  const repo = getReembolsoRepository()
  await repo.eliminar(id)

  if (isUuid(id)) {
    const sb = await getSupabaseForWrites()
    await sb.from('items_requerimiento').delete().eq('id', id)
  }

  revalidatePath(`/ejecucion/${actividadId}`)
}

/**
 * Materializa los reembolsos auto-generados que aún no han sido
 * persistidos manualmente.  Útil cuando la auto-generación falló
 * en el primer render por errores transitorios de red o de datos.
 *
 * Solo guarda los que no existen ya en el repositorio (idempotente).
 * Retorna cuántos se generaron y la lista actualizada.
 */
export async function materializarReembolsosAuto(actividadId: string): Promise<{
  generados: number
  reembolsos: ReembolsoProps[]
}> {
  const uc = makeGetReembolsosFromActivity()
  const result = await uc.execute({ actividadId })

  const repo = getReembolsoRepository()
  const existentes = await repo.listarPorActividad(actividadId)
  const existentesIds = new Set(existentes.map((r) => r.id))

  // Solo persiste los auto-generados que aún no están en el repo
  const nuevos = result.reembolsos.filter((r) => !existentesIds.has(r.id))
  for (const r of nuevos) {
    await repo.guardar(r)
  }

  const todos = [...existentes, ...nuevos]
  revalidatePath(`/ejecucion/${actividadId}`)

  return {
    generados: nuevos.length,
    reembolsos: todos.map((r) => r.toProps()),
  }
}

// ============================================================
// importarReembolsosDesdeExcel
//
// Fallback para actividades que fueron creadas ANTES de la
// corrección del parser (cuando el ALOJAMIENTO sheet no se
// procesaba).  El usuario sube el Excel original y este action:
//   1. Parsea la hoja "ALOJAMIENTO Y,O TRANSPORTE"
//   2. Inserta los beneficiarios en reembolsos_detalle
//   3. Re-ejecuta el caso de uso para devolver los formatos
// ============================================================

export async function importarReembolsosDesdeExcel(
  actividadId: string,
  formData: FormData,
): Promise<{
  generados: number
  reembolsos: ReembolsoProps[]
  error?: string
}> {
  try {
    const file = formData.get('file')
    if (!file || !(file instanceof Blob)) {
      return { generados: 0, reembolsos: [], error: 'No se recibió un archivo válido.' }
    }

    const fileName = (file as File).name || ''
    const ext = fileName.split('.').pop()?.toLowerCase()
    if (!['xlsx', 'xlsm', 'xls'].includes(ext ?? '')) {
      return { generados: 0, reembolsos: [], error: 'El archivo debe ser un Excel (.xlsx, .xlsm o .xls).' }
    }

    // ── 1. Leer Excel y encontrar hoja ALOJAMIENTO ────────────
    const ExcelJS = (await import('exceljs')).default
    const workbook = new ExcelJS.Workbook()
    const arrayBuffer = await file.arrayBuffer()
    await workbook.xlsx.load(arrayBuffer)

    const sheetAloj = workbook.worksheets.find((ws) => {
      const n = ws.name.toUpperCase()
      return n.includes('ALOJAMIENTO') || n.includes('TRANSPORTE')
    })

    if (!sheetAloj) {
      return {
        generados: 0,
        reembolsos: [],
        error: `No se encontró la hoja de ALOJAMIENTO/TRANSPORTE. Hojas: ${workbook.worksheets.map((w) => w.name).join(', ')}`,
      }
    }

    // ── 2. Parsear beneficiarios de la hoja ────────────────────
    const beneficiarios = parseAlojamientoSheet(sheetAloj)

    if (beneficiarios.length === 0) {
      return {
        generados: 0,
        reembolsos: [],
        error: 'No se encontraron beneficiarios en la hoja de ALOJAMIENTO. Verifica que el formato sea correcto.',
      }
    }

    // ── 3. Limpiar reembolsos previos e insertar en items_requerimiento ──
    const { createClient } = await import('@supabase/supabase-js')
    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    )

    await sb
      .from('items_requerimiento')
      .delete()
      .eq('requerimiento_id', actividadId)
      .eq('tipo', 'REEMBOLSO')

    const rows = beneficiarios.map((b) => ({
      requerimiento_id:       actividadId,
      descripcion:            `Reembolso: ${b.nombre}`,
      tipo:                   'REEMBOLSO',
      unidad_medida:          'und',
      cantidad:               1,
      precio_unitario:        b.valorTotal,
      estado:                 'ACTIVO',
      fuente:                 'excel',
      beneficiario_nombre:    b.nombre || null,
      beneficiario_documento: b.documento || null,
      beneficiario_celular:   b.celular || null,
      municipio_origen:       b.ruta || null,
    }))

    const { error: insertErr } = await sb.from('items_requerimiento').insert(rows)
    if (insertErr) {
      return { generados: 0, reembolsos: [], error: `Error al insertar: ${insertErr.message}` }
    }

    // ── 4. Re-ejecutar el caso de uso para obtener formatos ───
    const uc = makeGetReembolsosFromActivity()
    const result = await uc.execute({ actividadId })

    const repo = getReembolsoRepository()
    const existentes = await repo.listarPorActividad(actividadId)
    const existentesIds = new Set(existentes.map((r) => r.id))
    for (const r of result.reembolsos) {
      if (!existentesIds.has(r.id)) {
        await repo.guardar(r)
      }
    }

    revalidatePath(`/ejecucion/${actividadId}`)

    return {
      generados: result.reembolsos.length,
      reembolsos: result.reembolsos.map((r) => r.toProps()),
    }
  } catch (err) {
    console.error('[importarReembolsosDesdeExcel]', err)
    return {
      generados: 0,
      reembolsos: [],
      error: 'Error inesperado al procesar el archivo.',
    }
  }
}

// ---------------------------------------------------------------
// Parser inline de la hoja ALOJAMIENTO Y,O TRANSPORTE
// Misma lógica que parseAlojamientoTransporte en cotizaciones.ts
// pero sin depender de funciones internas de ese módulo.
// ---------------------------------------------------------------

interface BeneficiarioExtraido {
  nombre: string
  documento: string
  celular: string
  ruta: string
  valorTotal: number
  esInhumacion: boolean
}

function parseAlojamientoSheet(sheet: import('exceljs').Worksheet): BeneficiarioExtraido[] {
  const result: BeneficiarioExtraido[] = []

  // Helpers
  const str = (val: import('exceljs').CellValue): string => {
    if (val === null || val === undefined) return ''
    if (val instanceof Date) return val.toISOString().split('T')[0]
    if (typeof val === 'object' && 'text' in (val as object)) {
      return String((val as { text: string }).text).trim()
    }
    return String(val).trim()
  }

  const getCell = (r: number, c: number) => str(sheet.getRow(r).getCell(c).value)
  const toNum = (s: string) => {
    const n = Number(s.replace(/[^0-9.-]/g, ''))
    return isNaN(n) ? 0 : n
  }

  // Encontrar fila de encabezado (contiene "PRIMER NOMBRE")
  let headerRow = 0
  for (let r = 1; r <= Math.min(sheet.rowCount, 30); r++) {
    for (let c = 1; c <= 10; c++) {
      if (str(sheet.getRow(r).getCell(c).value).toUpperCase().includes('PRIMER NOMBRE')) {
        headerRow = r
        break
      }
    }
    if (headerRow) break
  }
  if (!headerRow) return result

  // Detectar columnas dinámicamente
  let colCelular = 7, colRuta = 15, colCostoIda = 16, colCostoRegreso = 17, colCostoTotal = 18
  const hr = sheet.getRow(headerRow)
  const maxCol = Math.max(hr.cellCount || 0, 32)
  for (let c = 1; c <= maxCol; c++) {
    const v = str(hr.getCell(c).value).toUpperCase()
    if (!v) continue
    if (v.includes('CELULAR') || v.includes('TELÉFONO') || v.includes('TELEFONO')) {
      colCelular = c
    } else if (v.includes('LUGAR DE SALIDA') || v.includes('ITINERARIO TERRESTRE')) {
      colRuta = c
    } else if (v.includes('COSTO IDA') || (v.includes('GASTO TRANSPORTE') && !v.includes('BOGOTA') && !v.includes('BOGOTÁ'))) {
      colCostoIda = c
    } else if (v.includes('COSTO REGRESO') || v.includes('BOGOTA') || v.includes('BOGOTÁ')) {
      colCostoRegreso = c
    } else if (v.includes('COSTO TOTAL')) {
      colCostoTotal = c
    }
  }

  // Recorrer filas de datos
  for (let r = headerRow + 1; r <= sheet.rowCount; r++) {
    const c1 = getCell(r, 1)
    if (c1.toUpperCase().startsWith('TOTAL')) break
    if (c1.includes('_____') || c1.includes('(Nombre')) break

    const nombre = [getCell(r, 1), getCell(r, 2), getCell(r, 3), getCell(r, 4)]
      .filter(Boolean).join(' ').trim()
    if (!nombre) continue

    const tipoDoc = getCell(r, 5)
    const numDoc = getCell(r, 6)
    const celular = getCell(r, colCelular)
    const ruta = getCell(r, colRuta)
    const costoIda = toNum(getCell(r, colCostoIda))
    const costoRegreso = toNum(getCell(r, colCostoRegreso))
    const costoTotal = toNum(getCell(r, colCostoTotal))
    const valorTotal = costoTotal || costoIda + costoRegreso

    result.push({
      nombre,
      documento: tipoDoc ? `${tipoDoc} ${numDoc}`.trim() : numDoc,
      celular,
      ruta,
      valorTotal,
      esInhumacion: ruta.toUpperCase().includes('INHUMAC'),
    })
  }

  return result
}
