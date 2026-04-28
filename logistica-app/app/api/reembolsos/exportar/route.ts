import { NextRequest, NextResponse } from 'next/server'
import { Reembolso } from '@/src/core/domain/entities/Reembolso'
import { getPdfGenerator, getActivityRepository } from '@/src/infrastructure/container'

export const runtime = 'nodejs'
import type { ReembolsoProps } from '@/src/core/domain/entities/Reembolso'
import { trace } from '@opentelemetry/api'

const tracer = trace.getTracer('reembolso-exportar')

// ============================================================
// POST /api/reembolsos/exportar
//
// Genera el documento XLSX de un reembolso individual llenando
// la plantilla Excel oficial con ExcelJS y lo retorna
// directamente sin necesidad de LibreOffice ni procesos externos.
//
// Body JSON esperado:
// {
//   reembolsoProps: ReembolsoProps,   // datos del reembolso
//   actividadId:   string,            // para cargar contexto
//   expedidoPor?:  string             // nombre del firmante
// }
//
// Respuesta:
//   200 application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
//       — binario del XLSX listo para descarga
//   400 — body inválido
//   404 — actividad no encontrada
//   500 — error de generación
// ============================================================

export async function POST(request: NextRequest) {
  let body: { reembolsoProps: ReembolsoProps; actividadId: string; expedidoPor?: string }

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Body JSON inválido.' }, { status: 400 })
  }

  const { reembolsoProps, actividadId, expedidoPor } = body

  if (!reembolsoProps || !actividadId) {
    return NextResponse.json(
      { error: 'Se requieren reembolsoProps y actividadId.' },
      { status: 400 },
    )
  }

  try {
    // Construir entidad (valida invariantes de dominio)
    const reembolso = new Reembolso(reembolsoProps)

    // Cargar contexto de la actividad
    const actividad = await getActivityRepository().obtenerPorId(actividadId)
    if (!actividad) {
      return NextResponse.json(
        { error: `Actividad '${actividadId}' no encontrada.` },
        { status: 404 },
      )
    }

    // Generar documento con traza de OTEL
    const documento = await tracer.startActiveSpan('generate_documento', async (span) => {
      try {
        const result = await getPdfGenerator().generateReembolsoPdf({
          reembolso,
          actividad: {
            id:                   actividad.id,
            numeroRequerimiento:  actividad.numeroRequerimiento,
            nombreActividad:      actividad.nombreActividad,
            municipio:            actividad.municipio,
            fechaInicio:          actividad.fechaInicio,
          },
          expedidoPor: expedidoPor ?? 'Coordinador Logístico',
        })
        span.setStatus({ code: 1 }) // OK
        return result
      } catch (err: unknown) {
        span.recordException(err instanceof Error ? err : new Error(String(err)))
        span.setStatus({ code: 2, message: err instanceof Error ? err.message : String(err) }) // ERROR
        throw err
      } finally {
        span.end()
      }
    })

    return new NextResponse(documento.buffer, {
      status: 200,
      headers: {
        'Content-Type':        documento.mimeType,
        'Content-Disposition': `attachment; filename="${documento.nombreArchivo}"`,
        'Cache-Control':       'no-store',
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido'
    console.error('[/api/reembolsos/exportar]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
