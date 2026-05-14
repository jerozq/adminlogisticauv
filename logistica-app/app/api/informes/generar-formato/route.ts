import { NextRequest, NextResponse } from 'next/server'
import Docxtemplater from 'docxtemplater'
import PizZip from 'pizzip'
import path from 'path'
import fs from 'fs'
import type { InformeActividad, ReembolsoInforme } from '@/actions/informes'
import { getDocumentConverterService } from '@/src/infrastructure/container'
import { DocumentConversionError } from '@/src/core/domain/entities/DocumentConversionError'
import { getLogger } from '@/src/infrastructure/observability/logger'
import { createClient } from '@/utils/supabase/server'

export const runtime = 'nodejs'

type TipoFormato = 'lista-asistencia' | 'recibo-satisfaccion'

interface GenerarFormatoBody {
  tipo: TipoFormato
  actividad: InformeActividad
  reembolsos?: ReembolsoInforme[]
}

const TEMPLATE_TAG_RENAMES: Record<string, string> = {
  'numero requerimiento': 'numero_requerimiento',
  'responsable nombre': 'responsable_nombre',
  'direccion territorial': 'direccion_territorial',
  'monto reembolso declarado': 'monto_reembolso_declarado',
}

function fixAndNormalizeTemplateTags(xml: string): string {
  return xml.replace(/<w:p[\s>][\s\S]*?<\/w:p>/g, fixParagraph)
}

function fixParagraph(paraXml: string): string {
  type WtElement = { fullStart: number; fullEnd: number; openTag: string; text: string }
  const wtElements: WtElement[] = []

  const re = /(<w:t(?:\s[^>]*)?>)([^<]*)(<\/w:t>)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(paraXml)) !== null) {
    wtElements.push({
      fullStart: m.index,
      fullEnd: re.lastIndex,
      openTag: m[1],
      text: m[2],
    })
  }

  if (wtElements.length === 0) return paraXml

  const combined = wtElements.map((w) => w.text).join('')
  if (!combined.includes('{{')) return paraXml

  const charPart: number[] = []
  const charOffset: number[] = []
  wtElements.forEach((w, i) => {
    for (let c = 0; c < w.text.length; c++) {
      charPart.push(i)
      charOffset.push(c)
    }
  })

  type TagMatch = { start: number; end: number; normalized: string }
  const tagMatches: TagMatch[] = []
  const tagRe = /\{\{([\s\S]*?)\}\}/g
  let tm: RegExpExecArray | null
  while ((tm = tagRe.exec(combined)) !== null) {
    const inner = tm[1].trim().replace(/\s+/g, ' ')
    const renamed = TEMPLATE_TAG_RENAMES[inner.toLowerCase()] ?? inner
    tagMatches.push({
      start: tm.index,
      end: tm.index + tm[0].length - 1,
      normalized: `{{${renamed}}}`,
    })
  }

  if (tagMatches.length === 0) return paraXml

  const texts = wtElements.map((w) => w.text)

  for (const tag of [...tagMatches].reverse()) {
    const si = charPart[tag.start]
    const ei = charPart[tag.end]
    if (si === undefined || ei === undefined) continue

    const so = charOffset[tag.start]
    const eo = charOffset[tag.end]

    if (si === ei) {
      texts[si] = texts[si].slice(0, so) + tag.normalized + texts[si].slice(eo + 1)
    } else {
      texts[si] = texts[si].slice(0, so) + tag.normalized
      texts[ei] = texts[ei].slice(eo + 1)
      for (let i = si + 1; i < ei; i++) texts[i] = ''
    }
  }

  let result = paraXml
  for (let i = wtElements.length - 1; i >= 0; i--) {
    const w = wtElements[i]
    result = result.slice(0, w.fullStart) + w.openTag + texts[i] + '</w:t>' + result.slice(w.fullEnd)
  }

  return result
}

function fmtCOP(value: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(value)
}

function getTemplatePath(tipo: TipoFormato): string {
  const fileName = tipo === 'lista-asistencia'
    ? 'FORMATO ASISTENCIA.docx'
    : 'FORMATO RECIBO SATISFACION.docx'

  // Buena práctica: plantillas en logistica-app/templates/
  return path.join(process.cwd(), 'templates', fileName)
}

function getDireccionTerritorial(actividad: InformeActividad): string {
  const dep = actividad.departamento?.trim()
  const mun = actividad.municipio?.trim()

  if (dep && mun) return `${dep} - ${mun}`
  if (dep) return dep
  if (mun) return mun
  return ''
}

function buildData(body: GenerarFormatoBody) {
  const { actividad, reembolsos = [] } = body
  const montoReembolsoDeclarado = reembolsos.reduce((sum, r) => sum + Number(r.precio_total ?? 0), 0)

  return {
    numero_requerimiento: actividad.numero_requerimiento ?? '',
    departamento: actividad.departamento ?? '',
    municipio: actividad.municipio ?? '',
    responsable_nombre: actividad.responsable_nombre ?? '',
    direccion_territorial: getDireccionTerritorial(actividad),
    monto_reembolso_declarado: fmtCOP(montoReembolsoDeclarado),
  }
}

export async function POST(req: NextRequest) {
  const correlationId = req.headers.get('x-correlation-id') ?? crypto.randomUUID()
  const log = getLogger('generar-formato')

  // Extraer userId si está autenticado
  let userId = 'anonymous'
  try {
    const sb = await createClient()
    const { data: { user } } = await sb.auth.getUser()
    userId = user?.id ?? 'anonymous'
  } catch {
    // Silenciosamente, si no se puede autenticar, userId queda como 'anonymous'
  }

  let body: GenerarFormatoBody

  try {
    body = await req.json() as GenerarFormatoBody
  } catch {
    log.warn({
      correlationId,
      userId,
      operation: 'generar-formato',
      errorCode: 'VALIDATION_ERROR',
    }, 'Body inválido en request')
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
  }

  if (!body?.actividad?.id || !body?.tipo) {
    return NextResponse.json({ error: 'Faltan datos requeridos para generar el formato' }, { status: 400 })
  }

  if (body.tipo !== 'lista-asistencia' && body.tipo !== 'recibo-satisfaccion') {
    return NextResponse.json({ error: 'Tipo de formato no soportado' }, { status: 400 })
  }

  const templatePath = getTemplatePath(body.tipo)
  if (!fs.existsSync(templatePath)) {
    return NextResponse.json(
      { error: `Plantilla no encontrada en: ${templatePath}` },
      { status: 404 },
    )
  }

  try {
    const content = fs.readFileSync(templatePath)
    const zip = new PizZip(content)

    const xmlFilePattern = /^word\/(document|header\d*|footer\d*|endnotes|footnotes).*\.xml$/
    for (const filename of Object.keys(zip.files)) {
      if (!xmlFilePattern.test(filename)) continue
      const original = zip.files[filename].asText()
      const fixed = fixAndNormalizeTemplateTags(original)
      if (fixed !== original) zip.file(filename, fixed)
    }

    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      delimiters: { start: '{{', end: '}}' },
      parser: (tag: string) => ({
        get(scope: Record<string, unknown>) {
          const key = tag.trim()
          const val = scope[key]
          return val !== undefined && val !== null ? val : ''
        },
      }),
      nullGetter: () => '',
    })

    doc.render(buildData(body))

    const buf = doc.getZip().generate({
      type: 'nodebuffer',
      compression: 'DEFLATE',
    })

    const reqNumber = (body.actividad.numero_requerimiento ?? '').trim() || 'SIN_NUMERO_REQUERIMIENTO'
    const baseNameDocx = body.tipo === 'lista-asistencia'
      ? `DOCUMENTOS ${reqNumber}`
      : `RECIBO DE SATIFACCION ${reqNumber}`

    // ── Intentar conversión DOCX → PDF via CloudConvert ────────────────────
    const apiKeyAvailable = Boolean(process.env.CLOUDCONVERT_API_KEY?.trim())

    if (apiKeyAvailable) {
      try {
        const converter = getDocumentConverterService()
        const { pdfBuffer } = await converter.convertDocxToPdf({
          docxBuffer: buf,
          fileName: `${baseNameDocx}.docx`,
        })

        log.info({
          correlationId,
          userId,
          operation: 'generar-formato',
          metadata: { tipo: body.tipo, conversión: 'success', formato: 'PDF' },
        }, 'Documento convertido a PDF exitosamente')

        const pdfName = `${baseNameDocx}.pdf`
        return new NextResponse(pdfBuffer as unknown as BodyInit, {
          status: 200,
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(pdfName)}`,
            'Cache-Control': 'no-store',
            'X-Conversion-Status': 'pdf_ok',
            'x-correlation-id': correlationId,
          },
        })
      } catch (err) {
        const convErr = err instanceof DocumentConversionError ? err : null
        const code = convErr?.errorCode ?? 'ERR_UNKNOWN'

        log.warn({
          correlationId,
          userId,
          operation: 'generar-formato',
          errorCode: code as any,
          metadata: {
            stage: 'pdf_conversion',
            provider: convErr?.provider ?? 'unknown',
            isQuotaExceeded: convErr?.isQuotaExceeded?.(),
            fallback: 'DOCX',
          },
        }, `Conversión PDF fallida (${code}), aplicando fallback DOCX`)

        // Devolver DOCX con header indicando el motivo del fallback
        const docxName = `${baseNameDocx}.docx`
        return new NextResponse(buf as unknown as BodyInit, {
          status: 200,
          headers: {
            'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(docxName)}`,
            'Cache-Control': 'no-store',
            'X-Conversion-Status': code,
            'x-correlation-id': correlationId,
          },
        })
      }
    }

    // ── Sin API key configurada → entregar DOCX directamente ──────────────
    log.info({
      correlationId,
      userId,
      operation: 'generar-formato',
      metadata: { tipo: body.tipo, formato: 'DOCX', reason: 'no_api_key' },
    }, 'API key no configurada, entregando DOCX')

    const docxName = `${baseNameDocx}.docx`
    return new NextResponse(buf as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(docxName)}`,
        'Cache-Control': 'no-store',
        'X-Conversion-Status': 'no_api_key',
        'x-correlation-id': correlationId,
      },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    log.error({
      correlationId,
      userId,
      operation: 'generar-formato',
      errorCode: 'UNEXPECTED_ERROR',
      metadata: { error: msg },
    }, err, 'Error procesando plantilla')
    return NextResponse.json({ error: `Error procesando plantilla: ${msg}`, correlationId }, { status: 500 })
  }
}
