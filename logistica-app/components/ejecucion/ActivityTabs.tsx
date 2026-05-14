'use client'

import { Suspense } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { CalendarDays, Receipt, FileCheck2 } from 'lucide-react'
import { AgendaView } from './AgendaView'
import { TablaReembolsos } from './TablaReembolsos'
import { TabInforme } from './TabInforme'
import type { HitoCronogramaIA } from '@/actions/cronograma-ia'
import type { BitacoraEntregaRow } from '@/types/ejecucion'
import type { ReembolsoProps } from '@/src/core/domain/entities/Reembolso'
import type { InformeActividad, ReembolsoInforme, EvidenciaInforme } from '@/actions/informes'

type Tab = 'agenda' | 'reembolsos' | 'informe'
const VALID_TABS: Tab[] = ['agenda', 'reembolsos', 'informe']

interface Props {
  actividadId: string
  fechaInicio: string | null
  horaInicio: string | null
  entregas: BitacoraEntregaRow[]
  reembolsos?: ReembolsoProps[]
  cronogramaIACache?: HitoCronogramaIA[] | null
  isMockMode?: boolean
  // Datos del módulo de Informes
  informeActividad?: InformeActividad | null
  informeReembolsos?: ReembolsoInforme[]
  informeEvidencias?: EvidenciaInforme[]
}

// Inner component needs Suspense because it calls useSearchParams()
function ActivityTabsInner({
  actividadId,
  fechaInicio,
  horaInicio,
  entregas,
  reembolsos = [],
  cronogramaIACache,
  isMockMode = false,
  informeActividad = null,
  informeReembolsos = [],
  informeEvidencias = [],
}: Props) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  const rawTab = searchParams.get('tab')
  const tab: Tab = VALID_TABS.includes(rawTab as Tab) ? (rawTab as Tab) : 'agenda'

  function setTab(next: Tab) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('tab', next)
    router.push(`${pathname}?${params.toString()}`)
  }

  // Calcular si el informe tiene docs pendientes para el badge
  const informePendiente = informeActividad
    ? !informeActividad.recibo_satisfaccion_firmado_url ||
      !informeActividad.lista_asistencia_firmada_url ||
      !informeActividad.informe_pdf2_url ||
      !informeActividad.informe_pdf3_url
    : false

  return (
    <div>
      {/* Tab bar */}
      <div className="flex gap-1 p-1 [background:var(--surface)] rounded-2xl mb-4">
        <TabButton
          active={tab === 'agenda'}
          onClick={() => setTab('agenda')}
          icon={<CalendarDays strokeWidth={1.5} className="size-4" />}
          label="Agenda IA"
        />
        <TabButton
          active={tab === 'reembolsos'}
          onClick={() => setTab('reembolsos')}
          icon={<Receipt strokeWidth={1.5} className="size-4" />}
          label="Formatos"
          badge={reembolsos.length > 0 ? String(reembolsos.length) : undefined}
        />
        <TabButton
          active={tab === 'informe'}
          onClick={() => setTab('informe')}
          icon={<FileCheck2 strokeWidth={1.5} className="size-4" />}
          label="Informe"
          badge={informePendiente ? '!' : undefined}
          badgeColor={informePendiente ? 'amber' : undefined}
        />
      </div>

      {/* Content */}
      {tab === 'agenda' && (
        <AgendaView
          actividadId={actividadId}
          fechaInicioDefault={fechaInicio}
          horaInicioDefault={horaInicio}
          initialEntregas={entregas}
          cronogramaIACache={cronogramaIACache ?? null}
          isMockMode={isMockMode}
        />
      )}
      {tab === 'reembolsos' && (
        <TablaReembolsos
          actividadId={actividadId}
          initialReembolsos={reembolsos}
        />
      )}
      {tab === 'informe' && informeActividad && (
        <TabInforme
          actividadId={actividadId}
          actividad={informeActividad}
          reembolsos={informeReembolsos}
          evidencias={informeEvidencias}
        />
      )}
      {tab === 'informe' && !informeActividad && (
        <div className="glass-panel rounded-2xl p-8 text-center">
          <FileCheck2 strokeWidth={1} className="size-8 [color:var(--text-muted)] mx-auto mb-2" />
          <p className="text-sm [color:var(--text-muted)]">No se pudieron cargar los datos del informe.</p>
        </div>
      )}
    </div>
  )
}

export function ActivityTabs(props: Props) {
  return (
    <Suspense fallback={<div className="h-12 rounded-2xl animate-pulse [background:var(--surface)]" />}>
      <ActivityTabsInner {...props} />
    </Suspense>
  )
}

function TabButton({
  active,
  onClick,
  icon,
  label,
  badge,
  badgeColor,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
  badge?: string
  badgeColor?: 'amber' | undefined
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-semibold
                  rounded-xl transition-all ${
                    active
                      ? '[background:var(--surface-raised)] shadow [color:var(--text-primary)]'
                      : '[color:var(--text-muted)] hover:[color:var(--text-secondary)]'
                  }`}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
      {badge && (
        <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-md ${
          badgeColor === 'amber'
            ? 'pill-run'
            : active
            ? 'pill-prep'
            : '[background:var(--surface-border)] [color:var(--text-muted)]'
        }`}>
          {badge}
        </span>
      )}
    </button>
  )
}
