'use server'

import { revalidatePath } from 'next/cache'
import { getSupabase } from '@/lib/supabase'

export type ActividadProfesional = {
  requerimientoId: string
  nombreActividad: string
  municipio: string | null
  departamento: string | null
  fechaInicio: string | null
  createdAt: string
}

export type ProfesionalDirectorio = {
  clave: string
  nombre: string
  cedula: string | null
  celular: string | null
  correo: string | null
  especialidad: string | null
  notas: string | null
  zonas: string[]
  totalActividades: number
  actividades: ActividadProfesional[]
}

function claveDe(nombre: string, cedula: string | null): string {
  return cedula?.trim() || `n:${nombre.trim().toLowerCase()}`
}

export async function listarDirectorioProfesionales(): Promise<ProfesionalDirectorio[]> {
  const supabase = getSupabase()

  const [reqResult, profResult] = await Promise.all([
    supabase
      .from('requerimientos')
      .select('id, nombre_actividad, municipio, departamento, fecha_inicio, created_at, responsable_nombre, responsable_cedula, responsable_celular, responsable_correo')
      .not('responsable_nombre', 'is', null)
      .neq('responsable_nombre', '')
      .order('created_at', { ascending: false })
      .limit(5000),
    supabase.from('profesionales').select('*'),
  ])

  if (reqResult.error) {
    console.error('[listarDirectorioProfesionales]', reqResult.error)
    return []
  }

  const enriquecidoPorCedula = new Map<string, { especialidad: string | null; notas: string | null }>()
  for (const p of profResult.data ?? []) {
    if (p.cedula) {
      enriquecidoPorCedula.set(p.cedula as string, {
        especialidad: (p.especialidad as string | null) ?? null,
        notas: (p.notas as string | null) ?? null,
      })
    }
  }

  const porClave = new Map<string, ProfesionalDirectorio>()

  for (const row of reqResult.data ?? []) {
    const nombre = (row.responsable_nombre as string).trim()
    const cedula = (row.responsable_cedula as string | null)?.trim() || null
    const clave = claveDe(nombre, cedula)

    if (!porClave.has(clave)) {
      const enriquecido = cedula ? enriquecidoPorCedula.get(cedula) : undefined
      porClave.set(clave, {
        clave,
        nombre,
        cedula,
        celular: (row.responsable_celular as string | null) ?? null,
        correo: (row.responsable_correo as string | null) ?? null,
        especialidad: enriquecido?.especialidad ?? null,
        notas: enriquecido?.notas ?? null,
        zonas: [],
        totalActividades: 0,
        actividades: [],
      })
    }

    const entry = porClave.get(clave)!
    entry.totalActividades += 1
    // Las filas vienen ordenadas por created_at desc, así que lo primero que
    // llega para cada clave es el contacto más reciente.
    entry.celular ||= (row.responsable_celular as string | null) ?? null
    entry.correo ||= (row.responsable_correo as string | null) ?? null

    const municipio = row.municipio as string | null
    if (municipio && !entry.zonas.includes(municipio)) entry.zonas.push(municipio)

    entry.actividades.push({
      requerimientoId: row.id as string,
      nombreActividad: (row.nombre_actividad as string) ?? 'Sin nombre',
      municipio,
      departamento: row.departamento as string | null,
      fechaInicio: row.fecha_inicio as string | null,
      createdAt: row.created_at as string,
    })
  }

  return Array.from(porClave.values()).sort((a, b) => b.totalActividades - a.totalActividades)
}

export async function guardarProfesional(datos: {
  cedula: string
  nombre: string
  celular?: string | null
  correo?: string | null
  especialidad?: string | null
  notas?: string | null
}): Promise<{ ok: boolean; error?: string }> {
  if (!datos.cedula?.trim()) {
    return { ok: false, error: 'No se puede guardar sin cédula: el directorio solo permite enriquecer profesionales que ya tienen cédula registrada en alguna actividad.' }
  }

  const supabase = getSupabase()
  const { error } = await supabase
    .from('profesionales')
    .upsert(
      {
        cedula: datos.cedula.trim(),
        nombre: datos.nombre,
        celular: datos.celular || null,
        correo: datos.correo || null,
        especialidad: datos.especialidad || null,
        notas: datos.notas || null,
      },
      { onConflict: 'cedula' }
    )

  if (error) return { ok: false, error: error.message }
  revalidatePath('/profesionales')
  return { ok: true }
}
