import { NextRequest, NextResponse } from 'next/server'
import Docxtemplater from 'docxtemplater'
import PizZip from 'pizzip'
import path from 'path'
import fs from 'fs'

// ============================================================
// Etiquetas del template Word → nombres snake_case uniformes
// Se aplica durante el preprocesado del XML antes de docxtemplater.
// ============================================================
// Las etiquetas del template ya están normalizadas a snake_case.
// Este mapa solo actúa como red de seguridad por si se reedita el .docx en Word
// y este re-fragmenta alguna etiqueta.
const TEMPLATE_TAG_RENAMES: Record<string, string> = {
  'total de servicios con margen':                              'subtotal_servicios',
  'reembolso de transporte':                                    'concepto_transporte',
  'precio_total de reembolsos sin inhumacion':                  'total_reembolsos_sin_inhumacion',
  'servicios de inhumacion':                                    'concepto_inhumacion',
  'cantidad_de inhumaciones':                                   'cantidad_inhumaciones',
  'precio total de inhumaciones':                               'total_inhumaciones',
  'precio_total de reembolsos con inhumaciones':                'total_reembolsos_con_inhumaciones',
  'precio total de servicios con margen mas reembolsos beneficiarios': 'gran_total',
}

/**
 * Preprocesa el XML del DOCX para reparar etiquetas {{tag}} fragmentadas.
 *
 * Word divide las marcas en múltiples <w:r>/<w:t> runs por corrección
 * ortográfica, cambios de formato, etc. La estrategia correcta es trabajar
 * a nivel de párrafo <w:p>: extraer el texto concatenado de TODOS los <w:t>
 * del párrafo (sin insertar espacios entre runs), detectar patrones {{...}},
 * normalizar los nombres, y reconstruir el XML de fin a inicio para no
 * invalidar posiciones absolutas.
 */
function fixAndNormalizeTemplateTags(xml: string): string {
  return xml.replace(/<w:p[\s>][\s\S]*?<\/w:p>/g, fixParagraph)
}

function fixParagraph(paraXml: string): string {
  // 1. Extraer todos los <w:t>...</w:t> con sus posiciones absolutas en paraXml
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

  // 2. Concatenar textos SIN añadir espacios entre runs
  const combined = wtElements.map((w) => w.text).join('')
  if (!combined.includes('{{')) return paraXml

  // 3. Mapeo posición-en-combined → (índice de wtElement, offset dentro del texto)
  const charPart: number[] = []
  const charOffset: number[] = []
  wtElements.forEach((w, i) => {
    for (let c = 0; c < w.text.length; c++) {
      charPart.push(i)
      charOffset.push(c)
    }
  })

  // 4. Detectar todas las marcas {{...}} en el texto concatenado
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

  // 5. Actualizar los textos de los wtElements (en orden inverso)
  const texts = wtElements.map((w) => w.text)

  for (const tag of [...tagMatches].reverse()) {
    const si = charPart[tag.start]
    const ei = charPart[tag.end]
    if (si === undefined || ei === undefined) continue

    const so = charOffset[tag.start]
    const eo = charOffset[tag.end]
    const before = texts[si].slice(0, so)
    const after = texts[ei].slice(eo + 1)

    if (si === ei) {
      texts[si] = before + tag.normalized + after
    } else {
      texts[si] = before + tag.normalized
      texts[ei] = after
      for (let i = si + 1; i < ei; i++) texts[i] = ''
    }
  }

  // 6. Reconstruir el XML de fin a inicio (para no desplazar posiciones)
  let result = paraXml
  for (let i = wtElements.length - 1; i >= 0; i--) {
    const w = wtElements[i]
    result = result.slice(0, w.fullStart) + w.openTag + texts[i] + '</w:t>' + result.slice(w.fullEnd)
  }

  return result
}

// ============================================================
// Formateador colombiano
// ============================================================
function fmt(n: number | string | null | undefined): string {
  const num = typeof n === 'string' ? parseFloat(n) : (n ?? 0)
  if (isNaN(num)) return '0'
  return new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(num)
}

// ============================================================
// Tipos del body
// ============================================================
interface ItemExport {
  descripcion: string
  cantidad: number
  precio_unitario: number
  es_passthrough?: boolean
}

interface TotalsExport {
  subtotal_servicios: number
  total_reembolsos_sin_inhumacion: number
  total_inhumaciones: number
  cantidad_inhumaciones: number
  total_reembolsos_con_inhumaciones: number
  gran_total: number
}

interface RequerimientoExport {
  fecha_inicio: string | null
  numero_requerimiento: string | null
  municipio: string | null
  departamento: string | null
}

interface GenerarCotizacionBody {
  requerimiento: RequerimientoExport
  items: ItemExport[]
  totals: TotalsExport
  cotizacion_fecha?: string | null
  nombreArchivo?: string
}

// ============================================================
// POST /api/generar-cotizacion
// ============================================================
export async function POST(req: NextRequest) {
  let body: GenerarCotizacionBody

  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
  }

  const { requerimiento, items, totals, cotizacion_fecha, nombreArchivo } = body

  const templatePath = path.join(process.cwd(), '..', 'PLANTILLA COTIZACION.docx')

  if (!fs.existsSync(templatePath)) {
    return NextResponse.json(
      { error: `Plantilla no encontrada en: ${templatePath}` },
      { status: 404 }
    )
  }

  try {
    const content = fs.readFileSync(templatePath)
    const zip = new PizZip(content)

    // Preprocesar todos los XML del documento para reparar y normalizar etiquetas
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
      // Con el preprocesado, las etiquetas ya son snake_case → resolución directa
      parser: (tag: string) => ({
        get(scope: Record<string, unknown>) {
          const key = tag.trim()
          const val = scope[key]
          return val !== undefined && val !== null ? val : ''
        },
      }),
      nullGetter: () => '',
    })

    const fmtDateDoc = (s: string | null | undefined) => {
      if (!s) return ''
      const d = new Date(s.includes('T') ? s : s + 'T00:00')
      return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' })
    }

    const precioUnitInhumacion =
      totals.cantidad_inhumaciones > 0
        ? totals.total_inhumaciones / totals.cantidad_inhumaciones
        : 0

    const docData = {
      // Encabezado
      created_at:            fmtDateDoc(cotizacion_fecha ?? new Date().toISOString()),
      fecha_inicio:          fmtDateDoc(requerimiento.fecha_inicio),
      numero_requerimiento:  requerimiento.numero_requerimiento ?? '',
      municipio:             requerimiento.municipio ?? '',
      departamento:          requerimiento.departamento ?? '',

      // Tabla 1: loop {{#items}}…{{/items}} - Incluimos todo por solicitud
      items: items.map((item) => ({
        descripcion:     item.descripcion,
        cantidad:        String(item.cantidad),
        precio_unitario: fmt(item.precio_unitario),
        precio_total:    fmt(item.cantidad * item.precio_unitario),
      })),

      // Subtotal tabla 1: ahora incluye inhumación para el cliente
      subtotal_servicios: fmt(totals.gran_total),

      // Tabla 2: reembolsos (Transporte fuera por solicitud)
      concepto_transporte:             '',
      total_reembolsos_sin_inhumacion: '',
      concepto_inhumacion:             'Servicios de inhumación',
      cantidad_inhumaciones:           String(totals.cantidad_inhumaciones),
      precio_unitario_inhumacion:      fmt(precioUnitInhumacion),
      total_inhumaciones:              fmt(totals.total_inhumaciones),
      total_reembolsos_con_inhumaciones: fmt(totals.total_reembolsos_con_inhumaciones),

      // Gran total: incluye todo para el cliente
      gran_total: fmt(totals.gran_total),
    }

    try {
      doc.render(docData)
    } catch (renderErr: unknown) {
      // docxtemplater "Multi error": múltiples errores de parsing en el template
      // Intentamos extraer detalle útil antes de relanzar
      const err = renderErr as { message?: string; properties?: { errors?: Array<{ message: string; properties?: { explanation?: string } }> } }
      const subErrors = err?.properties?.errors
      if (subErrors && subErrors.length > 0) {
        const detail = subErrors.map((e) => e.properties?.explanation ?? e.message).join('; ')
        console.error('[generar-cotizacion] Sub-errors:', JSON.stringify(subErrors, null, 2))
        throw new Error(`Errores en template: ${detail}`)
      }
      throw renderErr
    }

    const buf = doc.getZip().generate({
      type: 'nodebuffer',
      compression: 'DEFLATE',
    })

    const body = await req.clone().json().catch(() => ({}))
    const format = body.format || 'docx'
    
    let finalBuf = buf
    let contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    let ext = 'docx'

    if (format === 'pdf') {
      const fs = require('fs')
      const os = require('os')
      const path = require('path')
      const { execSync } = require('child_process')
      
      const tmpDir = os.tmpdir()
      const tmpBase = `cotizacion-${requerimiento.numero_requerimiento ?? 'tmp'}-${Date.now()}`
      const tmpDocx = path.join(tmpDir, `${tmpBase}.docx`)
      
      fs.writeFileSync(tmpDocx, buf)
      
      try {
        const paths = [
          process.env.LIBREOFFICE_PATH,
          'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
          'soffice',
        ].filter(Boolean) as string[]
        
        let libreOffice = 'soffice'
        for (const p of paths) {
          try {
            execSync(`"${p}" --version`, { stdio: 'ignore' })
            libreOffice = p
            break
          } catch {}
        }
        
        execSync(`"${libreOffice}" --headless --convert-to pdf "${tmpDocx}" --outdir "${tmpDir}"`, { timeout: 30000 })
        const tmpPdf = path.join(tmpDir, `${tmpBase}.pdf`)
        finalBuf = fs.readFileSync(tmpPdf)
        contentType = 'application/pdf'
        ext = 'pdf'
        fs.unlinkSync(tmpPdf)
      } finally {
        try { fs.unlinkSync(tmpDocx) } catch {}
      }
    }

    const filename = encodeURIComponent(
      nombreArchivo ?? `Cotizacion_${requerimiento.numero_requerimiento ?? 'nueva'}.${ext}`
    )

    return new NextResponse(finalBuf as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename*=UTF-8''${filename}`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[generar-cotizacion] Error:', msg)
    return NextResponse.json({ error: `Error procesando plantilla: ${msg}` }, { status: 500 })
  }
}
