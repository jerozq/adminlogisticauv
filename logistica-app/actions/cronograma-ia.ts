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
  item_requerimiento_id?: string | null  // FK a items_requerimiento para búsqueda por Paso A
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

    // 4. PASO B: Cargar items_requerimiento con observación para extracción por ítem
    const { data: items, error: itemsError } = await sb
      .from('items_requerimiento')
      .select('id, descripcion, categoria, cantidad, unidad_medida, observacion_item, fecha_entrega_estimada, hora_entrega_estimada')
      .eq('requerimiento_id', actividadId)
      .in('tipo', ['SERVICIO', 'PASIVO_TERCERO'])
      .neq('estado', 'CANCELADO')
      .order('created_at', { ascending: true })

    if (itemsError) {
      return { ok: false, error: `Error al cargar ítems: ${itemsError.message}`, isQuota: false }
    }

    if (!items || items.length === 0) {
      return {
        ok: false,
        error: 'No hay ítems cotizados. Crea al menos 1 ítem en cotización antes de generar agenda.',
        isQuota: false
      }
    }

    // 5. Extracción IA: fecha/hora de observación de CADA ÍTEM (no global)
    const google = createGoogleGenerativeAI({ apiKey })

    const itemsForExtraction = items
      .map((i, idx) => 
        `Ítem ${idx + 1}: "${i.descripcion}" | Observación: "${i.observacion_item ?? 'Sin observación'}" | Actual: ${i.fecha_entrega_estimada ?? 'N/A'} ${i.hora_entrega_estimada ?? 'N/A'}`
      )
      .join('\n')

    const extractionPrompt = `Extrae fecha y hora de ENTREGA/EJECUCIÓN de cada ítem logístico.
Para cada uno, busca en su observación fechas, horas, o referencias (ej. "mañana", "próximo jueves", "10:00 AM").

Ítems:
${itemsForExtraction}

RESPONDE SOLO un JSON array válido:
[
  { "item_idx": 1, "fecha": "YYYY-MM-DD" | null, "hora": "HH:mm" | null },
  ...
]

Si no hay fecha/hora clara, retorna null para ambos campos.`

    let extractedDates: Array<{ item_idx: number; fecha: string | null; hora: string | null }> = []
    try {
      const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: extractionPrompt }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 500 },
          safetySettings: [],
        }),
      })
      
      const result = await response.json()
      const content = result.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
      const jsonMatch = content.match(/\[[\s\S]*\]/)
      if (jsonMatch) {
        extractedDates = JSON.parse(jsonMatch[0])
      }
    } catch (aiErr) {
      console.warn('[generarCronogramaIA] Extracción de fechas falló:', aiErr)
      // Continuar con valores en DB
    }

    // 6. Generar EXACTAMENTE 1 entrega POR ÍTEM (no inventes ítems adicionales) con item_requerimiento_id
    const entregables: HitoCronogramaIA[] = []

    for (let idx = 0; idx < items.length; idx++) {
      const item = items[idx]
      const extracted = extractedDates.find((e) => e.item_idx === idx + 1)
      
      const fecha = extracted?.fecha ?? item.fecha_entrega_estimada ?? req.fecha_inicio ?? new Date().toISOString().split('T')[0]
      const hora = extracted?.hora ?? item.hora_entrega_estimada ?? req.hora_inicio ?? '08:00'

      entregables.push({
        fecha,
        hora,
        descripcion_item: item.descripcion,
        cantidad: item.cantidad,
        item_requerimiento_id: item.id,  // PASO A: guardar FK para búsqueda en UI
      })
    }

    // 7. Guardar JSON en caché (requerimientos.cronograma_ia)
    await guardarCronogramaIAEnCache(sb, actividadId, entregables)

    // 8. Si se regenera, limpiar bitacora_entregas que estén vinculadas a ítems
    if (forzarRegeneracion) {
      await sb.from('bitacora_entregas').delete().eq('actividad_id', actividadId).not('item_requerimiento_id', 'is', null)
    }

    // 9. Persistir entregables en bitacora_entregas con FK a item_requerimiento_id (PASO A)
    let hitosGuardados = 0
    for (let idx = 0; idx < entregables.length; idx++) {
      const entregable = entregables[idx]
      const item = items[idx]
      const fechaHoraISO = toBitacoraISO(entregable.fecha, entregable.hora)
      if (!fechaHoraISO) continue

      const { error: insertError } = await sb.from('bitacora_entregas').insert({
        actividad_id: actividadId,
        item_requerimiento_id: item.id,  // FK FUERTE: vincula a cada ítem de cotización
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
