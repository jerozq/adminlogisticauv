'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { CheckCircle2, Clock, TrendingUp, Pencil } from 'lucide-react'
import { calcularTiempoRestante, type CalculoVencimiento } from '@/src/core/domain/calculators/vencimientos'
import type { ActividadKanban } from '@/types/ejecucion'
import { CambiarEstadoButton } from './CambiarEstadoButton'

const COLUMNS = [
  { key: 'generado',     label: 'Preparado',    dot: '[background:var(--state-prep-dot)]',   header: '[color:var(--state-prep-fg)]',   pill: 'pill-prep',   filter: ['generado']                 },
  { key: 'en_ejecucion', label: 'En Ejecución', dot: '[background:var(--state-run-dot)]',    header: '[color:var(--state-run-fg)]',    pill: 'pill-run',    filter: ['en_ejecucion', 'aplazado'] },
  { key: 'liquidado',    label: 'Liquidado',    dot: '[background:var(--state-ok-dot)]',     header: '[color:var(--state-ok-fg)]',     pill: 'pill-ok',     filter: ['liquidado']                },
  { key: 'cancelado',    label: 'Cancelados',   dot: '[background:var(--state-cancel-dot)]', header: '[color:var(--state-cancel-fg)]', pill: 'pill-cancel', filter: ['cancelado']                },
] as const

type ColKey = (typeof COLUMNS)[number]['key']

// ============================================================
// KanbanBoard
// ============================================================
export function KanbanBoard({ actividades }: { actividades: ActividadKanban[] }) {
  const [mobileCol, setMobileCol] = useState<ColKey>('en_ejecucion')

  const byCol = (col: (typeof COLUMNS)[number]) =>
    actividades.filter((a) => (col.filter as readonly string[]).includes(a.estado))

  return (
    <>
      {/* Mobile: selector de columna con scroll */}
      <div className="flex md:hidden gap-1 p-1 glass-panel rounded-xl mb-4 overflow-x-auto">
        {COLUMNS.map((col) => (
          <button
            key={col.key}
            onClick={() => setMobileCol(col.key)}
            className={`shrink-0 px-3 py-2 text-xs font-semibold rounded-lg border transition-all ${
              mobileCol === col.key
                ? `${col.pill} shadow-sm`
                : 'border-transparent [color:var(--text-secondary)] hover:[color:var(--text-primary)] hover:[background:var(--surface)]'
            }`}
          >
            {col.label}
            <span className="ml-1 text-slate-400 font-[family-name:var(--font-geist-sans)]">({byCol(col).length})</span>
          </button>
        ))}
      </div>

      {/* Board */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4 md:items-start">
        {COLUMNS.map((col) => {
          const cards = byCol(col)
          return (
            <div
              key={col.key}
              className={[
                'kanban-col',
                mobileCol !== col.key ? 'hidden md:block' : '',
              ].join(' ')}
            >
              {/* Column header */}
              <div className="flex items-center gap-2 mb-3">
                <span className={`size-2 rounded-full shrink-0 ${col.dot}`} />
                <h3 className={`text-sm font-semibold flex-1 ${col.header} font-[family-name:var(--font-geist-sans)]`}>
                  {col.label}
                </h3>
                <span className={`text-xs px-2 py-0.5 rounded-full border ${col.pill} font-[family-name:var(--font-geist-sans)]`}>
                  {cards.length}
                </span>
              </div>

              {/* Cards */}
              <div className="flex flex-col gap-3">
                {cards.length === 0 ? (
                  <div className="text-center py-10 text-sm [color:var(--text-muted)]">
                    Sin actividades
                  </div>
                ) : (
                  cards.map((a) => <ActivityCard key={a.id} actividad={a} />)
                )}
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}

// ============================================================
// ActivityCard
// ============================================================
function CountdownTimer({ startStr, endStr, isDone }: { startStr?: string | null, endStr?: string | null, isDone: boolean }) {
  const [timeLeft, setTimeLeft] = useState<CalculoVencimiento | null>(null)

  useEffect(() => {
    if (!startStr) return

    // Actualización inmediata para no esperar 1s el primer render real calculado
    const initCalc = calcularTiempoRestante(startStr, Date.now(), isDone)
    if (initCalc) setTimeLeft(initCalc)

    if (isDone || !initCalc) return

    const interval = setInterval(() => {
      const calc = calcularTiempoRestante(startStr, Date.now(), isDone)
      setTimeLeft(calc)
    }, 1000)

    return () => clearInterval(interval)
  }, [startStr, isDone, endStr])

  if (!timeLeft) return null
  
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-semibold border backdrop-blur-xl shadow-sm font-[family-name:var(--font-geist-sans)] ${
      isDone
        ? 'pill-hold opacity-70'
        : timeLeft.isLate
        ? 'pill-cancel'
        : 'pill-run'
    }`}>
      <Clock strokeWidth={1.5} className="size-3" />
      {timeLeft.label}
    </span>
  )
}

function ActivityCard({ actividad }: { actividad: ActividadKanban }) {
  const progress =
    actividad.total_entregas > 0
      ? Math.round((actividad.entregas_listas / actividad.total_entregas) * 100)
      : null

  const fmt = (n: number) =>
    new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: 0,
    }).format(n)

  const fmtDate = (d: string | null) => {
    if (!d) return null
    return new Date(d + 'T00:00').toLocaleDateString('es-CO', {
      day: 'numeric',
      month: 'short',
    })
  }

  // Formatear hora: si es ISO string, extrae HH:MM; si es HH:MM ya, devuelve igual
  const fmtTime = (t: string | null | undefined): string | null => {
    if (!t) return null
    // Si contiene 'T', es un ISO string → extrae HH:MM
    if (t.includes('T')) {
      const parts = t.split('T')[1]?.substring(0, 5)
      return parts && /^\d{2}:\d{2}$/.test(parts) ? parts : null
    }
    // Si es HH:MM ya, valida y devuelve
    if (/^\d{2}:\d{2}$/.test(t)) return t
    // Otro formato inválido
    return null
  }

  // Preparar fecha combinada para Timer
  let startDateTime = null
  if (actividad.fecha_inicio) {
    const hi = fmtTime(actividad.hora_inicio) || '00:00'
    startDateTime = `${actividad.fecha_inicio}T${hi}:00`
  }

  const isDone = ['liquidado', 'cancelado'].includes(actividad.estado)

  const statusStyles: Record<string, { label: string; cls: string; dot: string }> = {
    generado: {
      label: 'Preparado',
      cls: 'pill-prep',
      dot: 'var(--state-prep-dot)',
    },
    en_ejecucion: {
      label: 'En Ejecución',
      cls: 'pill-run',
      dot: 'var(--state-run-dot)',
    },
    liquidado: {
      label: 'Liquidado',
      cls: 'pill-ok',
      dot: 'var(--state-ok-dot)',
    },
    aplazado: {
      label: 'Aplazado',
      cls: 'pill-hold',
      dot: 'var(--state-hold-dot)',
    },
    cancelado: {
      label: 'Cancelado',
      cls: 'pill-cancel',
      dot: 'var(--state-cancel-dot)',
    },
  }

  const statusCfg = statusStyles[actividad.estado] ?? {
    label: actividad.estado,
    cls: 'pill-hold',
  }

  return (
    <div className="surface-card rounded-2xl hover:shadow-md transition-all overflow-hidden">
      {/* Zona clickeable → detalle de ejecución */}
      <Link
        href={`/ejecucion/${actividad.id}`}
        className="block p-4 pb-3 active:scale-[0.99] relative"
      >
        <div className="absolute top-3 right-3">
          <CountdownTimer startStr={startDateTime} isDone={isDone} />
        </div>

        <div className="mb-2 pr-28">
          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold font-[family-name:var(--font-geist-sans)] ${statusCfg.cls}`}>
            <span className="size-1.5 rounded-full flex-shrink-0" style={{ background: statusCfg.dot }} />
            {statusCfg.label}
          </span>
        </div>

        {/* Título dinámico: Requerimiento N° — Municipio */}
        <p className="font-semibold [color:var(--text-primary)] text-sm leading-tight line-clamp-2 mb-2 pr-20 font-[family-name:var(--font-geist-sans)]">
          {[
            actividad.numero_requerimiento ?? null,
            actividad.municipio ?? null,
          ].filter(Boolean).join(' — ') || actividad.nombre_actividad}
        </p>

        {/* Meta info */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs [color:var(--text-secondary)] mb-3">
          {actividad.fecha_inicio && (
            <span className="flex items-center gap-1">
              <Clock strokeWidth={1.5} className="size-3" />
              {fmtDate(actividad.fecha_inicio)}
              {fmtTime(actividad.hora_inicio) && ` · ${fmtTime(actividad.hora_inicio)}`}
            </span>
          )}
        </div>

        {/* Progress bar */}
        {actividad.total_entregas > 0 && (
          <div className="mb-3">
            <div className="flex justify-between text-xs text-slate-500 mb-1 font-[family-name:var(--font-geist-sans)]">
              <span className="flex items-center gap-1">
                <CheckCircle2 strokeWidth={1.5} className="size-3" />
                Entregas
              </span>
              <span>{actividad.entregas_listas}/{actividad.total_entregas}</span>
            </div>
            <div className="h-1.5 [background:var(--surface-border)] rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${progress ?? 0}%`,
                  background: progress === 100 ? 'var(--state-ok-dot)' : 'var(--state-prep-dot)',
                }}
              />
            </div>
          </div>
        )}

        {/* Ingreso cotizado */}
        {actividad.ingreso_cotizado !== null && (
          <div className="flex items-center gap-1 text-xs font-semibold [color:var(--text-secondary)] font-[family-name:var(--font-geist-sans)]">
            <TrendingUp strokeWidth={1.5} className="size-3 [color:var(--state-ok-dot)]" />
            {fmt(actividad.ingreso_cotizado)}
          </div>
        )}
      </Link>

      {/* Footer con acciones */}
      <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-t [border-color:var(--surface-border)] [background:var(--surface)]">
        {/* Cambiar estado */}
        <CambiarEstadoButton
          actividadId={actividad.id}
          estadoActual={actividad.estado}
        />

        {/* Editar cotización */}
        <Link
          href={`/cotizaciones/${actividad.id}/editar`}
          title="Editar cotización"
          className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold [color:var(--text-secondary)]
                     rounded-xl border [border-color:var(--surface-border)] [background:var(--surface-raised)]
                     hover:[background:var(--surface)] hover:[color:var(--text-primary)] transition-colors"
        >
          <Pencil strokeWidth={1.5} className="size-3" />
          Editar
        </Link>
      </div>
    </div>
  )
}

