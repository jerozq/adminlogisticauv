'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Plus,
  Trash2,
  Save,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Sparkles,
} from 'lucide-react'
import type { CotizacionItemDraft, RequerimientoEncabezado } from '@/types/cotizacion'
import { actualizarCotizacion, parsearRequerimientoExcel } from '@/actions/cotizaciones'

// ─── Constantes ──────────────────────────────────────────────
const CATEGORIAS = [
  'Logística',
  'Alimentación',
  'Alojamiento',
  'Materiales',
  'Transporte',
  'Inhumación',
  'Reembolso',
  'Otros',
]

const UNIDADES_SUGERIDAS = [
  'día',
  'noche',
  'persona',
  'unidad',
  'kit',
  'servicio',
  'km',
  'hora',
  'combo',
  'actividad',
  'paquete',
]

const ESTADO_LABELS: Record<string, string> = {
  borrador: 'Borrador',
  enviada: 'Enviada',
  aprobada: 'Aprobada',
  rechazada: 'Rechazada',
}

// ─── FormField helper ─────────────────────────────────────────
function FormField({
  label,
  value,
  onChange,
  type = 'text',
  multiline = false,
  placeholder = '',
  className = '',
  readOnly = false,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  multiline?: boolean
  placeholder?: string
  className?: string
  readOnly?: boolean
}) {
  const base =
    'w-full glass-input px-3 py-2 text-sm disabled:opacity-50'

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <label className="text-xs font-semibold [color:var(--text-secondary)] uppercase tracking-wide">{label}</label>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={2}
          disabled={readOnly}
          className={`${base} resize-none`}
        />
      ) : (
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={readOnly}
          className={base}
        />
      )}
    </div>
  )
}

// ─── Props ────────────────────────────────────────────────────
interface Props {
  requerimientoId: string
  cotizacionId: string
  initialEncabezado: RequerimientoEncabezado
  initialItems: CotizacionItemDraft[]
  version: number
  estado: string
  requerimientoEstado: string
}

// ============================================================
// Componente principal
// ============================================================
export function CotizacionEditor({
  requerimientoId,
  cotizacionId,
  initialEncabezado,
  initialItems,
  version,
  estado,
  requerimientoEstado,
}: Props) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [encabezado, setEncabezado] = useState<RequerimientoEncabezado>(initialEncabezado)
  const [items, setItems] = useState<CotizacionItemDraft[]>(initialItems)
  const [saving, setSaving] = useState(false)
  const [generatingAI, setGeneratingAI] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null)
  const [headerOpen, setHeaderOpen] = useState(true)

  function setEnc<K extends keyof RequerimientoEncabezado>(key: K, value: RequerimientoEncabezado[K]) {
    setEncabezado((prev) => ({ ...prev, [key]: value }))
  }

  function setItem(idx: number, patch: Partial<CotizacionItemDraft>) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)))
  }

  function addItem() {
    setItems((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        tarifarioId: null,
        codigoItem: '',
        descripcion: '',
        categoria: 'Logística',
        unidadMedida: 'unidad',
        cantidad: 1,
        precioUnitario: 0,
        esPassthrough: false,
        fuente: 'manual',
        opcionesTarifario: [],
        excluirDeFinanzas: false,
        ocultarEnCotizacion: false,
      },
    ])
  }

  function removeItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx))
  }

  async function handleRegenerarIA() {
    fileInputRef.current?.click()
  }

  async function handleArchivoSeleccionado(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    // Limpiar para permitir re-selección del mismo archivo
    e.target.value = ''

    if (!confirm(`¿Analizar "${file.name}" con IA y reemplazar los ítems actuales con los extraídos? Los cambios no se guardan hasta que hagas clic en "Guardar cambios".`)) return

    setGeneratingAI(true)
    setResult(null)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await parsearRequerimientoExcel(formData)
      if (res.ok) {
        setItems(res.data.items)
        setResult({ ok: true, msg: `IA extrajo ${res.data.items.length} ítem(s) del archivo. Revisa los precios y guarda cuando estés listo.` })
      } else {
        setResult({ ok: false, msg: res.error })
      }
    } catch (e) {
      setResult({ ok: false, msg: e instanceof Error ? e.message : 'Error al procesar el archivo' })
    } finally {
      setGeneratingAI(false)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  async function handleSave() {
    setSaving(true)
    setResult(null)
    try {
      const itemsToSave = items.map((it) => ({ ...it, opcionesTarifario: [] }))
      const res = await actualizarCotizacion(requerimientoId, cotizacionId, encabezado, itemsToSave)
      
      if (res.ok) {
        setResult({ ok: true, msg: '¡Cambios guardados como nueva versión correctamente!' })
        router.refresh() // Refresh to load the new version from the server
      } else {
        setResult({ ok: false, msg: res.error })
      }
    } catch (e) {
      setResult({ ok: false, msg: e instanceof Error ? e.message : 'Error inesperado' })
    } finally {
      setSaving(false)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  const totalServicios = items
    .filter((i) => !i.esPassthrough)
    .reduce((s, i) => s + i.cantidad * i.precioUnitario, 0)

  const totalPassthrough = items
    .filter((i) => i.esPassthrough)
    .reduce((s, i) => s + i.cantidad * i.precioUnitario, 0)

  const fmt = (n: number) =>
    n.toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })

  return (
    <div className="flex flex-col gap-6">
      {/* Input de archivo oculto para regenerar con IA */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls,.pdf"
        className="hidden"
        onChange={handleArchivoSeleccionado}
      />

      {/* ── Banner de resultado ── */}
      {result && (
        <div
          className={`flex items-start gap-3 rounded-xl px-4 py-3 text-sm border ${
            result.ok ? 'pill-ok' : 'pill-cancel'
          }`}
        >
          {result.ok ? (
            <CheckCircle2 strokeWidth={1.5} className="size-4 mt-0.5 shrink-0" />
          ) : (
            <AlertCircle strokeWidth={1.5} className="size-4 mt-0.5 shrink-0" />
          )}
          <span>{result.msg}</span>
        </div>
      )}

      {/* ── Badges de estado ── */}
      <div className="flex flex-wrap gap-2">
        <span className="rounded-full pill-hold px-3 py-1 text-xs font-semibold">
          Requerimiento: {requerimientoEstado}
        </span>
        <span className="rounded-full pill-prep px-3 py-1 text-xs font-semibold">
          Cotización v{version} · {ESTADO_LABELS[estado] ?? estado}
        </span>
      </div>

      {/* ── Sección Encabezado ── */}
      <section className="rounded-2xl surface-card overflow-hidden">
        <button
          type="button"
          onClick={() => setHeaderOpen((o) => !o)}
          className="w-full flex items-center justify-between px-6 py-4 [background:var(--surface)] border-b [border-color:var(--surface-border)] hover:[background:var(--surface-raised)] transition-colors text-left"
        >
          <div>
            <h2 className="font-bold [color:var(--text-primary)] text-sm">Encabezado del requerimiento</h2>
            <p className="text-xs [color:var(--text-secondary)] mt-0.5">
              {encabezado.numeroRequerimiento && `N° ${encabezado.numeroRequerimiento} · `}
              {encabezado.nombreActividad || 'Sin nombre'}
            </p>
          </div>
          {headerOpen ? (
            <ChevronUp strokeWidth={1.5} className="size-4 [color:var(--text-muted)] shrink-0" />
          ) : (
            <ChevronDown strokeWidth={1.5} className="size-4 [color:var(--text-muted)] shrink-0" />
          )}
        </button>

        {headerOpen && (
          <div className="px-6 py-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <FormField
              label="N° Requerimiento"
              value={encabezado.numeroRequerimiento}
              onChange={(v) => setEnc('numeroRequerimiento', v)}
              placeholder="Ej. 629PE"
            />
            <FormField
              label="Nombre de la Actividad"
              value={encabezado.nombreActividad}
              onChange={(v) => setEnc('nombreActividad', v)}
              className="sm:col-span-1 lg:col-span-2"
            />
            <FormField
              label="Objeto"
              value={encabezado.objeto}
              onChange={(v) => setEnc('objeto', v)}
              multiline
              className="sm:col-span-2 lg:col-span-3"
            />

            <FormField
              label="Dirección Territorial"
              value={encabezado.direccionTerritorial}
              onChange={(v) => setEnc('direccionTerritorial', v)}
            />
            <FormField
              label="Municipio"
              value={encabezado.municipio}
              onChange={(v) => setEnc('municipio', v)}
            />
            <FormField
              label="Departamento"
              value={encabezado.departamento}
              onChange={(v) => setEnc('departamento', v)}
            />
            <FormField
              label="Lugar / Detalle"
              value={encabezado.lugarDetalle}
              onChange={(v) => setEnc('lugarDetalle', v)}
              className="sm:col-span-2 lg:col-span-3"
            />

            <FormField
              label="Fecha Solicitud"
              type="date"
              value={encabezado.fechaSolicitud}
              onChange={(v) => setEnc('fechaSolicitud', v)}
            />
            <FormField
              label="Fecha Inicio"
              type="date"
              value={encabezado.fechaInicio}
              onChange={(v) => setEnc('fechaInicio', v)}
            />
            <FormField
              label="Hora Inicio"
              value={encabezado.horaInicio}
              onChange={(v) => setEnc('horaInicio', v)}
              placeholder="08:00"
            />
            <FormField
              label="Fecha Fin"
              type="date"
              value={encabezado.fechaFin}
              onChange={(v) => setEnc('fechaFin', v)}
            />
            <FormField
              label="Hora Fin"
              value={encabezado.horaFin}
              onChange={(v) => setEnc('horaFin', v)}
              placeholder="17:00"
            />
            <FormField
              label="N° Víctimas"
              type="number"
              value={String(encabezado.numVictimas)}
              onChange={(v) => setEnc('numVictimas', parseInt(v) || 0)}
            />

            <FormField
              label="Nombre Responsable"
              value={encabezado.responsableNombre}
              onChange={(v) => setEnc('responsableNombre', v)}
            />
            <FormField
              label="Cédula Responsable"
              value={encabezado.responsableCedula}
              onChange={(v) => setEnc('responsableCedula', v)}
            />
            <FormField
              label="Celular Responsable"
              value={encabezado.responsableCelular}
              onChange={(v) => setEnc('responsableCelular', v)}
            />
            <FormField
              label="Correo Responsable"
              type="email"
              value={encabezado.responsableCorreo}
              onChange={(v) => setEnc('responsableCorreo', v)}
              className="sm:col-span-2"
            />
          </div>
        )}
      </section>

      {/* ── Sección Ítems ── */}
      <section className="rounded-2xl surface-card overflow-hidden">
        <div className="px-6 py-4 [background:var(--surface)] border-b [border-color:var(--surface-border)] flex items-center justify-between gap-4">
          <div>
            <h2 className="font-bold [color:var(--text-primary)] text-sm">Ítems cotizados</h2>
            <p className="text-xs [color:var(--text-secondary)] mt-0.5">
              {items.length} ítems · Servicios propios: {fmt(totalServicios)}
              {totalPassthrough > 0 && ` · Pass-through: ${fmt(totalPassthrough)}`}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={handleRegenerarIA}
              disabled={generatingAI || saving}
              title="Generar ítems automáticamente con IA usando los datos del requerimiento"
              className="flex items-center gap-1.5 rounded-xl border [border-color:var(--surface-border)] bg-transparent px-3 py-2 text-xs font-semibold [color:var(--text-secondary)] hover:[background:var(--surface-raised)] disabled:opacity-50 transition-colors"
            >
              {generatingAI ? (
                <Loader2 strokeWidth={1.5} className="size-3.5 animate-spin" />
              ) : (
                <Sparkles strokeWidth={1.5} className="size-3.5" />
              )}
              {generatingAI ? 'Generando...' : 'Regenerar con IA'}
            </button>
            <button
              onClick={addItem}
              className="flex items-center gap-1.5 rounded-xl btn-primary px-3 py-2 text-xs font-semibold transition-colors"
            >
              <Plus strokeWidth={1.5} className="size-3.5" />
              Agregar ítem
            </button>
          </div>
        </div>

        {/* Datalist para unidades */}
        <datalist id="unidades-sugeridas">
          {UNIDADES_SUGERIDAS.map((u) => (
            <option key={u} value={u} />
          ))}
        </datalist>

        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-xs [color:var(--text-muted)] [background:var(--surface)] border-b [border-color:var(--surface-border)]">
                <th className="px-3 py-2.5 font-semibold w-9">#</th>
                <th className="px-3 py-2.5 font-semibold min-w-[200px]">Descripción</th>
                <th className="px-3 py-2.5 font-semibold min-w-[130px]">Categoría</th>
                <th className="px-3 py-2.5 font-semibold min-w-[90px]">Unidad</th>
                <th className="px-3 py-2.5 font-semibold min-w-[80px] text-right whitespace-nowrap">Cantidad</th>
                <th className="px-3 py-2.5 font-semibold min-w-[140px] text-right whitespace-nowrap">Precio Unit.</th>
                <th className="px-3 py-2.5 font-semibold min-w-[120px] text-right whitespace-nowrap">Total</th>
                <th className="px-3 py-2.5 font-semibold min-w-[90px] text-center whitespace-nowrap">Pass-through</th>
                <th className="px-3 py-2.5 w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y [divide-color:var(--surface-border)]">
              {items.map((item, idx) => (
                <tr
                  key={item.id}
                  className={`group ${item.esPassthrough ? 'pill-run opacity-80' : 'hover:[background:var(--surface)]'}`}
                >
                  <td className="px-3 py-2 text-xs [color:var(--text-muted)] font-medium">{idx + 1}</td>

                  {/* Descripción */}
                  <td className="px-2 py-1.5">
                    <input
                      value={item.descripcion}
                      onChange={(e) => setItem(idx, { descripcion: e.target.value })}
                      placeholder="Descripción..."
                      className="w-full rounded-lg border border-transparent bg-transparent px-2 py-1 text-sm [color:var(--text-primary)] placeholder:[color:var(--text-muted)] hover:[border-color:var(--surface-border)] focus:[border-color:var(--input-ring)] focus:[background:var(--input-bg)] focus:outline-none transition-colors"
                    />
                  </td>

                  {/* Categoría */}
                  <td className="px-2 py-1.5">
                    <select
                      value={item.categoria}
                      onChange={(e) => setItem(idx, { categoria: e.target.value })}
                      className="w-full rounded-lg border border-transparent bg-transparent px-2 py-1 text-sm [color:var(--text-primary)] hover:[border-color:var(--surface-border)] focus:[border-color:var(--input-ring)] focus:outline-none transition-colors cursor-pointer"
                    >
                      {CATEGORIAS.map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                      {!CATEGORIAS.includes(item.categoria) && item.categoria && (
                        <option value={item.categoria}>{item.categoria}</option>
                      )}
                    </select>
                  </td>

                  {/* Unidad */}
                  <td className="px-2 py-1.5">
                    <input
                      list="unidades-sugeridas"
                      value={item.unidadMedida}
                      onChange={(e) => setItem(idx, { unidadMedida: e.target.value })}
                      placeholder="unidad"
                      className="w-full rounded-lg border border-transparent bg-transparent px-2 py-1 text-sm [color:var(--text-primary)] placeholder:[color:var(--text-muted)] hover:[border-color:var(--surface-border)] focus:[border-color:var(--input-ring)] focus:[background:var(--input-bg)] focus:outline-none transition-colors"
                    />
                  </td>

                  {/* Cantidad */}
                  <td className="px-2 py-1.5">
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={item.cantidad}
                      onChange={(e) => setItem(idx, { cantidad: parseFloat(e.target.value) || 0 })}
                      className="w-full rounded-lg border border-transparent bg-transparent px-2 py-1 text-sm text-right [color:var(--text-primary)] hover:[border-color:var(--surface-border)] focus:[border-color:var(--input-ring)] focus:[background:var(--input-bg)] focus:outline-none transition-colors"
                    />
                  </td>

                  {/* Precio unitario */}
                  <td className="px-2 py-1.5 min-w-[140px]">
                    <input
                      type="number"
                      min={0}
                      step={1000}
                      value={item.precioUnitario}
                      onChange={(e) =>
                        setItem(idx, { precioUnitario: parseFloat(e.target.value) || 0 })
                      }
                      className="w-full min-w-[110px] rounded-lg border border-transparent bg-transparent px-2 py-1 text-sm text-right [color:var(--text-primary)] hover:[border-color:var(--surface-border)] focus:[border-color:var(--input-ring)] focus:[background:var(--input-bg)] focus:outline-none transition-colors"
                    />
                  </td>

                  {/* Total */}
                  <td className="px-3 py-2 text-right text-sm font-semibold [color:var(--text-secondary)] tabular-nums">
                    {fmt(item.cantidad * item.precioUnitario)}
                  </td>

                  {/* Pass-through */}
                  <td className="px-3 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={item.esPassthrough}
                      onChange={(e) => setItem(idx, { esPassthrough: e.target.checked })}
                      title="Pass-through: costo de terceros sin margen de utilidad"
                      className="size-4 rounded accent-amber-500 cursor-pointer"
                    />
                  </td>

                  {/* Eliminar */}
                  <td className="px-2 py-1.5">
                    <button
                      onClick={() => removeItem(idx)}
                      title="Eliminar ítem"
                      className="flex size-7 items-center justify-center rounded-lg [color:var(--text-muted)] hover:pill-cancel hover:[color:var(--state-cancel-fg)] transition-colors opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 strokeWidth={1.5} className="size-3.5" />
                    </button>
                  </td>
                </tr>
              ))}

              {items.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-6 py-14 text-center text-sm [color:var(--text-muted)]">
                    No hay ítems. Haz clic en{' '}
                    <strong className="[color:var(--text-secondary)]">Agregar ítem</strong> para comenzar.
                  </td>
                </tr>
              )}
            </tbody>

            {items.length > 0 && (
              <tfoot className="border-t-2 [border-color:var(--surface-border)] [background:var(--surface)]">
                {totalPassthrough > 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-2 text-right text-xs [color:var(--text-secondary)] font-medium"
                    >
                      Subtotal pass-through
                    </td>
                    <td className="px-3 py-2 text-right text-sm [color:var(--state-run-fg)] font-semibold tabular-nums">
                      {fmt(totalPassthrough)}
                    </td>
                    <td colSpan={2} />
                  </tr>
                )}
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-3 text-right text-xs font-bold [color:var(--text-secondary)] uppercase tracking-wide"
                  >
                    Total servicios propios
                  </td>
                  <td className="px-3 py-3 text-right text-base font-bold [color:var(--text-primary)] tabular-nums">
                    {fmt(totalServicios)}
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>

      {/* ── Botón guardar ── */}
      <div className="flex items-center justify-end gap-3 pb-8">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 rounded-xl btn-primary px-6 py-3 text-sm font-semibold disabled:opacity-60 transition-colors"
        >
          {saving ? (
            <Loader2 strokeWidth={1.5} className="size-4 animate-spin" />
          ) : (
            <Save strokeWidth={1.5} className="size-4" />
          )}
          {saving ? 'Guardando...' : 'Guardar cambios'}
        </button>
      </div>
    </div>
  )
}
