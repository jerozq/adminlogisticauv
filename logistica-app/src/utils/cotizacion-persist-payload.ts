import type {
  CotizacionItemDraft,
  ParsedRequerimiento,
  ReembolsoDetalleDraft,
  RequerimientoEncabezado,
  CronogramaEntregaDraft,
} from '@/types/cotizacion'

export interface GuardarCotizacionPayload {
  encabezado: RequerimientoEncabezado
  items: CotizacionItemDraft[]
  reembolsos: ReembolsoDetalleDraft[]
  fileName: string
  cronogramaSugerido: CronogramaEntregaDraft[]
}

export function buildGuardarCotizacionPayload(
  parsed: ParsedRequerimiento,
  fileName: string
): GuardarCotizacionPayload {
  return {
    encabezado: parsed.encabezado,
    items: parsed.items.map((item) => ({
      ...item,
      // Evita exceder el límite de body de Server Actions.
      opcionesTarifario: [],
    })),
    reembolsos: parsed.reembolsos,
    fileName,
    cronogramaSugerido: parsed.cronogramaSugerido ?? [],
  }
}
