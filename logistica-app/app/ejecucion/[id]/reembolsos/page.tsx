'use client'

import { useEffect, useState } from 'react'
import { getActividadBasica, listarCostos } from '@/actions/ejecucion'
import { ArrowLeft, Printer, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import type { EjecucionCostoConItem } from '@/types/ejecucion'
import type { ActividadBasica } from '@/actions/ejecucion'
import { DownloadPdfButton } from '@/components/reembolsos/DownloadPdfButton'

export default function ReembolsosPrintPage() {
  const { id } = useParams() as { id: string }
  const [actividad, setActividad] = useState<ActividadBasica | null>(null)
  const [costos, setCostos] = useState<EjecucionCostoConItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [resAct, resCostos] = await Promise.all([
        getActividadBasica(id),
        listarCostos(id)
      ])
      setActividad(resAct)
      setCostos(resCostos)
      setLoading(false)
    }
    load()
  }, [id])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center [background:var(--background)]">
        <Loader2 className="size-8 animate-spin [color:var(--text-muted)]" />
      </div>
    )
  }

  if (!actividad) return <div>No encontrada</div>

  // 3. Filtrar los que requieren reembolso (pagados por Jero o Socio, no por Caja Proyecto)
  const reembolsosJero = costos.filter(c => c.pagador === 'jero')
  const reembolsosSocio = costos.filter(c => c.pagador === 'socio')

  const totalJero = reembolsosJero.reduce((s, c) => s + c.monto, 0)
  const totalSocio = reembolsosSocio.reduce((s, c) => s + c.monto, 0)

  const fmt = (n: number) =>
    new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: 0,
    }).format(n)

  return (
    <div className="min-h-screen [background:var(--background)] p-4 sm:p-8 print:bg-white print:p-0">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Barra de herramientas (no se imprime) */}
        <div className="flex items-center justify-between glass-panel px-5 py-4 rounded-3xl print:hidden">
          <Link
            href={`/ejecucion/${id}`}
            className="flex items-center gap-2 text-sm font-semibold [color:var(--text-secondary)] hover:[color:var(--text-primary)] transition-colors"
          >
            <ArrowLeft className="size-4" />
            Volver
          </Link>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 px-4 py-2 btn-primary rounded-xl text-sm font-bold"
          >
            <Printer className="size-4" />
            Imprimir PDF
          </button>
        </div>

        {/* Documento de Reembolso */}
        <div className="glass-panel p-8 sm:p-12 rounded-3xl print:shadow-none print:border-none print:rounded-none min-h-[11in]">
          {/* Encabezado */}
          <div className="flex justify-between items-start border-b-2 [border-color:var(--surface-border)] pb-6 mb-8">
            <div>
              <h1 className="text-2xl font-black uppercase tracking-tighter [color:var(--text-primary)]">
                Resumen de Reembolsos
              </h1>
              <p className="[color:var(--text-secondary)] font-medium">{actividad.nombre_actividad}</p>
              <p className="text-xs [color:var(--text-muted)] mt-1">Ref: {actividad.numero_requerimiento}</p>
            </div>
            <div className="text-right">
              <p className="text-xs font-bold uppercase [color:var(--text-muted)]">Fecha Ejecución</p>
              <p className="font-bold [color:var(--text-primary)]">{actividad.fecha_inicio}</p>
            </div>
          </div>

          {/* Sección Jero */}
          {reembolsosJero.length > 0 && (
            <div className="mb-10">
              <h2 className="text-sm font-black uppercase mb-4 [color:var(--state-prep-fg)] border-l-4 [border-color:var(--state-prep-dot)] pl-3">
                Reembolsos para Jero
              </h2>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b [border-color:var(--surface-border)] [color:var(--text-muted)] font-bold text-[11px] uppercase tracking-wider">
                    <th className="py-3 text-left">Concepto</th>
                    <th className="py-3 text-right">Monto</th>
                    <th className="py-3 text-center w-24">Evidencia</th>
                    <th className="py-3 text-right w-36 print:hidden">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y [divide-color:var(--surface-border)]">
                  {reembolsosJero.map(c => (
                    <tr key={c.id}>
                      <td className="py-3">
                        <p className="font-bold [color:var(--text-primary)]">{c.cotizacion_items?.descripcion || c.descripcion}</p>
                      </td>
                      <td className="py-3 text-right font-mono font-bold [color:var(--text-primary)]">{fmt(c.monto)}</td>
                      <td className="py-3 text-center">
                        {c.soporte_url ? (
                          <span className="text-[10px] [color:var(--state-ok-fg)] font-bold uppercase">Si</span>
                        ) : (
                          <span className="text-[10px] [color:var(--text-muted)] font-bold uppercase">No</span>
                        )}
                      </td>
                      <td className="py-3 pr-2 print:hidden flex justify-end">
                        <DownloadPdfButton costo={c} actividad={actividad} pagadorName="Jeronimo Zapata" />
                      </td>
                    </tr>
                  ))}
                  <tr className="[background:var(--surface)] font-black">
                    <td className="py-3 px-2 [color:var(--text-secondary)]">TOTAL REEMBOLSO JERO</td>
                    <td className="py-3 px-2 text-right [color:var(--state-prep-fg)]">{fmt(totalJero)}</td>
                    <td></td>
                    <td></td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {/* Sección Socio */}
          {reembolsosSocio.length > 0 && (
            <div className="mb-10">
              <h2 className="text-sm font-black uppercase mb-4 [color:var(--state-ok-fg)] border-l-4 [border-color:var(--state-ok-dot)] pl-3">
                Reembolsos para Socio
              </h2>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b [border-color:var(--surface-border)] [color:var(--text-muted)] font-bold text-[11px] uppercase">
                    <th className="py-2 text-left">Concepto</th>
                    <th className="py-2 text-right">Monto</th>
                    <th className="py-2 text-center w-24">Evidencia</th>
                    <th className="py-2 text-right w-36">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y [divide-color:var(--surface-border)]">
                  {reembolsosSocio.map(c => (
                    <tr key={c.id}>
                      <td className="py-3">
                        <p className="font-bold [color:var(--text-primary)]">{c.cotizacion_items?.descripcion || c.descripcion}</p>
                      </td>
                      <td className="py-3 text-right font-mono font-bold [color:var(--text-primary)]">{fmt(c.monto)}</td>
                      <td className="py-3 text-center">
                        {c.soporte_url ? (
                          <span className="text-[10px] [color:var(--state-ok-fg)] font-bold uppercase">Si</span>
                        ) : (
                          <span className="text-[10px] [color:var(--text-muted)] font-bold uppercase">No</span>
                        )}
                      </td>
                      <td className="py-3 pr-2 print:hidden flex justify-end">
                        <DownloadPdfButton costo={c} actividad={actividad} pagadorName="Socio Proyecto" />
                      </td>
                    </tr>
                  ))}
                  <tr className="[background:var(--surface)] font-black">
                    <td className="py-3 px-2 [color:var(--text-secondary)]">TOTAL REEMBOLSO SOCIO</td>
                    <td className="py-3 px-2 text-right [color:var(--state-ok-fg)]">{fmt(totalSocio)}</td>
                    <td></td>
                    <td></td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {/* Galería de Evidencias */}
          <div className="mt-12 pt-8 border-t [border-color:var(--surface-border)]">
            <h3 className="text-xs font-black uppercase mb-6 [color:var(--text-muted)] tracking-widest text-center">
              Anexo: Evidencias Fotográficas
            </h3>
            <div className="grid grid-cols-2 gap-4">
              {costos.filter(c => c.soporte_url).map(c => (
                <div key={c.id} className="border [border-color:var(--surface-border)] rounded-lg overflow-hidden p-1">
                  <div className="aspect-video [background:var(--surface)] relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={c.soporte_url!}
                      alt="Evidencia"
                      className="object-contain w-full h-full"
                    />
                  </div>
                  <div className="p-2 [background:var(--surface)] mt-1">
                    <p className="text-[9px] font-bold [color:var(--text-muted)] uppercase truncate">
                      {c.cotizacion_items?.descripcion || c.descripcion}
                    </p>
                    <p className="text-[10px] font-black [color:var(--text-primary)]">{fmt(c.monto)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Pie de página */}
          <div className="mt-auto pt-12 text-center [color:var(--text-muted)] space-y-1">
            <p className="text-[10px] font-bold uppercase">Admin Logística UV - Sistema de Liquidación</p>
            <p className="text-[9px] italic">Documento generado automáticamente para soporte de reembolsos integrales.</p>
          </div>
        </div>
      </div>

    </div>
  )
}
