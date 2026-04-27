'use client'

import { useState } from 'react'
import {
  FileUp,
  ClipboardList,
  PenLine,
  Lock,
  CheckCircle2,
  Loader2,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  FileText,
} from 'lucide-react'
import { FileUploader } from '@/components/cotizaciones/FileUploader'
import { RequerimientoHeader } from '@/components/cotizaciones/RequerimientoHeader'
import { CotizacionPreview } from '@/components/cotizaciones/CotizacionPreview'
import { guardarCotizacion } from '@/actions/cotizaciones'
import type {
  CotizacionItemDraft,
  ParsedRequerimiento,
  RequerimientoEncabezado,
  WizardStep,
} from '@/types/cotizacion'

// ============================================================
// Indicador de pasos
// ============================================================

const STEPS: { id: WizardStep; label: string; icon: React.ReactNode }[] = [
  { id: 1, label: 'Cargar', icon: <FileUp className="size-4" /> },
  { id: 2, label: 'Encabezado', icon: <ClipboardList className="size-4" /> },
  { id: 3, label: 'Ítems', icon: <PenLine className="size-4" /> },
  { id: 4, label: 'Guardar', icon: <Lock className="size-4" /> },
]

function StepIndicator({ current }: { current: WizardStep }) {
  return (
    <nav aria-label="Pasos del formulario" className="flex items-center justify-center gap-0">
      {STEPS.map((step, idx) => {
        const done = step.id < current
        const active = step.id === current
        return (
          <div key={step.id} className="flex items-center">
            <div
              className={[
                'flex flex-col items-center gap-1',
              ].join(' ')}
            >
              <div
                className={[
                  'flex size-9 items-center justify-center rounded-full text-sm font-bold transition-colors',
                  done
                    ? '[background:var(--state-ok-dot)] text-white'
                    : active
                    ? '[background:var(--accent)] [color:var(--accent-fg)] shadow-sm'
                    : '[background:var(--surface)] [color:var(--text-muted)]',
                ].join(' ')}
              >
                {done ? <CheckCircle2 className="size-4" /> : step.icon}
              </div>
              <span
                className={[
                  'hidden sm:block text-xs font-medium',
                  active ? '[color:var(--state-prep-fg)]' : done ? '[color:var(--state-ok-fg)]' : '[color:var(--text-muted)]',
                ].join(' ')}
              >
                {step.label}
              </span>
            </div>
            {idx < STEPS.length - 1 && (
              <div
                className={[
                  'mx-1 h-0.5 w-8 sm:w-12 rounded transition-colors',
                  done ? '[background:var(--state-ok-dot)]' : '[background:var(--surface-border)]',
                ].join(' ')}
              />
            )}
          </div>
        )
      })}
    </nav>
  )
}

// ============================================================
// Página principal
// ============================================================

export default function NuevaCotizacionPage() {
  const [step, setStep] = useState<WizardStep>(1)
  const [fileName, setFileName] = useState('')
  const [encabezado, setEncabezado] = useState<RequerimientoEncabezado | null>(null)
  const [items, setItems] = useState<CotizacionItemDraft[]>([])
  const [cronogramaSugerido, setCronogramaSugerido] = useState<ParsedRequerimiento['cronogramaSugerido']>([])
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [savedIds, setSavedIds] = useState<{ requerimientoId: string; cotizacionId: string } | null>(null)

  function onParsed(data: ParsedRequerimiento, name: string) {
    setFileName(name)
    setEncabezado(data.encabezado)
    setItems(data.items)
    setCronogramaSugerido(data.cronogramaSugerido ?? [])
    setStep(2)
  }

  async function handleGuardar() {
    if (!encabezado) return
    setSaving(true)
    setSaveError(null)
    try {
      // Evita exceder el límite de body de Server Actions.
      // Las sugerencias de tarifario no son necesarias para persistir.
      const itemsToSave: CotizacionItemDraft[] = items.map((it) => ({
        ...it,
        opcionesTarifario: [],
      }))

      const result = await guardarCotizacion(
        encabezado,
        itemsToSave,
        [],
        fileName,
        cronogramaSugerido
      )
      if (result.ok) {
        setSavedIds({ requerimientoId: result.requerimientoId, cotizacionId: result.cotizacionId })
        setStep(4)
      } else {
        setSaveError(result.error)
        window.scrollTo({ top: 0, behavior: 'smooth' })
      }
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Error inesperado')
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen [background:var(--background)]">
      {/* Header */}
      <header className="sticky top-0 z-10 glass-panel border-x-0 border-t-0 border-b">
        <div className="mx-auto flex max-w-2xl flex-col gap-3 px-4 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-base font-bold [color:var(--text-primary)]">Nueva cotización</h1>
            {fileName && (
              <span className="max-w-[160px] truncate rounded-full [background:var(--surface)] px-3 py-1 text-xs [color:var(--text-muted)]">
                {fileName}
              </span>
            )}
          </div>
          <StepIndicator current={step} />
        </div>
      </header>

      {/* Contenido */}
      <main className="mx-auto max-w-2xl px-4 py-6 pb-28">
        {/* ─── Paso 1: Cargar Excel ─── */}
        {step === 1 && (
          <section className="flex flex-col gap-4">
            <div>
              <h2 className="text-lg font-bold [color:var(--text-primary)]">Carga el requerimiento</h2>
              <p className="mt-1 text-sm [color:var(--text-muted)]">
                Excel de la Unidad para las Víctimas (formato UARIV).
                El sistema extrae automáticamente encabezado e ítems, incluyendo servicios de inhumación.
              </p>
            </div>
            <FileUploader onParsed={onParsed} />
          </section>
        )}

        {/* ─── Paso 2: Revisar encabezado ─── */}
        {step === 2 && encabezado && (
          <section className="flex flex-col gap-6">
            <div>
              <h2 className="text-lg font-bold [color:var(--text-primary)]">Verifica el encabezado</h2>
              <p className="mt-1 text-sm [color:var(--text-muted)]">
                Corrige los datos extraídos del Excel si es necesario.
              </p>
            </div>
            <RequerimientoHeader
              encabezado={encabezado}
              onChange={setEncabezado}
            />
          </section>
        )}

        {/* ─── Paso 3: Editar ítems ─── */}
        {step === 3 && encabezado && (
          <section className="flex flex-col gap-6">
            {/* Error de guardado arriba para que siempre sea visible */}
            {saveError && (
              <div className="flex items-start gap-3 rounded-xl pill-cancel px-4 py-3 text-sm">
                <span className="mt-0.5 text-lg leading-none">⚠️</span>
                <span>{saveError}</span>
              </div>
            )}
            <div>
              <h2 className="text-lg font-bold [color:var(--text-primary)]">Edita la cotización</h2>
              <p className="mt-1 text-sm [color:var(--text-muted)]">
                Ajusta cantidades, precios y añade o elimina ítems.
                Los <span className="font-semibold [color:var(--state-run-fg)]">ítems passthrough</span> son costos
                de terceros sin margen de utilidad.
              </p>
            </div>
            <CotizacionPreview
              items={items}
              onItemsChange={setItems}
              locked={false}
            />
          </section>
        )}

        {/* ─── Paso 4: Confirmación ─── */}
        {step === 4 && savedIds && (
          <section className="flex flex-col items-center gap-6 py-8 text-center">
            <div className="flex size-20 items-center justify-center rounded-full [background:var(--state-ok-bg)]">
              <CheckCircle2 className="size-10 [color:var(--state-ok-fg)]" />
            </div>
            <div>
              <h2 className="text-xl font-bold [color:var(--text-primary)]">¡Cotización guardada!</h2>
              <p className="mt-2 text-sm [color:var(--text-muted)]">
                Se creó el requerimiento y la cotización versión 1 en Supabase.
              </p>
            </div>

            {/* Preview de encabezado bloqueado */}
            {encabezado && (
              <div className="w-full">
                <RequerimientoHeader
                  encabezado={encabezado}
                  onChange={() => {}}
                  readonly
                />
              </div>
            )}

            {/* Preview de ítems bloqueado */}
              <div className="w-full">
              <CotizacionPreview
                items={items}
                onItemsChange={() => {}}
                locked
              />
            </div>

            <div className="flex flex-col gap-2 w-full sm:flex-row sm:justify-center">
              {savedIds && (
                <a
                  href={`/cotizaciones/${savedIds.requerimientoId}/exportar`}
                  className="btn-primary flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold transition-colors"
                >
                  <FileText className="size-4" />
                  Previsualizar y Exportar Word
                </a>
              )}
              <a
                href={`https://supabase.com/dashboard/project/vqodvkqvutkgvaqdcwtq/editor`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold transition-colors"
              >
                <ExternalLink className="size-4" />
                Ver en Supabase
              </a>
              <button
                onClick={() => {
                  setStep(1)
                  setEncabezado(null)
                  setItems([])
                  setCronogramaSugerido([])
                  setFileName('')
                  setSavedIds(null)
                }}
                className="btn-primary flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold transition-colors"
              >
                <FileUp className="size-4" />
                Nueva cotización
              </button>
            </div>
          </section>
        )}


      </main>

      {/* Footer de navegación fijo */}
      {step !== 1 && step !== 4 && (
        <div className="fixed bottom-0 left-0 right-0 glass-panel border-x-0 border-b-0">
          <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-3">
            <button
              onClick={() => setStep((step - 1) as WizardStep)}
              disabled={saving}
              className="btn-secondary flex items-center gap-1.5 rounded-xl px-4 py-2.5
                         text-sm font-medium disabled:opacity-50 transition-colors"
            >
              <ChevronLeft className="size-4" />
              Atrás
            </button>

            {step < 3 ? (
              <button
                onClick={() => setStep((step + 1) as WizardStep)}
                disabled={!encabezado}
                className="btn-primary flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold
                           disabled:opacity-50 transition-colors"
              >
                Siguiente
                <ChevronRight className="size-4" />
              </button>
            ) : (
              <button
                onClick={handleGuardar}
                disabled={saving}
                className="btn-primary flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold
                           disabled:opacity-50 transition-colors"
              >
                {saving ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Guardando…
                  </>
                ) : (
                  <>
                    <Lock className="size-4" />
                    Guardar cotización
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
