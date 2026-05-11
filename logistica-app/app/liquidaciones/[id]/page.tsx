import { getLiquidacionDetalle, listarSoportes, obtenerInsightsRetenciones } from '@/actions/liquidaciones'
import { listarCuentas } from '@/actions/tesoreria'
import { PageHeader } from '@/components/PageHeader'
import { LiquidacionDashboard } from '@/components/liquidaciones/LiquidacionDashboard'
import { notFound } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function LiquidacionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const [detalle, insights, soportes] = await Promise.all([
    getLiquidacionDetalle(id),
    obtenerInsightsRetenciones(),
    listarSoportes(id),
  ])
  const cuentas = await listarCuentas().catch(() => [])

  if (!detalle.actividad) {
    notFound()
  }

  return (
    <div className="min-h-screen">
      <PageHeader
        title={`Liquidación: ${detalle.actividad.numero_requerimiento || 'S/N'}`}
        breadcrumbs={[
          { label: 'Inicio', href: '/' },
          { label: 'Liquidaciones', href: '/liquidaciones' },
          { label: 'Auditora', href: `/liquidaciones/${id}` },
        ]}
      />
      <main className="max-w-6xl mx-auto px-4 py-8">
        <LiquidacionDashboard detalle={detalle} actividadId={id} insights={insights} soportes={soportes} cuentas={cuentas} />
      </main>
    </div>
  )
}
