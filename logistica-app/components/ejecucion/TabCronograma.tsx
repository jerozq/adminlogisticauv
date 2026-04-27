'use client'

import { useState, useTransition } from 'react'
import {
  CheckCircle2,
  Circle,
  Camera,
  Clock,
  Plus,
  AlertTriangle,
  Loader2,
  X,
  ImageIcon,
} from 'lucide-react'
import { crearEntrega, marcarEntregaLista, marcarEntregaPendiente } from '@/actions/ejecucion'
import { uploadEvidencia } from '@/lib/supabase-browser'
import type { BitacoraEntregaRow, EstadoEntrega } from '@/types/ejecucion'

// ============================================================
// Helpers de tiempo
// ============================================================

// Formatear hora: si es ISO string, extrae HH:MM; si es HH:MM ya, devuelve igual
function fmtTime(t: string | null | undefined): string | null {
  if (!t) return null
  // Si contiene 'T', es un ISO string → extrae HH:MM
  if (t.includes('T')) {
    const parts = t.split('T')[1]?.substring(0, 5)
    return parts && /^\d{2}:\d{2}$/.test(parts) ? parts : null
  }
  // Si es HH:MM ya, valida y devuelve
  if (/^\d{2}:\d{2}$/.test(t)) return t
  // Otro formato inválido
  return null
}

function getAlertLevel(
  fechaHoraLimite: string,
  estado: EstadoEntrega
): 'none' | 'warning' | 'danger' {
  if (estado === 'listo') return 'none'
  const limite = new Date(fechaHoraLimite)
  const now = new Date()
  if (limite < now) return 'danger'   // vencida
  const diffHoras = (limite.getTime() - now.getTime()) / (1000 * 60 * 60)
  if (diffHoras <= 2) return 'warning' // menos de 2 horas
  return 'none'
}

function formatDateTime(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const tomorrow = new Date(now)
  tomorrow.setDate(tomorrow.getDate() + 1)

  const time = d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })

  if (d.toDateString() === now.toDateString()) return `Hoy ${time}`
  if (d.toDateString() === tomorrow.toDateString()) return `Mañana ${time}`
  return (
    d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: '2-digit' }) +
    ` ${time}`
  )
}

// ============================================================
// TabCronograma
// ============================================================

interface Props {
  actividadId: string
  fechaInicioDefault: string | null
  horaInicioDefault: string | null
  initialEntregas: BitacoraEntregaRow[]
}

export function TabCronograma({
  actividadId,
  fechaInicioDefault,
  horaInicioDefault,
  initialEntregas,
}: Props) {
  const [entregas, setEntregas] = useState<BitacoraEntregaRow[]>(
    [...initialEntregas].sort(
      (a, b) =>
        new Date(a.fecha_hora_limite).getTime() - new Date(b.fecha_hora_limite).getTime()
    )
  )
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(() => {
    // Default: fecha de inicio de la actividad a la hora programada
    let defaultDt = ''
    if (fechaInicioDefault && horaInicioDefault) {
      const hm = fmtTime(horaInicioDefault)
      if (hm) {
        defaultDt = `${fechaInicioDefault}T${hm}`
      }
    }
    return { descripcion: '', fecha_hora_limite: defaultDt }
  })
  const [adding, startAdd] = useTransition()
  const [uploadingId, setUploadingId] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // ----- Agregar hito -----
  function handleAdd() {
    if (!form.descripcion.trim() || !form.fecha_hora_limite) return
    setErrorMsg(null)
    startAdd(async () => {
      try {
        const nueva = await crearEntrega(actividadId, {
          descripcion: form.descripcion.trim(),
          fecha_hora_limite: new Date(form.fecha_hora_limite).toISOString(),
        })
        setEntregas((prev) =>
          [...prev, nueva].sort(
            (a, b) =>
              new Date(a.fecha_hora_limite).getTime() - new Date(b.fecha_hora_limite).getTime()
          )
        )
        setForm((f) => ({ ...f, descripcion: '' }))
        setShowForm(false)
      } catch (e) {
        setErrorMsg('Error al guardar el hito. Intenta de nuevo.')
      }
    })
  }

  // ----- Marcar como listo o pendiente -----
  async function handleToggleEstado(entregaId: string, estaListo: boolean) {
    if (estaListo) {
      // Revertir a pendiente
      await marcarEntregaPendiente(entregaId, actividadId)
      setEntregas((prev) =>
        prev.map((e) => (e.id === entregaId ? { ...e, estado: 'pendiente' as const } : e))
      )
    } else {
      // Marcar listo (sin evidencia en este punto)
      await marcarEntregaLista(entregaId, null, actividadId)
      setEntregas((prev) =>
        prev.map((e) => (e.id === entregaId ? { ...e, estado: 'listo' as const } : e))
      )
    }
  }

  // ----- Subir evidencia y marcar listo -----
  async function handleUploadEvidencia(entregaId: string, file: File) {
    setUploadingId(entregaId)
    setErrorMsg(null)
    try {
      const url = await uploadEvidencia(file, 'entregas')
      await marcarEntregaLista(entregaId, url, actividadId)
      setEntregas((prev) =>
        prev.map((e) =>
          e.id === entregaId
            ? { ...e, estado: 'listo' as const, evidencia_url: url }
            : e
        )
      )
    } catch (e) {
      setErrorMsg('Error subiendo la imagen. Verifica tu conexión.')
    } finally {
      setUploadingId(null)
    }
  }

  const pendientes = entregas.filter((e) => e.estado === 'pendiente')
  const listos = entregas.filter((e) => e.estado === 'listo')

  return (
    <div className="space-y-3">
      {/* Error */}
      {errorMsg && (
        <div className="flex items-center gap-2 pill-cancel text-sm px-4 py-3 rounded-xl">
          <AlertTriangle strokeWidth={1.5} className="size-4 shrink-0" />
          <span>{errorMsg}</span>
          <button onClick={() => setErrorMsg(null)} className="ml-auto">
            <X strokeWidth={1.5} className="size-4" />
          </button>
        </div>
      )}

      {/* Botón agregar */}
      <button
        onClick={() => setShowForm((v) => !v)}
        className="w-full flex items-center justify-center gap-2 py-3 text-sm font-semibold
                   btn-secondary rounded-2xl transition-colors"
      >
        <Plus strokeWidth={1.5} className="size-4" />
        Agregar hito
      </button>

      {/* Formulario */}
      {showForm && (
        <div className="surface-card rounded-2xl p-4 space-y-3">
          <input
            type="text"
            placeholder="Ej: 3 almuerzos, refrigerios, transporte…"
            value={form.descripcion}
            onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))}
            className="glass-input w-full px-3 py-3 text-sm placeholder:[color:var(--text-muted)]"
          />
          <div>
            <label className="text-xs text-zinc-500 mb-1 block font-medium">
              Fecha y hora límite de entrega
            </label>
            <input
              type="datetime-local"
              value={form.fecha_hora_limite}
              onChange={(e) => setForm((f) => ({ ...f, fecha_hora_limite: e.target.value }))}
              className="glass-input w-full px-3 py-3 text-sm"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleAdd}
              disabled={adding || !form.descripcion.trim() || !form.fecha_hora_limite}
              className="flex-1 flex items-center justify-center gap-2 py-3 text-sm font-semibold
                         btn-primary rounded-xl disabled:opacity-50 transition-colors"
            >
              {adding && <Loader2 strokeWidth={1.5} className="size-4 animate-spin" />}
              {adding ? 'Guardando…' : 'Guardar hito'}
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="px-4 py-3 text-sm btn-secondary rounded-xl transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Lista vacía */}
      {entregas.length === 0 && (
        <div className="flex flex-col items-center py-14 [color:var(--text-muted)]">
          <Clock strokeWidth={1.5} className="size-10 mb-3 opacity-40" />
          <p className="text-sm">Sin hitos en el cronograma</p>
          <p className="text-xs mt-1">Agrega entregas para hacer seguimiento en campo</p>
        </div>
      )}

      {/* Pendientes */}
      {pendientes.map((entrega) => {
        const alert = getAlertLevel(entrega.fecha_hora_limite, entrega.estado)
        const uploading = uploadingId === entrega.id

        return (
          <EntregaCard
            key={entrega.id}
            entrega={entrega}
            alertLevel={alert}
            uploading={uploading}
            onToggleEstado={() => handleToggleEstado(entrega.id, entrega.estado === 'listo')}
            onUpload={(file) => handleUploadEvidencia(entrega.id, file)}
          />
        )
      })}

      {/* Separador listos */}
      {listos.length > 0 && (
        <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider px-1 pt-2">
          Completadas ({listos.length})
        </p>
      )}

      {/* Completadas */}
      {listos.map((entrega) => (
        <EntregaCard
          key={entrega.id}
          entrega={entrega}
          alertLevel="none"
          uploading={false}
          onToggleEstado={() => handleToggleEstado(entrega.id, true)}
          onUpload={(file) => handleUploadEvidencia(entrega.id, file)}
        />
      ))}
    </div>
  )
}

// ============================================================
// EntregaCard
// ============================================================
interface CardProps {
  entrega: BitacoraEntregaRow
  alertLevel: 'none' | 'warning' | 'danger'
  uploading: boolean
  onToggleEstado: () => void
  onUpload: (file: File) => void
}

function EntregaCard({ entrega, alertLevel, uploading, onToggleEstado, onUpload }: CardProps) {
  const done = entrega.estado === 'listo'

  const ringCls = done
    ? 'surface-card opacity-70'
    : alertLevel === 'danger'
    ? 'pill-cancel rounded-2xl'
    : alertLevel === 'warning'
    ? 'pill-run rounded-2xl'
    : 'surface-card'

  return (
    <div className={`rounded-2xl p-4 ring-1 transition-all ${ringCls}`}>
      {/* Alerta de tiempo */}
      {!done && alertLevel !== 'none' && (
        <div
        className={`flex items-center gap-1.5 text-xs font-bold mb-2 ${
            alertLevel === 'danger' ? '[color:var(--state-cancel-fg)]' : '[color:var(--state-run-fg)]'
          }`}
        >
          <AlertTriangle strokeWidth={1.5} className="size-3.5" />
          {alertLevel === 'danger'
            ? '¡Vencida! Sin evidencia cargada'
            : 'Menos de 2 horas · Carga la evidencia ahora'}
        </div>
      )}

      <div className="flex items-start gap-3">
        {/* Checkbox Toggle */}
        <button
          onClick={onToggleEstado}
          className={`mt-0.5 shrink-0 transition-colors hover:text-blue-400`}
          title={done ? 'Marcar como pendiente' : 'Marcar como listo'}
        >
          {done ? (
            <CheckCircle2 strokeWidth={1.5} className="size-5 text-green-500" />
          ) : (
            <Circle strokeWidth={1.5} className="size-5 text-zinc-300" />
          )}
        </button>

        {/* Contenido */}
        <div className="flex-1 min-w-0">
          <p
            className={`text-sm font-medium leading-snug ${
              done ? 'line-through [color:var(--text-muted)]' : '[color:var(--text-primary)]'
            }`}
          >
            {entrega.descripcion}
          </p>
          <p
            className={`text-xs mt-0.5 ${
              !done && alertLevel === 'danger'
                ? '[color:var(--state-cancel-fg)] font-semibold'
                : !done && alertLevel === 'warning'
                ? '[color:var(--state-run-fg)] font-semibold'
                : '[color:var(--text-muted)]'
            }`}
          >
            {formatDateTime(entrega.fecha_hora_limite)}
          </p>

          {/* Miniatura de evidencia */}
          {entrega.evidencia_url && (
            <a
              href={entrega.evidencia_url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-block"
            >
              {entrega.evidencia_url.match(/\.(jpg|jpeg|png|webp|heic)$/i) ? (
                <img
                  src={entrega.evidencia_url}
                  alt="Evidencia"
                  className="h-16 w-24 object-cover rounded-xl ring-1 ring-green-200"
                />
              ) : (
                <span className="flex items-center gap-1 text-xs text-blue-600 underline">
                  <ImageIcon strokeWidth={1.5} className="size-3" /> Ver evidencia
                </span>
              )}
            </a>
          )}
        </div>

        {/* Botón cargar evidencia (siempre visible para poder re-subir foto) */}
        <label
          className={`shrink-0 flex items-center gap-1.5 px-3 py-2 text-xs font-semibold
                      rounded-xl cursor-pointer transition-colors min-w-[90px] justify-center
                      ${
                        uploading
                          ? '[background:var(--surface)] [color:var(--text-muted)] pointer-events-none'
                          : done 
                          ? 'btn-secondary ring-0'
                          : 'btn-primary'
                      }`}
        >
            {uploading ? (
              <Loader2 strokeWidth={1.5} className="size-3.5 animate-spin" />
            ) : (
              <Camera strokeWidth={1.5} className="size-3.5" />
            )}
            {uploading ? 'Subiendo…' : 'Evidencia'}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              disabled={uploading}
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) onUpload(file)
                e.target.value = ''
              }}
            />
          </label>
      </div>
    </div>
  )
}
