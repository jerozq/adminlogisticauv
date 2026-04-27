import Link from 'next/link'
import { ArrowLeft, BarChart3 } from 'lucide-react'
import { obtenerResumenFinanciero } from '@/actions/finanzas'
import { DashboardFinanciero } from '@/components/finanzas/DashboardFinanciero'

export const metadata = { title: 'Dashboard Financiero · Admin Logística UV' }

// Forzar renderizado dinámico (datos en tiempo real)
export const dynamic = 'force-dynamic'

export default async function FinanzasPage() {
  // Carga inicial sin filtros — el cliente refresca al cambiar filtros
  const datos = await obtenerResumenFinanciero({})

  return (
    <div className="min-h-screen [background:var(--background)]">
      {/* Header */}
      <div className="sticky top-0 z-10 glass-panel border-x-0 border-t-0 border-b px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center gap-3">
          <Link
            href="/"
            className="p-2 -ml-2 rounded-xl hover:[background:var(--surface)] transition-colors"
            aria-label="Volver al inicio"
          >
            <ArrowLeft strokeWidth={1.5} className="size-5 [color:var(--text-secondary)]" />
          </Link>

          <div className="flex items-center gap-2 flex-1 min-w-0">
            <BarChart3 strokeWidth={1.5} className="size-5 [color:var(--accent)] shrink-0" />
            <div>
              <h1 className="font-bold [color:var(--text-primary)] leading-none">Dashboard Financiero</h1>
              <p className="text-xs [color:var(--text-muted)] mt-0.5">
                {datos.cantidadActividades} actividad{datos.cantidadActividades !== 1 ? 'es' : ''}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        <DashboardFinanciero initialData={datos} />
      </div>
    </div>
  )
}
