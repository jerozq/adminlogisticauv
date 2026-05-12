import Link from 'next/link'
import {
  ArrowUpRight,
  BookOpen,
  Building2,
  CalendarDays,
  ClipboardList,
  Clock3,
  CreditCard,
  FileUp,
  Landmark,
  Radar,
  ReceiptText,
  ShieldCheck,
  CheckCircle2,
  Sparkles,
  TrendingUp,
  Activity,
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

type Tile = {
  href: string
  icon: React.ElementType
  label: string
  description: string
  statMain: string
  statSub: string
  badge?: { text: string; variant: 'prep' | 'run' | 'ok' | 'hold' }
  accent: string
  iconColor: string
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

  const moduleCards: Tile[] = [
    {
      href: '/cotizaciones',
      icon: ClipboardList,
      label: 'Cotizaciones',
      description: 'Carga de requerimientos y control de versiones',
      statMain: `${stats.cotizacionesTotal} cotizaciones`,
      statSub:
        stats.cotizacionesBorrador > 0
          ? `${stats.cotizacionesBorrador} pendientes de cerrar`
          : 'Todo al día en borradores',
      badge:
        stats.cotizacionesBorrador > 0
          ? { text: `${stats.cotizacionesBorrador} pendientes`, variant: 'hold' }
          : { text: 'Al día', variant: 'ok' },
      accent: 'from-fuchsia-400/20 via-violet-500/15 to-indigo-700/20',
      iconColor: '[color:var(--state-hold-fg)]',
    },
    {
      href: '/ejecucion',
      icon: Activity,
      label: 'Ejecución',
      description: 'Kanban, agenda y seguimiento operativo de campo',
      statMain: `${stats.actividadesEnCampo} en campo`,
      statSub:
        stats.actividadesHoy > 0
          ? `${stats.actividadesHoy} actividad${stats.actividadesHoy !== 1 ? 'es' : ''} hoy`
          : 'Sin actividades programadas hoy',
      badge: stats.actividadesEnCampo > 0 ? { text: 'Activo', variant: 'run' } : { text: 'Estable', variant: 'ok' },
      accent: 'from-cyan-400/20 via-sky-500/15 to-blue-700/20',
      iconColor: '[color:var(--state-prep-fg)]',
    },
    {
      href: '/liquidaciones',
      icon: Landmark,
      label: 'Liquidaciones',
      description: 'Consolidación de costos, validación y cierre',
      statMain: stats.ingresosLiquidados > 0 ? fmtM(stats.ingresosLiquidados) : 'Sin ingresos liquidados',
      statSub: 'Vista financiera por actividad y trazabilidad',
      badge: { text: 'Finanzas', variant: 'ok' },
      accent: 'from-emerald-400/20 via-green-500/15 to-teal-700/20',
      iconColor: '[color:var(--state-ok-fg)]',
    },
    {
      href: '/reembolsos',
      icon: ReceiptText,
      label: 'Reembolsos',
      description: 'Central de evidencias, soportes y revisión',
      statMain: 'Galería unificada de evidencias',
      statSub: 'Control rápido para auditoría documental',
      badge: { text: 'Soportes', variant: 'prep' },
      accent: 'from-indigo-300/20 via-blue-500/15 to-slate-700/20',
      iconColor: '[color:var(--state-prep-fg)]',
    },
    {
      href: '/tesoreria',
      icon: Building2,
      label: 'Tesorería',
      description: 'Movimientos, devoluciones y cuentas UV',
      statMain: 'Flujo y saldos en tiempo real',
      statSub: 'Gestión de caja para operación completa',
      badge: { text: 'Control', variant: 'run' },
      accent: 'from-slate-300/20 via-zinc-500/15 to-neutral-700/20',
      iconColor: '[color:var(--text-secondary)]',
    },
    {
      href: '/tarifario',
      icon: BookOpen,
      label: 'Tarifario',
      description: 'Base de precios y ajustes de negocio',
      statMain: `${stats.tarifarioTotal} ítems activos`,
      statSub: 'Edición inline con historial automático',
      badge: { text: 'Base', variant: 'prep' },
      accent: 'from-amber-300/25 via-orange-500/15 to-red-700/20',
      iconColor: '[color:var(--state-run-fg)]',
    },
  ]

  const badgeClass = {
    prep: 'pill-prep',
    run: 'pill-run',
    ok: 'pill-ok',
    hold: 'pill-hold',
  }

  const kpis = [
    {
      label: 'Operación en campo',
      value: `${stats.actividadesEnCampo}`,
      icon: Radar,
      note: 'actividades activas',
    },
    {
      label: 'Inicio del día',
      value: `${stats.actividadesHoy}`,
      icon: CalendarDays,
      note: 'programadas hoy',
    },
    {
      label: 'Ingresos liquidados',
      value: fmtM(stats.ingresosLiquidados),
      icon: TrendingUp,
      note: 'acumulado',
    },
    {
      label: 'Tarifario vigente',
      value: `${stats.tarifarioTotal}`,
      icon: ShieldCheck,
      note: 'ítems activos',
    },
  ]

  const focusMessage =
    stats.cotizacionesBorrador > 0
      ? `Tienes ${stats.cotizacionesBorrador} cotización${stats.cotizacionesBorrador !== 1 ? 'es' : ''} pendiente${stats.cotizacionesBorrador !== 1 ? 's' : ''}. Empecemos por ahí.`
      : stats.actividadesHoy > 0
      ? `Hoy hay ${stats.actividadesHoy} actividad${stats.actividadesHoy !== 1 ? 'es' : ''} programada${stats.actividadesHoy !== 1 ? 's' : ''}. Revisa ejecución después de cotizar.`
      : 'Comienza creando una nueva cotización para activar el flujo operativo del día.'

  return (
    <div className="min-h-[90vh] flex flex-col relative overflow-x-clip">
      {isLoginSuccess && <LoginToastClient />}

      <div className="pointer-events-none absolute -top-24 -left-20 size-96 rounded-full bg-cyan-400/15 blur-3xl" />
      <div className="pointer-events-none absolute top-24 -right-24 size-[28rem] rounded-full bg-fuchsia-400/10 blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 left-1/3 size-80 rounded-full bg-emerald-400/10 blur-3xl" />

      <header className="max-w-7xl mx-auto w-full px-6 pt-14 pb-8 relative z-10">
        <div className="surface-card rounded-3xl p-7 md:p-10 border border-white/10">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
            <div>
              <p className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] [color:var(--text-muted)] mb-3">
                <Sparkles className="size-3.5" strokeWidth={1.7} />
                Admin Logística UV
              </p>
              <h1 className="text-4xl md:text-5xl font-black tracking-tight [color:var(--text-primary)] leading-[0.95]">
                Bienvenido, {userName}
              </h1>
              <p className="mt-3 text-sm md:text-base [color:var(--text-secondary)] max-w-2xl">
                Centro de operación financiera y logística. Accede a todos los módulos desde una sola vista y entra directo al frente que necesites.
              </p>
              <p className="mt-3 text-xs md:text-sm font-semibold [color:var(--text-primary)] bg-white/5 border border-white/10 rounded-xl px-3 py-2 inline-flex items-center gap-2">
                <Sparkles className="size-3.5" strokeWidth={1.7} />
                {focusMessage}
              </p>
            </div>

            <div className="grid sm:grid-cols-2 gap-3 min-w-[250px]">
              <div className="rounded-2xl bg-black/20 border border-white/10 px-4 py-3 text-right">
                <p className="text-[11px] uppercase tracking-wider [color:var(--text-muted)]">Hora Bogotá</p>
                <p className="text-xl font-bold font-mono [color:var(--text-primary)] leading-tight">{hora}</p>
              </div>
              <div className="rounded-2xl bg-black/20 border border-white/10 px-4 py-3 text-right">
                <p className="text-[11px] uppercase tracking-wider [color:var(--text-muted)]">Fecha</p>
                <p className="text-sm capitalize font-semibold [color:var(--text-primary)] leading-tight">{fecha}</p>
              </div>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-2 lg:grid-cols-4 gap-3">
            {kpis.map(({ label, value, icon: Icon, note }) => (
              <div key={label} className="rounded-2xl bg-black/20 border border-white/10 px-4 py-3">
                <p className="text-[11px] uppercase tracking-wider [color:var(--text-muted)]">{label}</p>
                <div className="mt-1 flex items-center gap-2">
                  <Icon className="size-4 [color:var(--text-secondary)]" strokeWidth={1.7} />
                  <p className="text-sm md:text-base font-bold [color:var(--text-primary)] truncate">{value}</p>
                </div>
                <p className="text-[11px] mt-1 [color:var(--text-muted)]">{note}</p>
              </div>
            ))}
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full px-6 pb-16 relative z-10">
        <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold tracking-tight [color:var(--text-primary)]">Módulos del aplicativo</h2>
          <p className="text-sm [color:var(--text-secondary)]">Acceso completo a operación, finanzas y control documental.</p>
        </div>
          <Link
            href="/cotizaciones/nueva"
            className="group inline-flex items-center gap-2 rounded-xl px-4 py-2 bg-white/10 hover:bg-white/15 border border-white/15 hover:border-white/25 transition-all duration-200 text-sm font-semibold [color:var(--text-primary)] shrink-0"
          >
            <FileUp className="size-4" strokeWidth={1.7} />
            Nueva cotización
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {moduleCards.map(({ href, icon: Icon, label, description, badge, statMain, statSub, accent, iconColor }) => (
            <Link
            key={href}
            href={href}
            className={[
              'group relative rounded-3xl p-6 overflow-hidden',
              'border border-white/10 bg-white/5 backdrop-blur-2xl',
              'shadow-[0_12px_30px_rgba(0,0,0,0.30)]',
              'hover:-translate-y-1 hover:scale-[1.015] hover:border-white/20',
              'transition-all duration-300 ease-out',
            ].join(' ')}
          >
              <div className={`absolute inset-0 bg-gradient-to-br ${accent} opacity-100 group-hover:opacity-125 transition-opacity pointer-events-none`} />
              <div className="absolute -top-10 -right-10 size-28 rounded-full bg-white/10 blur-2xl pointer-events-none" />

              <div className="relative z-10 flex flex-col gap-5 h-full min-h-[220px]">
                <div className="flex items-start justify-between">
                  <div className="grid place-items-center size-14 rounded-2xl bg-black/20 border border-white/15 backdrop-blur-sm shadow-sm">
                    <Icon strokeWidth={1.5} className={`size-7 ${iconColor}`} />
                  </div>
                  {badge && (
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${badgeClass[badge.variant]}`}>
                      {badge.text}
                    </span>
                  )}
                </div>

                <div className="flex-1">
                  <h3 className="text-xl font-extrabold [color:var(--text-primary)] leading-tight">{label}</h3>
                  <p className="text-sm [color:var(--text-secondary)] mt-2 leading-snug">{description}</p>
                </div>

                <div className="border-t border-white/10 pt-3 space-y-1">
                  <div className="flex items-center gap-1.5 text-sm [color:var(--text-primary)] font-semibold">
                    <CheckCircle2 strokeWidth={1.6} className="size-4 shrink-0" />
                    <span className="truncate">{statMain}</span>
                  </div>
                  <p className="text-xs [color:var(--text-muted)]">{statSub}</p>
                </div>
              </div>

              <div className="absolute bottom-4 right-4 opacity-0 group-hover:opacity-100 group-hover:translate-x-0 translate-x-1 transition-all text-xs [color:var(--text-primary)] font-bold inline-flex items-center gap-1">
                Abrir <ArrowUpRight className="size-3.5" />
              </div>
            </Link>
          ))}
        </div>

        <section className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-3">
        <Link
          href="/ejecucion"
          className="rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 transition-colors p-4 flex items-center gap-3"
        >
          <div className="grid place-items-center size-9 rounded-xl bg-violet-400/20 border border-violet-300/20">
            <Clock3 className="size-4 [color:var(--text-primary)]" />
          </div>
          <div>
            <p className="text-sm font-semibold [color:var(--text-primary)]">Ir a operación</p>
            <p className="text-xs [color:var(--text-muted)]">Actividades y cronograma del día</p>
          </div>
        </Link>

        <Link
          href="/tesoreria"
          className="rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 transition-colors p-4 flex items-center gap-3"
        >
          <div className="grid place-items-center size-9 rounded-xl bg-emerald-400/20 border border-emerald-300/20">
            <CreditCard className="size-4 [color:var(--text-primary)]" />
          </div>
          <div>
            <p className="text-sm font-semibold [color:var(--text-primary)]">Control financiero</p>
            <p className="text-xs [color:var(--text-muted)]">Movimientos, cuentas y devoluciones</p>
          </div>
          </Link>
        </section>

        <div className="mt-8 text-xs [color:var(--text-muted)] flex items-center gap-2">
          <Sparkles className="size-3.5" />
          Navega por cualquier tarjeta o usa los accesos rápidos para iniciar el flujo.
        </div>
      </main>
    </div>
  )
}
