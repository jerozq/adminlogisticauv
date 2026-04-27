import Link from 'next/link'
import {
  Activity,
  ClipboardList,
  Landmark,
  BookOpen,
  FileUp,
  TrendingUp,
  Clock,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react'
import { createClient } from '@/utils/supabase/server'
import { LoginToastClient } from '@/components/LoginToastClient'
import { getDashboardStats } from '@/actions/ejecucion'

// ─── Utilidad para extraer el nombre del usuario ──────────────────────────────
function getUserDisplayName(user: { user_metadata?: { display_name?: string }; email?: string } | null): string {
  if (!user) return 'Usuario'
  if (user.user_metadata?.display_name) {
    return user.user_metadata.display_name
  }
  if (user.email) {
    const namePart = user.email.split('@')[0]
    const cleanName = namePart.replace(/[^a-zA-Z]/g, '')
    if (cleanName) {
      return cleanName.charAt(0).toUpperCase() + cleanName.toLowerCase().slice(1)
    }
  }
  return 'Usuario'
}

const fmtM = (n: number) => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} M COP`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)} K COP`
  return `${n} COP`
}

// ─── Componente principal (Server Component) ──────────────────────────────────
export default async function Home(props: {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const params = await props.searchParams
  const isLoginSuccess = params?.login === 'success'

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const userName = getUserDisplayName(user)

  const stats = await getDashboardStats()

  const hora = new Date().toLocaleTimeString('es-CO', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: 'America/Bogota',
  })
  const fecha = new Date().toLocaleDateString('es-CO', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'America/Bogota',
  })

  // ── Definición de tiles ──────────────────────────────────────────────────
  const tiles = [
    {
      href: '/ejecucion',
      icon: Activity,
      label: 'Ejecución',
      description: 'Tablero Kanban · Cronograma · Costos',
      badge:
        stats.actividadesEnCampo > 0
          ? { text: `${stats.actividadesEnCampo} en campo`, variant: 'run' as const }
          : null,
      stat:
        stats.actividadesHoy > 0
          ? { icon: Clock, text: `${stats.actividadesHoy} actividad${stats.actividadesHoy !== 1 ? 'es' : ''} hoy` }
          : { icon: CheckCircle2, text: 'Sin actividades hoy' },
      accent: 'from-blue-500/10 to-indigo-500/5',
      iconColor: '[color:var(--state-prep-fg)]',
    },
    {
      href: '/cotizaciones',
      icon: ClipboardList,
      label: 'Cotizaciones',
      description: 'Historial · Versiones · Estados',
      badge:
        stats.cotizacionesBorrador > 0
          ? { text: `${stats.cotizacionesBorrador} pendientes`, variant: 'run' as const }
          : null,
      stat: { icon: FileUp, text: `${stats.cotizacionesTotal} cotizaciones totales` },
      accent: 'from-violet-500/10 to-purple-500/5',
      iconColor: '[color:var(--state-hold-fg)]',
    },
    {
      href: '/dashboard/finanzas',
      icon: Landmark,
      label: 'Finanzas',
      description: 'KPIs · Utilidades · Distribución',
      badge: null,
      stat: {
        icon: TrendingUp,
        text:
          stats.ingresosLiquidados > 0
            ? fmtM(stats.ingresosLiquidados)
            : 'Sin liquidaciones aún',
      },
      accent: 'from-emerald-500/10 to-teal-500/5',
      iconColor: '[color:var(--state-ok-fg)]',
    },
    {
      href: '/tarifario',
      icon: BookOpen,
      label: 'Tarifario',
      description: 'Precios 2026 · Edición inline',
      badge:
        stats.tarifarioTotal > 0
          ? { text: `${stats.tarifarioTotal} ítems`, variant: 'prep' as const }
          : null,
      stat: { icon: AlertCircle, text: 'Historial automático' },
      accent: 'from-amber-500/10 to-orange-500/5',
      iconColor: '[color:var(--state-run-fg)]',
    },
  ]

  const badgeClass = {
    run: 'pill-run',
    prep: 'pill-prep',
    ok: 'pill-ok',
  }

  return (
    <div className="min-h-[90vh] flex flex-col">
      {isLoginSuccess && <LoginToastClient />}

      {/* ── Hero header ─────────────────────────────────────────── */}
      <header className="max-w-6xl mx-auto w-full px-6 pt-14 pb-10">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest [color:var(--text-muted)] mb-2">
              Admin Logística UV
            </p>
            <h1 className="text-4xl font-black tracking-tight [color:var(--text-primary)] leading-none">
              Hola, {userName}.
            </h1>
            <p className="mt-2 text-sm [color:var(--text-secondary)] font-medium">
              ¿Qué vamos a gestionar hoy?
            </p>
          </div>

          {/* Reloj / fecha */}
          <div className="surface-card rounded-2xl px-5 py-3 text-right shrink-0">
            <p className="text-xl font-bold font-mono [color:var(--text-primary)] leading-none">
              {hora}
            </p>
            <p className="text-xs [color:var(--text-muted)] mt-1 capitalize">{fecha}</p>
          </div>
        </div>
      </header>

      {/* ── Grid de Tiles ───────────────────────────────────────── */}
      <main className="flex-1 max-w-6xl mx-auto w-full px-6 pb-16">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {tiles.map(({ href, icon: Icon, label, description, badge, stat, accent, iconColor }) => (
            <Link
              key={href}
              href={href}
              className={[
                'group relative flex flex-col justify-between',
                'rounded-3xl p-6 overflow-hidden',
                // Liquid Glass base
                'backdrop-blur-2xl',
                'border border-white/20',
                'bg-white/10',
                // Sombra con inner shine (igual que surface-card)
                'shadow-[0_4px_30px_rgba(0,0,0,0.08),0_1px_0_0_rgba(255,255,255,0.80)_inset]',
                // Hover
                'hover:bg-white/20',
                'hover:shadow-[0_8px_40px_rgba(0,0,0,0.12),0_1px_0_0_rgba(255,255,255,0.90)_inset]',
                'hover:scale-[1.025] hover:-translate-y-0.5',
                'transition-all duration-200 ease-out',
                // Dark mode
                'dark:bg-white/5 dark:border-white/10',
                'dark:hover:bg-white/10',
                'dark:shadow-[0_4px_30px_rgba(0,0,0,0.40),0_1px_0_0_rgba(255,255,255,0.08)_inset]',
              ].join(' ')}
            >
              {/* Gradiente de acento por módulo */}
              <div
                className={`absolute inset-0 bg-gradient-to-br ${accent} opacity-100 group-hover:opacity-150 transition-opacity pointer-events-none`}
              />

              {/* Contenido */}
              <div className="relative z-10 flex flex-col gap-5 h-full">
                {/* Icono + Badge */}
                <div className="flex items-start justify-between">
                  <div className="grid place-items-center size-14 rounded-2xl bg-white/20 dark:bg-white/8 border border-white/30 dark:border-white/12 backdrop-blur-sm shadow-sm">
                    <Icon strokeWidth={1.5} className={`size-7 ${iconColor}`} />
                  </div>
                  {badge && (
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${badgeClass[badge.variant]}`}>
                      {badge.text}
                    </span>
                  )}
                </div>

                {/* Nombre + descripción */}
                <div className="flex-1">
                  <h2 className="text-lg font-bold [color:var(--text-primary)] leading-tight">
                    {label}
                  </h2>
                  <p className="text-xs [color:var(--text-muted)] mt-1 leading-snug">
                    {description}
                  </p>
                </div>

                {/* Stat inferior */}
                <div className="flex items-center gap-1.5 text-xs [color:var(--text-secondary)] font-medium border-t [border-color:var(--surface-border)] pt-3">
                  <stat.icon strokeWidth={1.5} className="size-3.5 shrink-0" />
                  <span className="truncate">{stat.text}</span>
                </div>
              </div>

              {/* Flecha sutil en hover */}
              <div className="absolute bottom-4 right-4 opacity-0 group-hover:opacity-40 transition-opacity text-xs [color:var(--text-primary)] font-bold">
                →
              </div>
            </Link>
          ))}
        </div>

        {/* ── Acceso rápido: Nueva Cotización ─────────────────────── */}
        <div className="mt-6">
          <Link
            href="/cotizaciones/nueva"
            className={[
              'group flex items-center justify-between',
              'rounded-2xl px-6 py-4',
              'backdrop-blur-xl bg-white/8 dark:bg-white/4',
              'border border-white/15 dark:border-white/8',
              'hover:bg-white/15 dark:hover:bg-white/8',
              'shadow-[0_2px_16px_rgba(0,0,0,0.06)]',
              'transition-all duration-150',
            ].join(' ')}
          >
            <div className="flex items-center gap-3">
              <div className="grid place-items-center size-9 rounded-xl bg-white/20 border border-white/30">
                <FileUp strokeWidth={1.5} className="size-4 [color:var(--text-secondary)]" />
              </div>
              <div>
                <p className="text-sm font-semibold [color:var(--text-primary)]">
                  Nueva Cotización
                </p>
                <p className="text-xs [color:var(--text-muted)]">
                  Carga un Excel UARIV y genera una cotización editable
                </p>
              </div>
            </div>
            <span className="text-xs [color:var(--text-muted)] group-hover:[color:var(--text-secondary)] transition-colors font-medium">
              Abrir →
            </span>
          </Link>
        </div>
      </main>
    </div>
  )
}
