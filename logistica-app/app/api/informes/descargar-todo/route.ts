import { NextRequest, NextResponse } from 'next/server'
import PizZip from 'pizzip'
import { obtenerInformeActividad } from '@/actions/informes'

export const runtime = 'nodejs'

function extensionDe(url: string): string {
  const limpia = url.split('?')[0]
  const ext = limpia.split('.').pop()
  return ext && ext.length <= 5 ? ext : 'pdf'
}

function slug(texto: string): string {
  return texto
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'documento'
}

async function agregarArchivo(zip: PizZip, nombre: string, url: string | null) {
  if (!url) return
  try {
    const res = await fetch(url)
    if (!res.ok) return
    const buffer = Buffer.from(await res.arrayBuffer())
    zip.file(nombre, buffer)
  } catch (err) {
    console.warn(`[descargar-todo] No se pudo descargar ${nombre}:`, err)
  }
}

export async function GET(req: NextRequest) {
  const actividadId = req.nextUrl.searchParams.get('actividadId')
  if (!actividadId) {
    return NextResponse.json({ error: 'Falta actividadId' }, { status: 400 })
  }

  const { actividad, reembolsos } = await obtenerInformeActividad(actividadId)
  if (!actividad) {
    return NextResponse.json({ error: 'Actividad no encontrada' }, { status: 404 })
  }

  const zip = new PizZip()
  const nombreBase = slug(actividad.nombre_actividad || actividad.numero_requerimiento || 'actividad')

  await Promise.all([
    agregarArchivo(zip, `1-RS.${extensionDe(actividad.recibo_satisfaccion_firmado_url ?? '')}`, actividad.recibo_satisfaccion_firmado_url),
    agregarArchivo(zip, `2-Asistencia.${extensionDe(actividad.lista_asistencia_firmada_url ?? '')}`, actividad.lista_asistencia_firmada_url),
    agregarArchivo(zip, `4-Evidencias.${extensionDe(actividad.informe_pdf3_url ?? '')}`, actividad.informe_pdf3_url),
    ...reembolsos.flatMap((r, i) => {
      const nombrePersona = slug(r.beneficiario_nombre || r.descripcion || `beneficiario-${i + 1}`)
      return [
        agregarArchivo(zip, `3-Reembolsos/${nombrePersona}-firmado.${extensionDe(r.reembolso_firmado_url ?? '')}`, r.reembolso_firmado_url),
        agregarArchivo(zip, `3-Reembolsos/${nombrePersona}-cedula.${extensionDe(r.cedula_url ?? '')}`, r.cedula_url),
      ]
    }),
  ])

  const archivosEnZip = Object.keys(zip.files).length
  if (archivosEnZip === 0) {
    return NextResponse.json({ error: 'No hay documentos subidos todavía para esta actividad.' }, { status: 400 })
  }

  const contenido = zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }) as Buffer

  return new NextResponse(new Uint8Array(contenido), {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="Informe-${nombreBase}.zip"`,
    },
  })
}
