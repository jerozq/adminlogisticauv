'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Activity,
  Landmark,
  ReceiptText,
  BookOpen,
  Home,
  FileUp,
  ChevronDown,
  X,
  LogOut,
  User,
} from 'lucide-react'
import { ThemeToggle } from '@/components/ThemeToggle'
import { createClient } from '@/utils/supabase/client'
import { signOut } from '@/actions/auth'

// ── Mapa de rutas → nombre del módulo ────────────────────────────────────────
const MODULE_MAP: { prefix: string; label: string; icon: React.ElementType }[] = [
  { prefix: '/ejecucion',        label: 'Ejecución',      icon: Activity     },
  { prefix: '/cotizaciones',     label: 'Cotizaciones',   icon: FileUp       },
  { prefix: '/dashboard/finanzas', label: 'Finanzas',     icon: Landmark     },
  { prefix: '/tarifario',        label: 'Tarifario',      icon: BookOpen     },
  { prefix: '/reembolsos',       label: 'Reembolsos',     icon: ReceiptText  },
]

const NAV_LINKS = [
  { href: '/',                    label: 'Inicio',       icon: Home         },
  { href: '/ejecucion',           label: 'Ejecución',    icon: Activity     },
  { href: '/cotizaciones',        label: 'Cotizaciones', icon: FileUp       },
  { href: '/dashboard/finanzas',  label: 'Finanzas',     icon: Landmark     },
  { href: '/tarifario',           label: 'Tarifario',    icon: BookOpen     },
  { href: '/reembolsos',          label: 'Reembolsos',   icon: ReceiptText  },
]

// ── Hook: detecta scroll hacia abajo para reducir opacidad ───────────────────
function useScrolled(threshold = 20) {
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > threshold)
    window.addEventListener('scroll', handler, { passive: true })
    return () => window.removeEventListener('scroll', handler)
  }, [threshold])
  return scrolled
}

// ── Componente principal ─────────────────────────────────────────────────────
export function FloatingNav() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const scrolled = useScrolled(30)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const fetchUser = async () => {
      const supabase = createClient()
      const { data } = await supabase.auth.getUser()
      setUserEmail(data.user?.email ?? null)
    }
    fetchUser()
  }, [])

  // Detecta el módulo actual
  const current =
    MODULE_MAP.find((m) => pathname.startsWith(m.prefix)) ??
    { label: 'Admin UV', icon: Home }
  const CurrentIcon = current.icon

  // Cierra al hacer clic fuera
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Cierra al cambiar de ruta
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpen(false)
  }, [pathname])

  return (
    <div
      ref={panelRef}
      className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center"
      style={{ filter: scrolled && !open ? 'opacity(0.55)' : 'opacity(1)', transition: 'filter 0.4s ease' }}
    >
      {/* ── Isla dinámica (píldora) ── */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Navegación"
        className={[
          'group flex items-center gap-2 px-4 py-2 rounded-full',
          'backdrop-blur-2xl',
          open
            ? 'bg-white/25 dark:bg-white/12 border-white/40 dark:border-white/20'
            : 'bg-white/15 dark:bg-white/8 border-white/25 dark:border-white/12',
          'border',
          'shadow-[0_4px_24px_rgba(0,0,0,0.10),0_1px_0_0_rgba(255,255,255,0.80)_inset]',
          'dark:shadow-[0_4px_24px_rgba(0,0,0,0.40),0_1px_0_0_rgba(255,255,255,0.08)_inset]',
          'hover:bg-white/25 dark:hover:bg-white/14',
          'transition-all duration-200 ease-out',
          open ? 'scale-[1.02]' : 'scale-100',
        ].join(' ')}
      >
        <CurrentIcon
          strokeWidth={1.5}
          className="size-3.5 [color:var(--text-secondary)] group-hover:[color:var(--text-primary)] transition-colors"
        />
        <span className="text-xs font-semibold [color:var(--text-primary)] tracking-tight">
          {current.label}
        </span>
        {open
          ? <X strokeWidth={2} className="size-3 [color:var(--text-muted)]" />
          : <ChevronDown strokeWidth={2} className="size-3 [color:var(--text-muted)] group-hover:[color:var(--text-secondary)] transition-colors" />
        }
      </button>

      {/* ── Panel desplegable (Centro de Control) ── */}
      {open && (
        <div
          className={[
            'mt-2 w-80 sm:w-96',
            'rounded-3xl overflow-hidden',
            'backdrop-blur-3xl',
            'bg-white/95 dark:bg-slate-950/95',
            'border border-white/20 dark:border-slate-700/50',
            'shadow-[0_8px_32px_rgba(0,0,0,0.12),0_1px_0_0_rgba(255,255,255,0.85)_inset]',
            'dark:shadow-[0_8px_32px_rgba(0,0,0,0.50),0_1px_0_0_rgba(255,255,255,0.10)_inset]',
            // Animación de entrada
            'animate-in fade-in slide-in-from-top-2 duration-150',
          ].join(' ')}
        >
          {/* Links de navegación (Grid 2 columnas) */}
          <div className="grid grid-cols-2 gap-2 p-3">
            {NAV_LINKS.map(({ href, label, icon: Icon }) => {
              const isActive = href === '/' ? pathname === '/' : pathname.startsWith(href)
              return (
                <Link
                  key={href}
                  href={href}
                  className={[
                    'flex items-center gap-2.5 p-2.5 rounded-2xl text-sm transition-all duration-150',
                    isActive
                      ? 'bg-white/40 dark:bg-white/12 [color:var(--text-primary)] font-bold shadow-[0_2px_8px_rgba(0,0,0,0.04)]'
                      : '[color:var(--text-secondary)] hover:bg-white/30 dark:hover:bg-white/8 hover:[color:var(--text-primary)] font-medium',
                  ].join(' ')}
                >
                  <Icon strokeWidth={isActive ? 2 : 1.5} className="size-4 shrink-0" />
                  <span className="truncate">{label}</span>
                  {isActive && (
                    <span className="ml-auto size-1.5 rounded-full [background:var(--accent)] shrink-0 shadow-[0_0_8px_var(--accent)]" />
                  )}
                </Link>
              )
            })}
          </div>

          {/* Footer del Menú (Perfil y Controles) */}
          <div className="border-t border-white/20 dark:border-white/10 p-3 bg-white/5 dark:bg-black/10 flex flex-col gap-3">
            {/* Info del usuario */}
            <div className="flex items-center gap-2 overflow-hidden px-1">
              <div className="grid place-items-center size-7 rounded-full bg-white/30 dark:bg-white/10 shrink-0 shadow-inner">
                <User strokeWidth={1.5} className="size-3.5 [color:var(--text-primary)]" />
              </div>
              <span className="text-xs font-medium truncate [color:var(--text-secondary)]">
                {userEmail || 'Cargando perfil...'}
              </span>
            </div>

            {/* Tema y Cerrar Sesión */}
            <div className="flex items-center justify-between gap-2 px-1">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-widest [color:var(--text-muted)]">
                  Tema
                </span>
                <ThemeToggle />
              </div>

              <form action={signOut}>
                <button
                  type="submit"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-red-600 dark:text-red-400 bg-red-500/10 hover:bg-red-500/20 transition-colors"
                >
                  <LogOut strokeWidth={2} className="size-3.5 shrink-0" />
                  Salir
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
