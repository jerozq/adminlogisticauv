'use client'

import { usePathname } from 'next/navigation'
import { FloatingNav } from './FloatingNav'

/**
 * AppShell — envuelve el contenido principal.
 * En /login muestra la página a pantalla completa sin nav ni padding.
 * En el resto de rutas muestra el FloatingNav y el pt-16 estándar.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isAuthRoute = pathname === '/login'

  if (isAuthRoute) {
    return <>{children}</>
  }

  return (
    <>
      <FloatingNav />
      <main className="flex-1 pt-16">{children}</main>
    </>
  )
}
