// Utilidades de Supabase para uso en componentes cliente (browser-only)
// Usado para subir archivos directamente desde el dispositivo del usuario
import { getSupabase } from './supabase'
import { trace } from '@opentelemetry/api'

/**
 * Sube un archivo al bucket 'evidencias' de Supabase Storage.
 * Retorna la URL pública del archivo subido.
 *
 * @param file    - Archivo seleccionado / capturado con la cámara
 * @param folder  - Carpeta dentro del bucket: 'entregas' | 'soportes'
 */
export async function uploadEvidencia(
  file: File,
  folder: 'entregas' | 'soportes'
): Promise<string> {
  const tracer = trace.getTracer('logistica-browser')
  
  return tracer.startActiveSpan('upload_evidencia_foto', async (span) => {
    try {
      span.setAttribute('file.name', file.name)
      span.setAttribute('file.size', file.size)
      span.setAttribute('file.type', file.type)
      span.setAttribute('file.folder', folder)

      const sb = getSupabase()
      const ext = file.name.split('.').pop() ?? 'jpg'
      const uniqueName = `${Date.now()}-${crypto.randomUUID()}.${ext}`
      const path = `${folder}/${uniqueName}`

      const { data, error } = await sb.storage
        .from('evidencias')
        .upload(path, file, { upsert: false, contentType: file.type })

      if (error) {
        span.recordException(error)
        throw new Error(`Error subiendo archivo: ${error.message}`)
      }

      const {
        data: { publicUrl },
      } = sb.storage.from('evidencias').getPublicUrl(data.path)

      span.setAttribute('file.publicUrl', publicUrl)
      span.end()
      
      return publicUrl
    } catch (err: unknown) {
      span.recordException(err instanceof Error ? err : new Error(String(err)))
      span.end()
      throw err
    }
  })
}
