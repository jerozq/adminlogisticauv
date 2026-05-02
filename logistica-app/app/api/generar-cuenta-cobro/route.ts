import { NextRequest, NextResponse } from 'next/server'
import Docxtemplater from 'docxtemplater'
import PizZip from 'pizzip'
import path from 'path'
import fs from 'fs'
import { createClient } from '@supabase/supabase-js'
import { numeroALetras } from '@/src/utils/numeroALetras'

export const runtime = 'nodejs'

// ─── Supabase (service role para escritura sin RLS) ──────────────────────────
function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('Variables de entorno Supabase no configuradas')
  return createClient(url, key)
}

// ─── Reparador de etiquetas fragmentadas (igual al de generar-cotizacion) ────
function fixAndNormalizeTags(xml: string): string {
  return xml.replace(/<w:p[\s>][\s\S]*?<\/w:p>/g, fixParagraph)
}

function fixParagraph(paraXml: string): string {
  type WtEl = { fullStart: number; fullEnd: number; openTag: string; text: string }
  const wtElements: WtEl[] = []
  const re = /(<w:t(?:\s[^>]*)?>)([^<]*)(<\/w:t>)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(paraXml)) !== null) {
    wtElements.push({ fullStart: m.index, fullEnd: re.lastIndex, openTag: m[1], text: m[2] })
  }
  if (wtElements.length === 0) return paraXml

  const combined = wtElements.map((w) => w.text).join('')
  if (!combined.includes('{{')) return paraXml

  const charPart: number[] = []
  const charOffset: number[] = []
  wtElements.forEach((w, i) => {
    for (let c = 0; c < w.text.length; c++) { charPart.push(i); charOffset.push(c) }
  })

  type TagMatch = { start: number; end: number; normalized: string }
  const tagMatches: TagMatch[] = []
  const tagRe = /\{\{([\s\S]*?)\}\}/g
  let tm: RegExpExecArray | null
  while ((tm = tagRe.exec(combined)) !== null) {
    const inner = tm[1].trim().replace(/\s+/g, '_').toLowerCase()
    tagMatches.push({ start: tm.index, end: tm.index + tm[0].length - 1, normalized: `{{${inner}}}` })
  }

  if (tagMatches.length === 0) return paraXml

  const texts = wtElements.map((w) => w.text)
  for (const tag of [...tagMatches].reverse()) {
    const si = charPart[tag.start]
    const ei = charPart[tag.end]
    if (si === undefined || ei === undefined) continue
    const so = charOffset[tag.start]
    const eo = charOffset[tag.end]
    const before = texts[si].slice(0, so)
    const after = texts[ei].slice(eo + 1)
    if (si === ei) { texts[si] = before + tag.normalized + after }
    else { texts[si] = before + tag.normalized; texts[ei] = after; for (let i = si + 1; i < ei; i++) texts[i] = '' }
  }

  let result = paraXml
  for (let i = wtElements.length - 1; i >= 0; i--) {
    const w = wtElements[i]
    result = result.slice(0, w.fullStart) + w.openTag + texts[i] + '</w:t>' + result.slice(w.fullEnd)
  }
  return result
}

// ─── Formateador COP ──────────────────────────────────────────────────────────
function fmt(n: number | string | null | undefined): string {
  const num = typeof n === 'string' ? parseFloat(n) : (n ?? 0)
  if (isNaN(num)) return '0'
  return new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(num)
}

function fmtDateDoc(s: string | null | undefined): string {
  if (!s) return ''
  const d = new Date(s.includes('T') ? s : s + 'T00:00')
  return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' })
}

function fmtTimeDoc(s: string | null | undefined): string {
  if (!s) return ''
  const raw = s.trim()

  // HH:mm o HH:mm:ss
  const simple = raw.match(/^(\d{2}):(\d{2})(?::\d{2})?$/)
  if (simple) return `${simple[1]}:${simple[2]}`

  // ISO u otros formatos parseables por Date
  const d = new Date(raw)
  if (!Number.isNaN(d.getTime())) {
    return d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: false })
  }

  // Fallback: intenta extraer HH:mm dentro del string
  const embedded = raw.match(/(\d{2}:\d{2})/)
  return embedded?.[1] ?? raw
}

// ─── Tipos del body ───────────────────────────────────────────────────────────
interface ItemCC {
  descripcion: string
  cantidad: number
  precio_unitario: number
}

interface GenerarCuentaCobroBody {
  requerimiento_id: string
  requerimiento: {
    fecha_inicio: string | null
    fecha_fin: string | null
    hora_inicio: string | null
    hora_fin: string | null
    numero_requerimiento: string | null
    nombre_actividad: string
    municipio: string | null
    departamento: string | null
    responsable_nombre: string | null
  }
  items: ItemCC[]
  gran_total: number
  cotizacion_fecha?: string | null
  nombreArchivo?: string
}

// ─── POST /api/generar-cuenta-cobro ──────────────────────────────────────────
export async function POST(req: NextRequest) {
  let body: GenerarCuentaCobroBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
  }

  const { requerimiento_id, requerimiento, items, gran_total, cotizacion_fecha, nombreArchivo } = body

  // ── 1. Consecutivo automático ──────────────────────────────────────────────
  let numero_cuenta: number
  try {
    const sb = getSupabaseAdmin()

    // ¿Ya tiene número asignado?
    const { data: req_data, error: errReq } = await sb
      .from('requerimientos')
      .select('numero_cuenta_cobro')
      .eq('id', requerimiento_id)
      .single()

    if (errReq) throw new Error(`No se pudo leer el requerimiento: ${errReq.message}`)

    if (req_data.numero_cuenta_cobro != null) {
      // Ya tiene consecutivo → reusar
      numero_cuenta = req_data.numero_cuenta_cobro as number
    } else {
      // Obtener el máximo actual y sumar 1
      const { data: maxData } = await sb
        .from('requerimientos')
        .select('numero_cuenta_cobro')
        .not('numero_cuenta_cobro', 'is', null)
        .order('numero_cuenta_cobro', { ascending: false })
        .limit(1)
        .maybeSingle()

      const maxActual = (maxData?.numero_cuenta_cobro as number | null) ?? 99
      numero_cuenta = maxActual + 1

      // Guardar en el registro
      const { error: errUpdate } = await sb
        .from('requerimientos')
        .update({ numero_cuenta_cobro: numero_cuenta })
        .eq('id', requerimiento_id)

      if (errUpdate) {
        console.error('[generar-cuenta-cobro] Error al guardar consecutivo:', errUpdate.message)
        // No es fatal: el doc se genera igual con el número calculado
      }
    }
  } catch (e) {
    console.error('[generar-cuenta-cobro] Consecutivo fallback:', e)
    // Fallback: número basado en timestamp para no bloquear la descarga
    numero_cuenta = parseInt(new Date().toISOString().replace(/\D/g, '').slice(0, 6))
  }

  // ── 2. Valor en letras ─────────────────────────────────────────────────────
  const valor_letras = numeroALetras(gran_total)

  // ── 3. Generar documento ───────────────────────────────────────────────────
  const templatePath = path.join(process.cwd(), 'templates', 'PLANTILLA CUENTA DE COBRO.docx')

  if (!fs.existsSync(templatePath)) {
    return NextResponse.json(
      { error: `Plantilla no encontrada en: ${templatePath}` },
      { status: 404 }
    )
  }

  try {
    const content = fs.readFileSync(templatePath)
    const zip = new PizZip(content)

    // Reparar etiquetas fragmentadas por Word
    const xmlFilePattern = /^word\/(document|header\d*|footer\d*|endnotes|footnotes).*\.xml$/
    for (const filename of Object.keys(zip.files)) {
      if (!xmlFilePattern.test(filename)) continue
      const original = zip.files[filename].asText()
      const fixed = fixAndNormalizeTags(original)
      if (fixed !== original) zip.file(filename, fixed)
    }

    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      delimiters: { start: '{{', end: '}}' },
      parser: (tag: string) => ({
        get(scope: Record<string, unknown>) {
          const val = scope[tag.trim()]
          return val !== undefined && val !== null ? val : ''
        },
      }),
      nullGetter: () => '',
    })

    // Descripción de servicios: lista de ítems concatenada
    const descripcion_servicios = items
      .map((i) => `${i.descripcion} (${i.cantidad} × ${fmt(i.precio_unitario)})`)
      .join('; ')

    const fechaCotizacion = fmtDateDoc(cotizacion_fecha ?? new Date().toISOString())

    const docData = {
      // Cuenta de cobro
      numero_cuenta:   String(numero_cuenta),
      fecha:           fechaCotizacion,
      cotizacion_fecha: fechaCotizacion,
      fecha_de_cotizacion: fechaCotizacion,
      año:             new Date().getFullYear().toString(),

      // Actividad
      numero_requerimiento: requerimiento.numero_requerimiento ?? '',
      nombre_actividad:     requerimiento.nombre_actividad ?? '',
      municipio:            requerimiento.municipio ?? '',
      departamento:         requerimiento.departamento ?? '',
      fecha_inicio:         fmtDateDoc(requerimiento.fecha_inicio),
      fecha_fin:            fmtDateDoc(requerimiento.fecha_fin),
      hora_inicio:          fmtTimeDoc(requerimiento.hora_inicio),
      hora_fin:             fmtTimeDoc(requerimiento.hora_fin),
      responsable:          requerimiento.responsable_nombre ?? '',

      // Valor
      valor_numeros:       fmt(gran_total),
      gran_total:          fmt(gran_total),
      valor_letras,

      // Tabla de ítems (loop {{#items}} … {{/items}})
      items: items.map((i) => ({
        descripcion:     i.descripcion,
        cantidad:        String(i.cantidad),
        precio_unitario: fmt(i.precio_unitario),
        precio_total:    fmt(i.cantidad * i.precio_unitario),
      })),

      // Descripción como texto plano
      descripcion_servicios,
      concepto: `Prestación de servicios logísticos – ${requerimiento.nombre_actividad}${requerimiento.municipio ? ' – ' + requerimiento.municipio : ''}`,
    }

    try {
      doc.render(docData)
    } catch (renderErr: unknown) {
      const err = renderErr as { properties?: { errors?: Array<{ message: string; properties?: { explanation?: string } }> } }
      const subErrors = err?.properties?.errors
      if (subErrors && subErrors.length > 0) {
        const detail = subErrors.map((e) => e.properties?.explanation ?? e.message).join('; ')
        throw new Error(`Errores en template: ${detail}`)
      }
      throw renderErr
    }

    const buf = doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' })

    const filename = encodeURIComponent(
      nombreArchivo ??
      `CuentaCobro_${numero_cuenta}_${requerimiento.numero_requerimiento ?? 'actividad'}.docx`
    )

    return new NextResponse(buf as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename*=UTF-8''${filename}`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[generar-cuenta-cobro] Error:', msg)
    return NextResponse.json({ error: `Error procesando plantilla: ${msg}` }, { status: 500 })
  }
}
