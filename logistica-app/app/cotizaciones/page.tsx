import Link from 'next/link'
import { FileUp, FileText, ChevronRight, Activity } from 'lucide-react'
import { listarRequerimientosConCotizaciones } from '@/actions/cotizaciones'

export const dynamic = 'force-dynamic'

export default async function CotizacionesListPage() {
  const list = await listarRequerimientosConCotizaciones()

  const fmt = (n: number) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n)

  return (
    <div className="min-h-screen [background:var(--background)] p-4 sm:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black tracking-tight [color:var(--text-primary)]">Cotizaciones</h1>
            <p className="text-sm [color:var(--text-secondary)] mt-1">Gestión y versionado de cotizaciones logísticas.</p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="btn-secondary px-4 py-2 rounded-xl text-sm font-bold transition-colors"
            >
              Volver
            </Link>
            <Link
              href="/cotizaciones/nueva"
              className="btn-primary flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-colors"
            >
              <FileUp className="size-4" />
              Nueva
            </Link>
          </div>
        </div>

        {/* List */}
        <div className="glass-panel rounded-3xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="border-b border-white/5 text-xs uppercase [color:var(--text-muted)] font-bold">
                <tr>
                  <th className="px-6 py-4">Requerimiento</th>
                  <th className="px-6 py-4">Ubicación</th>
                  <th className="px-6 py-4">Estado (Req)</th>
                  <th className="px-6 py-4">Cotización Actual</th>
                  <th className="px-6 py-4 text-right">Monto</th>
                  <th className="px-6 py-4"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {list.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center [color:var(--text-muted)]">
                      No hay cotizaciones registradas.
                    </td>
                  </tr>
                ) : (
                  list.map((item) => (
                    <tr key={item.id} className="hover:bg-white/5 transition-colors group">
                      <td className="px-6 py-4">
                        <p className="font-bold [color:var(--text-primary)]">{item.numero}</p>
                        <p className="text-xs [color:var(--text-muted)] truncate max-w-[250px]">{item.nombre}</p>
                      </td>
                      <td className="px-6 py-4">
                        <p className="font-medium [color:var(--text-primary)]">{item.municipio}</p>
                        <p className="text-xs [color:var(--text-muted)]">{item.departamento}</p>
                      </td>
                      <td className="px-6 py-4">
                        <span className="pill-hold px-2.5 py-1 text-[10px] font-bold uppercase rounded-md">
                          {item.estadoReq}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <span className="pill-prep px-2 py-0.5 text-xs font-black rounded-md">
                            V{item.version}
                          </span>
                          <span className="text-xs [color:var(--text-secondary)] capitalize">{item.estadoCot}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right font-mono font-bold [color:var(--text-primary)]">
                        {fmt(item.total)}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Link
                          href={`/cotizaciones/${item.id}/editar`}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold btn-secondary rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                        >
                          Abrir
                          <ChevronRight className="size-3.5" />
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  )
}
