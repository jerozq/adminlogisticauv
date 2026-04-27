import Link from 'next/link'
import { ArrowLeft, CheckCircle, XCircle, Clock, Activity } from 'lucide-react'
import type { HealthReport, ServiceStatus } from '@/app/api/health/route'

// ============================================================
// Dashboard de Salud — /dashboard/health
//
// Server Component: consulta los servicios de infraestructura
// en el momento del render y muestra su estado actual.
// Actualiza al hacer refresh manual (no hay polling en cliente).
// ============================================================

import { getHealthCheckAdapter } from '@/src/infrastructure/adapters/HealthCheckAdapter'

export const dynamic = 'force-dynamic'

async function fetchHealth(): Promise<HealthReport> {
  const adapter = getHealthCheckAdapter()
  return adapter.fetchHealth()
}

// ---------------------------------------------------------------
// Componente de tarjeta de servicio
// ---------------------------------------------------------------

function ServiceCard({
  name,
  service,
}: {
  name: string
  service: ServiceStatus
}) {
  return (
    <div className="bg-white rounded-2xl ring-1 ring-zinc-200 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-zinc-900 text-sm">{name}</p>
          {service.error && (
            <p className="text-xs text-red-500 mt-1 break-words">{service.error}</p>
          )}
        </div>

        {service.ok ? (
          <CheckCircle strokeWidth={1.5} className="size-5 text-green-500 shrink-0" />
        ) : (
          <XCircle strokeWidth={1.5} className="size-5 text-red-500 shrink-0" />
        )}
      </div>

      <div className="mt-3 flex items-center gap-1.5 text-xs text-zinc-500">
        <Clock strokeWidth={1.5} className="size-3.5" />
        <span>{service.latencyMs} ms</span>
        <span
          className={`ml-auto font-medium px-2 py-0.5 rounded-full text-xs ${
            service.ok
              ? 'bg-green-50 text-green-700'
              : 'bg-red-50 text-red-600'
          }`}
        >
          {service.ok ? 'Operativo' : 'Fallo'}
        </span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------
// Page
// ---------------------------------------------------------------

export default async function HealthPage() {
  const report = await fetchHealth()

  const ts = new Date(report.timestamp).toLocaleString('es-CO', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })

  return (
    <div className="min-h-screen bg-zinc-50">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white border-b border-zinc-200 px-4 py-3">
        <div className="max-w-xl mx-auto flex items-center gap-3">
          <Link
            href="/"
            className="p-2 -ml-2 rounded-xl hover:bg-zinc-100 transition-colors"
            aria-label="Volver al inicio"
          >
            <ArrowLeft strokeWidth={1.5} className="size-5 text-zinc-600" />
          </Link>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <Activity strokeWidth={1.5} className="size-4 text-zinc-400" />
              <h1 className="font-bold text-zinc-900 text-sm">Estado del Sistema</h1>
            </div>
            <p className="text-xs text-zinc-400">Actualizado: {ts}</p>
          </div>

          {/* Badge general */}
          <span
            className={`text-xs font-semibold px-3 py-1.5 rounded-full ${
              report.status === 'healthy'
                ? 'bg-green-50 text-green-700'
                : 'bg-amber-50 text-amber-700'
            }`}
          >
            {report.status === 'healthy' ? 'Todos OK' : 'Degradado'}
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-xl mx-auto px-4 py-6 flex flex-col gap-4">
        <p className="text-xs text-zinc-400 uppercase tracking-wide font-medium">
          Servicios de Infraestructura
        </p>

        <ServiceCard name="Base de Datos (Supabase)" service={report.services.database} />
        <ServiceCard name="Almacenamiento (Storage)" service={report.services.storage} />

        <p className="text-xs text-zinc-400 text-center mt-4">
          Recarga la página para verificar el estado actual.
        </p>
      </div>
    </div>
  )
}
