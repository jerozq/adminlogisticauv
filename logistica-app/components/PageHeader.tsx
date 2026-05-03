'use client'

import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, Home } from 'lucide-react'

// ── Mapa de segmentos de ruta → etiquetas legibles ───────────────────────────
const SEGMENT_LABELS: Record<string, string> = {
  ejecucion:   'Ejecución',
  cotizaciones: 'Cotizaciones',
  dashboard:   'Dashboard',
  finanzas:    'Finanzas',
  tarifario:   'Tarifario',
  reembolsos:  'Reembolsos',
  nueva:       'Nueva',
  editar:      'Editar',
  exportar:    'Exportar',
}

// ── Genera breadcrumbs a partir del pathname ──────────────────────────────────
function buildCrumbs(pathname: string, labelOverrides?: BreadcrumbItem[]) {
  // Si se pasan overrides, usarlos directamente
  if (labelOverrides) return labelOverrides

  const segments = pathname.split('/').filter(Boolean)
  const crumbs: BreadcrumbItem[] = [{ label: 'Inicio', href: '/' }]

  segments.forEach((seg, i) => {
    const href = '/' + segments.slice(0, i + 1).join('/')
    // Si parece un UUID/ID (no tiene nombre legible), lo muestra abreviado
    const isId = /^[0-9a-f-]{20,}$/i.test(seg) || /^\d+[A-Z]+$/.test(seg)
    const label = isId
      ? seg.toUpperCase()
      : (SEGMENT_LABELS[seg] ?? seg.charAt(0).toUpperCase() + seg.slice(1))
    crumbs.push({ label, href })
  })

  return crumbs
}

// ── Tipos ─────────────────────────────────────────────────────────────────────
export interface BreadcrumbItem {
  label: string
  href: string
}

export interface PageHeaderProps {
  /** Título principal de la página */
  title: string
  /** Subtítulo / descriptor (opcional) */
  subtitle?: string
  /** Override del destino del botón Volver (por defecto: router.back() → '/') */
  backHref?: string
  /** Breadcrumbs manuales (si no se pasan, se generan desde el pathname) */
  breadcrumbs?: BreadcrumbItem[]
  /** Contenido opcional a la derecha del título (botones de acción) */
  actions?: React.ReactNode
  /** Si false, oculta el botón volver */
  showBack?: boolean
}

// ── Componente ────────────────────────────────────────────────────────────────
export function PageHeader({
  title,
  subtitle,
  backHref,
  breadcrumbs: breadcrumbsProp,
  actions,
  showBack = true,
}: PageHeaderProps) {
  const router = useRouter()
  const pathname = usePathname()

  const crumbs = buildCrumbs(pathname, breadcrumbsProp)
  // No mostramos breadcrumbs si solo hay "Inicio"
  const showCrumbs = crumbs.length > 1

  const handleBack = () => {
    if (backHref) {
      router.push(backHref)
      return
    }
    // Intenta navegar atrás; si no hay historial (ventana nueva), va a /
    if (window.history.length > 1) {
      router.back()
    } else {
      router.push('/')
    }
  }

  return (
    <div className="sticky top-0 z-10 glass-panel border-x-0 border-t-0 border-b px-4 py-2.5">
      <div className="max-w-5xl mx-auto">
        {/* ── Fila principal: back + título + acciones ── */}
        <div className="flex items-center gap-2">
          {showBack && (
            <button
              onClick={handleBack}
              aria-label="Volver"
              className={[
                'shrink-0 grid place-items-center',
                'size-8 rounded-full',
                // Cristal Apple-style
                'backdrop-blur-xl',
                'bg-white/8',
                'border border-white/16',
                'shadow-[0_1px_4px_rgba(0,0,0,0.30),0_1px_0_0_rgba(255,255,255,0.08)_inset]',
                'hover:bg-white/14',
                'active:scale-95',
                'transition-all duration-150',
                '-ml-1',
              ].join(' ')}
            >
              <ChevronLeft strokeWidth={2.5} className="size-4 [color:var(--text-secondary)]" />
            </button>
          )}

          {/* Título */}
          <div className="flex-1 min-w-0">
            <h1 className="font-bold text-sm leading-tight [color:var(--text-primary)] truncate">
              {title}
            </h1>
            {subtitle && (
              <p className="text-xs [color:var(--text-muted)] truncate mt-0.5">{subtitle}</p>
            )}
          </div>

          {/* Acciones opcionales */}
          {actions && (
            <div className="flex items-center gap-2 shrink-0">
              {actions}
            </div>
          )}
        </div>

        {/* ── Breadcrumbs ── */}
        {showCrumbs && (
          <nav
            aria-label="Navegación"
            className="flex items-center gap-1 mt-1 ml-10 overflow-x-auto scrollbar-none"
          >
            {crumbs.map((crumb, i) => {
              const isLast = i === crumbs.length - 1
              return (
                <span key={crumb.href} className="flex items-center gap-1 shrink-0">
                  {i === 0 && (
                    <Home strokeWidth={1.5} className="size-2.5 [color:var(--text-muted)]" />
                  )}
                  {isLast ? (
                    <span
                      className="text-[10px] font-semibold [color:var(--text-secondary)] truncate max-w-[160px]"
                      aria-current="page"
                    >
                      {crumb.label}
                    </span>
                  ) : (
                    <Link
                      href={crumb.href}
                      className="text-[10px] [color:var(--text-muted)] hover:[color:var(--text-secondary)] transition-colors truncate max-w-[120px]"
                    >
                      {i > 0 ? crumb.label : null}
                    </Link>
                  )}
                  {!isLast && (
                    <span className="text-[9px] [color:var(--text-muted)] opacity-50">/</span>
                  )}
                </span>
              )
            })}
          </nav>
        )}
      </div>
    </div>
  )
}
