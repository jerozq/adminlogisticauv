'use server'

import fs from 'node:fs/promises'
import path from 'node:path'
import { getSupabase } from '@/lib/supabase'

export type TipoDocumentoProyecto = 'COTIZACION' | 'CUENTA_COBRO'

export interface DocumentoProyectoState {
  html: string
  updatedAt: string | null
  persistido: boolean
}

export interface DocumentosProyectoState {
  COTIZACION: DocumentoProyectoState
  CUENTA_COBRO: DocumentoProyectoState
}

const TIPOS_DOCUMENTO: TipoDocumentoProyecto[] = ['COTIZACION', 'CUENTA_COBRO']

const PLANTILLA_POR_TIPO: Record<TipoDocumentoProyecto, string> = {
  COTIZACION: 'DOCUMENTO_BASE_COTIZACION.html',
  CUENTA_COBRO: 'DOCUMENTO_BASE_CUENTA_COBRO.html',
}

async function leerPlantillaBase(tipo: TipoDocumentoProyecto): Promise<string> {
  const plantillaPath = path.join(process.cwd(), 'templates', PLANTILLA_POR_TIPO[tipo])

  try {
    return await fs.readFile(plantillaPath, 'utf8')
  } catch {
    return `<!doctype html><html><head><meta charset="utf-8"/></head><body><p>Plantilla ${tipo}</p></body></html>`
  }
}

function resolverNombreTipo(tipo: TipoDocumentoProyecto): string {
  return tipo === 'COTIZACION' ? 'Cotizacion' : 'CuentaCobro'
}

export async function cargarDocumentosProyecto(proyectoId: string): Promise<DocumentosProyectoState> {
  const sb = getSupabase()

  const plantillas = await Promise.all(TIPOS_DOCUMENTO.map((tipo) => leerPlantillaBase(tipo)))
  const basePorTipo = {
    COTIZACION: plantillas[0],
    CUENTA_COBRO: plantillas[1],
  }

  const fallback: DocumentosProyectoState = {
    COTIZACION: {
      html: basePorTipo.COTIZACION,
      updatedAt: null,
      persistido: false,
    },
    CUENTA_COBRO: {
      html: basePorTipo.CUENTA_COBRO,
      updatedAt: null,
      persistido: false,
    },
  }

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
        html: row.contenido_html || basePorTipo.COTIZACION,
        updatedAt: row.updated_at,
        persistido: true,
      }
    }

    if (row.tipo_documento === 'CUENTA_COBRO') {
      resultado.CUENTA_COBRO = {
        html: row.contenido_html || basePorTipo.CUENTA_COBRO,
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
  contenidoHtml: string
}): Promise<{ ok: true; updatedAt: string } | { ok: false; error: string }> {
  const { proyectoId, tipoDocumento, contenidoHtml } = input

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
        contenido_html: contenidoHtml,
      },
      { onConflict: 'proyecto_id,tipo_documento' },
    )
    .select('updated_at')
    .single()

  if (error || !data?.updated_at) {
    return {
      ok: false,
      error: error?.message || `No se pudo guardar el documento ${resolverNombreTipo(tipoDocumento)}.`,
    }
  }

  return { ok: true, updatedAt: data.updated_at }
}
