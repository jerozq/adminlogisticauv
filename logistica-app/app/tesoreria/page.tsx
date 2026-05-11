import { PageHeader } from '@/components/PageHeader'
import { TesoreriaDashboard } from '@/components/tesoreria/TesoreriaDashboard'
import { listarCuentas, listarMovimientos, listarUsuarios, obtenerResumenDevolucionesUnidad } from '@/actions/tesoreria'

export const dynamic = 'force-dynamic'

export default async function TesoreriaPage() {
  const [cuentas, transacciones, usuarios, resumenDevoluciones] = await Promise.all([
    listarCuentas().catch(() => []),
    listarMovimientos({ limit: 150 }).catch(() => []),
    listarUsuarios().catch(() => []),
    obtenerResumenDevolucionesUnidad().catch(() => ({ deudaPendienteUnidad: 0, totalDevuelto: 0, totalMovimientosDevolucion: 0 })),
  ])

  return (
    <div className="min-h-screen">
      <PageHeader
        title="Tesorería UV"
        breadcrumbs={[
          { label: 'Inicio', href: '/' },
          { label: 'Tesorería', href: '/tesoreria' },
        ]}
      />
      <main className="max-w-7xl mx-auto px-4 py-8">
        <TesoreriaDashboard
          cuentas={cuentas}
          transacciones={transacciones}
          usuarios={usuarios}
          resumenDevoluciones={resumenDevoluciones}
        />
      </main>
    </div>
  )
}
