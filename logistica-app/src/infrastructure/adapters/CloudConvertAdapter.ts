// ============================================================
// Adaptador de infraestructura: CloudConvertAdapter
//
// Implementa IDocumentConverterService usando la API REST v2 de
// CloudConvert (https://cloudconvert.com/api/v2).
//
// Flujo de conversión:
//   1. Crear Job con tres tareas encadenadas:
//      a) import/upload  – sube el DOCX.
//      b) convert        – convierte a PDF (office-convert).
//      c) export/url     – genera URL temporal del PDF.
//   2. Subir el archivo a la URL presignada devuelta por la tarea import.
//   3. Esperar a que el Job termine (polling con backoff exponencial).
//   4. Descargar el PDF resultante de la URL de export.
//
// Manejo de errores:
//   HTTP 402 → ERR_QUOTA_EXCEEDED (no reintentar, cuota agotada).
//   HTTP 5xx / red → ERR_PROVIDER_ERROR (retryable, se reintentan).
//   Job en estado 'error' → ERR_PROVIDER_ERROR.
//   Timeout de polling → ERR_TIMEOUT.
// ============================================================

import type {
  IDocumentConverterService,
  ConvertDocxToPdfInput,
  ConvertDocxToPdfOutput,
} from '@/src/core/domain/ports/IDocumentConverterService'
import { DocumentConversionError } from '@/src/core/domain/entities/DocumentConversionError'

// ── Constantes ────────────────────────────────────────────────────────────────

const CLOUDCONVERT_API_BASE = 'https://api.cloudconvert.com/v2'
const PROVIDER = 'cloudconvert' as const

/** Número máximo de intentos al crear el job o descargar el PDF. */
const MAX_RETRIES = 3

/** Tiempo base de backoff exponencial en ms. */
const BACKOFF_BASE_MS = 1_000

/** Tiempo máximo total de espera en polling (en ms). */
const POLLING_TIMEOUT_MS = 90_000

/** Intervalo inicial de polling en ms (crece exponencialmente). */
const POLLING_INTERVAL_MS = 2_000

// ── Tipos internos de la API de CloudConvert ──────────────────────────────────

interface CloudConvertTask {
  name: string
  operation: string
  status: 'waiting' | 'processing' | 'finished' | 'error'
  result?: {
    files?: Array<{ url: string; filename: string }>
  }
  message?: string
}

interface CloudConvertJob {
  id: string
  status: 'waiting' | 'processing' | 'finished' | 'error'
  tasks: CloudConvertTask[]
}

interface CloudConvertJobResponse {
  data: CloudConvertJob
}

interface CloudConvertUploadTaskResult {
  data: {
    result: {
      form: {
        url: string
        parameters: Record<string, string>
      }
    }
    id: string
    status: string
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Fetch con manejo centralizado de errores de CloudConvert.
 * Lanza DocumentConversionError en respuestas de error.
 */
async function cloudConvertFetch(
  url: string,
  options: RequestInit,
  stage: 'upload' | 'convert' | 'download' | 'unknown' = 'unknown',
): Promise<Response> {
  let response: Response

  try {
    response = await fetch(url, options)
  } catch (err) {
    throw new DocumentConversionError({
      message: `Error de red al conectar con CloudConvert: ${err instanceof Error ? err.message : String(err)}`,
      code: 'ERR_PROVIDER_ERROR',
      provider: PROVIDER,
      stage,
      retryable: true,
      cause: err,
    })
  }

  if (response.status === 402) {
    throw new DocumentConversionError({
      message: 'Cuota de CloudConvert agotada. Recarga créditos en cloudconvert.com.',
      code: 'ERR_QUOTA_EXCEEDED',
      provider: PROVIDER,
      stage,
      retryable: false,
    })
  }

  if (response.status >= 500) {
    throw new DocumentConversionError({
      message: `Error del servidor CloudConvert (HTTP ${response.status})`,
      code: 'ERR_PROVIDER_ERROR',
      provider: PROVIDER,
      stage,
      retryable: true,
    })
  }

  return response
}

/**
 * Espera a que el Job de CloudConvert finalice, con backoff exponencial.
 * Lanza DocumentConversionError si supera POLLING_TIMEOUT_MS.
 */
async function waitForJob(jobId: string, apiKey: string): Promise<CloudConvertJob> {
  const headers = { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' }
  const start = Date.now()
  let interval = POLLING_INTERVAL_MS

  while (true) {
    if (Date.now() - start > POLLING_TIMEOUT_MS) {
      throw new DocumentConversionError({
        message: `Timeout esperando la conversión del Job ${jobId} en CloudConvert`,
        code: 'ERR_TIMEOUT',
        provider: PROVIDER,
        stage: 'convert',
        retryable: false,
      })
    }

    await sleep(interval)
    interval = Math.min(interval * 1.5, 10_000) // backoff hasta 10 s

    const resp = await cloudConvertFetch(
      `${CLOUDCONVERT_API_BASE}/jobs/${jobId}`,
      { method: 'GET', headers },
      'convert',
    )

    const json = (await resp.json()) as CloudConvertJobResponse
    const job = json.data

    if (job.status === 'finished') return job

    if (job.status === 'error') {
      const failedTask = job.tasks.find((t) => t.status === 'error')
      throw new DocumentConversionError({
        message: `CloudConvert reportó error en el Job: ${failedTask?.message ?? 'sin detalle'}`,
        code: 'ERR_PROVIDER_ERROR',
        provider: PROVIDER,
        stage: 'convert',
        retryable: false,
      })
    }
    // status === 'waiting' | 'processing' → continuar polling
  }
}

// ── Adaptador ─────────────────────────────────────────────────────────────────

export class CloudConvertAdapter implements IDocumentConverterService {
  private readonly apiKey: string

  constructor(apiKey: string) {
    if (!apiKey || apiKey.trim() === '') {
      throw new Error(
        '[CloudConvertAdapter] CLOUDCONVERT_API_KEY no está configurada. ' +
          'Añádela a las variables de entorno.',
      )
    }
    this.apiKey = apiKey
  }

  async convertDocxToPdf(input: ConvertDocxToPdfInput): Promise<ConvertDocxToPdfOutput> {
    const { docxBuffer, fileName, correlationId } = input
    const headers = {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(correlationId ? { 'X-Correlation-ID': correlationId } : {}),
    }

    // ── 1. Crear el Job con las tres tareas ──────────────────────────────────
    const jobPayload = {
      tasks: {
        'import-docx': {
          operation: 'import/upload',
        },
        'convert-to-pdf': {
          operation: 'convert',
          input: 'import-docx',
          output_format: 'pdf',
          engine: 'office',
        },
        'export-pdf': {
          operation: 'export/url',
          input: 'convert-to-pdf',
          inline: false,
          archive_multiple_files: false,
        },
      },
    }

    let jobResponse: CloudConvertJobResponse | undefined
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const resp = await cloudConvertFetch(
          `${CLOUDCONVERT_API_BASE}/jobs`,
          { method: 'POST', headers, body: JSON.stringify(jobPayload) },
          'convert',
        )
        jobResponse = (await resp.json()) as CloudConvertJobResponse
        break
      } catch (err) {
        if (err instanceof DocumentConversionError && !err.metadata.retryable) throw err
        if (attempt === MAX_RETRIES) throw err
        await sleep(BACKOFF_BASE_MS * attempt)
      }
    }

    if (!jobResponse) {
      throw new DocumentConversionError({
        message: 'No se pudo crear el Job en CloudConvert tras varios intentos',
        code: 'ERR_PROVIDER_ERROR',
        provider: PROVIDER,
        stage: 'convert',
        retryable: false,
      })
    }

    const job = jobResponse.data

    // ── 2. Encontrar la tarea de upload y subir el DOCX ─────────────────────
    const importTask = job.tasks.find((t) => t.name === 'import-docx') as
      | (CloudConvertTask & { id?: string })
      | undefined

    // Obtener el detalle de la tarea import para conseguir la URL de upload
    const importTaskDetail = (await (
      await cloudConvertFetch(
        `${CLOUDCONVERT_API_BASE}/jobs/${job.id}?include=tasks`,
        { method: 'GET', headers: { Authorization: `Bearer ${this.apiKey}`, Accept: 'application/json' } },
        'upload',
      )
    ).json()) as {
      data: { tasks: Array<CloudConvertTask & { id: string; result?: { form?: { url: string; parameters: Record<string, string> } } }> }
    }

    const uploadTaskData = importTaskDetail.data.tasks.find((t) => t.name === 'import-docx')

    if (!uploadTaskData?.result?.form) {
      // Fallback: buscar la tarea por operation
      const fallback = importTaskDetail.data.tasks.find((t) => t.operation === 'import/upload')
      if (!fallback?.result?.form) {
        throw new DocumentConversionError({
          message: 'CloudConvert no devolvió una URL de upload válida',
          code: 'ERR_INVALID_RESPONSE',
          provider: PROVIDER,
          stage: 'upload',
          retryable: false,
        })
      }
    }

    const form = (uploadTaskData ?? importTask as unknown as typeof uploadTaskData)?.result?.form

    if (!form?.url) {
      throw new DocumentConversionError({
        message: 'CloudConvert no proporcionó formulario de upload',
        code: 'ERR_INVALID_RESPONSE',
        provider: PROVIDER,
        stage: 'upload',
        retryable: false,
      })
    }

    // Subir el DOCX como multipart/form-data
    const formData = new FormData()
    for (const [key, value] of Object.entries(form.parameters)) {
      formData.append(key, value)
    }
    formData.append('file', new Blob([new Uint8Array(docxBuffer)], {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    }), fileName)

    await cloudConvertFetch(form.url, { method: 'POST', body: formData }, 'upload')

    // ── 3. Esperar a que el Job termine (polling) ───────────────────────────
    const finishedJob = await waitForJob(job.id, this.apiKey)

    // ── 4. Descargar el PDF ─────────────────────────────────────────────────
    const exportTask = finishedJob.tasks.find((t) => t.name === 'export-pdf')
    const pdfUrl = exportTask?.result?.files?.[0]?.url

    if (!pdfUrl) {
      throw new DocumentConversionError({
        message: 'CloudConvert no devolvió URL de descarga del PDF',
        code: 'ERR_INVALID_RESPONSE',
        provider: PROVIDER,
        stage: 'download',
        retryable: false,
      })
    }

    let pdfResp: Response | undefined
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        pdfResp = await cloudConvertFetch(pdfUrl, { method: 'GET' }, 'download')
        break
      } catch (err) {
        if (err instanceof DocumentConversionError && !err.metadata.retryable) throw err
        if (attempt === MAX_RETRIES) throw err
        await sleep(BACKOFF_BASE_MS * attempt)
      }
    }

    if (!pdfResp) {
      throw new DocumentConversionError({
        message: 'No se pudo descargar el PDF de CloudConvert',
        code: 'ERR_PROVIDER_ERROR',
        provider: PROVIDER,
        stage: 'download',
        retryable: false,
      })
    }

    const pdfBuffer = Buffer.from(await pdfResp.arrayBuffer())

    return { pdfBuffer, provider: PROVIDER }
  }
}
