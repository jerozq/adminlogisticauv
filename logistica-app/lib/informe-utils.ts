import type { InformeActividad, ReembolsoInforme } from '@/actions/informes'

export type TipoVisualReembolso = 'transporte' | 'inhumacion'

export function obtenerTipoVisualReembolso(
  tipo: string,
  descripcion?: string | null,
  categoria?: string | null,
): TipoVisualReembolso {
  const tipoNormalizado = tipo.trim().toUpperCase()
  const descripcionNormalizada = descripcion?.toLowerCase() ?? ''
  const categoriaNormalizada = categoria?.toLowerCase() ?? ''

  if (
    categoriaNormalizada.includes('inhumaci') ||
    tipoNormalizado === 'INHUMACION' ||
    tipoNormalizado === 'PASIVO_TERCERO' ||
    descripcionNormalizada.includes('inhumaci')
  ) {
    return 'inhumacion'
  }

  return 'transporte'
}

export function calcularEstadoInforme(
  actividad: InformeActividad,
  reembolsos: ReembolsoInforme[],
): {
  pdf1Completo: boolean
  pdf2Completo: boolean
  pdf3Completo: boolean
  reembolsosCompleto: boolean
  porcentaje: number
} {
  // PDF 1 — Recibo de Satisfacción
  const pdf1Completo = !!actividad.recibo_satisfaccion_firmado_url

  // PDF 2 — Asistencia (independiente de los reembolsos de beneficiarios)
  const pdf2Completo = !!actividad.lista_asistencia_firmada_url

  // Reembolsos — cada beneficiario con su formato firmado (+ cédula si aplica)
  const reembolsosConDocs = reembolsos.filter((r) => {
    const tipoVisual = obtenerTipoVisualReembolso(r.tipo, r.descripcion, r.categoria)
    const requiereCedula = tipoVisual === 'transporte' || tipoVisual === 'inhumacion'
    return !!r.reembolso_firmado_url && (!requiereCedula || !!r.cedula_url)
  }).length
  const reembolsosCompleto = reembolsos.length === 0 || reembolsosConDocs === reembolsos.length

  // PDF 3 — Evidencias
  const pdf3Completo = !!actividad.informe_pdf3_url

  const items = [pdf1Completo, pdf2Completo, reembolsosCompleto, pdf3Completo]
  const porcentaje = Math.round((items.filter(Boolean).length / items.length) * 100)

  return { pdf1Completo, pdf2Completo, pdf3Completo, reembolsosCompleto, porcentaje }
}
