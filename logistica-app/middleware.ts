import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

// ============ CONFIGURACION ============
const isDev = process.env.NODE_ENV === 'development'
const PUBLIC_PATHS = ['/', '/login', '/register', '/about', '/contact']
const PROTECTED_PREFIXES = ['/dashboard', '/admin', '/profile', '/account']

// Cache simple para decisiones de ruta (1 minuto TTL)
const routeCache = new Map<string, { isProtected: boolean; timestamp: number }>()
const CACHE_TTL = 60000 // 1 minuto

// Timeout global para operaciones (3 segundos)
const OPERATION_TIMEOUT = 3000

// ============ FUNCIONES DE UTILIDAD ============
function log(message: string, data?: any) {
  if (isDev) {
    console.log(`[Middleware] ${message}`, data !== undefined ? data : '')
  }
}

function isProtectedRoute(pathname: string): boolean {
  // Verificar cache
  const cached = routeCache.get(pathname)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.isProtected
  }

  // Determinar si es ruta protegida
  const isProtected = PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix))

  // Guardar en cache
  routeCache.set(pathname, { isProtected, timestamp: Date.now() })

  return isProtected
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Operation timeout after ${ms}ms`)), ms)
    ),
  ])
}

function shouldProcessMiddleware(pathname: string): boolean {
  // Excluir assets estaticos y archivos con extension
  const excludePatterns = [
    '/_next/',
    '/api/',
    '/favicon.ico',
    '.svg', '.png', '.jpg', '.jpeg', '.gif', '.webp',
    '.css', '.js', '.json', '.woff', '.woff2', '.ttf',
  ]

  return !excludePatterns.some((pattern) => pathname.includes(pattern))
}

// ============ SUPABASE CLIENT (LAZY LOADING) ============
let supabaseClient: any = null

function getSupabaseClient(request: NextRequest) {
  if (!supabaseClient) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('Supabase environment variables are missing')
    }

    supabaseClient = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        // Middleware en Edge no puede modificar cookies facilmente
        // Estas funciones son no-op intencionalmente
        set() {},
        remove() {},
      },
    })
  }
  return supabaseClient
}

// ============ VERIFICACION DE SESION (CON PROTECCION) ============
async function checkSession(request: NextRequest) {
  try {
    const supabase = getSupabaseClient(request)

    const {
      data: { session },
      error,
    } = await withTimeout<any>(supabase.auth.getSession(), OPERATION_TIMEOUT)

    if (error) {
      log('Error en getSession:', error.message)
      return { session: null, error: error.message }
    }

    log('Sesion obtenida:', session ? 'Activa' : 'No hay sesion')
    return { session, error: null }
  } catch (error) {
    log('Excepcion en checkSession:', error instanceof Error ? error.message : 'Unknown error')
    return { session: null, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

// ============ MIDDLEWARE PRINCIPAL ============
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  log('=== NUEVA SOLICITUD ===')
  log('URL:', request.url)
  log('Pathname:', pathname)
  log('Method:', request.method)

  // 1. Verificar si debemos procesar esta ruta
  if (!shouldProcessMiddleware(pathname)) {
    log('Ruta excluida, continuando sin procesar')
    return NextResponse.next()
  }

  // 2. Rutas publicas que no requieren autenticacion
  if (PUBLIC_PATHS.includes(pathname)) {
    log('Ruta publica, permitiendo acceso')
    return NextResponse.next()
  }

  // 3. Verificar si es ruta protegida
  const protectedRoute = isProtectedRoute(pathname)
  if (!protectedRoute) {
    log('Ruta no protegida, continuando')
    return NextResponse.next()
  }

  log('Ruta protegida, verificando autenticacion')

  // 4. Verificar sesion con todas las protecciones
  try {
    // Validar variables de entorno primero
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      log('ERROR: Variables de entorno Supabase no configuradas')
      // En produccion, redirigir a login en lugar de fallar
      if (!isDev) {
        return NextResponse.redirect(new URL('/login', request.url))
      }
      return NextResponse.next()
    }

    const { session, error } = await checkSession(request)

    if (error) {
      log('Error verificando sesion, redirigiendo a login por seguridad:', error)
      return NextResponse.redirect(new URL('/login?error=auth_failed', request.url))
    }

    if (!session) {
      log('No hay sesion activa, redirigiendo a login')
      const loginUrl = new URL('/login', request.url)
      loginUrl.searchParams.set('redirectTo', pathname)
      return NextResponse.redirect(loginUrl)
    }

    log('Sesion valida, permitiendo acceso a ruta protegida')
    return NextResponse.next()
  } catch (error) {
    // Captura de ultimo recurso - NUNCA lanzar excepcion
    log('ERROR FATAL en middleware:', error instanceof Error ? error.message : 'Unknown error')
    log('Stack:', error instanceof Error ? error.stack : 'No stack available')

    // En desarrollo, mostrar error visualmente
    if (isDev) {
      return new NextResponse(
        `Middleware Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { status: 500 }
      )
    }

    // En produccion, redirigir suavemente a login
    return NextResponse.redirect(new URL('/login?error=system_error', request.url))
  }
}

// ============ CONFIGURACION DEL MATCHER ============
export const config = {
  matcher: [
    /*
     * Excluir explicitamente:
     * - API routes (/api/*)
     * - Archivos estaticos de Next.js (/_next/*)
     * - Imagenes optimizadas (/_next/image/*)
     * - Favicon
     * - Archivos de assets con extensiones comunes
     * - Archivos en carpeta public
     */
    '/((?!api|_next/static|_next/image|favicon.ico|public|.*\\.(?:svg|png|jpg|jpeg|gif|webp|css|js|json|woff|woff2|ttf|ico)$).*)',
  ],
}