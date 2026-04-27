import { NextRequest, NextResponse } from 'next/server'
import { makeGetFinancialSummaryWithAudit } from '@/src/infrastructure/container'

export const runtime = 'nodejs'
import { getFinancialExporter } from '@/src/infrastructure/adapters/FinancialExportAdapter'
import type { DatosExportacionFinanciero } from '@/src/core/domain/ports/IFinancialExporter'
import type { GetFinancialSummaryFilters } from '@/src/core/application/use-cases/GetFinancialSummary'
import { getLogger } from '@/src/infrastructure/observability/logger'

const log = getLogger('api.finanzas.exportar')

// ============================================================
// POST /api/dashboard/finanzas/exportar
//
// Genera y devuelve un archivo Excel del reporte financiero.
//
// Body (JSON, opcional):
//   {
//     filtros?: GetFinancialSummaryFilters,
//     nombreUsuario?: string
//   }
//
// Headers:
//   x-user-id — ID del usuario autenticado (para auditoría).
//               Si no se envía, se usa 'anonymous'.
//
// Respuesta exitosa:
//   200  application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
//   Content-Disposition: attachment; filename="reporte-financiero-YYYY-MM-DD.xlsx"
//
// Respuesta de error:
//   400  { error: string }  — body malformado
//   500  { error: string }  — fallo interno al generar el reporte
//
// Auditoría:
//   Pino registra el acceso con userId + filtros + tamaño del
//   archivo generado. El SupabaseFinancialAdapter añade un
//   segundo log al leer datos de la DB.
// ============================================================

export async function POST(req: NextRequest): Promise<NextResponse> {
  // ── Extraer identidad del usuario ─────────────────────────
  const userId       = req.headers.get('x-user-id') ?? 'anonymous'
  const generadoEn   = new Date().toISOString()

  let filters: GetFinancialSummaryFilters = {}
  let nombreUsuario: string | undefined

  try {
    const body     = await req.json()
    filters        = (body?.filtros as GetFinancialSummaryFilters) ?? {}
    nombreUsuario  = typeof body?.nombreUsuario === 'string' ? body.nombreUsuario : undefined
  } catch {
    // Body ausente o no es JSON válido — usar filtros vacíos (aceptable)
  }

  log.info(
    {
      userId,
      nombreUsuario:    nombreUsuario ?? 'desconocido',
      filtros:          filters,
      operation:        'exportarFinanciero',
      accesoFinanciero: true,
      timestamp:        generadoEn,
    },
    '[Auditoría] Solicitud de exportación financiera recibida',
  )

  try {
    // ── Ejecutar caso de uso con el adaptador optimizado ──────
    const output = await makeGetFinancialSummaryWithAudit(userId).execute(filters, userId)

    // ── Construir payload para el exporter ────────────────────
    const datos: DatosExportacionFinanciero = {
      kpis: {
        totalCotizado:       output.totalCotizado,
        totalGastoReal:      output.totalGastoReal,
        totalReembolsos:     output.totalReembolsos,
        utilidadBruta:       output.utilidadBruta,
        utilidadNeta:        output.utilidadNeta,
        dineroEnCaja:        output.dineroEnCaja,
        utilidadPorCobrar:   output.utilidadPorCobrar,
        cantidadActividades: output.cantidadActividades,
      },
      agregadosPorMes:    output.agregadosPorMes,
      agregadosPorSocio:  output.agregadosPorSocio,
      agregadosPorFuente: output.agregadosPorFuente,
      balancesDetalle:    output.balancesDetalle,
    }

    // ── Generar Excel ─────────────────────────────────────────
    const archivo = await getFinancialExporter().exportarResumenDashboard(datos, {
      userId,
      nombreUsuario,
      generadoEn,
      filtrosAplicados: filters,
      titulo: 'Reporte Financiero — Admin Logística UV',
    })

    return new NextResponse(archivo.buffer as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type':        archivo.contentType,
        'Content-Disposition': `attachment; filename="${archivo.filename}"`,
        // No cachear datos financieros sensibles
        'Cache-Control':       'no-store, no-cache, must-revalidate',
        'Pragma':              'no-cache',
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error interno al generar el reporte.'

    log.error(
      {
        userId,
        filtros:          filters,
        operation:        'exportarFinanciero',
        accesoFinanciero: true,
        error:            message,
      },
      '[Auditoría] Fallo en exportación financiera',
    )

    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// Solo POST está permitido en este endpoint
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ error: 'Método no permitido. Use POST.' }, { status: 405 })
}
