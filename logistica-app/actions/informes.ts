'use server'

import { revalidatePath } from 'next/cache'
import { getSupabase } from '@/lib/supabase'

// ============================================================
// Types
// ============================================================

export interface ReembolsoInforme {
  id: string
  descripcion: string
  tipo: string
  beneficiario_nombre: string | null
  beneficiario_documento: string | null
  precio_total: number
  estado: string
  pagado: boolean
  reembolso_firmado_url: string | null
  cedula_url: string | null
}

export interface InformeActividad {
  id: string
  nombre_actividad: string
  numero_requerimiento: string | null
  municipio: string | null
  departamento: string | null
  lugar_detalle: string | null
  fecha_inicio: string | null
  fecha_fin: string | null
  responsable_nombre: string | null
  num_victimas: number
  // PDF 1
  recibo_satisfaccion_firmado_url: string | null
  // PDF 2
  lista_asistencia_firmada_url: string | null
  informe_pdf2_url: string | null
  // PDF 3
  informe_pdf3_url: string | null
  // Estado
  informe_estado: 'borrador' | 'en_proceso' | 'completo'
}

export interface EvidenciaInforme {
  id: string
  descripcion: string
  evidencia_url: string | null
  estado: string
  fecha_hora_limite: string
}

// ============================================================
// Obtener datos completos del informe de una actividad
// ============================================================

export async function obtenerInformeActividad(actividadId: string): Promise<{
  actividad: InformeActividad | null
  reembolsos: ReembolsoInforme[]
  evidencias: EvidenciaInforme[]
}> {
  const sb = getSupabase()

  const [actividadResult, reembolsosResult, evidenciasResult] = await Promise.all([
    sb
      .from('requerimientos')
      .select(`
        id,
        nombre_actividad,
        numero_requerimiento,
        municipio,
        departamento,
        lugar_detalle,
        fecha_inicio,
        fecha_fin,
        responsable_nombre,
        num_victimas,
        recibo_satisfaccion_firmado_url,
        lista_asistencia_firmada_url,
        informe_pdf2_url,
        informe_pdf3_url,
        informe_estado
      `)
      .eq('id', actividadId)
      .single(),

    sb
      .from('items_requerimiento')
      .select(`
        id,
        descripcion,
        tipo,
        beneficiario_nombre,
        beneficiario_documento,
        precio_total,
        estado,
        pagado,
        reembolso_firmado_url,
        cedula_url
      `)
      .eq('requerimiento_id', actividadId)
      .in('tipo', ['REEMBOLSO', 'PASIVO_TERCERO'])
      .eq('estado', 'ACTIVO')
      .order('created_at', { ascending: true }),

    sb
      .from('bitacora_entregas')
      .select(`
        id,
        descripcion,
        evidencia_url,
        estado,
        fecha_hora_limite
      `)
      .eq('actividad_id', actividadId)
      .not('evidencia_url', 'is', null)
      .order('fecha_hora_limite', { ascending: true }),
  ])

  return {
    actividad: actividadResult.data as InformeActividad | null,
    reembolsos: (reembolsosResult.data ?? []) as ReembolsoInforme[],
    evidencias: (evidenciasResult.data ?? []) as EvidenciaInforme[],
  }
}

// ============================================================
// Subir documento firmado de un beneficiario (reembolso o cédula)
// ============================================================

export async function subirDocumentoBeneficiario(
  itemId: string,
  actividadId: string,
  campo: 'reembolso_firmado_url' | 'cedula_url',
  url: string,
): Promise<{ ok: boolean; error?: string }> {
  const sb = getSupabase()

  const { error } = await sb
    .from('items_requerimiento')
    .update({ [campo]: url })
    .eq('id', itemId)

  if (error) {
    console.error(`Error actualizando ${campo}:`, error.message)
    return { ok: false, error: error.message }
  }

  revalidatePath(`/ejecucion/${actividadId}`)
  return { ok: true }
}

// ============================================================
// Subir documentos de la actividad (lista asistencia, recibo firmado)
// ============================================================

export async function subirDocumentoActividad(
  actividadId: string,
  campo: 'lista_asistencia_firmada_url' | 'recibo_satisfaccion_firmado_url' | 'informe_pdf2_url' | 'informe_pdf3_url',
  url: string,
): Promise<{ ok: boolean; error?: string }> {
  const sb = getSupabase()

  const { error } = await sb
    .from('requerimientos')
    .update({ [campo]: url })
    .eq('id', actividadId)

  if (error) {
    console.error(`Error actualizando ${campo}:`, error.message)
    return { ok: false, error: error.message }
  }

  revalidatePath(`/ejecucion/${actividadId}`)
  return { ok: true }
}

// ============================================================
// Actualizar estado del informe
// ============================================================

export async function actualizarEstadoInforme(
  actividadId: string,
  estado: 'borrador' | 'en_proceso' | 'completo',
): Promise<{ ok: boolean; error?: string }> {
  const sb = getSupabase()

  const { error } = await sb
    .from('requerimientos')
    .update({ informe_estado: estado })
    .eq('id', actividadId)

  if (error) {
    return { ok: false, error: error.message }
  }

  revalidatePath(`/ejecucion/${actividadId}`)
  return { ok: true }
}
