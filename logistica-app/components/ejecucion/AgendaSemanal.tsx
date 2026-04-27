'use client'

import { useState, useMemo, useRef } from 'react'
import {
  X,
  Plus,
  Edit3,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Calendar,
} from 'lucide-react'
import { subirArchivoEvidencia } from '@/actions/agenda-semanal'
import type { HitoCronogramaIA } from '@/actions/cronograma-ia'

// ============================================================
// Types & Helpers
// ============================================================

export interface Entregable extends HitoCronogramaIA {
  id?: string // Para edición en bitacora_entregas
}

interface ModalState {
  type: 'edit' | 'add' | null
  entregable?: Entregable
  selectedDate?: string
  selectedHour?: string
}

const HORAS = Array.from({ length: 15 }, (_, i) => {
  const h = 6 + i
  return {
    hora: h,
    label: `${h.toString().padStart(2, '0')}:00`,
    minLabel: `${h.toString().padStart(2, '0')}:30`,
  }
})

const EMOJIS_POR_PALABRA = {
  almuerzo: '🍽️',
  desayuno: '🥣',
  refrigerio: '☕',
  almacen: '📦',
  montaje: '🔧',
  transporte: '🚚',
  alojamiento: '🏨',
  material: '📋',
  entrega: '✅',
}

function getEmojiForItem(desc: string): string {
  const lower = desc.toLowerCase()
  for (const [palabra, emoji] of Object.entries(EMOJIS_POR_PALABRA)) {
    if (lower.includes(palabra)) return emoji
  }
  return '📌'
}

function getColorForHour(hora: number): string {
  if (hora >= 6 && hora < 10) return 'bg-amber-100/40' // Mañana
  if (hora >= 12 && hora < 14) return 'bg-orange-100/40' // Almuerzo
  if (hora >= 14 && hora < 17) return 'bg-blue-100/40' // Tarde
  return 'bg-white/5' // Otros
}

// ============================================================
// Grid Cell (Entregable Card)
// ============================================================

interface EntregableCardProps {
  entregable: Entregable
  onEdit: (e: Entregable) => void
  onDelete: (id: string | undefined) => void
}

function EntregableCard({ entregable, onEdit, onDelete }: EntregableCardProps) {
  const emoji = getEmojiForItem(entregable.descripcion_item)
  const estado = (entregable as { estado?: 'pendiente' | 'listo' }).estado ?? 'pendiente'

  return (
    <div
      className={`
        relative group
        px-2.5 py-2 rounded-xl
        backdrop-blur-sm ring-1
        transition-all hover:scale-105 cursor-pointer
        ${
          estado === 'listo'
            ? 'bg-emerald-400/20 ring-emerald-300/50'
            : 'bg-yellow-400/20 ring-yellow-300/50'
        }
      `}
      onClick={() => onEdit(entregable)}
    >
      <div className="flex items-center gap-1.5 mb-0.5">
        <span className="text-lg">{emoji}</span>
        <span className="text-[11px] font-bold text-white truncate max-w-[90px]">
          {entregable.descripcion_item}
        </span>
      </div>
      <div className="text-[10px] text-white/70 font-mono">
        x{entregable.cantidad}
      </div>

      {/* ── Acciones en hover ── */}
      <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
        <button
          onClick={(e) => {
            e.stopPropagation()
            onEdit(entregable)
          }}
          className="p-1 bg-white/20 hover:bg-white/40 rounded-md transition-colors"
          title="Editar"
        >
          <Edit3 className="size-2.5 text-white" />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation()
            onDelete(entregable.id)
          }}
          className="p-1 bg-red-500/20 hover:bg-red-500/40 rounded-md transition-colors"
          title="Eliminar"
        >
          <Trash2 className="size-2.5 text-red-300" />
        </button>
      </div>
    </div>
  )
}

// ============================================================
// Modal: Editar / Crear Entregable (CON EVIDENCIAS Y ESTADO)
// ============================================================

interface EntregableModalProps {
  isOpen: boolean
  mode: 'edit' | 'add'
  entregable?: Entregable & { id?: string; estado?: string; evidencia_url?: string }
  defaultDate?: string
  defaultHour?: string
  actividadId?: string
  onSave: (e: Entregable & { id?: string; estado?: string; evidencia_url?: string }) => void | Promise<void>
  onClose: () => void
}

function EntregableModal({
  isOpen,
  mode,
  entregable,
  defaultDate,
  defaultHour,
  actividadId,
  onSave,
  onClose,
}: EntregableModalProps) {
  const [form, setForm] = useState<
    Entregable & { id?: string; estado?: string; evidencia_url?: string }
  >(
    entregable || {
      fecha: defaultDate || new Date().toISOString().split('T')[0],
      hora: defaultHour || '09:00',
      descripcion_item: '',
      cantidad: 1,
      estado: 'pendiente',
      id: undefined,
      evidencia_url: undefined,
    }
  )

  const [uploading, setUploading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  if (!isOpen) return null

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !actividadId || !form.id) return

    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('id', form.id)

      const result = await subirArchivoEvidencia(formData)

      if (!result.ok || !result.url) {
        console.error('Upload error:', result.error)
        alert('Error al subir la evidencia: ' + result.error)
        return
      }

      setForm({ ...form, evidencia_url: result.url })
    } catch (err) {
      console.error('Upload failed:', err)
      alert('Error al procesar la evidencia')
    } finally {
      setUploading(false)
    }
  }

  const handleSave = async () => {
    setIsSaving(true)
    try {
      await onSave(form)
      onClose()
    } catch (err) {
      console.error('Save failed:', err)
      alert('Error al guardar cambios')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="glass-panel rounded-3xl p-8 max-w-lg w-full mx-4 ring-1 ring-white/20 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white">
            {mode === 'edit' ? 'Editar Entregable' : 'Nuevo Entregable'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
          >
            <X className="size-5 text-white" />
          </button>
        </div>

        <div className="space-y-4 mb-6">
          {/* Fecha */}
          <div>
            <label className="block text-xs font-bold text-white/60 mb-2">
              Fecha (YYYY-MM-DD)
            </label>
            <input
              type="date"
              value={form.fecha}
              onChange={(e) => setForm({ ...form, fecha: e.target.value })}
              className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-white/50"
            />
          </div>

          {/* Hora */}
          <div>
            <label className="block text-xs font-bold text-white/60 mb-2">
              Hora (HH:MM)
            </label>
            <input
              type="time"
              value={form.hora}
              onChange={(e) => setForm({ ...form, hora: e.target.value })}
              className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-white/50"
            />
          </div>

          {/* Descripción */}
          <div>
            <label className="block text-xs font-bold text-white/60 mb-2">
              Descripción del Ítem
            </label>
            <input
              type="text"
              placeholder="Ej: Almuerzos, Montaje de salón, ..."
              value={form.descripcion_item}
              onChange={(e) =>
                setForm({ ...form, descripcion_item: e.target.value })
              }
              className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-white/50"
            />
          </div>

          {/* Cantidad */}
          <div>
            <label className="block text-xs font-bold text-white/60 mb-2">
              Cantidad
            </label>
            <input
              type="number"
              min="1"
              value={form.cantidad}
              onChange={(e) =>
                setForm({ ...form, cantidad: parseInt(e.target.value) || 1 })
              }
              className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-white/50"
            />
          </div>

          {/* Estado */}
          {mode === 'edit' && (
            <div>
              <label className="block text-xs font-bold text-white/60 mb-2">
                Estado
              </label>
              <select
                value={form.estado || 'pendiente'}
                onChange={(e) =>
                  setForm({ ...form, estado: e.target.value as 'pendiente' | 'listo' })
                }
                className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-white/50"
              >
                <option value="pendiente" className="text-zinc-900">
                  Pendiente
                </option>
                <option value="listo" className="text-zinc-900">
                  Hecho ✓
                </option>
              </select>
            </div>
          )}

          {/* Evidencia / Foto */}
          {mode === 'edit' && (
            <div className="border-t border-white/10 pt-4">
              <label className="block text-xs font-bold text-white/60 mb-3">
                Evidencia / Foto
              </label>

              {/* Zona de carga */}
              <div className="mb-4">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,.pdf"
                  onChange={handleFileUpload}
                  disabled={uploading}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef?.current?.click()}
                  disabled={uploading}
                  className="w-full px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-lg font-bold transition-colors disabled:opacity-50"
                >
                  {uploading ? '📤 Subiendo...' : '📸 Subir Foto/Evidencia'}
                </button>
              </div>

              {/* Vista previa */}
              {form.evidencia_url && (
                <div className="space-y-2">
                  <div className="text-[11px] text-white/60 font-mono break-all">
                    {form.evidencia_url.split('/').pop()}
                  </div>
                  <img
                    src={form.evidencia_url}
                    alt="Vista previa"
                    className="w-full h-32 object-cover rounded-lg"
                    onError={() => {
                      console.error('Image failed to load')
                    }}
                  />
                  <button
                    onClick={() => setForm({ ...form, evidencia_url: undefined })}
                    className="text-xs text-red-400 hover:text-red-300"
                  >
                    Remover evidencia
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex gap-3">
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex-1 px-4 py-2.5 bg-gradient-to-r from-blue-600 to-violet-600 text-white rounded-lg font-bold hover:from-blue-700 hover:to-violet-700 transition-all disabled:opacity-50"
          >
            {isSaving ? '⏳ Guardando...' : mode === 'edit' ? 'Actualizar' : 'Crear'}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2.5 bg-white/10 text-white rounded-lg font-bold hover:bg-white/20 transition-colors"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}

// ============================================================
// AgendaSemanal Component
// ============================================================

interface AgendaSemanalProps {
  entregables: Entregable[]
  actividadId: string // REQUERIDO para operaciones en DB
  fechaInicio?: string // YYYY-MM-DD
  onSaveEntregable?: (e: Entregable) => void | Promise<void>
  onDeleteEntregable?: (id: string | undefined) => void | Promise<void>
}

export function AgendaSemanal({
  entregables,
  actividadId,
  fechaInicio,
  onSaveEntregable,
  onDeleteEntregable,
}: AgendaSemanalProps) {
  const [semanaOffset, setSemanaOffset] = useState(0)
  const [modal, setModal] = useState<ModalState>({ type: null })
  const [isLoading, setIsLoading] = useState(false)

  // Calcular semana actual
  const hoy = fechaInicio ? new Date(fechaInicio) : new Date()
  const primerDiaSemana = new Date(hoy)
  primerDiaSemana.setDate(hoy.getDate() - hoy.getDay() + semanaOffset * 7)

  const diasSemana = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(primerDiaSemana)
    d.setDate(d.getDate() + i)
    return d
  })

  // Agrupar entregables por fecha-hora
  const entregablesByDateHour = useMemo(() => {
    const map = new Map<string, Entregable[]>()
    for (const ent of entregables) {
      const horaNumero = parseInt(ent.hora.split(':')[0])
      const key = `${ent.fecha}-${horaNumero}`
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(ent)
    }
    return map
  }, [entregables])

  // Manejar click en espacio vacío
  function handleCellClick(dia: Date, hora: number) {
    const fechaStr = dia.toISOString().split('T')[0]
    const horaStr = `${hora.toString().padStart(2, '0')}:00`
    setModal({
      type: 'add',
      selectedDate: fechaStr,
      selectedHour: horaStr,
    })
  }

  // Manejar edición
  function handleEdit(ent: Entregable) {
    setModal({ type: 'edit', entregable: ent })
  }

  // Guardar cambios (CREATE o UPDATE)
  async function handleSave(
    ent: Entregable & { id?: string; estado?: string; evidencia_url?: string }
  ) {
    setIsLoading(true)
    try {
      // Importar las server actions
      const {
        agregarItemCronograma,
        actualizarItemCronograma,
        subirEvidenciaEntregable,
      } = await import('@/actions/agenda-semanal')

      if (ent.id && modal.type === 'edit') {
        // UPDATE
        const result = await actualizarItemCronograma(actividadId, ent.id, {
          fecha: ent.fecha,
          hora: ent.hora,
          descripcion_item: ent.descripcion_item,
          cantidad: ent.cantidad,
          estado: ent.estado as 'pendiente' | 'listo' | undefined,
        })

        if (!result.ok) {
          alert(result.error || 'Error al actualizar')
          return
        }

        // Si hay evidencia_url, también actualizar eso
        if (ent.evidencia_url) {
          const evidResult = await subirEvidenciaEntregable(
            ent.id,
            ent.evidencia_url
          )
          if (!evidResult.ok) {
            // Evidencia no crítica: el entregable se guardó correctamente
          }
        }
      } else {
        // CREATE
        const result = await agregarItemCronograma(actividadId, {
          fecha: ent.fecha,
          hora: ent.hora,
          descripcion_item: ent.descripcion_item,
          cantidad: ent.cantidad,
          estado: 'pendiente',
        })

        if (!result.ok) {
          alert(result.error || 'Error al crear')
          return
        }

        // Si hay evidencia_url, guardarla
        if (ent.evidencia_url && result.id) {
          const evidResult = await subirEvidenciaEntregable(
            result.id,
            ent.evidencia_url
          )
          if (!evidResult.ok) {
            // Evidencia no crítica: el entregable se guardó correctamente
          }
        }
      }

      // Callback opcional
      onSaveEntregable?.(ent)
    } catch (err) {
      console.error('Save failed:', err)
      alert('Error inesperado al guardar')
    } finally {
      setIsLoading(false)
    }
  }

  // Eliminar entregable
  async function handleDelete(id: string | undefined) {
    if (!id) return
    if (!confirm('¿Estás seguro de que quieres eliminar este entregable?'))
      return

    setIsLoading(true)
    try {
      const { eliminarItemCronograma } = await import(
        '@/actions/agenda-semanal'
      )

      const result = await eliminarItemCronograma(actividadId, id)

      if (!result.ok) {
        alert(result.error || 'Error al eliminar')
        return
      }

      onDeleteEntregable?.(id)
    } catch (err) {
      console.error('Delete failed:', err)
      alert('Error inesperado al eliminar')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* ── Header con navegación de semanas ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Calendar className="size-5 text-zinc-400" />
          <span className="text-sm font-bold text-white">
            Semana del {diasSemana[0].toLocaleDateString('es-CO', {
              month: 'short',
              day: 'numeric',
            })}{' '}
            al{' '}
            {diasSemana[6].toLocaleDateString('es-CO', {
              month: 'short',
              day: 'numeric',
            })}
          </span>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setSemanaOffset(semanaOffset - 1)}
            className="p-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
            title="Semana anterior"
          >
            <ChevronLeft className="size-4 text-white" />
          </button>
          <button
            onClick={() => setSemanaOffset(0)}
            className="px-3 py-2 text-xs font-bold text-white bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
          >
            Hoy
          </button>
          <button
            onClick={() => setSemanaOffset(semanaOffset + 1)}
            className="p-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
            title="Próxima semana"
          >
            <ChevronRight className="size-4 text-white" />
          </button>
        </div>
      </div>

      {/* ── Grid Semanal ── */}
      <div className="glass-panel rounded-3xl p-4 ring-1 ring-white/10 overflow-x-auto">
        <div
          className="grid gap-0.5"
          style={{
            gridTemplateColumns: '80px ' + Array(7).fill('1fr').join(' '),
            minWidth: '1200px',
          }}
        >
          {/* Encabezado: Horas + Días */}
          <div />
          {diasSemana.map((dia) => (
            <div
              key={dia.toISOString()}
              className="text-center py-2 border-b border-white/5"
            >
              <div className="text-xs font-bold text-white/60 uppercase">
                {dia.toLocaleDateString('es-CO', { weekday: 'short' })}
              </div>
              <div className="text-sm font-black text-white">
                {dia.getDate()}
              </div>
            </div>
          ))}

          {/* Filas: Horas x Días */}
          {HORAS.map((horario) => (
            <div key={horario.hora}>
              {/* Etiqueta de hora */}
              <div
                className={`
                  px-2 py-1 text-right text-[10px] font-bold
                  border-b border-white/5
                  text-white/50
                `}
              >
                <div className="flex items-center justify-end gap-1 h-full">
                  <Clock className="size-2.5" />
                  {horario.label}
                </div>
              </div>

              {/* Celdas para cada día */}
              {diasSemana.map((dia) => {
                const fechaStr = dia.toISOString().split('T')[0]
                const key = `${fechaStr}-${horario.hora}`
                const itemsEnCelda = entregablesByDateHour.get(key) || []

                return (
                  <div
                    key={key}
                    onClick={() => handleCellClick(dia, horario.hora)}
                    className={`
                      relative min-h-16 p-1
                      border-b border-r border-white/5
                      transition-colors hover:bg-white/10 cursor-pointer
                      ${getColorForHour(horario.hora)}
                    `}
                  >
                    <div className="space-y-1">
                      {itemsEnCelda.map((ent, idx) => (
                        <EntregableCard
                          key={`${ent.fecha}-${ent.hora}-${idx}`}
                          entregable={ent}
                          onEdit={handleEdit}
                          onDelete={handleDelete}
                        />
                      ))}
                    </div>

                    {/* Botón + para añadir si la celda está vacía */}
                    {itemsEnCelda.length === 0 && (
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleCellClick(dia, horario.hora)
                          }}
                          className="p-1 bg-white/20 hover:bg-white/40 rounded-md transition-colors"
                          title="Añadir ítem"
                        >
                          <Plus className="size-3 text-white" />
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>

      {/* ── Modal de Edición/Creación ── */}
      <EntregableModal
        isOpen={modal.type !== null}
        mode={modal.type as 'edit' | 'add'}
        entregable={modal.entregable}
        defaultDate={modal.selectedDate}
        defaultHour={modal.selectedHour}
        actividadId={actividadId}
        onSave={handleSave}
        onClose={() => setModal({ type: null })}
      />
    </div>
  )
}
