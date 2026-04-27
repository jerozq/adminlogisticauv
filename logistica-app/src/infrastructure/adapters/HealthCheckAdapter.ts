import { getSupabase } from '@/lib/supabase'

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

export class HealthCheckAdapter {
  async checkDatabase(): Promise<ServiceStatus> {
    const start = Date.now()
    try {
      const sb = getSupabase()
      const { error } = await sb
        .from('requerimientos')
        .select('id', { count: 'exact', head: true })
        .limit(1)

      if (error) throw error
      return { ok: true, latencyMs: Date.now() - start }
    } catch (err) {
      return {
        ok: false,
        latencyMs: Date.now() - start,
        error: err instanceof Error ? err.message : 'Error desconocido',
      }
    }
  }

  async checkStorage(): Promise<ServiceStatus> {
    const start = Date.now()
    try {
      const sb = getSupabase()
      const { error } = await sb.storage.from('evidencias').list('', { limit: 1 })

      // Un error 'Bucket not found' aún significa que Storage está respondiendo
      if (error && !error.message.includes('not found') && !error.message.includes('does not exist')) {
        throw error
      }
      return { ok: true, latencyMs: Date.now() - start }
    } catch (err) {
      return {
        ok: false,
        latencyMs: Date.now() - start,
        error: err instanceof Error ? err.message : 'Error desconocido',
      }
    }
  }

  async fetchHealth(): Promise<HealthReport> {
    const [database, storage] = await Promise.all([this.checkDatabase(), this.checkStorage()])
    
    const allOk = database.ok && storage.ok
    return {
      status: allOk ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      services: { database, storage },
    }
  }
}

let _healthAdapter: HealthCheckAdapter | null = null

export function getHealthCheckAdapter(): HealthCheckAdapter {
  if (!_healthAdapter) {
    _healthAdapter = new HealthCheckAdapter()
  }
  return _healthAdapter
}
