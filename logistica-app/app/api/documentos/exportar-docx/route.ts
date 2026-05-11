import { NextRequest, NextResponse } from 'next/server'
import HTMLtoDOCX from 'html-to-docx'

export const runtime = 'nodejs'

interface ExportarDocxBody {
  html: string
  nombreArchivo?: string
}

function envolverHtmlSiHaceFalta(html: string): string {
  const normalized = html.trim().toLowerCase()
  if (normalized.includes('<html') && normalized.includes('<body')) {
    return html
  }

  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <style>
      body { font-family: Calibri, Arial, sans-serif; line-height: 1.45; color: #111827; margin: 36px; }
      table { border-collapse: collapse; width: 100%; }
      th, td { border: 1px solid #d1d5db; padding: 8px; }
      h1, h2, h3 { color: #0f172a; }
    </style>
  </head>
  <body>${html}</body>
</html>`
}

export async function POST(req: NextRequest) {
  let body: ExportarDocxBody

  try {
    body = (await req.json()) as ExportarDocxBody
  } catch {
    return NextResponse.json({ error: 'Body inválido.' }, { status: 400 })
  }

  if (!body.html || !body.html.trim()) {
    return NextResponse.json({ error: 'El contenido HTML es obligatorio.' }, { status: 400 })
  }

  try {
    const fullHtml = envolverHtmlSiHaceFalta(body.html)

    const docxBuffer = await HTMLtoDOCX(fullHtml, null, {
      table: { row: { cantSplit: true } },
      pageNumber: true,
      footer: true,
    })

    const filename = encodeURIComponent(body.nombreArchivo || 'Documento.docx')

    return new NextResponse(docxBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename*=UTF-8''${filename}`,
      },
    })
  } catch (error) {
    console.error('[documentos/exportar-docx] Error:', error)
    return NextResponse.json({ error: 'No se pudo convertir el documento a Word.' }, { status: 500 })
  }
}
