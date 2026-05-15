'use client'

import { useTransition } from 'react'
import {
  FileText,
  ClipboardList,
  Bus,
  Flower2,
  UserCheck,
  Camera,
  CheckCircle2,
  Clock,
  ImageIcon,
  ExternalLink,
} from 'lucide-react'
import { UploadDocumento } from './UploadDocumento'
import { DescargarPDFButton } from '@/components/informes/DescargarPDFButton'
import { GenerarEvidenciasPDFButton } from '@/components/informes/GenerarEvidenciasPDFButton'
import {
  subirDocumentoBeneficiario,
  subirDocumentoActividad,
} from '@/actions/informes'
import { calcularEstadoInforme, obtenerTipoVisualReembolso } from '@/lib/informe-utils'
import type { InformeActividad, ReembolsoInforme, EvidenciaInforme } from '@/actions/informes'

// ============================================================
// TabInforme
//
// Tab "Generar Informe" dentro de /ejecucion/[id]
//
// Secciones:
//   1. Documentos de la Actividad — Lista Asistencia + Recibo Satisfacción
//   2. Formatos de Reembolso — tabla de beneficiarios con upload
//   3. Vista Previa de Evidencias — fotos del cronograma (fuente del PDF 3)
// ============================================================

// ── Helpers ──────────────────────────────────────────────────

const COP = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
})

function fmtCOP(v: number) {
  return COP.format(v)
}

// ── Sección header ───────────────────────────────────────────

function SectionHeader({ icon, title, badge }: {
  icon: React.ReactNode
  title: string
  badge?: string
}) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <span className="[color:var(--text-muted)]">{icon}</span>
        <h3 className="text-sm font-semibold [color:var(--text-secondary)]">{title}</h3>
      </div>
      {badge && (
        <span className="text-xs px-2 py-0.5 rounded-full border [border-color:var(--surface-border)] [color:var(--text-muted)]">
          {badge}
        </span>
      )}
    </div>
  )
}

// ── Badge de estado ──────────────────────────────────────────

function DocBadge({ url }: { url: string | null }) {
  if (url) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-400">
        <CheckCircle2 strokeWidth={2} className="size-3.5" />
        Completo
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs [color:var(--text-muted)]">
      <Clock strokeWidth={1.5} className="size-3.5" />
      Pendiente
    </span>
  )
}

// ── Barra de progreso del informe ─────────────────────────────

function ProgressBar({ porcentaje, pdf1, pdf2, pdf3 }: {
  porcentaje: number
  pdf1: boolean
  pdf2: boolean
  pdf3: boolean
}) {
  const dot = (ok: boolean, label: string) => (
    <div className="flex items-center gap-1.5">
      <span className={`size-2 rounded-full ${ok ? 'bg-emerald-400' : '[background:var(--surface-border)]'}`} />
      <span className={`text-xs ${ok ? 'text-emerald-400' : '[color:var(--text-muted)]'}`}>{label}</span>
    </div>
  )

  return (
    <div className="glass-panel rounded-2xl p-4 mb-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold [color:var(--text-secondary)]">Progreso del Informe</span>
        <span className={`text-xs font-bold ${porcentaje === 100 ? 'text-emerald-400' : '[color:var(--text-muted)]'}`}>
          {porcentaje}%
        </span>
      </div>
      <div className="h-1.5 rounded-full [background:var(--surface-border)] overflow-hidden mb-3">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${porcentaje}%`,
            background: porcentaje === 100
              ? 'linear-gradient(90deg,#34d399,#10b981)'
              : 'linear-gradient(90deg,#818cf8,#a78bfa)',
          }}
        />
      </div>
      <div className="flex items-center gap-4">
        {dot(pdf1, 'PDF 1')}
        {dot(pdf2, 'PDF 2')}
        {dot(pdf3, 'PDF 3')}
      </div>
    </div>
  )
}

// ── Componente principal ─────────────────────────────────────

interface Props {
  actividadId: string
  actividad: InformeActividad
  reembolsos: ReembolsoInforme[]
  evidencias: EvidenciaInforme[]
}

export function TabInforme({ actividadId, actividad, reembolsos, evidencias }: Props) {
  const [, startTransition] = useTransition()
  const estado = calcularEstadoInforme(actividad, reembolsos)

  // ── Handlers para documentos de la actividad ─────────────

  function handleSubirActividad(
    campo: 'lista_asistencia_firmada_url' | 'recibo_satisfaccion_firmado_url' | 'informe_pdf2_url' | 'informe_pdf3_url',
  ) {
    return async (url: string) => {
      await subirDocumentoActividad(actividadId, campo, url)
    }
  }

  // ── Handlers para documentos de beneficiarios ────────────

  function handleSubirBeneficiario(
    itemId: string,
    campo: 'reembolso_firmado_url' | 'cedula_url',
  ) {
    return async (url: string) => {
      await subirDocumentoBeneficiario(itemId, actividadId, campo, url)
    }
  }

  // ── Render ────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* Barra de progreso */}
      <ProgressBar
        porcentaje={estado.porcentaje}
        pdf1={estado.pdf1Completo}
        pdf2={estado.pdf2Completo}
        pdf3={estado.pdf3Completo}
      />

      {/* ══════════════════════════════════════════
          SECCIÓN 1 — Documentos de la Actividad
          ══════════════════════════════════════════ */}
      <div>
        <SectionHeader
          icon={<FileText strokeWidth={1.5} className="size-4" />}
          title="Documentos de la Actividad"
          badge="PDF 1 y PDF 2 (portada)"
        />

        <div className="space-y-2">

          {/* Recibo de Satisfacción */}
          <div className="glass-panel rounded-xl p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold [color:var(--text-primary)]">
                  Recibo de Satisfacción
                </p>
                <p className="text-xs [color:var(--text-muted)] mt-0.5">
                  Formato de cumplimiento de requisitos — firmado por el profesional
                </p>
                <div className="mt-2">
                  <DocBadge url={actividad.recibo_satisfaccion_firmado_url} />
                </div>
              </div>
              <div className="flex flex-col items-end gap-2 shrink-0">
                <DescargarPDFButton
                  label="Descargar Formato"
                  tipo="recibo-satisfaccion"
                  actividad={actividad}
                  reembolsos={reembolsos}
                />
                {actividad.recibo_satisfaccion_firmado_url && (
                  <a
                    href={actividad.recibo_satisfaccion_firmado_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs [color:var(--text-muted)] hover:[color:var(--text-secondary)] transition-colors"
                  >
                    <ExternalLink strokeWidth={1.5} className="size-3.5" />
                    Ver firmado
                  </a>
                )}
                <UploadDocumento
                  label="Subir Firmado"
                  currentUrl={actividad.recibo_satisfaccion_firmado_url}
                  uploadFolder="firmados"
                  onSuccess={handleSubirActividad('recibo_satisfaccion_firmado_url')}
                />
              </div>
            </div>
          </div>

          {/* Lista de Asistencia */}
          <div className="glass-panel rounded-xl p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold [color:var(--text-primary)]">
                  Lista de Asistencia
                </p>
                <p className="text-xs [color:var(--text-muted)] mt-0.5">
                  Portada del PDF 2 — firmada por todos los asistentes
                </p>
                <div className="mt-2">
                  <DocBadge url={actividad.lista_asistencia_firmada_url} />
                </div>
              </div>
              <div className="flex flex-col items-end gap-2 shrink-0">
                <DescargarPDFButton
                  label="Descargar Formato"
                  tipo="lista-asistencia"
                  actividad={actividad}
                  reembolsos={reembolsos}
                />
                {actividad.lista_asistencia_firmada_url && (
                  <a
                    href={actividad.lista_asistencia_firmada_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs [color:var(--text-muted)] hover:[color:var(--text-secondary)] transition-colors"
                  >
                    <ExternalLink strokeWidth={1.5} className="size-3.5" />
                    Ver firmada
                  </a>
                )}
                <UploadDocumento
                  label="Subir Firmada"
                  currentUrl={actividad.lista_asistencia_firmada_url}
                  uploadFolder="asistencia"
                  onSuccess={handleSubirActividad('lista_asistencia_firmada_url')}
                />
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* ══════════════════════════════════════════
          SECCIÓN 2 — Formatos de Reembolso
          ══════════════════════════════════════════ */}
      <div>
        <SectionHeader
          icon={<ClipboardList strokeWidth={1.5} className="size-4" />}
          title="Formatos de Reembolso"
          badge={`${reembolsos.length} beneficiarios`}
        />

        {reembolsos.length === 0 ? (
          <div className="glass-panel rounded-xl p-8 text-center">
            <UserCheck strokeWidth={1} className="size-8 [color:var(--text-muted)] mx-auto mb-2" />
            <p className="text-sm [color:var(--text-muted)]">No hay reembolsos registrados para esta actividad.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {reembolsos.map((r) => {
              const tipoVisual = obtenerTipoVisualReembolso(r.tipo, r.descripcion)
              // Habilitar cédula solo para rubros de Transporte e Inhumación
              const habilitarCedula = tipoVisual === 'transporte' || tipoVisual === 'inhumacion' || r.tipo === 'REEMBOLSO' || r.tipo === 'PASIVO_TERCERO'

              const firmadoOk = !!r.reembolso_firmado_url
              const cedulaOk = !!r.cedula_url
              const completo = firmadoOk && (!habilitarCedula || cedulaOk)

              return (
                <div
                  key={r.id}
                  className={`glass-panel rounded-xl p-3 border-l-2 transition-colors ${
                    completo
                      ? 'border-l-emerald-500/40'
                      : firmadoOk
                      ? 'border-l-amber-500/40'
                      : 'border-l-white/10'
                  }`}
                >
                  {/* Fila superior: nombre + tipo + monto */}
                  <div className="flex items-start gap-2 mb-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {tipoVisual === 'inhumacion' ? (
                          <Flower2 strokeWidth={1.5} className="size-3.5 text-purple-400 shrink-0" />
                        ) : (
                          <Bus strokeWidth={1.5} className="size-3.5 text-blue-400 shrink-0" />
                        )}
                        <span className="text-sm font-semibold [color:var(--text-primary)] truncate">
                          {r.beneficiario_nombre ?? r.descripcion}
                        </span>
                        {r.beneficiario_documento && (
                          <span className="text-xs [color:var(--text-muted)] font-mono">
                            {r.beneficiario_documento}
                          </span>
                        )}
                      </div>
                      <p className="text-xs [color:var(--text-muted)] mt-0.5 truncate">
                        {r.descripcion}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <span className="text-sm font-bold [color:var(--text-primary)]">
                        {fmtCOP(r.precio_total ?? 0)}
                      </span>
                    </div>
                  </div>

                  {/* Fila inferior: botones de upload */}
                  <div className="flex items-center gap-2 flex-wrap pt-1 border-t [border-color:var(--surface-border)]">
                    {/* Siempre: Reembolso firmado */}
                    <UploadDocumento
                      label="Subir Firmado"
                      currentUrl={r.reembolso_firmado_url}
                      uploadFolder="firmados"
                      onSuccess={handleSubirBeneficiario(r.id, 'reembolso_firmado_url')}
                    />

                    {/* Solo para Transporte e Inhumación: Cédula */}
                    {habilitarCedula && (
                      <UploadDocumento
                        label="Subir Cédula"
                        currentUrl={r.cedula_url}
                        uploadFolder="cedulas"
                        accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
                        onSuccess={handleSubirBeneficiario(r.id, 'cedula_url')}
                      />
                    )}

                    {/* Indicador de completitud */}
                    {completo && (
                      <span className="ml-auto text-xs font-medium text-emerald-400 flex items-center gap-1">
                        <CheckCircle2 strokeWidth={2} className="size-3.5" />
                        Completo
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════
          SECCIÓN 3 — Evidencias (fuente del PDF 3)
          ══════════════════════════════════════════ */}
      <div>
        <SectionHeader
          icon={<Camera strokeWidth={1.5} className="size-4" />}
          title="Evidencias de Campo"
          badge={`PDF 3 · ${evidencias.length} fotos`}
        />

        {evidencias.length === 0 ? (
          <div className="glass-panel rounded-xl p-8 text-center">
            <ImageIcon strokeWidth={1} className="size-8 [color:var(--text-muted)] mx-auto mb-2" />
            <p className="text-sm [color:var(--text-muted)]">
              Las evidencias subidas en la Agenda aparecerán aquí para el PDF 3.
            </p>
          </div>
        ) : (
          <div className="glass-panel rounded-xl p-3">
            <p className="text-xs [color:var(--text-muted)] mb-3">
              Estas fotos se incluirán automáticamente en el PDF 3 al generarlo.
            </p>
            <div className="grid grid-cols-2 gap-2">
              {evidencias.map((ev) => (
                <a
                  key={ev.id}
                  href={ev.evidencia_url!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group relative rounded-xl overflow-hidden aspect-video bg-zinc-900/50 hover:ring-2 hover:ring-violet-500/40 transition-all"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={ev.evidencia_url!}
                    alt={ev.descripcion}
                    className="w-full h-full object-cover group-hover:opacity-80 transition-opacity"
                    loading="lazy"
                  />
                  {/* Label sobre la foto */}
                  <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent p-2">
                    <p className="text-xs font-medium text-white/90 line-clamp-1">
                      {ev.descripcion}
                    </p>
                  </div>
                  {/* Icono hover */}
                  <div className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <ExternalLink strokeWidth={1.5} className="size-3.5 text-white drop-shadow" />
                  </div>
                </a>
              ))}
            </div>

            {/* Generar + estado PDF 3 */}
            <div className="mt-3 pt-3 border-t [border-color:var(--surface-border)] flex items-center justify-between gap-3">
              <GenerarEvidenciasPDFButton
                actividad={actividad}
                evidencias={evidencias}
              />
              {actividad.informe_pdf3_url && (
                <a
                  href={actividad.informe_pdf3_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-medium text-emerald-400 hover:text-emerald-300 transition-colors"
                >
                  <CheckCircle2 strokeWidth={2} className="size-3.5" />
                  Ver PDF 3
                  <ExternalLink strokeWidth={1.5} className="size-3" />
                </a>
              )}
            </div>
          </div>
        )}
      </div>

    </div>
  )
}
