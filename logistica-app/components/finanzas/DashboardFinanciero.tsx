'use client'

import { useState, useTransition, useCallback } from 'react'
import {
  TrendingUp, TrendingDown, DollarSign, Percent,
  Wallet, ChevronRight, X, Loader2, AlertCircle, Info, FileDown,
} from 'lucide-react'
import { obtenerResumenFinanciero } from '@/actions/finanzas'
import type { DatosFinanciero, ActividadFinanciera } from '@/actions/finanzas'
import type { GetFinancialSummaryFilters } from '@/src/core/application/use-cases/GetFinancialSummary'
import type { FuenteFinanciacion, EstadoActividad } from '@/src/types/domain'

// ============================================================
// DashboardFinanciero — Client Component
//
// Shell interactivo del dashboard financiero. Orquesta:
//   FilterBar → KpiGrid → ChartsRow → TablaActividades → DesgloseModal
//
// Re-fetch: al cambiar filtros, llama a la Server Action
//   obtenerResumenFinanciero() con useTransition.
// ============================================================

const COP = new Intl.NumberFormat('es-CO', {
  style: 'currency', currency: 'COP', maximumFractionDigits: 0,
})
const fmt = (n: number) => COP.format(n)
const fmtM = (n: number) => {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} M`
  if (Math.abs(n) >= 1_000)    return `${(n / 1_000).toFixed(0)} K`
  return fmt(n)
}

const FUENTES: FuenteFinanciacion[] = ['Fondo Propio', 'Anticipo Unidad', 'Crédito']
const ESTADOS: EstadoActividad[] = ['generado', 'en_ejecucion', 'liquidado', 'aplazado', 'cancelado']
const ESTADO_LABELS: Record<EstadoActividad, string> = {
  generado: 'Generado', en_ejecucion: 'En Ejecución',
  liquidado: 'Liquidado', aplazado: 'Aplazado', cancelado: 'Cancelado',
}
const PIE_COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)', 'var(--chart-6)']

// ---------------------------------------------------------------
// Semáforo de rentabilidad
// ---------------------------------------------------------------
function semaforo(margen: number): { color: string; label: string } {
  if (margen >= 20) return { color: 'pill-ok',   label: 'Alta' }
  if (margen >= 10) return { color: 'pill-run',  label: 'Media' }
  return { color: 'pill-cancel', label: 'Baja' }
}

// ---------------------------------------------------------------
// SVG Bar Chart
// ---------------------------------------------------------------
function BarChart({ actividades }: { actividades: ActividadFinanciera[] }) {
  if (actividades.length === 0) return <EmptyChart label="Sin datos para la gráfica" />

  const items = actividades.slice(0, 20) // max 20 bars
  const maxVal = Math.max(...items.flatMap((a) => [a.totalCotizado, a.totalCostosReales]), 1)

  const BAR_W = 28
  const GAP   = 4
  const GROUP = BAR_W * 2 + GAP + 12
  const H     = 160
  const PB    = 24
  const chartW = items.length * GROUP

  return (
    <div className="overflow-x-auto">
      <svg
        width={Math.max(chartW, 300)}
        height={H + PB}
        viewBox={`0 0 ${Math.max(chartW, 300)} ${H + PB}`}
        className="block"
      >
        {/* Horizontal grid lines */}
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <line
            key={f}
            x1={0} y1={H - H * f}
            x2={Math.max(chartW, 300)} y2={H - H * f}
            stroke="var(--surface-border)" strokeWidth={1}
          />
        ))}

        {items.map((a, i) => {
          const x     = i * GROUP + 4
          const hCot  = Math.max(2, (a.totalCotizado / maxVal) * H)
          const hReal = Math.max(2, (a.totalCostosReales / maxVal) * H)
          const abbr  = a.nombreActividad.slice(0, 8)

          return (
            <g key={a.actividadId}>
              {/* Cotizado */}
              <rect
                x={x} y={H - hCot}
                width={BAR_W} height={hCot}
                rx={3} fill="var(--chart-2)" opacity={0.75}
              />
              {/* Real */}
              <rect
                x={x + BAR_W + GAP} y={H - hReal}
                width={BAR_W} height={hReal}
                rx={3} fill={a.totalCostosReales > a.totalCotizado ? 'var(--chart-5)' : 'var(--chart-4)'}
                opacity={0.75}
              />
              {/* Label */}
              <text
                x={x + BAR_W} y={H + 16}
                textAnchor="middle" fontSize={9} fill="var(--text-muted)"
              >
                {abbr}
              </text>
            </g>
          )
        })}
      </svg>

      {/* Legend */}
      <div className="flex gap-4 mt-2 text-xs [color:var(--text-muted)]">
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-2.5 rounded-sm" style={{ background: 'var(--chart-2)' }} /> Cotizado
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-2.5 rounded-sm" style={{ background: 'var(--chart-4)' }} /> Costo Real
        </span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------
// SVG Donut Chart
// ---------------------------------------------------------------
function DonutChart({ distribucion }: { distribucion: DatosFinanciero['distribucionTotal'] }) {
  if (distribucion.length === 0) return <EmptyChart label="Sin distribución de socios" />

  const total = distribucion.reduce((s, d) => s + Math.max(0, d.totalRecibe), 0)
  if (total === 0) return <EmptyChart label="Utilidad total = 0" />

  const R = 70, r = 44, cx = 90, cy = 90

  let startAngle = -Math.PI / 2
  const segments = distribucion.map((d, i) => {
    const value = Math.max(0, d.totalRecibe)
    const angle = total > 0 ? (value / total) * 2 * Math.PI : 0
    const endAngle = startAngle + angle
    const largeArc = angle > Math.PI ? 1 : 0
    const seg = {
      x1: Math.cos(startAngle), y1: Math.sin(startAngle),
      x2: Math.cos(endAngle),   y2: Math.sin(endAngle),
      largeArc, color: PIE_COLORS[i % PIE_COLORS.length],
      label: d.nombreSocio, pct: total > 0 ? Math.round((value / total) * 100) : 0,
    }
    startAngle = endAngle
    return seg
  })

  function arcPath(seg: typeof segments[0]) {
    if (seg.largeArc === 0 && Math.abs(seg.x1 - seg.x2) < 0.001 && Math.abs(seg.y1 - seg.y2) < 0.001) {
      // Full circle
      return [
        `M ${cx} ${cy - R}`,
        `A ${R} ${R} 0 1 1 ${cx - 0.001} ${cy - R}`,
        `L ${cx - 0.001} ${cy - r}`,
        `A ${r} ${r} 0 1 0 ${cx} ${cy - r}`,
        'Z',
      ].join(' ')
    }
    return [
      `M ${cx + R * seg.x1} ${cy + R * seg.y1}`,
      `A ${R} ${R} 0 ${seg.largeArc} 1 ${cx + R * seg.x2} ${cy + R * seg.y2}`,
      `L ${cx + r * seg.x2} ${cy + r * seg.y2}`,
      `A ${r} ${r} 0 ${seg.largeArc} 0 ${cx + r * seg.x1} ${cy + r * seg.y1}`,
      'Z',
    ].join(' ')
  }

  return (
    <div className="flex items-center gap-6">
      <svg width={180} height={180} viewBox="0 0 180 180" className="shrink-0">
        {segments.map((seg, i) => (
          <path key={i} d={arcPath(seg)} fill={seg.color} opacity={0.9} />
        ))}
        <text x={cx} y={cy - 6} textAnchor="middle" fontSize={11} fill="var(--text-secondary)" fontWeight="600">
          {fmt(total).replace('$', '')}
        </text>
        <text x={cx} y={cy + 10} textAnchor="middle" fontSize={9} fill="var(--text-muted)">
          Total
        </text>
      </svg>

      <div className="flex flex-col gap-2 min-w-0">
        {segments.map((seg, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            <span
              className="inline-block size-2.5 rounded-full shrink-0"
              style={{ background: seg.color }}
            />
            <span className="[color:var(--text-primary)] truncate">{seg.label}</span>
            <span className="[color:var(--text-muted)] ml-auto pl-2 font-mono">{seg.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function EmptyChart({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-32 [color:var(--text-muted)] gap-2">
      <Info strokeWidth={1.5} className="size-6" />
      <p className="text-xs">{label}</p>
    </div>
  )
}

// ---------------------------------------------------------------
// Desglose modal — quién puso cuánto y quién se lleva cuánto
// ---------------------------------------------------------------
function DesgloseModal({
  actividad,
  onClose,
}: {
  actividad: ActividadFinanciera
  onClose: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40 backdrop-blur-md p-4 transition-all duration-300"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="modal-card rounded-3xl shadow-2xl w-full max-w-xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b [border-color:var(--surface-border)]">
          <div>
            <p className="text-xs [color:var(--text-muted)]">Desglose financiero</p>
            <h2 className="font-semibold [color:var(--text-primary)] text-sm leading-tight line-clamp-2">
              {actividad.nombreActividad}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="[color:var(--text-muted)] hover:[color:var(--text-primary)] ml-3 shrink-0"
            aria-label="Cerrar"
          >
            <X strokeWidth={1.5} className="size-4" />
          </button>
        </div>

        {/* Balance summary */}
        <div className="grid grid-cols-3 divide-x [divide-color:var(--surface-border)] border-b [border-color:var(--surface-border)]">
          {[
            { label: 'Cotizado',   value: actividad.totalCotizado,    color: '[color:var(--text-primary)]' },
            { label: 'Costo Real', value: actividad.totalCostosReales, color: '[color:var(--text-secondary)]' },
            { label: 'Utilidad',   value: actividad.utilidadNeta,      color: actividad.utilidadNeta >= 0 ? '[color:var(--state-ok-fg)]' : '[color:var(--state-cancel-fg)]' },
          ].map((k) => (
            <div key={k.label} className="px-4 py-3 text-center">
              <p className="text-xs [color:var(--text-muted)] mb-1">{k.label}</p>
              <p className={`font-bold text-sm ${k.color}`}>{fmtM(k.value)}</p>
            </div>
          ))}
        </div>

        {/* Distribución */}
        <div className="px-5 py-4 max-h-72 overflow-y-auto">
          {actividad.distribucion.length === 0 ? (
            <p className="text-sm [color:var(--text-muted)] text-center py-6">
              Sin participaciones configuradas para esta actividad.
            </p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="[color:var(--text-muted)] font-medium border-b border-white/5">
                  <th className="py-2 text-left">Socio</th>
                  <th className="py-2 text-right">Aportó</th>
                  <th className="py-2 text-right">↩ Capital</th>
                  <th className="py-2 text-right">Utilidad</th>
                  <th className="py-2 text-right font-semibold [color:var(--text-secondary)]">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {actividad.distribucion.map((d) => (
                  <tr key={d.socioId}>
                    <td className="py-2 font-medium [color:var(--text-primary)]">{d.nombreSocio}</td>
                    <td className="py-2 text-right font-mono [color:var(--text-secondary)]">{fmtM(d.montoAportado)}</td>
                    <td className="py-2 text-right font-mono [color:var(--state-prep-fg)]">{fmtM(d.devolucionCapital)}</td>
                    <td className="py-2 text-right font-mono [color:var(--state-ok-fg)]">{fmtM(d.porcionRemanente)}</td>
                    <td className="py-2 text-right font-mono font-bold [color:var(--text-primary)]">{fmtM(d.totalRecibe)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-white/5 font-semibold [color:var(--text-secondary)]">
                  <td className="py-2 text-xs [color:var(--text-muted)]">Total</td>
                  <td className="py-2 text-right font-mono">{fmtM(actividad.distribucion.reduce((s, d) => s + d.montoAportado, 0))}</td>
                  <td className="py-2 text-right font-mono [color:var(--state-prep-fg)]">{fmtM(actividad.distribucion.reduce((s, d) => s + d.devolucionCapital, 0))}</td>
                  <td className="py-2 text-right font-mono [color:var(--state-ok-fg)]">{fmtM(actividad.distribucion.reduce((s, d) => s + d.porcionRemanente, 0))}</td>
                  <td className="py-2 text-right font-mono [color:var(--text-primary)]">{fmtM(actividad.distribucion.reduce((s, d) => s + d.totalRecibe, 0))}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>

        <div className="px-5 py-3 border-t [border-color:var(--surface-border)] flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-sm rounded-lg border [border-color:var(--surface-border)] [color:var(--text-secondary)] hover:[background:var(--surface)] transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------
// DashboardFinanciero — componente principal
// ---------------------------------------------------------------

export function DashboardFinanciero({ initialData }: { initialData: DatosFinanciero }) {
  const [data, setData]       = useState<DatosFinanciero>(initialData)
  const [filters, setFilters] = useState<GetFinancialSummaryFilters>(initialData.filtrosAplicados)
  const [desglose, setDesglose] = useState<ActividadFinanciera | null>(null)
  const [isPending, startTransition] = useTransition()
  const [error, setError]     = useState<string | null>(null)
  const [isExporting, setIsExporting] = useState(false)

  const socios = data.agregadosPorSocio

  const applyFilters = useCallback((next: GetFinancialSummaryFilters) => {
    setFilters(next)
    setError(null)
    startTransition(async () => {
      try {
        const result = await obtenerResumenFinanciero(next)
        setData(result)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Error al cargar datos.')
      }
    })
  }, [])

  function setFilter<K extends keyof GetFinancialSummaryFilters>(
    key: K, value: GetFinancialSummaryFilters[K],
  ) {
    const next = { ...filters, [key]: value || undefined }
    applyFilters(next)
  }

  function clearFilters() {
    applyFilters({})
  }

  async function exportarExcel() {
    setIsExporting(true)
    setError(null)
    try {
      const res = await fetch('/api/dashboard/finanzas/exportar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filtros: filters }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error((j as { error?: string }).error ?? `HTTP ${res.status}`)
      }
      const blob     = await res.blob()
      const url      = URL.createObjectURL(blob)
      const a        = document.createElement('a')
      const filename = res.headers.get('Content-Disposition')?.match(/filename="([^"]+)"/)?.[1]
                       ?? 'reporte-financiero.xlsx'
      a.href     = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al exportar.')
    } finally {
      setIsExporting(false)
    }
  }

  const hasFilters = Object.values(filters).some((v) => v !== undefined && v !== '')

  return (
    <>
      {/* ── Filtros superiores ── */}
      <div className="glass-panel rounded-2xl px-4 py-3 mb-5 flex flex-wrap gap-3 items-end">
        {/* Desde */}
        <label className="flex flex-col gap-1 min-w-32">
          <span className="text-xs font-medium [color:var(--text-secondary)]">Desde</span>
          <input
            type="date"
            value={filters.desde ?? ''}
            onChange={(e) => setFilter('desde', e.target.value)}
            className="glass-input px-2.5 py-1.5 text-sm"
          />
        </label>

        {/* Hasta */}
        <label className="flex flex-col gap-1 min-w-32">
          <span className="text-xs font-medium [color:var(--text-secondary)]">Hasta</span>
          <input
            type="date"
            value={filters.hasta ?? ''}
            onChange={(e) => setFilter('hasta', e.target.value)}
            className="glass-input px-2.5 py-1.5 text-sm"
          />
        </label>

        {/* Socio */}
        <label className="flex flex-col gap-1 min-w-40">
          <span className="text-xs font-medium [color:var(--text-secondary)]">Socio</span>
          <select
            value={filters.socioId ?? ''}
            onChange={(e) => setFilter('socioId', e.target.value)}
            className="glass-input px-2.5 py-1.5 text-sm"
          >
            <option value="">Todos</option>
            {socios.map((s) => (
              <option key={s.socioId} value={s.socioId}>{s.nombreSocio}</option>
            ))}
          </select>
        </label>

        {/* Fuente */}
        <label className="flex flex-col gap-1 min-w-44">
          <span className="text-xs font-medium [color:var(--text-secondary)]">Fuente de Financiación</span>
          <select
            value={filters.fuenteFinanciacion ?? ''}
            onChange={(e) => setFilter('fuenteFinanciacion', e.target.value as FuenteFinanciacion)}
            className="glass-input px-2.5 py-1.5 text-sm"
          >
            <option value="">Todas</option>
            {FUENTES.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
        </label>

        {/* Estado */}
        <label className="flex flex-col gap-1 min-w-36">
          <span className="text-xs font-medium [color:var(--text-secondary)]">Estado</span>
          <select
            value={filters.estadoActividad ?? ''}
            onChange={(e) => setFilter('estadoActividad', e.target.value as EstadoActividad)}
            className="glass-input px-2.5 py-1.5 text-sm"
          >
            <option value="">Todos</option>
            {ESTADOS.map((es) => <option key={es} value={es}>{ESTADO_LABELS[es]}</option>)}
          </select>
        </label>

        {/* Spinner + clear + export */}
        <div className="flex items-end gap-2 ml-auto">
          {isPending && <Loader2 strokeWidth={1.5} className="size-4 [color:var(--text-muted)] animate-spin mb-2" />}
          {hasFilters && (
            <button
              onClick={clearFilters}
              className="px-3 py-1.5 text-xs rounded-lg border [border-color:var(--surface-border)] [color:var(--text-secondary)] hover:[background:var(--surface)] transition-colors flex items-center gap-1"
            >
              <X strokeWidth={1.5} className="size-3" /> Limpiar
            </button>
          )}
          <button
            onClick={exportarExcel}
            disabled={isExporting || isPending}
            className="btn-primary px-3 py-1.5 text-xs rounded-lg disabled:opacity-50 transition-colors flex items-center gap-1.5 font-medium"
            title="Descargar reporte en Excel para contabilidad"
          >
            {isExporting
              ? <Loader2 strokeWidth={1.5} className="size-3 animate-spin" />
              : <FileDown strokeWidth={1.5} className="size-3" />
            }
            {isExporting ? 'Generando…' : 'Exportar Excel'}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 text-sm pill-cancel rounded-xl px-4 py-2.5 mb-4">
          <AlertCircle strokeWidth={1.5} className="size-4 shrink-0" /> {error}
        </div>
      )}

      {/* ── KPI Cards: State of Cash & Finanzas ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        {/* State of Cash */}
        <div className="glass-panel rounded-3xl p-6 lg:col-span-2 flex flex-col justify-between relative overflow-hidden group">
            <div className="flex items-center gap-2 mb-4">
            <div className="p-2 [background:var(--surface)] rounded-xl">
              <Wallet className="size-5 [color:var(--text-secondary)]" strokeWidth={1.5} />
            </div>
            <h2 className="text-lg font-bold [color:var(--text-primary)]">State of Cash</h2>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-medium [color:var(--text-secondary)] uppercase tracking-wider mb-1">Dinero en Caja</p>
              <p className="text-3xl font-extrabold [color:var(--text-primary)] tracking-tight">{fmt(data.dineroEnCaja)}</p>
              <p className="text-xs [color:var(--state-ok-fg)] mt-1 font-medium flex items-center gap-1">
                <TrendingUp className="size-3" /> Disponible hoy
              </p>
            </div>
            <div className="border-l [border-color:var(--surface-border)] pl-4">
              <p className="text-xs font-medium [color:var(--text-secondary)] uppercase tracking-wider mb-1">Por Cobrar</p>
              <p className="text-3xl font-extrabold [color:var(--text-primary)] tracking-tight">{fmt(data.utilidadPorCobrar)}</p>
              <p className="text-xs [color:var(--state-run-fg)] mt-1 font-medium flex items-center gap-1">
                <TrendingUp className="size-3" /> Retornos pendientes
              </p>
            </div>
          </div>
        </div>

        {/* Global KPIs */}
        <div className="flex flex-col gap-4">
          <KpiCard
            label="Utilidad Neta Total"
            value={fmt(data.utilidadNeta)}
            sub={`${data.cantidadActividades} actividades finalizadas`}
            icon={data.utilidadNeta >= 0 ? <TrendingUp strokeWidth={1.5} className="size-4" /> : <TrendingDown strokeWidth={1.5} className="size-4" />}
            color={data.utilidadNeta >= 0 ? 'emerald' : 'red'}
            highlight
          />
          <KpiCard
            label="Ingresos Totales"
            value={fmt(data.totalCotizado)}
            sub={`M. Promedio: ${data.margenPromedio.toFixed(1)}%`}
            icon={<DollarSign strokeWidth={1.5} className="size-4" />}
            color="violet"
          />
        </div>
      </div>

      {/* ── Gráficos ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        {/* Bar: Cotizado vs Real */}
        <div className="lg:col-span-2 glass-panel rounded-3xl p-5">
          <h3 className="text-sm font-semibold [color:var(--text-secondary)] mb-4">
            Cotizado vs Costo Real por Actividad
          </h3>
          <BarChart actividades={data.actividades} />
        </div>

        {/* Donut: distribución entre socios */}
        <div className="glass-panel rounded-3xl p-5">
          <h3 className="text-sm font-semibold [color:var(--text-secondary)] mb-4">
            Distribución de Utilidades
          </h3>
          <DonutChart distribucion={data.distribucionTotal} />
        </div>
      </div>

      {/* ── Tabla de actividades ── */}
      <div className="glass-panel rounded-3xl overflow-hidden">
        <div className="px-4 py-3 border-b [border-color:var(--surface-border)]">
          <h3 className="text-sm font-semibold [color:var(--text-secondary)]">
            Detalle por Actividad
            <span className="ml-2 text-xs font-normal [color:var(--text-muted)]">
              · click para ver desglose de socios
            </span>
          </h3>
        </div>

        {data.actividades.length === 0 ? (
          <div className="py-16 text-center [color:var(--text-muted)] text-sm">
            No hay actividades para los filtros seleccionados.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="[color:var(--text-muted)] text-xs font-medium border-b border-white/5">
                  <th className="px-4 py-3 text-left w-6"></th>
                  <th className="px-3 py-3 text-left">Actividad</th>
                  <th className="px-3 py-3 text-left hidden sm:table-cell">Municipio</th>
                  <th className="px-3 py-3 text-left hidden md:table-cell">Fecha</th>
                  <th className="px-3 py-3 text-right">Cotizado</th>
                  <th className="px-3 py-3 text-right hidden lg:table-cell">Costo Real</th>
                  <th className="px-3 py-3 text-right">Utilidad</th>
                  <th className="px-3 py-3 text-center">Margen</th>
                  <th className="px-3 py-3 text-right w-6"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {data.actividades.map((a) => {
                  const s = semaforo(a.margenPorcentaje)
                  return (
                    <tr
                      key={a.actividadId}
                      className="hover:bg-white/5 transition-colors cursor-pointer group"
                      onClick={() => setDesglose(a)}
                    >
                      {/* Semáforo */}
                      <td className="px-4 py-3">
                        <span
                          title={s.label}
                          className={`inline-block size-2.5 rounded-full ${s.color}`}
                        />
                      </td>
                      <td className="px-3 py-3 font-medium [color:var(--text-primary)] max-w-xs">
                        <span className="line-clamp-2 leading-tight">{a.nombreActividad}</span>
                      </td>
                      <td className="px-3 py-3 [color:var(--text-secondary)] hidden sm:table-cell">
                        {a.municipio ?? '—'}
                      </td>
                      <td className="px-3 py-3 [color:var(--text-secondary)] text-xs hidden md:table-cell whitespace-nowrap">
                        {a.fechaActividad ?? '—'}
                      </td>
                      <td className="px-3 py-3 text-right font-mono font-medium whitespace-nowrap [color:var(--text-primary)]">
                        {fmtM(a.totalCotizado)}
                      </td>
                      <td className="px-3 py-3 text-right font-mono hidden lg:table-cell whitespace-nowrap [color:var(--text-secondary)]">
                        {fmtM(a.totalCostosReales)}
                      </td>
                      <td className={`px-3 py-3 text-right font-mono font-semibold whitespace-nowrap ${a.utilidadNeta >= 0 ? '[color:var(--state-ok-fg)]' : '[color:var(--state-cancel-fg)]'}`}>
                        {fmtM(a.utilidadNeta)}
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          a.margenPorcentaje >= 20 ? 'pill-ok'
                          : a.margenPorcentaje >= 10 ? 'pill-run'
                          : 'pill-cancel'
                        }`}>
                          {a.margenPorcentaje.toFixed(1)} %
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right [color:var(--text-muted)] group-hover:[color:var(--text-secondary)] transition-colors">
                        <ChevronRight strokeWidth={1.5} className="size-4 ml-auto" />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Modal desglose ── */}
      {desglose && (
        <DesgloseModal actividad={desglose} onClose={() => setDesglose(null)} />
      )}
    </>
  )
}

// ---------------------------------------------------------------
// KpiCard
// ---------------------------------------------------------------

type CardColor = 'violet' | 'emerald' | 'amber' | 'red' | 'blue'

const colorMap: Record<CardColor, string> = {
  emerald: '[color:var(--state-ok-fg)]',
  red: '[color:var(--state-cancel-fg)]',
  violet: '[color:var(--state-run-fg)]',
  amber: '[color:var(--state-prep-fg)]',
  blue: '[color:var(--state-run-fg)]',
}

function KpiCard({
  label, value, sub, icon, color, highlight,
}: {
  label: string
  value: string
  sub: string
  icon: React.ReactNode
  color: CardColor
  highlight?: boolean
}) {
  return (
    <div className={`glass-panel rounded-2xl p-4 ${highlight ? '[border-color:var(--surface-border)] ring-1' : ''}`}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium [color:var(--text-secondary)]">{label}</span>
        <span className="p-1.5 rounded-lg [background:var(--surface)] [color:var(--text-secondary)]">{icon}</span>
      </div>
      <p className={`text-xl font-bold font-mono leading-none ${colorMap[color]}`}>{value}</p>
      <p className="text-xs [color:var(--text-muted)] mt-1.5">{sub}</p>
    </div>
  )
}
