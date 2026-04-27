import fs from 'fs'
import path from 'path'
import PizZip from 'pizzip'
import Docxtemplater from 'docxtemplater'
import type { IDocumentGenerator, DocumentoGenerado } from '@/src/core/domain/ports/IDocumentGenerator'
import type { DatosCotizacionDocumento } from '@/src/types/domain'

// ============================================================
// WordTemplateAdapter
//
// Implementa IDocumentGenerator usando docxtemplater + PizZip.
// Lee la plantilla DOCX desde el sistema de ficheros en cada
// llamada (Next.js invalida el módulo entre requests en dev).
//
// Responsabilidad de este adaptador:
//   1. Leer la plantilla desde disco.
//   2. Reparar etiquetas {{tag}} fragmentadas por Word.
//   3. Mapear DatosCotizacionDocumento → variables del template.
//   4. Renderizar y devolver el buffer DOCX.
// ============================================================

// ---------------------------------------------------------------
// Reparación de etiquetas fragmentadas
//
// Word divide las marcas en múltiples <w:r>/<w:t> por corrección
// ortográfica o cambios de formato. Se trabaja párrafo a párrafo.
// ---------------------------------------------------------------

const TEMPLATE_TAG_RENAMES: Record<string, string> = {
  'total de servicios con margen':                                       'subtotal_servicios',
  'reembolso de transporte':                                             'concepto_transporte',
  'precio_total de reembolsos sin inhumacion':                           'total_reembolsos_sin_inhumacion',
  'servicios de inhumacion':                                             'concepto_inhumacion',
  'cantidad_de inhumaciones':                                            'cantidad_inhumaciones',
  'precio total de inhumaciones':                                        'total_inhumaciones',
  'precio_total de reembolsos con inhumaciones':                         'total_reembolsos_con_inhumaciones',
  'precio total de servicios con margen mas reembolsos beneficiarios':   'gran_total',
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
    wtElements.push({ fullStart: m.index, fullEnd: re.lastIndex, openTag: m[1], text: m[2] })
  }
  if (wtElements.length === 0) return paraXml

  const combined = wtElements.map((w) => w.text).join('')
  if (!combined.includes('{{')) return paraXml

  const charPart: number[]   = []
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
    const inner   = tm[1].trim().replace(/\s+/g, ' ')
    const renamed = TEMPLATE_TAG_RENAMES[inner.toLowerCase()] ?? inner
    tagMatches.push({ start: tm.index, end: tm.index + tm[0].length - 1, normalized: `{{${renamed}}}` })
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

// ---------------------------------------------------------------
// Formateadores
// ---------------------------------------------------------------

function fmt(n: number): string {
  return new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(n)
}

function fmtDate(isoString: string): string {
  const d = new Date(isoString.includes('T') ? isoString : isoString + 'T00:00')
  return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' })
}

// ---------------------------------------------------------------
// Adaptador
// ---------------------------------------------------------------

export class WordTemplateAdapter implements IDocumentGenerator {
  /**
   * @param templatePath - Ruta absoluta al archivo .docx de plantilla.
   *   Por defecto: `<cwd>/../PLANTILLA COTIZACION.docx` (raíz del repo).
   */
  constructor(
    private readonly templatePath: string = path.join(
      process.cwd(),
      '..',
      'PLANTILLA COTIZACION.docx'
    )
  ) {}

  async generarCotizacion(datos: DatosCotizacionDocumento): Promise<DocumentoGenerado> {
    // 1. Leer plantilla
    if (!fs.existsSync(this.templatePath)) {
      throw new Error(`[WordTemplateAdapter] Plantilla no encontrada: ${this.templatePath}`)
    }
    const content = fs.readFileSync(this.templatePath)
    const zip     = new PizZip(content)

    // 2. Reparar y normalizar etiquetas en todos los XML del documento
    const xmlFilePattern = /^word\/(document|header\d*|footer\d*|endnotes|footnotes).*\.xml$/
    for (const filename of Object.keys(zip.files)) {
      if (!xmlFilePattern.test(filename)) continue
      const original = zip.files[filename].asText()
      const fixed    = fixAndNormalizeTemplateTags(original)
      if (fixed !== original) zip.file(filename, fixed)
    }

    // 3. Calcular totales a partir de los ítems de dominio
    const itemsServicio   = datos.items.filter((i) => !i.esPassthrough)
    const subtotalServ    = itemsServicio.reduce((s, i) => s + i.precioTotal, 0)
    const inhumaciones    = datos.items.filter((i) =>
      i.categoria?.toLowerCase().includes('inhumacion') ||
      i.categoria?.toLowerCase().includes('inhumación')
    )
    const totalInhumaciones   = inhumaciones.reduce((s, i) => s + i.precioTotal, 0)
    const cantidadInhumaciones = inhumaciones.reduce((s, i) => s + i.cantidad, 0)

    const totalReembolsosSinInhumacion =
      datos.reembolsos.reduce(
        (s, r) => s + r.valorTransporte + r.valorAlojamiento + r.valorAlimentacion + r.valorOtros,
        0
      )
    const totalReembolsosConInhumaciones = totalReembolsosSinInhumacion + totalInhumaciones

    // 4. Construir datos del template
    const docData = {
      created_at:           fmtDate(datos.fechaGeneracion),
      fecha_inicio:         datos.encabezado.fechaInicio ? fmtDate(datos.encabezado.fechaInicio) : '',
      numero_requerimiento: datos.encabezado.numeroRequerimiento,
      municipio:            datos.encabezado.municipio,
      departamento:         datos.encabezado.departamento,

      // Tabla 1: loop {{#items}}…{{/items}} (solo ítems con margen)
      items: itemsServicio.map((i) => ({
        descripcion:     i.descripcion,
        cantidad:        String(i.cantidad),
        precio_unitario: fmt(i.precioUnitario),
        precio_total:    fmt(i.precioTotal),
      })),

      subtotal_servicios: fmt(subtotalServ),

      // Tabla 2: reembolsos y otros cargos estáticos
      concepto_transporte:               'Reembolso de transporte',
      total_reembolsos_sin_inhumacion:   fmt(totalReembolsosSinInhumacion),
      concepto_inhumacion:               'Servicios de inhumación',
      cantidad_inhumaciones:             String(cantidadInhumaciones),
      precio_unitario_inhumacion:        fmt(cantidadInhumaciones > 0 ? totalInhumaciones / cantidadInhumaciones : 0),
      total_inhumaciones:                fmt(totalInhumaciones),
      total_reembolsos_con_inhumaciones: fmt(totalReembolsosConInhumaciones),

      // Gran total
      gran_total: fmt(datos.totalGeneral),
    }

    // 5. Renderizar
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks:    true,
      delimiters:    { start: '{{', end: '}}' },
      parser: (tag: string) => ({
        get(scope: Record<string, unknown>) {
          const val = scope[tag.trim()]
          return val !== undefined && val !== null ? val : ''
        },
      }),
      nullGetter: () => '',
    })

    try {
      doc.render(docData)
    } catch (err: unknown) {
      const e = err as {
        properties?: { errors?: Array<{ properties?: { explanation?: string }; message: string }> }
      }
      const sub = e?.properties?.errors
      if (sub && sub.length > 0) {
        const detail = sub.map((x) => x.properties?.explanation ?? x.message).join('; ')
        throw new Error(`[WordTemplateAdapter] Errores en template: ${detail}`)
      }
      throw err
    }

    const buffer = doc.getZip().generate({
      type:        'arraybuffer',
      compression: 'DEFLATE',
    }) as ArrayBuffer

    const nombreArchivo =
      `COT-UV-${datos.encabezado.numeroRequerimiento ?? 'nueva'}-v${datos.version}.docx`
        .replace(/\s+/g, '-')

    return {
      buffer,
      nombreArchivo,
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    }
  }
}
