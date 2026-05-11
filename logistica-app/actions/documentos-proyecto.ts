'use server'

import { getSupabase } from '@/lib/supabase'

export type TipoDocumentoProyecto = 'COTIZACION' | 'CUENTA_COBRO'
export type DocumentoCampos = Record<string, string>

export interface DocumentoProyectoState {
  campos: DocumentoCampos
  updatedAt: string | null
  persistido: boolean
}

export interface DocumentosProyectoState {
  COTIZACION: DocumentoProyectoState
  CUENTA_COBRO: DocumentoProyectoState
}

const TIPOS_DOCUMENTO: TipoDocumentoProyecto[] = ['COTIZACION', 'CUENTA_COBRO']

function parsearCampos(raw: string | null | undefined): DocumentoCampos {
  if (!raw) return {}

  try {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}

    const entries = Object.entries(parsed as Record<string, unknown>)
    return entries.reduce<DocumentoCampos>((acc, [key, value]) => {
      if (typeof key !== 'string' || !key.trim()) return acc
      if (typeof value !== 'string') return acc
      acc[key] = value
      return acc
    }, {})
  } catch {
    return {}
  }
}

function serializarCampos(campos: DocumentoCampos): string {
  return JSON.stringify(campos)
}

function resolverNombreTipo(tipo: TipoDocumentoProyecto): string {
  return tipo === 'COTIZACION' ? 'Cotizacion' : 'CuentaCobro'
}

function estadoFallback(): DocumentosProyectoState {
  return {
    COTIZACION: {
      campos: {},
      updatedAt: null,
      persistido: false,
    },
    CUENTA_COBRO: {
      campos: {},
      updatedAt: null,
      persistido: false,
    },
  }
}

export async function cargarDocumentosProyecto(proyectoId: string): Promise<DocumentosProyectoState> {
  const sb = getSupabase()
  const fallback = estadoFallback()

  const { data, error } = await sb
    .from('documentos_proyecto')
    .select('tipo_documento, contenido_html, updated_at')
    .eq('proyecto_id', proyectoId)

  if (error || !data) {
    return fallback
  }

  const resultado: DocumentosProyectoState = { ...fallback }

  for (const row of data) {
    if (row.tipo_documento === 'COTIZACION') {
      resultado.COTIZACION = {
        campos: parsearCampos(row.contenido_html),
        updatedAt: row.updated_at,
        persistido: true,
      }
    }

    if (row.tipo_documento === 'CUENTA_COBRO') {
      resultado.CUENTA_COBRO = {
        campos: parsearCampos(row.contenido_html),
        updatedAt: row.updated_at,
        persistido: true,
      }
    }
  }

  return resultado
}

export async function guardarDocumentoProyecto(input: {
  proyectoId: string
  tipoDocumento: TipoDocumentoProyecto
  campos: DocumentoCampos
}): Promise<{ ok: true; updatedAt: string } | { ok: false; error: string }> {
  const { proyectoId, tipoDocumento, campos } = input

  if (!proyectoId) {
    return { ok: false, error: 'Proyecto inválido.' }
  }

  if (!TIPOS_DOCUMENTO.includes(tipoDocumento)) {
    return { ok: false, error: 'Tipo de documento inválido.' }
  }

  const sb = getSupabase()

  const { data, error } = await sb
    .from('documentos_proyecto')
    .upsert(
      {
        proyecto_id: proyectoId,
        tipo_documento: tipoDocumento,
        contenido_html: serializarCampos(campos),
      },
      { onConflict: 'proyecto_id,tipo_documento' },
    )
    .select('updated_at')
    .single()

  if (error || !data?.updated_at) {
    return {
      ok: false,
      error: error?.message || `No se pudo guardar la configuración de ${resolverNombreTipo(tipoDocumento)}.`,
    }
  }

  return { ok: true, updatedAt: data.updated_at }
}

export async function obtenerDocumentoProyectoActual(input: {
  proyectoId: string
  tipoDocumento: TipoDocumentoProyecto
}): Promise<
  | { ok: true; campos: DocumentoCampos; updatedAt: string | null; persistido: boolean }
  | { ok: false; error: string }
> {
  const { proyectoId, tipoDocumento } = input

  if (!proyectoId) {
    return { ok: false, error: 'Proyecto inválido.' }
  }

  if (!TIPOS_DOCUMENTO.includes(tipoDocumento)) {
    return { ok: false, error: 'Tipo de documento inválido.' }
  }

  const documentos = await cargarDocumentosProyecto(proyectoId)
  const documento = documentos[tipoDocumento]

  return {
    ok: true,
    campos: documento.campos,
    updatedAt: documento.updatedAt,
    persistido: documento.persistido,
  }
}
