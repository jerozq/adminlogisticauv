'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Plus, Activity } from 'lucide-react'
import { KanbanBoard } from './KanbanBoard'
import { CalendarioMaestro } from './CalendarioMaestro'
import type { ActividadKanban, ActividadCalendarioMaestro } from '@/types/ejecucion'
import { PageHeader } from '@/components/PageHeader'

type ViewMode = 'kanban' | 'calendar'

interface Props {
  actividadesKanban: ActividadKanban[]
  actividadesCalendario: ActividadCalendarioMaestro[]
}

function ViewToggle({ value, onChange }: { value: ViewMode; onChange: (next: ViewMode) => void }) {
  return (
    <div className="relative inline-grid grid-cols-2 rounded-full p-1 glass-panel min-w-[250px]">
      <span
        className={`absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-full [background:var(--surface-raised)] border [border-color:var(--surface-border)] shadow-sm transition-transform duration-200 ${
          value === 'kanban' ? 'translate-x-0' : 'translate-x-full'
        }`}
        aria-hidden
      />
      <button
        onClick={() => onChange('kanban')}
        className={`relative z-10 px-4 py-1.5 text-xs font-semibold rounded-full transition-colors font-[family-name:var(--font-geist-sans)] ${
          value === 'kanban' ? '[color:var(--text-primary)]' : '[color:var(--text-muted)]'
        }`}
      >
        Tablero Kanban
      </button>
      <button
        onClick={() => onChange('calendar')}
        className={`relative z-10 px-4 py-1.5 text-xs font-semibold rounded-full transition-colors font-[family-name:var(--font-geist-sans)] ${
          value === 'calendar' ? '[color:var(--text-primary)]' : '[color:var(--text-muted)]'
        }`}
      >
        Calendario
      </button>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-24 [color:var(--text-muted)]">
      <Activity strokeWidth={1.5} className="size-12 mb-4 opacity-30" />
      <p className="font-semibold [color:var(--text-secondary)] mb-1">Sin actividades en ejecución</p>
      <p className="text-sm mb-6">Crea una cotización y pásala a estado Generado</p>
      <Link
        href="/cotizaciones/nueva"
        className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold
                   btn-primary rounded-xl transition-colors"
      >
        <Plus strokeWidth={1.5} className="size-4" />
        Crear primera cotización
      </Link>
    </div>
  )
}

export function EjecucionBoardShell({ actividadesKanban, actividadesCalendario }: Props) {
  const [viewMode, setViewMode] = useState<ViewMode>('kanban')

  const total = actividadesKanban.length
  const enCampo = actividadesKanban.filter((a) => a.estado === 'en_ejecucion').length

  return (
    <div className="min-h-screen [background:var(--background)]">
      <PageHeader
        title="Ejecución"
        subtitle={`${total} actividad${total !== 1 ? 'es' : ''}${enCampo > 0 ? ` · ${enCampo} en campo` : ''}`}
        backHref="/"
        breadcrumbs={[{ label: 'Inicio', href: '/' }, { label: 'Ejecución', href: '/ejecucion' }]}
        actions={
          <>
            <ViewToggle value={viewMode} onChange={setViewMode} />
            <Link
              href="/cotizaciones/nueva"
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold btn-primary rounded-xl transition-colors"
            >
              <Plus strokeWidth={1.5} className="size-3.5" />
              Nueva
            </Link>
          </>
        }
      />

      <div className="max-w-5xl mx-auto px-4 py-4">
        {actividadesKanban.length === 0 ? (
          <EmptyState />
        ) : viewMode === 'kanban' ? (
          <KanbanBoard actividades={actividadesKanban} />
        ) : (
          <CalendarioMaestro actividades={actividadesCalendario} />
        )}
      </div>
    </div>
  )
}
