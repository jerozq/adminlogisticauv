import { NextResponse } from 'next/server'
import { cargarCotizacion } from '@/actions/cotizaciones'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ versionId: string }> }
) {
  const { versionId } = await params

  const data = await cargarCotizacion(versionId)

  if (!data.ok) {
    return NextResponse.json(
      { ok: false, error: 'No se encontró la versión solicitada.' },
      { status: 404 },
    )
  }

  return NextResponse.json({
    ok: true,
    encabezado: {
      numeroRequerimiento: data.encabezado.numeroRequerimiento,
      nombreActividad: data.encabezado.nombreActividad,
      municipio: data.encabezado.municipio,
      departamento: data.encabezado.departamento,
      fechaInicio: data.encabezado.fechaInicio,
      fechaFin: data.encabezado.fechaFin,
      horaInicio: data.encabezado.horaInicio,
      horaFin: data.encabezado.horaFin,
      responsableNombre: data.encabezado.responsableNombre,
    },
    items: data.items.map((item) => ({
      descripcion: item.descripcion,
      cantidad: item.cantidad,
      precioUnitario: item.precioUnitario,
    })),
  })
}
