'use client'

import { useState } from 'react'
import {
  FileUp,
  ClipboardList,
  PenLine,
  Lock,
  CheckCircle2,
  Loader2,
  ChevronLeft,
  ChevronRight,
  List,
  PenSquare,
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

const ENCABEZADO_VACIO: RequerimientoEncabezado = {
  numeroRequerimiento: '',
  nombreActividad: '',
  objeto: '',
  direccionTerritorial: '',
  municipio: '',
  departamento: '',
  lugarDetalle: '',
  fechaSolicitud: '',
  fechaInicio: '',
  fechaFin: '',
  horaInicio: '',
  horaFin: '',
  responsableNombre: '',
  responsableCedula: '',
  responsableCelular: '',
  responsableCorreo: '',
  numVictimas: 0,
  montoReembolsoDeclarado: 0,
}

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
                    ? 'bg-emerald-500 text-white'
                    : active
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-200'
                    : 'bg-white/10 text-slate-500',
                ].join(' ')}
              >
                {done ? <CheckCircle2 className="size-4" /> : step.icon}
              </div>
              <span
                className={[
                  'hidden sm:block text-xs font-medium',
                  active ? 'text-blue-400' : done ? 'text-emerald-400' : 'text-slate-500',
                ].join(' ')}
              >
                {step.label}
              </span>
            </div>
            {idx < STEPS.length - 1 && (
              <div
                className={[
                  'mx-1 h-0.5 w-8 sm:w-12 rounded transition-colors',
                  done ? 'bg-emerald-400' : 'bg-white/10',
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
    <div className="min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-white/10 bg-black/60 backdrop-blur-sm">
        <div className="mx-auto flex max-w-2xl flex-col gap-3 px-4 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-base font-bold text-slate-100">Nueva cotización</h1>
            {fileName && (
              <span className="max-w-[160px] truncate rounded-full bg-white/10 px-3 py-1 text-xs text-slate-400">
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
              <h2 className="text-lg font-bold text-slate-200">Carga el requerimiento</h2>
              <p className="mt-1 text-sm text-slate-400">
                Excel de la Unidad para las Víctimas (formato UARIV).
                El sistema extrae automáticamente encabezado e ítems, incluyendo servicios de inhumación.
              </p>
            </div>
            <FileUploader onParsed={onParsed} />

            {/* Separador */}
            <div className="flex items-center gap-3 mt-2">
              <div className="flex-1 h-px bg-white/10" />
              <span className="text-xs text-slate-500">o</span>
              <div className="flex-1 h-px bg-white/10" />
            </div>

            {/* Creación manual sin archivo */}
            <button
              type="button"
              onClick={() => {
                setFileName('manual')
                setEncabezado(ENCABEZADO_VACIO)
                setItems([])
                setCronogramaSugerido([])
                setStep(2)
              }}
              className="flex items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/5
                         px-4 py-3 text-sm font-medium text-slate-300 hover:bg-white/10 transition-colors"
            >
              <PenSquare className="size-4" />
              Crear requerimiento manualmente
            </button>
          </section>
        )}

        {/* ─── Paso 2: Revisar encabezado ─── */}
        {step === 2 && encabezado && (
          <section className="flex flex-col gap-6">
            <div>
              <h2 className="text-lg font-bold text-slate-200">Verifica el encabezado</h2>
              <p className="mt-1 text-sm text-slate-400">
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
              <div className="flex items-start gap-3 rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-400 ring-1 ring-red-500/20">
                <span className="mt-0.5 text-lg leading-none">⚠️</span>
                <span>{saveError}</span>
              </div>
            )}
            <div>
              <h2 className="text-lg font-bold text-slate-200">Edita la cotización</h2>
              <p className="mt-1 text-sm text-slate-400">
                Ajusta cantidades, precios y añade o elimina ítems.
                Los <span className="font-semibold text-amber-600">ítems passthrough</span> son costos
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
            <div className="flex size-20 items-center justify-center rounded-full bg-emerald-500/20">
              <CheckCircle2 className="size-10 text-emerald-500" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-100">¡Cotización guardada!</h2>
              <p className="mt-2 text-sm text-slate-400">
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
              <a
                href="/cotizaciones"
                className="flex items-center justify-center gap-2 rounded-xl bg-zinc-700 px-5 py-3 text-sm font-semibold text-white hover:bg-zinc-600 transition-colors"
              >
                <List className="size-4" />
                Ver cotizaciones
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
                className="flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
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
        <div className="fixed bottom-0 left-0 right-0 border-t border-white/10 bg-black/80 backdrop-blur-sm">
          <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-3">
            <button
              onClick={() => setStep((step - 1) as WizardStep)}
              disabled={saving}
              className="flex items-center gap-1.5 rounded-xl border border-white/20 bg-white/5 px-4 py-2.5
                         text-sm font-medium text-slate-300 hover:bg-white/10 disabled:opacity-50 transition-colors"
            >
              <ChevronLeft className="size-4" />
              Atrás
            </button>

            {step < 3 ? (
              <button
                onClick={() => setStep((step + 1) as WizardStep)}
                disabled={!encabezado}
                className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold
                           text-white shadow-sm hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                Siguiente
                <ChevronRight className="size-4" />
              </button>
            ) : (
              <button
                onClick={handleGuardar}
                disabled={saving}
                className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold
                           text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50 transition-colors"
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
