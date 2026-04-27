'use server'

import { getSupabase } from '@/lib/supabase'

export interface EvidenciaGlobal {
  id: string
  actividad_id: string
  nombre_actividad: string
  descripcion: string
  monto: number
  pagador: string
  soporte_url: string
  created_at: string
}

export async function listarEvidenciasGlobales(): Promise<EvidenciaGlobal[]> {
  const sb = getSupabase()

  // Optimizando consulta usando inner join con requerimientos
  const { data, error } = await sb
    .from('ejecucion_costos')
    .select(`
      id,
      actividad_id,
      descripcion,
      monto,
      pagador,
      soporte_url,
      created_at,
      requerimientos!inner(nombre_actividad)
    `)
    .not('soporte_url', 'is', null)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching global evidences:', error.message)
    return []
  }

  return (data || []).map((row: Record<string, unknown>) => ({
    id: row.id,
    actividad_id: row.actividad_id,
    nombre_actividad: (row.requerimientos as { nombre_actividad?: string } | null)?.nombre_actividad || 'Actividad Desconocida',
    descripcion: row.descripcion,
    monto: row.monto,
    pagador: row.pagador,
    soporte_url: row.soporte_url,
    created_at: row.created_at,
  }))
}
