import { describe, expect, it } from 'vitest'
import {
  sanitizeRequerimientoFileName,
  buildRequerimientoStoragePath,
} from '@/src/utils/requerimiento-file'

describe('requerimiento-file utils', () => {
  it('sanitiza nombres removiendo caracteres no permitidos', () => {
    const sanitized = sanitizeRequerimientoFileName('REQ 629PE (final).xlsx')
    expect(sanitized).toBe('REQ_629PE_final_.xlsx')
  })

  it('construye una ruta estable en carpeta requerimientos', () => {
    const path = buildRequerimientoStoragePath('Mi archivo.xlsx', 'abc-123')
    expect(path).toBe('requerimientos/abc-123-Mi_archivo.xlsx')
  })
})
