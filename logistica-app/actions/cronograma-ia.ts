'use server'

import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { generateObject } from 'ai'
import { z } from 'zod'
import { getSupabase } from '@/lib/supabase'
import { revalidatePath, revalidateTag } from 'next/cache'

// ============================================================
// Cronograma IA — Genera hitos de agenda inteligente
//
// Usa Gemini 2.0 Flash para analizar:
//   1. Observaciones del requerimiento (campo texto libre)
//   2. Ítems cotizados (alimentación, logística, etc.)
//   3. Fechas de la actividad
//
// Produce un JSON estricto con: fecha, hora, descripcion_item, cantidad
// que se persiste en bitacora_entregas y en cronograma_ia (actividades/requerimientos)
// para evitar llamadas redundantes (caché en DB).
// ============================================================

const EntregableSchema = z.object({
  fecha: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida (use YYYY-MM-DD)'),
  hora: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Hora inválida (use HH:MM 24h)'),
  descripcion_item: z.string().min(3),
  cantidad: z.number().int().positive(),
})

const CronogramaSchema = z.object({
  entregables: z.array(EntregableSchema).describe('Lista de entregables operativos en orden cronológico'),
})

export interface HitoCronogramaIA {
  fecha: string
  hora: string
  descripcion_item: string
  cantidad: number
}

export type GenerarCronogramaResult =
  | { ok: true; entregables: HitoCronogramaIA[]; hitosGuardados: number; fromCache: boolean }
  | { ok: false; error: string; isQuota: boolean }

// ── Mock Data (activo con USE_MOCK_AI=true) ───────────────────────────────────
const MOCK_HITOS: HitoCronogramaIA[] = [
  { fecha: new Date().toISOString().split('T')[0], hora: '07:00', descripcion_item: '[Logística] Toma de control y arribo al punto', cantidad: 1 },
  { fecha: new Date().toISOString().split('T')[0], hora: '08:00', descripcion_item: '[Alimentación] Desayunos beneficiarios', cantidad: 15 },
  { fecha: new Date().toISOString().split('T')[0], hora: '10:00', descripcion_item: '[Alimentación] Refrigerio AM', cantidad: 15 },
  { fecha: new Date().toISOString().split('T')[0], hora: '12:30', descripcion_item: '[Alimentación] Almuerzos de trabajo', cantidad: 15 },
  { fecha: new Date().toISOString().split('T')[0], hora: '15:00', descripcion_item: '[Alimentación] Refrigerio PM', cantidad: 15 },
  { fecha: new Date().toISOString().split('T')[0], hora: '17:00', descripcion_item: '[Logística] Cierre y liquidación del evento', cantidad: 1 },
]

function toBitacoraISO(fecha: string, hora: string): string | null {
  const dt = new Date(`${fecha}T${hora}:00`)
  if (Number.isNaN(dt.getTime())) return null
  return dt.toISOString()
}

async function guardarCronogramaIAEnCache(
  sb: ReturnType<typeof getSupabase>,
  actividadId: string,
  entregables: HitoCronogramaIA[]
): Promise<void> {
  const payload = { 
    data: entregables, 
    updated_at: new Date().toISOString() 
  }

  const { error: errActividades } = await sb
    .from('actividades')
    .update({ cronograma_ia: payload })
    .eq('id', actividadId)

  // Compatibilidad: en este proyecto la entidad principal es requerimientos.
  if (errActividades) {
    await sb
      .from('requerimientos')
      .update({ cronograma_ia: payload })
      .eq('id', actividadId)
    return
  }

  // Mantener ambos sincronizados para lecturas existentes.
  await sb
    .from('requerimientos')
    .update({ cronograma_ia: payload })
    .eq('id', actividadId)
}

export async function generarCronogramaIA(
  actividadId: string,
  forzarRegeneracion = false
): Promise<GenerarCronogramaResult> {
  try {
    // ── MOCK MODE: retorna datos simulados sin llamar a Gemini ──
    if (process.env.USE_MOCK_AI === 'true') {
      await new Promise((r) => setTimeout(r, 1000))
      const sb = getSupabase()
      await guardarCronogramaIAEnCache(sb, actividadId, MOCK_HITOS)
      revalidatePath(`/ejecucion/${actividadId}`)
      revalidatePath('/ejecucion')
      return { ok: true, entregables: MOCK_HITOS, hitosGuardados: MOCK_HITOS.length, fromCache: false }
    }

    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY
    if (!apiKey) {
      return { ok: false, error: 'GOOGLE_GENERATIVE_AI_API_KEY no configurada', isQuota: false }
    }

    const sb = getSupabase()

    // 1. Cargar datos del requerimiento (incluyendo caché)
    const { data: req, error: reqError } = await sb
      .from('requerimientos')
      .select('id, nombre_actividad, municipio, fecha_inicio, fecha_fin, hora_inicio, hora_fin, num_victimas, objeto, cronograma_ia')
      .eq('id', actividadId)
      .single()

    if (reqError || !req) {
      return { ok: false, error: 'Actividad no encontrada', isQuota: false }
    }

    // 2. Control de Cooldown (Anti-429)
    const cache = req.cronograma_ia as { data: HitoCronogramaIA[]; updated_at?: string } | null
    const now = new Date()

    if (forzarRegeneracion && cache?.updated_at) {
      const lastUpdate = new Date(cache.updated_at)
      const diffSecs = (now.getTime() - lastUpdate.getTime()) / 1000
      if (diffSecs < 60) {
        return { 
          ok: false, 
          error: `Espera ${Math.ceil(60 - diffSecs)} segundos antes de regenerar.`, 
          isQuota: false 
        }
      }
    }

    // 3. Usar caché si existe y no se está forzando regeneración
    if (!forzarRegeneracion && cache?.data && Array.isArray(cache.data) && cache.data.length > 0) {
      return {
        ok: true,
        entregables: cache.data,
        hitosGuardados: 0,
        fromCache: true,
      }
    }

    // 3. Cargar ítems cotizados de la última cotización
    const { data: items } = await sb
      .from('items_requerimiento')
      .select('descripcion, categoria, cantidad, unidad_medida')
      .eq('requerimiento_id', actividadId)
      .in('tipo', ['SERVICIO', 'PASIVO_TERCERO'])
      .neq('estado', 'CANCELADO')

    let itemsText = 'Sin ítems cotizados'
    if (items && items.length > 0) {
      itemsText = items
        .map(i => `- ${i.descripcion} (${i.cantidad} ${i.unidad_medida ?? 'und'}) [${i.categoria ?? 'General'}]`)
        .join('\n')
    }

    // 4. Calcular duración de la actividad
    const fechaInicio = req.fecha_inicio ?? new Date().toISOString().split('T')[0]
    const fechaFin = req.fecha_fin ?? fechaInicio
    const diasActividad = Math.max(1,
      Math.ceil(
        (new Date(fechaFin).getTime() - new Date(fechaInicio).getTime()) / (1000 * 60 * 60 * 24)
      ) + 1
    )

    // 5. Generar cronograma con IA
    const google = createGoogleGenerativeAI({ apiKey })

    const systemPrompt = `Eres un coordinador logístico experto de la UARIV (Unidad para las Víctimas de Colombia).
Se te pasan los datos de una actividad logística y debes generar un cronograma operativo detallado.

REGLAS:
- Eres un analista logístico experto. Analiza las observaciones de este requerimiento y extrae un cronograma estricto. Si no hay hora específica, infiere una lógica (ej. almuerzos a las 12:00 PM).
- Devuelve únicamente "entregables" con: fecha (YYYY-MM-DD), hora (HH:MM 24h), descripcion_item y cantidad.
- Genera entregables realistas y accionables para el equipo de campo.
- Si hay alimentación, programa horarios consistentes (ej. 10:00, 12:00, 15:00).
- Ordena cronológicamente por fecha y hora.
- Máximo ${diasActividad * 12} entregables en total.`

    const userPrompt = `=== ACTIVIDAD ===
Nombre: ${req.nombre_actividad}
Municipio: ${req.municipio ?? 'No especificado'}
Fecha inicio: ${fechaInicio}
Fecha fin: ${fechaFin}
Hora inicio: ${req.hora_inicio ?? '08:00'}
Hora fin: ${req.hora_fin ?? '17:00'}
Días de actividad: ${diasActividad}
Víctimas/beneficiarios: ${req.num_victimas ?? 0}

=== ÍTEMS COTIZADOS ===
${itemsText}

=== OBSERVACIONES ===
${req.objeto ?? 'Sin observaciones adicionales'}

Genera el cronograma operativo completo.`

    const { object } = await generateObject({
      model: google('gemini-2.5-flash'),
      schema: CronogramaSchema,
      system: systemPrompt,
      prompt: userPrompt,
      temperature: 0.3,
    })

    const entregables = object.entregables

    // 6. Guardar JSON en caché (actividades/requerimientos.cronograma_ia)
    await guardarCronogramaIAEnCache(sb, actividadId, entregables)

    // 7. Si se regenera, limpiar hitos anteriores antes de insertar los nuevos
    if (forzarRegeneracion) {
      await sb.from('bitacora_entregas').delete().eq('actividad_id', actividadId)
    }

    // 8. Persistir los entregables en bitacora_entregas
    let hitosGuardados = 0
    for (const entregable of entregables) {
      const fechaHoraISO = toBitacoraISO(entregable.fecha, entregable.hora)
      if (!fechaHoraISO) continue

      const { error: insertError } = await sb.from('bitacora_entregas').insert({
        actividad_id: actividadId,
        descripcion: `${entregable.descripcion_item} (x${entregable.cantidad})`,
        fecha_hora_limite: fechaHoraISO,
        estado: 'pendiente',
      })

      if (!insertError) hitosGuardados++
    }

    revalidatePath(`/ejecucion/${actividadId}`)
    // @ts-expect-error -- revalidateTag not yet in Next.js types
    revalidateTag(`act:${actividadId}`)

    return { ok: true, entregables, hitosGuardados, fromCache: false }
  } catch (err) {
    console.error('[generarCronogramaIA]', err)
    const message = err instanceof Error ? err.message : 'Error inesperado al generar cronograma'
    const isQuota =
      message.toLowerCase().includes('quota') ||
      message.toLowerCase().includes('rate') ||
      message.toLowerCase().includes('429') ||
      message.toLowerCase().includes('exceeded')
    return { ok: false, error: message, isQuota: isQuota }
  }
}

/**
 * Actualiza manualmente el cronograma (usado por el CRUD de la UI).
 */
export async function actualizarCronogramaIA(
  actividadId: string,
  entregables: HitoCronogramaIA[]
): Promise<{ ok: boolean; error?: string }> {
  try {
    const sb = getSupabase()
    await guardarCronogramaIAEnCache(sb, actividadId, entregables)
    revalidatePath(`/ejecucion/${actividadId}`)
    revalidatePath('/ejecucion')
    // @ts-expect-error -- revalidateTag not yet in Next.js types
    revalidateTag(`act:${actividadId}`)
    return { ok: true }
  } catch (err) {
    console.error('[actualizarCronogramaIA]', err)
    return { ok: false, error: 'Error al guardar los cambios en el cronograma' }
  }
}
