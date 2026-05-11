'use client'

import { useState, useTransition } from 'react'
import {
  FileDown,
  X,
  Check,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Receipt,
  Bus,
  Flower2,
  ClipboardCheck,
  Edit2,
  Trash2,
  Plus,
  Lock,
  Unlock,
  Wand2,
  Upload,
} from 'lucide-react'
import { guardarReembolso, crearReembolso, eliminarReembolso, materializarReembolsosAuto, importarReembolsosDesdeExcel } from '@/actions/reembolsos'
import type { ReembolsoProps, TipoReembolso } from '@/src/core/domain/entities/Reembolso'

// ============================================================
// TablaReembolsos
//
// Tabla interactiva de reembolsos con:
//   - Checkboxes de selección individual y masiva
//   - Botón "Editar" por fila → abre modal de edición
//   - Botón "Exportar PDF Seleccionados" → descarga masiva
//   - Estado de carga y notificación de éxito/error
// ============================================================

interface Props {
  actividadId: string
  initialReembolsos: ReembolsoProps[]
}

// ---------------------------------------------------------------
// Helpers de formato
// ---------------------------------------------------------------

const COP = new Intl.NumberFormat('es-CO', {
  style:                 'currency',
  currency:              'COP',
  maximumFractionDigits: 0,
})

function fmtCOP(valor: number): string {
  return COP.format(valor)
}

function fmtFecha(iso: string): string {
  const [y, m, d] = iso.split('-')
  if (!y || !m || !d) return iso
  return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`
}

function tipoBadge(tipo: TipoReembolso) {
  return tipo === 'TRANSPORTE'
    ? 'pill-prep'
    : 'pill-hold'
}

// ---------------------------------------------------------------
// Modal de creación
// ---------------------------------------------------------------

interface CreateModalProps {
  actividadId: string
  onSave: (created: ReembolsoProps) => void
  onCancel: () => void
}

function ModalCrearFormato({ actividadId, onSave, onCancel }: CreateModalProps) {
  const [tipo, setTipo] = useState<TipoReembolso>('TRANSPORTE')
  const [form, setForm] = useState({
    personaNombre: '',
    documento: '',
    celular: '',
    rutaOrigen: '',
    rutaDestino: '',
    fecha: new Date().toISOString().split('T')[0],
    valor: 0,
  })
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleTipoChange(t: TipoReembolso) {
    setTipo(t)
    if (t === 'INHUMACION' && form.valor === 0) {
      setForm((prev) => ({ ...prev, valor: 531000 }))
    } else if (t === 'TRANSPORTE' && form.valor === 531000) {
      setForm((prev) => ({ ...prev, valor: 0 }))
    }
  }

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function handleSave() {
    setError(null)
    startTransition(async () => {
      try {
        const result = await crearReembolso({
          actividadId,
          tipo,
          personaNombre: form.personaNombre.trim(),
          documento:     form.documento.trim(),
          celular:       form.celular.trim() || null,
          rutaOrigen:    form.rutaOrigen.trim(),
          rutaDestino:   form.rutaDestino.trim(),
          fecha:         form.fecha,
          valor:         form.valor,
        })
        onSave(result.reembolso)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Error al crear el formato.')
      }
    })
  }

  const tipoIcon = tipo === 'TRANSPORTE' ? Bus : Flower2
  const TipoIcon = tipoIcon

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel() }}
    >
      <div className="modal-card rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b [border-color:var(--surface-border)]">
          <div className="flex items-center gap-2">
            <Plus strokeWidth={1.5} className="size-4 text-violet-500" />
            <h2 className="font-semibold [color:var(--text-primary)] text-sm">
              Nuevo Formato
            </h2>
          </div>
          <button
            onClick={onCancel}
            className="[color:var(--text-muted)] hover:[color:var(--text-primary)] transition-colors"
            aria-label="Cerrar"
          >
            <X strokeWidth={1.5} className="size-4" />
          </button>
        </div>

        {/* Form */}
        <div className="px-5 py-4 space-y-3 max-h-[70vh] overflow-y-auto">
          {/* Tipo selector */}
          <div>
            <span className="text-xs font-medium [color:var(--text-secondary)] mb-2 block">Tipo de formato</span>
            <div className="flex gap-2">
              {(['TRANSPORTE', 'INHUMACION'] as TipoReembolso[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => handleTipoChange(t)}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold border transition-all ${
                    tipo === t
                      ? t === 'TRANSPORTE'
                        ? 'bg-blue-500/20 border-blue-500/40 text-blue-300'
                        : 'bg-purple-500/20 border-purple-500/40 text-purple-300'
                      : 'bg-white/5 border-white/10 text-white/40 hover:bg-white/10 hover:text-white/70'
                  }`}
                >
                  {t === 'TRANSPORTE' ? (
                    <Bus strokeWidth={1.5} className="size-3.5" />
                  ) : (
                    <Flower2 strokeWidth={1.5} className="size-3.5" />
                  )}
                  {t === 'TRANSPORTE' ? 'Transporte' : 'Inhumación'}
                </button>
              ))}
            </div>
          </div>

          <Field label="Nombre completo">
            <input
              type="text"
              value={form.personaNombre}
              onChange={(e) => set('personaNombre', e.target.value)}
              placeholder="Ej. Juan García López"
              className={INPUT_CLS}
              autoFocus
            />
          </Field>
          <Field label="Documento (CC)">
            <input
              type="text"
              value={form.documento}
              onChange={(e) => set('documento', e.target.value)}
              placeholder="1234567890"
              className={INPUT_CLS}
            />
          </Field>
          <Field label="Celular">
            <input
              type="tel"
              value={form.celular}
              onChange={(e) => set('celular', e.target.value)}
              placeholder="Opcional"
              className={INPUT_CLS}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Origen">
              <input
                type="text"
                value={form.rutaOrigen}
                onChange={(e) => set('rutaOrigen', e.target.value)}
                placeholder="Ej. Cali"
                className={INPUT_CLS}
              />
            </Field>
            <Field label="Destino">
              <input
                type="text"
                value={form.rutaDestino}
                onChange={(e) => set('rutaDestino', e.target.value)}
                placeholder="Ej. Palmira"
                className={INPUT_CLS}
              />
            </Field>
          </div>

          <Field label="Fecha">
            <input
              type="date"
              value={form.fecha}
              onChange={(e) => set('fecha', e.target.value)}
              className={INPUT_CLS}
            />
          </Field>

          {/* Valor — normativo fijo para INHUMACION */}
          {tipo === 'INHUMACION' ? (
            <div>
              <span className="text-xs font-medium [color:var(--text-secondary)] mb-1 block">Valor (COP)</span>
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-purple-500/10 border border-purple-500/25 text-sm">
                <Lock strokeWidth={1.5} className="size-3.5 text-purple-400 shrink-0" />
                <span className="font-mono font-semibold text-purple-200">{fmtCOP(form.valor || 531000)}</span>
                <button
                  type="button"
                  onClick={() => set('valor', form.valor || 531000)}
                  className="ml-auto text-[10px] text-purple-400/70 hover:text-purple-300 transition-colors underline underline-offset-2"
                  tabIndex={-1}
                >
                  Restablecer $531.000
                </button>
              </div>
              <p className="text-[10px] text-purple-400/60 mt-1 leading-relaxed">
                Valor normativo fijo para Inhumación según la operación UV. Edita manualmente si hay excepción.
              </p>
              <input
                type="number"
                min={1}
                step={1000}
                value={form.valor || 531000}
                onChange={(e) => set('valor', Number(e.target.value))}
                className="sr-only"
                aria-hidden
                tabIndex={-1}
              />
            </div>
          ) : (
            <Field label="Valor (COP)">
              <input
                type="number"
                min={1}
                step={1000}
                value={form.valor || ''}
                onChange={(e) => set('valor', Number(e.target.value))}
                placeholder="0"
                className={INPUT_CLS}
              />
            </Field>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="mx-5 mb-3 flex items-start gap-2 [color:var(--state-cancel-fg)] text-xs">
            <AlertCircle strokeWidth={1.5} className="size-3.5 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Footer */}
        <div className="px-5 py-4 border-t [border-color:var(--surface-border)] flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="btn-secondary px-3 py-1.5 text-sm rounded-lg transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg btn-primary disabled:opacity-50 transition-colors"
          >
            {isPending ? (
              <Loader2 strokeWidth={1.5} className="size-3.5 animate-spin" />
            ) : (
              <Plus strokeWidth={1.5} className="size-3.5" />
            )}
            Crear Formato
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------
// Modal de edición
// ---------------------------------------------------------------

interface EditModalProps {
  reembolso: ReembolsoProps
  onSave: (updated: ReembolsoProps) => void
  onCancel: () => void
}

const VALOR_NORMATIVO_INHUMACION = 531000

function ModalEditarReembolso({ reembolso, onSave, onCancel }: EditModalProps) {
  const [form, setForm] = useState<ReembolsoProps>({ ...reembolso })
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  // Para INHUMACIÓN el valor está bloqueado por defecto; se puede desbloquear
  const [valorDesbloqueado, setValorDesbloqueado] = useState(false)

  const esInhumacion = form.tipo === 'INHUMACION'

  function set<K extends keyof ReembolsoProps>(key: K, value: ReembolsoProps[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function handleSave() {
    setError(null)
    startTransition(async () => {
      try {
        const result = await guardarReembolso(form)
        onSave(result.reembolso)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Error al guardar.')
      }
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel() }}
    >
      <div className="modal-card rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b [border-color:var(--surface-border)]">
          <div className="flex items-center gap-2">
            <Receipt strokeWidth={1.5} className="size-4 text-violet-500" />
            <h2 className="font-semibold [color:var(--text-primary)] text-sm">
              Editar reembolso — {form.tipo}
            </h2>
          </div>
          <button
            onClick={onCancel}
            className="[color:var(--text-muted)] hover:[color:var(--text-primary)] transition-colors"
            aria-label="Cerrar"
          >
            <X strokeWidth={1.5} className="size-4" />
          </button>
        </div>

        {/* Form */}
        <div className="px-5 py-4 space-y-3 max-h-[70vh] overflow-y-auto">
          <Field label="Nombre completo">
            <input
              type="text"
              value={form.personaNombre}
              onChange={(e) => set('personaNombre', e.target.value)}
              className={INPUT_CLS}
            />
          </Field>
          <Field label="Documento (CC)">
            <input
              type="text"
              value={form.documento}
              onChange={(e) => set('documento', e.target.value)}
              className={INPUT_CLS}
            />
          </Field>
          <Field label="Celular">
            <input
              type="tel"
              value={form.celular ?? ''}
              onChange={(e) => set('celular', e.target.value || null)}
              placeholder="Opcional"
              className={INPUT_CLS}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Origen">
              <input
                type="text"
                value={form.rutaOrigen}
                onChange={(e) => set('rutaOrigen', e.target.value)}
                className={INPUT_CLS}
              />
            </Field>
            <Field label="Destino">
              <input
                type="text"
                value={form.rutaDestino}
                onChange={(e) => set('rutaDestino', e.target.value)}
                className={INPUT_CLS}
              />
            </Field>
          </div>

          <Field label="Fecha (YYYY-MM-DD)">
            <input
              type="date"
              value={form.fecha}
              onChange={(e) => set('fecha', e.target.value)}
              className={INPUT_CLS}
            />
          </Field>

          {/* Valor — bloqueado para INHUMACIÓN salvo desbloqueo explícito */}
          {esInhumacion && !valorDesbloqueado ? (
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium [color:var(--text-secondary)]">Valor (COP)</span>
                <button
                  type="button"
                  onClick={() => setValorDesbloqueado(true)}
                  className="flex items-center gap-1 text-[10px] text-purple-400/70 hover:text-purple-300 transition-colors"
                >
                  <Unlock strokeWidth={1.5} className="size-3" />
                  Editar valor
                </button>
              </div>
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-purple-500/10 border border-purple-500/25">
                <Lock strokeWidth={1.5} className="size-3.5 text-purple-400 shrink-0" />
                <span className="font-mono font-semibold text-purple-200 text-sm">{fmtCOP(form.valor)}</span>
                {form.valor !== VALOR_NORMATIVO_INHUMACION && (
                  <button
                    type="button"
                    onClick={() => set('valor', VALOR_NORMATIVO_INHUMACION)}
                    className="ml-auto text-[10px] text-purple-400/70 hover:text-purple-300 transition-colors underline underline-offset-2"
                  >
                    Restablecer $531.000
                  </button>
                )}
              </div>
              <p className="text-[10px] text-purple-400/60 mt-1">
                Valor normativo fijo INHUMACIÓN según tarifario UV.
              </p>
            </div>
          ) : (
            <Field label="Valor (COP)">
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  step={1000}
                  value={form.valor}
                  onChange={(e) => set('valor', Number(e.target.value))}
                  className={`${INPUT_CLS} flex-1`}
                />
                {esInhumacion && (
                  <button
                    type="button"
                    onClick={() => {
                      set('valor', VALOR_NORMATIVO_INHUMACION)
                      setValorDesbloqueado(false)
                    }}
                    className="shrink-0 px-2 py-2 text-[10px] rounded-lg bg-purple-500/10 border border-purple-500/25 text-purple-300 hover:bg-purple-500/20 transition-all whitespace-nowrap"
                    title="Restablecer valor normativo $531.000"
                  >
                    <Lock strokeWidth={1.5} className="size-3.5" />
                  </button>
                )}
              </div>
            </Field>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="mx-5 mb-3 flex items-start gap-2 [color:var(--state-cancel-fg)] text-xs">
            <AlertCircle strokeWidth={1.5} className="size-3.5 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Footer */}
        <div className="px-5 py-4 border-t [border-color:var(--surface-border)] flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="btn-secondary px-3 py-1.5 text-sm rounded-lg transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg btn-primary disabled:opacity-50 transition-colors"
          >
            {isPending ? (
              <Loader2 strokeWidth={1.5} className="size-3.5 animate-spin" />
            ) : (
              <Check strokeWidth={1.5} className="size-3.5" />
            )}
            Guardar
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-medium [color:var(--text-secondary)] mb-1 block">{label}</span>
      {children}
    </label>
  )
}

const INPUT_CLS =
  'glass-input w-full px-3 py-2 text-sm transition'

// ---------------------------------------------------------------
// Notificación flotante
// ---------------------------------------------------------------

function Toast({ message, type }: { message: string; type: 'success' | 'error' }) {
  const icon =
    type === 'success' ? (
      <CheckCircle2 strokeWidth={1.5} className="size-4 text-green-600 shrink-0" />
    ) : (
      <AlertCircle strokeWidth={1.5} className="size-4 text-red-500 shrink-0" />
    )
  const bg = type === 'success' ? 'pill-ok' : 'pill-cancel'
  const text = ''

  return (
    <div
      className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2.5 rounded-2xl border shadow-lg text-sm font-medium ${bg}`}
    >
      {icon}
      {message}
    </div>
  )
}

// ---------------------------------------------------------------
// Recibo de Satisfacción — tipos, modal y tarjeta
// ---------------------------------------------------------------

interface ReciboSatisfaccion {
  responsableUV:              string       // Quien emite (coordinador UV)
  cargoUV:                    string       // Su cargo
  representanteBeneficiarios: string       // Quien recibe (comunidad)
  documentoRepresentante:     string       // CC del representante
  servicioPrestado:           string       // Descripción del servicio
  lugar:                      string       // Ciudad/municipio de firma
  fecha:                      string       // YYYY-MM-DD
  observaciones:              string | null
}

interface ModalReciboProps {
  initial: ReciboSatisfaccion | null
  onSave: (data: ReciboSatisfaccion) => void
  onCancel: () => void
}

function ModalReciboSatisfaccion({ initial, onSave, onCancel }: ModalReciboProps) {
  const [form, setForm] = useState<ReciboSatisfaccion>(
    initial ?? {
      responsableUV:              '',
      cargoUV:                    'Coordinador/a Logístico',
      representanteBeneficiarios: '',
      documentoRepresentante:     '',
      servicioPrestado:           '',
      lugar:                      '',
      fecha:                      new Date().toISOString().split('T')[0],
      observaciones:              null,
    }
  )
  const [error, setError] = useState<string | null>(null)

  function set<K extends keyof ReciboSatisfaccion>(key: K, value: ReciboSatisfaccion[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function handleSave() {
    if (!form.responsableUV.trim()) { setError('El responsable UV es obligatorio.'); return }
    if (!form.representanteBeneficiarios.trim()) { setError('El representante de beneficiarios es obligatorio.'); return }
    if (!form.servicioPrestado.trim()) { setError('La descripción del servicio es obligatoria.'); return }
    if (!form.lugar.trim()) { setError('El lugar de firma es obligatorio.'); return }
    setError(null)
    onSave({ ...form, observaciones: form.observaciones?.trim() || null })
  }

  const isEdit = initial !== null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel() }}
    >
      <div className="modal-card rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b [border-color:var(--surface-border)]">
          <div className="flex items-center gap-2">
            <ClipboardCheck strokeWidth={1.5} className="size-4 text-emerald-500" />
            <h2 className="font-semibold [color:var(--text-primary)] text-sm">
              {isEdit ? 'Editar Recibo a Satisfacción' : 'Nuevo Recibo a Satisfacción'}
            </h2>
          </div>
          <button
            onClick={onCancel}
            className="[color:var(--text-muted)] hover:[color:var(--text-primary)] transition-colors"
            aria-label="Cerrar"
          >
            <X strokeWidth={1.5} className="size-4" />
          </button>
        </div>

        {/* Form */}
        <div className="px-5 py-4 space-y-3 max-h-[70vh] overflow-y-auto">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-white/30 pt-1">
            Emisor (UV)
          </p>
          <Field label="Nombre del responsable UV">
            <input
              type="text"
              value={form.responsableUV}
              onChange={(e) => set('responsableUV', e.target.value)}
              placeholder="Ej. Jeronimo Zapata"
              className={INPUT_CLS}
              autoFocus
            />
          </Field>
          <Field label="Cargo">
            <input
              type="text"
              value={form.cargoUV}
              onChange={(e) => set('cargoUV', e.target.value)}
              className={INPUT_CLS}
            />
          </Field>

          <p className="text-[10px] font-semibold uppercase tracking-wider text-white/30 pt-2">
            Receptor (Beneficiarios)
          </p>
          <Field label="Nombre del representante">
            <input
              type="text"
              value={form.representanteBeneficiarios}
              onChange={(e) => set('representanteBeneficiarios', e.target.value)}
              placeholder="Ej. María García"
              className={INPUT_CLS}
            />
          </Field>
          <Field label="Documento CC">
            <input
              type="text"
              value={form.documentoRepresentante}
              onChange={(e) => set('documentoRepresentante', e.target.value)}
              placeholder="1234567890"
              className={INPUT_CLS}
            />
          </Field>

          <p className="text-[10px] font-semibold uppercase tracking-wider text-white/30 pt-2">
            Servicio
          </p>
          <Field label="Descripción del servicio prestado">
            <textarea
              value={form.servicioPrestado}
              onChange={(e) => set('servicioPrestado', e.target.value)}
              placeholder="Ej. Jornada de atención logística para 25 beneficiarios en el municipio…"
              rows={3}
              className={`${INPUT_CLS} resize-none`}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Lugar de firma">
              <input
                type="text"
                value={form.lugar}
                onChange={(e) => set('lugar', e.target.value)}
                placeholder="Ej. Cali"
                className={INPUT_CLS}
              />
            </Field>
            <Field label="Fecha">
              <input
                type="date"
                value={form.fecha}
                onChange={(e) => set('fecha', e.target.value)}
                className={INPUT_CLS}
              />
            </Field>
          </div>

          <Field label="Observaciones (opcional)">
            <textarea
              value={form.observaciones ?? ''}
              onChange={(e) => set('observaciones', e.target.value || null)}
              placeholder="Cualquier nota adicional…"
              rows={2}
              className={`${INPUT_CLS} resize-none`}
            />
          </Field>
        </div>

        {/* Error */}
        {error && (
          <div className="mx-5 mb-3 flex items-start gap-2 [color:var(--state-cancel-fg)] text-xs">
            <AlertCircle strokeWidth={1.5} className="size-3.5 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Footer */}
        <div className="px-5 py-4 border-t [border-color:var(--surface-border)] flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="btn-secondary px-3 py-1.5 text-sm rounded-lg transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg btn-primary transition-colors"
          >
            <Check strokeWidth={1.5} className="size-3.5" />
            {isEdit ? 'Guardar cambios' : 'Crear Recibo'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ReciboCard({
  recibo,
  onEdit,
  onDelete,
}: {
  recibo: ReciboSatisfaccion
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <div className="mt-8 bg-emerald-500/5 hover:bg-emerald-500/10 border border-emerald-500/20 shadow-lg rounded-xl backdrop-blur-xl transition-all duration-200 p-5 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-emerald-500/15 border border-emerald-500/25">
            <ClipboardCheck strokeWidth={1.5} className="size-4 text-emerald-400" />
          </div>
          <div>
            <p className="text-sm font-bold text-emerald-300">Recibo a Satisfacción</p>
            <p className="text-[10px] text-emerald-400/60 mt-0.5 font-medium">
              {fmtFecha(recibo.fecha)} · {recibo.lugar}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onEdit}
            className="p-1 rounded-md text-white/50 hover:text-white hover:bg-white/10 transition-all"
            title="Editar recibo"
          >
            <Edit2 strokeWidth={1.5} className="size-4" />
          </button>
          <button
            onClick={onDelete}
            className="p-1 rounded-md text-white/50 hover:text-red-400 hover:bg-red-500/10 transition-all"
            title="Eliminar recibo"
          >
            <Trash2 strokeWidth={1.5} className="size-4" />
          </button>
        </div>
      </div>

      {/* Parties */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white/5 rounded-xl p-3 border border-white/10">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-white/30 mb-1">Emisor (UV)</p>
          <p className="text-sm font-semibold text-white/90 leading-snug">{recibo.responsableUV}</p>
          <p className="text-xs text-white/40 mt-0.5">{recibo.cargoUV}</p>
        </div>
        <div className="bg-white/5 rounded-xl p-3 border border-white/10">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-white/30 mb-1">Receptor</p>
          <p className="text-sm font-semibold text-white/90 leading-snug">{recibo.representanteBeneficiarios}</p>
          {recibo.documentoRepresentante && (
            <p className="text-xs text-white/40 mt-0.5 font-mono">CC {recibo.documentoRepresentante}</p>
          )}
        </div>
      </div>

      {/* Service */}
      <div className="bg-white/5 rounded-xl p-3 border border-white/10">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-white/30 mb-1">Servicio Prestado</p>
        <p className="text-xs text-white/70 leading-relaxed">{recibo.servicioPrestado}</p>
      </div>

      {recibo.observaciones && (
        <div className="bg-white/5 rounded-xl p-3 border border-white/10">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-white/30 mb-1">Observaciones</p>
          <p className="text-xs text-white/60 leading-relaxed">{recibo.observaciones}</p>
        </div>
      )}

      {/* Export — connected to PDF when API route is available */}
      <button
        disabled
        className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 text-emerald-300/50 font-medium cursor-not-allowed transition-all"
        title="Exportar PDF disponible próximamente"
      >
        <FileDown strokeWidth={1.5} className="size-3.5" />
        Exportar Recibo PDF
      </button>
    </div>
  )
}

// ---------------------------------------------------------------
// Tarjeta individual de formato
// ---------------------------------------------------------------

function FormatoCard({
  reembolso,
  exporting,
  onEdit,
  onExport,
  onDelete,
}: {
  reembolso: ReembolsoProps
  exporting: boolean
  onEdit: () => void
  onExport: () => void
  onDelete: () => void
}) {
  const isTransporte = reembolso.tipo === 'TRANSPORTE'
  const Icon = isTransporte ? Bus : Flower2
  const iconColor = isTransporte ? 'text-blue-400' : 'text-purple-400'
  const accentColor = isTransporte ? 'text-blue-400' : 'text-purple-400'

  return (
    <div className="group bg-white/5 hover:bg-white/10 border border-white/10 shadow-lg rounded-xl backdrop-blur-xl transition-all duration-200 flex flex-col p-4 gap-3">
      {/* Header: tipo + controles */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <div className={`p-1.5 rounded-lg bg-white/5 ${iconColor}`}>
            <Icon strokeWidth={1.5} className="size-4" />
          </div>
          <span className={`text-xs font-bold uppercase tracking-wider ${accentColor}`}>
            {reembolso.tipo}
          </span>
        </div>
        {/* Botones de control — esquina superior derecha */}
        <div className="flex items-center gap-1">
          <button
            onClick={onEdit}
            className="p-1 rounded-md text-white/50 hover:text-white hover:bg-white/10 transition-all"
            aria-label={`Editar ${reembolso.personaNombre}`}
            title="Editar formato"
          >
            <Edit2 strokeWidth={1.5} className="size-4" />
          </button>
          <button
            onClick={onDelete}
            className="p-1 rounded-md text-white/50 hover:text-red-400 hover:bg-red-500/10 transition-all"
            aria-label={`Eliminar ${reembolso.personaNombre}`}
            title="Eliminar formato"
          >
            <Trash2 strokeWidth={1.5} className="size-4" />
          </button>
        </div>
      </div>

      {/* Beneficiario + valor */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-sm text-white/90 truncate">{reembolso.personaNombre}</p>
          <p className="text-xs text-white/40 font-mono mt-0.5">{reembolso.documento}</p>
        </div>
        <div className="flex flex-col items-end shrink-0">
          <span className="font-bold text-sm text-white/90 whitespace-nowrap">
            {fmtCOP(reembolso.valor)}
          </span>
          {!isTransporte && (
            <span className="flex items-center gap-0.5 text-[10px] text-purple-400/70 font-medium mt-0.5">
              <Lock strokeWidth={2} className="size-2.5" />
              normativo
            </span>
          )}
        </div>
      </div>

      {/* Ruta y fecha */}
      <div className="text-xs text-white/50 space-y-0.5">
        <p className="truncate">{reembolso.rutaOrigen} → {reembolso.rutaDestino}</p>
        <p>{fmtFecha(reembolso.fecha)}</p>
      </div>

      {/* Exportar PDF */}
      <div className="pt-1 mt-auto">
        <button
          onClick={onExport}
          disabled={exporting}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-white/10 hover:bg-white/20 border border-white/20 text-white/80 hover:text-white font-medium disabled:opacity-50 transition-all shadow-md backdrop-blur-md"
          aria-label={`Exportar PDF de ${reembolso.personaNombre}`}
        >
          {exporting ? (
            <Loader2 strokeWidth={1.5} className="size-3 animate-spin" />
          ) : (
            <FileDown strokeWidth={1.5} className="size-3" />
          )}
          Exportar PDF
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------
// EmptyStateConGenerar — estado vacío con botón de regeneración
// y fallback de importación desde Excel
// ---------------------------------------------------------------

function EmptyStateConGenerar({
  actividadId,
  onGenerados,
}: {
  actividadId: string
  onGenerados: (lista: ReembolsoProps[]) => void
}) {
  const [isPending, startTransition] = useTransition()
  const [msg, setMsg] = useState<{ texto: string; tipo: 'ok' | 'warn' | 'error' } | null>(null)
  const [showUpload, setShowUpload] = useState(false)
  const [uploading, setUploading] = useState(false)

  function handleGenerar() {
    setMsg(null)
    startTransition(async () => {
      const result = await materializarReembolsosAuto(actividadId)
      if (result.generados > 0) {
        onGenerados(result.reembolsos)
        setMsg({ texto: `${result.generados} formato${result.generados !== 1 ? 's' : ''} generado${result.generados !== 1 ? 's' : ''} correctamente.`, tipo: 'ok' })
      } else {
        // No data in DB — show upload fallback
        setShowUpload(true)
        setMsg({ texto: 'No hay datos de beneficiarios en la base de datos. Sube el Excel original para importarlos.', tipo: 'warn' })
      }
    })
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setMsg(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const result = await importarReembolsosDesdeExcel(actividadId, fd)
      if (result.error) {
        setMsg({ texto: result.error, tipo: 'error' })
      } else if (result.generados > 0) {
        onGenerados(result.reembolsos)
        setMsg({ texto: `${result.generados} formato${result.generados !== 1 ? 's' : ''} importado${result.generados !== 1 ? 's' : ''} correctamente.`, tipo: 'ok' })
      } else {
        setMsg({ texto: 'No se encontraron beneficiarios con valores de transporte en el Excel.', tipo: 'warn' })
      }
    } catch {
      setMsg({ texto: 'Error inesperado al procesar el archivo.', tipo: 'error' })
    } finally {
      setUploading(false)
      // Reset file input
      e.target.value = ''
    }
  }

  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-10 text-center backdrop-blur-md flex flex-col items-center gap-4">
      <Receipt strokeWidth={1.5} className="size-8 text-white/25 mx-auto" />
      <p className="text-sm font-medium text-white/50">Sin formatos detectados</p>
      <p className="text-xs text-white/30 max-w-xs leading-relaxed mx-auto">
        Los formatos se generan automáticamente desde los datos de beneficiarios
        del requerimiento. Si no se generaron, usa el botón para volver a intentarlo.
      </p>

      {/* Botón principal: generar desde DB */}
      <button
        onClick={handleGenerar}
        disabled={isPending || uploading}
        className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-xl bg-violet-500/20 hover:bg-violet-500/30 border border-violet-500/30 text-violet-300 disabled:opacity-50 transition-all"
      >
        {isPending ? (
          <Loader2 strokeWidth={1.5} className="size-4 animate-spin" />
        ) : (
          <Wand2 strokeWidth={1.5} className="size-4" />
        )}
        {isPending ? 'Generando…' : 'Generar Reembolsos'}
      </button>

      {/* Fallback: importar desde Excel */}
      {showUpload && (
        <div className="w-full max-w-sm space-y-3 pt-2 border-t border-white/10">
          <p className="text-xs text-amber-400/80 leading-relaxed">
            Sube el Excel del requerimiento (hoja ALOJAMIENTO) para importar los beneficiarios.
          </p>
          <label
            className={`flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-xl border cursor-pointer transition-all ${
              uploading
                ? 'bg-white/5 border-white/10 text-white/30 cursor-wait'
                : 'bg-amber-500/15 hover:bg-amber-500/25 border-amber-500/30 text-amber-300'
            }`}
          >
            {uploading ? (
              <Loader2 strokeWidth={1.5} className="size-4 animate-spin" />
            ) : (
              <Upload strokeWidth={1.5} className="size-4" />
            )}
            {uploading ? 'Importando…' : 'Importar desde Excel'}
            <input
              type="file"
              accept=".xlsx,.xlsm,.xls"
              onChange={handleFileUpload}
              disabled={uploading}
              className="hidden"
            />
          </label>
        </div>
      )}

      {/* Mensajes */}
      {msg && (
        <p className={`text-xs font-medium ${
          msg.tipo === 'ok' ? 'text-emerald-400' :
          msg.tipo === 'error' ? 'text-red-400' :
          'text-amber-400'
        }`}>
          {msg.texto}
        </p>
      )}
    </div>
  )
}

// ---------------------------------------------------------------
// TablaReembolsos — componente principal (ahora: Formatos)
// ---------------------------------------------------------------

export function TablaReembolsos({ actividadId, initialReembolsos }: Props) {
  const [reembolsos, setReembolsos] = useState<ReembolsoProps[]>(initialReembolsos)
  const [editing, setEditing] = useState<ReembolsoProps | null>(null)
  const [showCrear, setShowCrear] = useState(false)
  const [exportingId, setExportingId] = useState<string | null>(null)
  const [toastMsg, setToastMsg] = useState('')
  const [toastType, setToastType] = useState<'success' | 'error'>('success')

  // ── Recibo a Satisfacción ──────────────────────────────────────
  const [recibo, setRecibo] = useState<ReciboSatisfaccion | null>(null)
  const [showReciboModal, setShowReciboModal] = useState(false)
  const [isEditingRecibo, setIsEditingRecibo] = useState(false)

  const transporte = reembolsos.filter((r) => r.tipo === 'TRANSPORTE')
  const inhumacion = reembolsos.filter((r) => r.tipo === 'INHUMACION')
  const isEmpty = reembolsos.length === 0

  // ── Creación ─────────────────────────────────────────────────
  function handleCreated(created: ReembolsoProps) {
    setReembolsos((prev) => [...prev, created])
    setShowCrear(false)
    showToast('Formato creado correctamente.', 'success')
  }

  // ── Eliminación ──────────────────────────────────────────────
  async function handleDelete(id: string) {
    // Optimistic: remove immediately from UI
    setReembolsos((prev) => prev.filter((r) => r.id !== id))
    try {
      await eliminarReembolso(id, actividadId)
      showToast('Formato eliminado.', 'success')
    } catch {
      showToast('No se pudo eliminar. Recarga la página.', 'error')
    }
  }

  // ── Edición ──────────────────────────────────────────────────
  function handleSaved(updated: ReembolsoProps) {
    setReembolsos((prev) =>
      prev.map((r) => (r.id === updated.id ? updated : r)),
    )
    setEditing(null)
    showToast('Formato guardado correctamente.', 'success')
  }

  // ── Exportar documento individual ────────────────────────────
  async function handleExportOne(reembolso: ReembolsoProps) {
    setExportingId(reembolso.id)
    try {
      const response = await fetch('/api/reembolsos/exportar', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          reembolsoProps: reembolso,
          actividadId,
          expedidoPor:    'Coordinador Logístico',
        }),
      })

      if (!response.ok) {
        const err = await response.json().catch(() => ({}))
        throw new Error((err as { error?: string }).error ?? 'Error desconocido')
      }

      const blob = await response.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      const disposition = response.headers.get('Content-Disposition')
      a.download = disposition?.match(/filename="([^"]+)"/)?.[1]
        ?? `FORMATO-${reembolso.tipo}-${reembolso.documento}.xlsx`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      showToast('Documento generado exitosamente.', 'success')
    } catch {
      showToast('No se pudo generar el documento.', 'error')
    } finally {
      setExportingId(null)
    }
  }

  function showToast(msg: string, type: 'success' | 'error') {
    setToastMsg(msg)
    setToastType(type)
    setTimeout(() => setToastMsg(''), 4000)
  }

  // ── Recibo de Satisfacción handlers ─────────────────────────
  function handleReciboGuardado(data: ReciboSatisfaccion) {
    setRecibo(data)
    setShowReciboModal(false)
    setIsEditingRecibo(false)
    showToast('Recibo a Satisfacción guardado correctamente.', 'success')
  }

  function handleReciboEliminado() {
    setRecibo(null)
    showToast('Recibo eliminado.', 'success')
  }

  // ── Render ───────────────────────────────────────────────────
  return (
    <>
      {/* ── Encabezado de sección con botón de creación ── */}
      <div className="flex items-center justify-between mb-6">
        <div />
        <button
          onClick={() => setShowCrear(true)}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl bg-white/10 hover:bg-white/20 border border-white/10 text-white transition-all shadow-md backdrop-blur-md"
        >
          <Plus strokeWidth={1.5} className="size-4" />
          Nuevo Formato
        </button>
      </div>

      {/* ── Estado vacío (glass) ── */}
      {isEmpty && (
        <EmptyStateConGenerar
          actividadId={actividadId}
          onGenerados={(lista) => setReembolsos(lista)}
        />
      )}

      {/* ── Secciones por tipo con grid ── */}
      {!isEmpty && (
        <div className="space-y-8">
          {/* Transporte */}
          {transporte.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-4">
                <Bus strokeWidth={1.5} className="size-3.5 text-blue-400" />
                <span className="text-xs font-bold uppercase tracking-widest text-blue-400">
                  Transporte
                </span>
                <span className="text-xs text-white/30">
                  · {transporte.length} formato{transporte.length !== 1 ? 's' : ''}
                </span>
                <span className="ml-auto text-xs font-semibold text-white/50">
                  {fmtCOP(transporte.reduce((s, r) => s + r.valor, 0))}
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {transporte.map((r) => (
                  <FormatoCard
                    key={r.id}
                    reembolso={r}
                    exporting={exportingId === r.id}
                    onEdit={() => setEditing(r)}
                    onExport={() => handleExportOne(r)}
                    onDelete={() => handleDelete(r.id)}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Inhumación */}
          {inhumacion.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-4">
                <Flower2 strokeWidth={1.5} className="size-3.5 text-purple-400" />
                <span className="text-xs font-bold uppercase tracking-widest text-purple-400">
                  Inhumación
                </span>
                <span className="text-xs text-white/30">
                  · {inhumacion.length} formato{inhumacion.length !== 1 ? 's' : ''}
                </span>
                <span className="ml-auto text-xs font-semibold text-white/50">
                  {fmtCOP(inhumacion.reduce((s, r) => s + r.valor, 0))}
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {inhumacion.map((r) => (
                  <FormatoCard
                    key={r.id}
                    reembolso={r}
                    exporting={exportingId === r.id}
                    onEdit={() => setEditing(r)}
                    onExport={() => handleExportOne(r)}
                    onDelete={() => handleDelete(r.id)}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {/* ── Recibo a Satisfacción ── */}
      {recibo ? (
        <ReciboCard
          recibo={recibo}
          onEdit={() => { setIsEditingRecibo(true); setShowReciboModal(true) }}
          onDelete={handleReciboEliminado}
        />
      ) : (
        <div className="mt-8 bg-white/5 hover:bg-white/10 border border-white/10 shadow-lg rounded-xl backdrop-blur-xl transition-all duration-200 p-5 flex items-center gap-5">
          <div className="shrink-0 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
            <ClipboardCheck strokeWidth={1.5} className="size-5 text-emerald-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white/90">Recibo a Satisfacción</p>
            <p className="text-xs text-white/40 mt-0.5 leading-relaxed">
              Acredita la prestación satisfactoria del servicio logístico por parte de la UV.
              Se emite y firma al cierre formal de la actividad.
            </p>
          </div>
          <button
            onClick={() => { setIsEditingRecibo(false); setShowReciboModal(true) }}
            className="shrink-0 flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/25 text-emerald-300 whitespace-nowrap transition-all"
          >
            <Plus strokeWidth={1.5} className="size-3.5" />
            Crear Recibo
          </button>
        </div>
      )}

      {/* ── Modal de creación ── */}
      {showCrear && (
        <ModalCrearFormato
          actividadId={actividadId}
          onSave={handleCreated}
          onCancel={() => setShowCrear(false)}
        />
      )}

      {/* ── Modal de edición ── */}
      {editing && (
        <ModalEditarReembolso
          reembolso={editing}
          onSave={handleSaved}
          onCancel={() => setEditing(null)}
        />
      )}

      {/* ── Modal Recibo a Satisfacción ── */}
      {showReciboModal && (
        <ModalReciboSatisfaccion
          initial={isEditingRecibo ? recibo : null}
          onSave={handleReciboGuardado}
          onCancel={() => { setShowReciboModal(false); setIsEditingRecibo(false) }}
        />
      )}

      {/* ── Toast ── */}
      {toastMsg && <Toast message={toastMsg} type={toastType} />}
    </>
  )
}

