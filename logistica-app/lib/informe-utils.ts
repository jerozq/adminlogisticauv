import type { InformeActividad, ReembolsoInforme } from '@/actions/informes'

export function calcularEstadoInforme(
  actividad: InformeActividad,
  reembolsos: ReembolsoInforme[],
): {
  pdf1Completo: boolean
  pdf2Completo: boolean
  pdf3Completo: boolean
  porcentaje: number
} {
  const pdf1Completo = !!actividad.recibo_satisfaccion_firmado_url

  const tieneListaAsistencia = !!actividad.lista_asistencia_firmada_url
  const reembolsosConDocs = reembolsos.filter(
    (r) => !!r.reembolso_firmado_url && !!r.cedula_url,
  ).length
  const pdf2Completo =
    tieneListaAsistencia &&
    (reembolsos.length === 0 || reembolsosConDocs === reembolsos.length) &&
    !!actividad.informe_pdf2_url

  const pdf3Completo = !!actividad.informe_pdf3_url

  const completados = [pdf1Completo, pdf2Completo, pdf3Completo].filter(Boolean).length
  const porcentaje = Math.round((completados / 3) * 100)

  return { pdf1Completo, pdf2Completo, pdf3Completo, porcentaje }
}
