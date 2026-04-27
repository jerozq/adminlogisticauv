import { NextResponse } from 'next/server'


// ============================================================
// GET /api/health
//
// Verifica la disponibilidad de los servicios de infraestructura:
//   - DB: query simple a la tabla requerimientos
//   - Storage: listado del bucket 'evidencias'
//
// Responde con HTTP 200 si todos los servicios están OK,
// o HTTP 503 si alguno falla, para facilitar la integración
// con balanceadores de carga y sistemas de monitoreo.
// ============================================================

export interface ServiceStatus {
  ok: boolean
  latencyMs: number
  error?: string
}

export interface HealthReport {
  status: 'healthy' | 'degraded'
  timestamp: string
  services: {
    database: ServiceStatus
    storage: ServiceStatus
  }
}

import { getHealthCheckAdapter } from '@/src/infrastructure/adapters/HealthCheckAdapter'

export async function GET(): Promise<NextResponse<HealthReport>> {
  const adapter = getHealthCheckAdapter()
  const report = await adapter.fetchHealth()

  return NextResponse.json(report, { status: report.status === 'healthy' ? 200 : 503 })
}
