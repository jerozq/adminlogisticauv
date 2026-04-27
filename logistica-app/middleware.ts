import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const isDev = process.env.NODE_ENV === 'development'

function log(message: string, data?: unknown): void {
  if (isDev) {
    console.log(`[Middleware] ${message}`, data ?? '')
  }
}

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl
  log('Protegiendo ruta:', pathname)

  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseAnonKey) {
      log('Faltan variables de entorno Supabase')
      return NextResponse.redirect(new URL('/login', request.url))
    }

    // Cliente por-request con API getAll/setAll (requerida en @supabase/ssr ^0.5+)
    let response = NextResponse.next({ request })

    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    })

    // getUser() verifica el JWT contra Supabase (más seguro que getSession)
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser()

    if (error || !user) {
      log('Sin sesion válida, redirigiendo a login')
      const loginUrl = new URL('/login', request.url)
      loginUrl.searchParams.set('redirectTo', pathname)
      return NextResponse.redirect(loginUrl)
    }

    log('Usuario autenticado:', user.email)
    return response
  } catch (err) {
    // Captura de último recurso — NUNCA propagar excepción en Edge
    log('ERROR FATAL:', err instanceof Error ? err.message : 'Unknown error')
    return NextResponse.redirect(new URL('/login?reason=system_error', request.url))
  }
}

// ============ MATCHER ============
// Allowlist explícita: el middleware solo se invoca en estas rutas.
// La raíz '/' y '/login' quedan fuera intencionalmente → nunca causan MIDDLEWARE_INVOCATION_FAILED.
export const config = {
  matcher: [
    '/dashboard/:path*',
    '/admin/:path*',
    '/profile/:path*',
    '/account/:path*',
    '/cotizaciones/:path*',
    '/ejecucion/:path*',
    '/reembolsos/:path*',
    '/tarifario/:path*',
  ],
}