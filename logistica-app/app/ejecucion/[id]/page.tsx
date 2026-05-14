import { notFound } from 'next/navigation'
import Link from 'next/link'
import { FileText } from 'lucide-react'
import { getSupabase } from '@/lib/supabase'
import { getActivityRepository, makeGetReembolsosFromActivity } from '@/src/infrastructure/container'
import { listarEntregas } from '@/actions/ejecucion'
import { obtenerInformeActividad } from '@/actions/informes'
import { ActivityTabs } from '@/components/ejecucion/ActivityTabs'
import { CambiarEstadoButton } from '@/components/ejecucion/CambiarEstadoButton'
import { MetaCardEjecucion } from '@/components/ejecucion/MetaCardEjecucion'
import { AssistantAI } from '@/components/AssistantAI'
import { PageHeader } from '@/components/PageHeader'
import type { HitoCronogramaIA } from '@/actions/cronograma-ia'
import { unstable_cache } from 'next/cache'

// ============================================================
// Type for raw requerimiento DB row
// ============================================================
interface RequerimientoRaw {
  id: string
  nombre_actividad: string
  numero_requerimiento: string | null
  municipio: string | null
  departamento: string | null
  estado: string
  fecha_inicio: string | null
  fecha_fin: string | null
  hora_inicio: string | null
  hora_fin: string | null
  responsable_nombre: string | null
  num_victimas: number
  cronograma_ia: unknown
}

// ============================================================
// Estado badge helpers
// ============================================================

const ESTADO_CONFIG: Record<string, { label: string; cls: string }> = {
  cargado:      { label: 'Cargado',      cls: 'pill-hold' },
  generado:     { label: 'Generado',     cls: 'pill-prep' },
  en_ejecucion: { label: 'En Ejecución', cls: 'pill-run'  },
  liquidado:    { label: 'Liquidado',    cls: 'pill-ok'   },
}

// ============================================================
// Page
// ============================================================

export default async function ActividadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const sb = getSupabase()

  // Un único Promise.all: las consultas puras de datos se cachean con etiquetas
  // específicas por actividad; el agregado de dominio y los reembolsos corren frescos.
  // La navegación entre pestañas es instantánea porque los datos ya están en memoria.
  const reembolsoUC = makeGetReembolsosFromActivity()
  const [
    entityResult,
    rawResult,
    entregas,
    reembolsosResult,
    informeData,
  ] = await Promise.all([
    getActivityRepository().obtenerPorId(id),
    unstable_cache(
      () => getActivityRepository().obtenerRequerimientoRaw(id),
      ['act', id],
      { tags: [`act:${id}`], revalidate: false }
    )(),
    unstable_cache(
      () => listarEntregas(id),
      ['entregas', id],
      { tags: [`act:${id}`, `entregas:${id}`], revalidate: false }
    )(),
    reembolsoUC.execute({ actividadId: id }).catch(() => ({
      reembolsos: [],
      totalAutoGenerados: 0,
      totalManuales: 0,
    })),
    obtenerInformeActividad(id).catch(() => ({
      actividad: null,
      reembolsos: [],
      evidencias: [],
    })),
  ])

  const actividad = rawResult as RequerimientoRaw | null
  if (!actividad) notFound()

  const ingresoTotal = entityResult?.ingresoTotal ?? 0

  // Caché del cronograma IA — el campo se almacena como { data: [], updated_at: '' }
  // (no como array directo). Extraemos .data con compatibilidad hacia atrás.
  const cronogramaRaw = actividad.cronograma_ia as
    | { data?: HitoCronogramaIA[]; updated_at?: string }
    | HitoCronogramaIA[]
    | null

  let cronogramaIACache: HitoCronogramaIA[] | null = null
  if (Array.isArray(cronogramaRaw) && cronogramaRaw.length > 0) {
    cronogramaIACache = cronogramaRaw
  } else if (cronogramaRaw && !Array.isArray(cronogramaRaw)) {
    const inner = (cronogramaRaw as { data?: HitoCronogramaIA[] }).data
    cronogramaIACache = Array.isArray(inner) && inner.length > 0 ? inner : null
  }

  // Serializar reembolsos (entidades de dominio → props serializables)
  const reembolsosProps = reembolsosResult.reembolsos.map((r) => r.toProps())

  const estadoCfg = ESTADO_CONFIG[actividad.estado] ?? {
    label: actividad.estado,
    cls: 'bg-zinc-100 text-zinc-600',
  }

  const tituloActividad = [
    actividad.numero_requerimiento ?? null,
    actividad.municipio
      ? actividad.departamento
        ? `${actividad.municipio}, ${actividad.departamento}`
        : actividad.municipio
      : null,
  ]
    .filter(Boolean)
    .join(' — ') || actividad.nombre_actividad

  const breadcrumbLabel = [
    actividad.numero_requerimiento ?? null,
    actividad.municipio ?? null,
  ]
    .filter(Boolean)
    .join(' - ') || actividad.nombre_actividad

  return (
    <div className="min-h-screen [background:var(--background)]">
      <PageHeader
        title={tituloActividad}
        backHref="/ejecucion"
        breadcrumbs={[
          { label: 'Inicio',     href: '/' },
          { label: 'Ejecución', href: '/ejecucion' },
          { label: breadcrumbLabel, href: `/ejecucion/${id}` },
        ]}
        actions={
          <>
            <Link
              href={`/cotizaciones/${id}/editar`}
              className="btn-secondary flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl transition-colors"
              title="Exportar cotización Word"
            >
              <FileText strokeWidth={1.5} className="size-3.5" />
              Editar
            </Link>
            <CambiarEstadoButton actividadId={id} estadoActual={actividad.estado} />
          </>
        }
      />

      {/* Meta card */}
      <div className="max-w-2xl mx-auto px-4 pt-4 pb-2">
        <MetaCardEjecucion
          actividadId={id}
          municipio={actividad.municipio}
          departamento={actividad.departamento}
          fechaInicio={actividad.fecha_inicio}
          fechaFin={actividad.fecha_fin}
          horaInicio={actividad.hora_inicio}
          horaFin={actividad.hora_fin}
          responsable={actividad.responsable_nombre}
          numVictimas={actividad.num_victimas}
          estadoLabel={estadoCfg.label}
          estadoCls={estadoCfg.cls}
        />
      </div>

      {/* Tabs */}
      <div className="max-w-2xl mx-auto px-4 pb-8">
        <ActivityTabs
          actividadId={id}
          fechaInicio={actividad.fecha_inicio}
          horaInicio={actividad.hora_inicio}
          entregas={entregas}
          reembolsos={reembolsosProps}
          cronogramaIACache={cronogramaIACache}
          isMockMode={process.env.USE_MOCK_AI === 'true'}
          informeActividad={informeData.actividad}
          informeReembolsos={informeData.reembolsos}
          informeEvidencias={informeData.evidencias}
        />
      </div>

      <AssistantAI 
        contextData={`Actividad en ejecución: ${actividad.nombre_actividad}. El presupuesto total de ingreso cotizado es ${ingresoTotal}. Reembolsos: ${reembolsosProps.length} detectados. Usa esta información si Jero te pide resumen de utilidades. Responde directo y sin saludos largos.`} 
      />
    </div>
  )
}

