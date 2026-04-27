// ============================================================
// Next.js Instrumentation Hook
//
// Next.js 15+ llama a `register()` una sola vez al arrancar
// el proceso Node.js, antes de que cualquier request sea
// procesado. Docs: https://nextjs.org/docs/app/guides/instrumentation
//
// IMPORTANTE: El import dinámico es necesario para evitar que
// los módulos de servidor (sdk-node) se incluyan en el bundle
// del Edge Runtime.
// ============================================================

export async function register() {
  // Solo se ejecuta en el runtime de Node.js (no en Edge Functions).
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { initSDK } = await import('./src/infrastructure/observability/tracer')
    initSDK()
  }
}
