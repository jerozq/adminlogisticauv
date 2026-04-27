import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// ============ CONFIGURACION ============
const isDev = process.env.NODE_ENV === 'development'
const PUBLIC_PATHS = ['/', '/login', '/register', '/about', '/contact']
const PROTECTED_PREFIXES = ['/dashboard', '/admin', '/profile', '/account']

function log(message: string, data?: unknown): void {
  if (isDev) {
    console.log(`[Middleware] ${message}`, data ?? '')
  }
}

// ============ MIDDLEWARE PRINCIPAL ============
export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl

  log('Request:', pathname)

  try {
    // 1. Rutas publicas — early return sin tocar Supabase
    if (PUBLIC_PATHS.includes(pathname)) {
      return NextResponse.next()
    }

    // 2. Solo verificar auth en rutas protegidas
    const isProtected = PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix))
    if (!isProtected) {
      return NextResponse.next()
    }

    // 3. Validar variables de entorno
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseAnonKey) {
      log('Faltan variables de entorno Supabase')
      return NextResponse.redirect(new URL('/login', request.url))
    }

    // 4. Cliente Supabase por-request con API getAll/setAll (requerida en @supabase/ssr ^0.5+)
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

    // 5. getUser() verifica el JWT contra Supabase (mas seguro que getSession())
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser()

    if (error) {
      log('Error de autenticacion:', error.message)
      const loginUrl = new URL('/login', request.url)
      loginUrl.searchParams.set('redirectTo', pathname)
      loginUrl.searchParams.set('reason', 'auth_error')
      return NextResponse.redirect(loginUrl)
    }

    if (!user) {
      log('Sin sesion activa, redirigiendo')
      const loginUrl = new URL('/login', request.url)
      loginUrl.searchParams.set('redirectTo', pathname)
      return NextResponse.redirect(loginUrl)
    }

    log('Usuario autenticado, acceso permitido')
    return response
  } catch (err) {
    // Captura de ultimo recurso — NUNCA propagar excepcion en Edge
    const message = err instanceof Error ? err.message : 'Unknown error'
    log('ERROR FATAL:', message)

    return NextResponse.redirect(new URL('/login?reason=system_error', request.url))
  }
}

// ============ MATCHER ============
export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|_next/data|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|css|js|json|woff|woff2|ttf|ico)$).*)',
  ],
}