import { headers } from 'next/headers'

/**
 * Extrae el x-correlation-id de los headers del request actual.
 *
 * Útil en Server Actions y Route Handlers para propagar correlationId
 * al logger estructurado.
 *
 * @returns El correlation ID o 'unknown' si no está disponible.
 */
export async function getCorrelationId(): Promise<string> {
  const headersList = await headers()
  return headersList.get('x-correlation-id') ?? 'unknown'
}
