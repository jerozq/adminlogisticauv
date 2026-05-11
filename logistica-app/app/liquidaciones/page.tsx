import { listarLiquidaciones } from '@/actions/liquidaciones'
import Link from 'next/link'
import { PageHeader } from '@/components/PageHeader'
import { FileSearch } from 'lucide-react'

export const dynamic = 'force-dynamic'

const COP = new Intl.NumberFormat('es-CO', {
  style: 'currency', currency: 'COP', maximumFractionDigits: 0,
})

export default async function LiquidacionesPage() {
  const liquidaciones = await listarLiquidaciones()

  return (
    <div className="min-h-screen">
      <PageHeader
        title="Auditora y Liquidaciones"
        breadcrumbs={[
          { label: 'Inicio', href: '/' },
          { label: 'Liquidaciones', href: '/liquidaciones' },
        ]}
      />

      <main className="max-w-6xl mx-auto px-4 py-8">
        <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-white/5 border-b border-white/10 text-xs uppercase text-slate-400">
                <tr>
                  <th className="px-6 py-4 font-semibold">Requerimiento</th>
                  <th className="px-6 py-4 font-semibold text-right">Cotizado</th>
                  <th className="px-6 py-4 font-semibold text-right">Abonado</th>
                  <th className="px-6 py-4 font-semibold text-right">Costos</th>
                  <th className="px-6 py-4 font-semibold text-right text-red-400">Devoluciones Pendientes</th>
                  <th className="px-6 py-4 font-semibold text-center">Estado</th>
                  <th className="px-6 py-4 font-semibold text-center">Accin</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {liquidaciones.map((liq) => (
                  <tr key={liq.id} className="hover:bg-white/5 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-semibold text-slate-200">{liq.numeroRequerimiento || 'S/N'}</div>
                      <div className="text-xs text-slate-400 line-clamp-1">{liq.municipio ?? '—'}</div>
                    </td>
                    <td className="px-6 py-4 text-right tabular-nums">{COP.format(liq.cotizado)}</td>
                    <td className="px-6 py-4 text-right tabular-nums text-emerald-400">{COP.format(liq.abonado)}</td>
                    <td className="px-6 py-4 text-right tabular-nums text-orange-400">{COP.format(liq.costosEjecutados)}</td>
                    <td className="px-6 py-4 text-right tabular-nums text-red-400">
                      {liq.devolucionesPendientes > 0 ? COP.format(liq.devolucionesPendientes) : '-'}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-white/10 text-slate-300">
                        {liq.estado}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <Link
                        href={`/liquidaciones/${liq.id}`}
                        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30 transition-colors"
                      >
                        <FileSearch className="w-4 h-4" />
                        Auditar
                      </Link>
                    </td>
                  </tr>
                ))}
                {liquidaciones.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-6 py-8 text-center text-slate-500">
                      No hay actividades para liquidar.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  )
}
