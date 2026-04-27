import { notFound } from 'next/navigation'
import Link from 'next/link'
import { FileText, MapPin, Calendar, Clock, User } from 'lucide-react'
import { getSupabase } from '@/lib/supabase'
import { getActivityRepository, makeGetReembolsosFromActivity } from '@/src/infrastructure/container'
import { listarEntregas, listarCostos, listarItemsCotizados, listarParticipaciones } from '@/actions/ejecucion'
import { ActivityTabs } from '@/components/ejecucion/ActivityTabs'
import { CambiarEstadoButton } from '@/components/ejecucion/CambiarEstadoButton'
import { AssistantAI } from '@/components/AssistantAI'
import { PageHeader } from '@/components/PageHeader'
import type { HitoCronogramaIA } from '@/actions/cronograma-ia'
import { unstable_cache } from 'next/cache'

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
    costos,
    itemsCotizados,
    participaciones,
    reembolsosResult,
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
    unstable_cache(
      () => listarCostos(id),
      ['costos', id],
      { tags: [`act:${id}`, `costos:${id}`], revalidate: false }
    )(),
    unstable_cache(
      () => listarItemsCotizados(id),
      ['items', id],
      { tags: [`act:${id}`, `items:${id}`], revalidate: false }
    )(),
    unstable_cache(
      () => listarParticipaciones(id),
      ['participaciones', id],
      { tags: [`act:${id}`, `participaciones:${id}`], revalidate: false }
    )(),
    reembolsoUC.execute({ actividadId: id }).catch(() => ({
      reembolsos: [],
      totalAutoGenerados: 0,
      totalManuales: 0,
    })),
  ])

  const actividad = rawResult
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

  const fmtDate = (d: string | null) =>
    d
      ? new Date(d + 'T00:00').toLocaleDateString('es-CO', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })
      : null

  // Formatear hora: si es ISO string, extrae HH:MM; si es HH:MM ya, devuelve igual
  const fmtTime = (t: string | null): string | null => {
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
        subtitle={actividad.nombre_actividad}
        backHref="/ejecucion"
        breadcrumbs={[
          { label: 'Inicio',     href: '/' },
          { label: 'Ejecución', href: '/ejecucion' },
          { label: breadcrumbLabel, href: `/ejecucion/${id}` },
        ]}
        actions={
          <>
            <Link
              href={`/cotizaciones/${id}/exportar`}
              className="btn-secondary flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl transition-colors"
              title="Exportar cotización Word"
            >
              <FileText strokeWidth={1.5} className="size-3.5" />
              Word
            </Link>
            <CambiarEstadoButton actividadId={id} estadoActual={actividad.estado} />
          </>
        }
      />

      {/* Meta card */}
      <div className="max-w-2xl mx-auto px-4 pt-4 pb-2">
        <div className="surface-card rounded-2xl p-4 mb-4">
          <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs [color:var(--text-secondary)]">
            {/* Estado */}
            <span
              className={`inline-flex items-center font-semibold px-2.5 py-1 rounded-full ${estadoCfg.cls}`}
            >
              {estadoCfg.label}
            </span>

            {actividad.municipio && (
              <span className="flex items-center gap-1">
                <MapPin strokeWidth={1.5} className="size-3.5 [color:var(--text-muted)]" />
                {actividad.municipio}
                {actividad.departamento ? `, ${actividad.departamento}` : ''}
              </span>
            )}

            {actividad.fecha_inicio && (
              <span className="flex items-center gap-1">
                <Calendar strokeWidth={1.5} className="size-3.5 [color:var(--text-muted)]" />
                {fmtDate(actividad.fecha_inicio)}
                {actividad.fecha_fin && actividad.fecha_fin !== actividad.fecha_inicio
                  ? ` → ${fmtDate(actividad.fecha_fin)}`
                  : ''}
              </span>
            )}

            {fmtTime(actividad.hora_inicio) && (
              <span className="flex items-center gap-1">
                <Clock strokeWidth={1.5} className="size-3.5 [color:var(--text-muted)]" />
                {fmtTime(actividad.hora_inicio)}
                {fmtTime(actividad.hora_fin) && ` - ${fmtTime(actividad.hora_fin)}`}
              </span>
            )}

            {actividad.responsable_nombre && (
              <span className="flex items-center gap-1">
                <User strokeWidth={1.5} className="size-3.5 [color:var(--text-muted)]" />
                {actividad.responsable_nombre}
              </span>
            )}
          </div>

          {actividad.num_victimas > 0 && (
            <p className="text-xs [color:var(--text-muted)] mt-2">
              {actividad.num_victimas} beneficiarios
            </p>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="max-w-2xl mx-auto px-4 pb-8">
        <ActivityTabs
          actividadId={id}
          fechaInicio={actividad.fecha_inicio}
          horaInicio={actividad.hora_inicio}
          entregas={entregas}
          costos={costos}
          itemsCotizados={itemsCotizados}
          ingresoTotal={ingresoTotal}
          participaciones={participaciones}
          reembolsos={reembolsosProps}
          cronogramaIACache={cronogramaIACache}
          isMockMode={process.env.USE_MOCK_AI === 'true'}
        />
      </div>

      <AssistantAI 
        contextData={`Actividad en ejecución: ${actividad.nombre_actividad}. El presupuesto total de ingreso cotizado es ${ingresoTotal}. Reembolsos: ${reembolsosProps.length} detectados. Usa esta información si Jero te pide resumen de utilidades. Responde directo y sin saludos largos.`} 
      />
    </div>
  )
}

