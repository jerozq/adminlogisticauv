'use client'

import { useState, useTransition, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import {
  Sparkles,
  Loader2,
  Clock,
  CalendarDays,
  CheckCircle2,
  Plus,
  Edit2,
  Trash2,
  RefreshCw,
  X,
  AlertTriangle,
  UtensilsCrossed,
  Truck,
  Package,
  Home,
  Wrench,
  Camera,
  ImageIcon,
} from 'lucide-react'
import { generarCronogramaIA, actualizarCronogramaIA } from '@/actions/cronograma-ia'
import { marcarEntregaLista, marcarEntregaPendiente } from '@/actions/ejecucion'
import { uploadEvidencia } from '@/lib/supabase-browser'
import type { BitacoraEntregaRow } from '@/types/ejecucion'
import type { HitoCronogramaIA } from '@/actions/cronograma-ia'

// ── Helpers ──────────────────────────────────────────────────────────────────
const CATEGORY_ICONS: Record<string, any> = {
  'Logística': Wrench,
  'Alimentación': UtensilsCrossed,
  'Materiales': Package,
  'Alojamiento': Home,
  'Transporte': Truck,
}

const CATEGORY_COLORS: Record<string, string> = {
  'Logística': 'bg-blue-100 text-blue-700 ring-blue-200/50 dark:bg-blue-900/30 dark:text-blue-300',
  'Alimentación': 'bg-amber-100 text-amber-700 ring-amber-200/50 dark:bg-amber-900/30 dark:text-amber-300',
  'Materiales': 'bg-emerald-100 text-emerald-700 ring-emerald-200/50 dark:bg-emerald-900/30 dark:text-emerald-300',
  'Alojamiento': 'bg-purple-100 text-purple-700 ring-purple-200/50 dark:bg-purple-900/30 dark:text-purple-300',
  'Transporte': 'bg-rose-100 text-rose-700 ring-rose-200/50 dark:bg-rose-900/30 dark:text-rose-300',
  'Otro': 'bg-zinc-100 text-zinc-600 ring-zinc-200/50 dark:bg-white/10 dark:text-zinc-400',
}

function parseCategoryFromDesc(desc: string): { cat: string; cleanDesc: string } {
  const match = desc.match(/^\[([^\]]+)\]\s*(.*)$/)
  if (match) return { cat: match[1], cleanDesc: match[2] }
  return { cat: 'Otro', cleanDesc: desc }
}

function formatTime(iso: string): string {
  // Manejar tanto ISO como HH:MM
  if (iso.includes('T')) {
    return new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: true })
  }
  return iso
}

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'short' })
}

// ── Toast Component ───────────────────────────────────────────────────────────
function Toast({ type, message, onClose }: { type: 'success' | 'error' | 'quota'; message: string; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 5000)
    return () => clearTimeout(t)
  }, [onClose])

  const color = type === 'success' ? 'pill-ok' : type === 'quota' ? 'pill-prep' : 'pill-cancel'
  return (
    <div className={`fixed top-20 right-6 z-[60] flex items-center gap-3 px-4 py-3 rounded-2xl backdrop-blur-xl border border-white/20 shadow-lg animate-in slide-in-from-right-4 ${color}`}>
      <span className="text-sm font-medium">{message}</span>
      <button onClick={onClose}><X className="size-4 opacity-50" /></button>
    </div>
  )
}

// ── CRUD Modal ───────────────────────────────────────────────────────────────
interface HitoModalProps {
  hito?: HitoCronogramaIA | null
  onClose: () => void
  onSave: (hito: HitoCronogramaIA) => void
}

function HitoModal({ hito, onClose, onSave }: HitoModalProps) {
  const [form, setForm] = useState<HitoCronogramaIA>(
    hito || { fecha: new Date().toISOString().split('T')[0], hora: '08:00', descripcion_item: '', cantidad: 1 }
  )

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-3xl backdrop-blur-2xl bg-background/80 border border-white/20 shadow-2xl p-6 animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-bold [color:var(--text-primary)]">
            {hito ? 'Editar Ítem' : 'Nuevo Ítem de Agenda'}
          </h3>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
            <X className="size-5 [color:var(--text-muted)]" />
          </button>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider [color:var(--text-muted)] mb-1.5">Fecha</label>
              <input type="date" value={form.fecha} onChange={e => setForm({...form, fecha: e.target.value})} className="glass-input w-full px-4 py-2.5 text-sm" />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider [color:var(--text-muted)] mb-1.5">Hora</label>
              <input type="time" value={form.hora} onChange={e => setForm({...form, hora: e.target.value})} className="glass-input w-full px-4 py-2.5 text-sm" />
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider [color:var(--text-muted)] mb-1.5">Descripción</label>
            <input type="text" placeholder="Ej: [Alimentación] Refrigerio AM" value={form.descripcion_item} onChange={e => setForm({...form, descripcion_item: e.target.value})} className="glass-input w-full px-4 py-2.5 text-sm" />
          </div>

          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider [color:var(--text-muted)] mb-1.5">Cantidad</label>
            <input type="number" min={1} value={form.cantidad} onChange={e => setForm({...form, cantidad: Number(e.target.value)})} className="glass-input w-full px-4 py-2.5 text-sm" />
          </div>

          <div className="pt-4 flex gap-3">
            <button onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold [color:var(--text-secondary)] hover:bg-white/5 transition-colors">
              Cancelar
            </button>
            <button 
              onClick={() => { if(form.descripcion_item) onSave(form) }}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-500/20 transition-all active:scale-95"
            >
              Guardar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}


// ── Types ─────────────────────────────────────────────────────────────────────
interface Props {
  actividadId: string
  initialEntregas: BitacoraEntregaRow[]
  fechaInicioDefault: string | null
  horaInicioDefault: string | null
  cronogramaIACache: HitoCronogramaIA[] | null
  isMockMode?: boolean
}

// ── Main Component ────────────────────────────────────────────────────────────
export function AgendaView({
  actividadId,
  initialEntregas,
  cronogramaIACache,
  isMockMode = false,
}: Props) {
  const router = useRouter()
  // El cronograma IA es la fuente de verdad para la estructura; initialEntregas para el estado (listo/pendiente)
  const [hitos, setHitos] = useState<HitoCronogramaIA[]>(cronogramaIACache || [])
  const [hitosBackup, setHitosBackup] = useState<HitoCronogramaIA[]>(cronogramaIACache || [])
  const [entregas, setEntregas] = useState<BitacoraEntregaRow[]>(initialEntregas)
  
  const [generating, startGenerate] = useTransition()
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'quota'; message: string } | null>(null)
  const [modal, setModal] = useState<{ open: boolean; hito: HitoCronogramaIA | null; index: number }>({ open: false, hito: null, index: -1 })

  // Agrupación por día
  const grouped = useMemo(() => {
    const days = new Map<string, HitoCronogramaIA[]>()
    hitos.sort((a,b) => `${a.fecha}T${a.hora}`.localeCompare(`${b.fecha}T${b.hora}`))
    hitos.forEach(h => {
      const list = days.get(h.fecha) || []
      list.push(h)
      days.set(h.fecha, list)
    })
    
    const sortedDates = Array.from(days.keys()).sort()
    const baseDate = sortedDates[0]
    
    return sortedDates.map((date, idx) => {
      const d1 = new Date(baseDate + 'T12:00:00')
      const dCurrent = new Date(date + 'T12:00:00')
      const dayNum = Math.round((dCurrent.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24)) + 1
      return { date, dayNum, items: days.get(date)! }
    })
  }, [hitos])

  // CRUD Handlers
  async function saveHitos(newHitos: HitoCronogramaIA[]) {
    setHitos(newHitos) // Optimistic update
    const res = await actualizarCronogramaIA(actividadId, newHitos)
    if (!res.ok) {
      setToast({ type: 'error', message: res.error || 'Error al guardar' })
      setHitos(hitosBackup) // Rollback al último estado guardado
    } else {
      setHitosBackup(newHitos) // Actualizar backup tras éxito
      setToast({ type: 'success', message: 'Cambios guardados correctamente' })
    }
  }

  function handleAddOrEdit(form: HitoCronogramaIA) {
    const newHitos = [...hitos]
    if (modal.index >= 0) {
      newHitos[modal.index] = form
    } else {
      newHitos.push(form)
    }
    saveHitos(newHitos)
    setModal({ open: false, hito: null, index: -1 })
  }

  function handleDelete(index: number) {
    if (!confirm('¿Eliminar este ítem del cronograma?')) return
    const newHitos = hitos.filter((_, i) => i !== index)
    saveHitos(newHitos)
  }

  function handleGenerateIA(forzar = false) {
    setToast(null)
    startGenerate(async () => {
      const res = await generarCronogramaIA(actividadId, forzar)
      if (res.ok) {
        setHitos(res.entregables)
        setToast({ type: 'success', message: res.fromCache ? 'Cronograma cargado desde caché.' : `${res.hitosGuardados} hitos generados correctamente.` })
        // Usar router.refresh() en lugar de window.location.reload() para evitar
        // que el Server Component re-monte sin estado y pierda los reembolsos en memoria.
        if (!res.fromCache) router.refresh()
      } else {
        setToast({ type: res.isQuota ? 'quota' : 'error', message: res.error })
      }
    })
  }

  return (
    <div className="space-y-6">
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}
      {modal.open && <HitoModal hito={modal.hito} onClose={() => setModal({open:false, hito:null, index:-1})} onSave={handleAddOrEdit} />}

      {/* Header */}
      <div className="flex items-center justify-between px-2">
        <div>
          <h2 className="text-lg font-black [color:var(--text-primary)] flex items-center gap-2">
            <Sparkles className="size-5 text-blue-500" />
            Agenda Operativa
          </h2>
          <p className="text-[10px] [color:var(--text-muted)] font-bold uppercase tracking-wider mt-0.5 flex items-center gap-2">
            Línea de tiempo inteligente · {hitos.length} hitos
            {isMockMode && (
              <span className="px-1.5 py-0.5 rounded-md bg-orange-500/20 text-orange-600 dark:text-orange-400 border border-orange-500/30 text-[9px] tracking-widest">
                MOCK MODE
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={() => setModal({ open: true, hito: null, index: -1 })}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold [background:var(--surface)] [color:var(--text-primary)] border [border-color:var(--surface-border)] hover:bg-white/10 transition-all active:scale-95"
          >
            <Plus className="size-3.5" />
            Añadir ítem
          </button>
          <button 
            onClick={() => handleGenerateIA(hitos.length > 0)}
            disabled={generating}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-500/20 disabled:opacity-50 transition-all active:scale-95"
          >
            {generating ? <RefreshCw className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
            {hitos.length > 0 ? 'Regenerar' : 'Generar IA'}
          </button>
        </div>
      </div>

      {/* Timeline */}
      <div className="space-y-10 relative pb-10">
        {hitos.length === 0 && (
          <div className="text-center py-20 glass-panel rounded-3xl border-dashed border-2">
            <CalendarDays className="size-10 mx-auto text-zinc-300 mb-4" />
            <p className="text-sm font-medium [color:var(--text-muted)]">No hay hitos programados</p>
            <button onClick={() => handleGenerateIA()} className="mt-4 text-xs font-bold text-blue-500 hover:underline">Generar con IA ahora</button>
          </div>
        )}

        {grouped.map((group) => (
          <div key={group.date} className="relative">
            {/* Encabezado del día */}
            <div className="sticky top-16 z-20 mb-6 -ml-2">
              <div className="inline-flex items-center gap-3 px-4 py-1.5 rounded-full backdrop-blur-2xl bg-white/10 dark:bg-white/5 border border-white/20 shadow-xl">
                <span className="size-5 rounded-full bg-blue-600 text-[10px] font-black text-white flex items-center justify-center">
                  {group.dayNum}
                </span>
                <span className="text-sm font-bold [color:var(--text-primary)] capitalize">
                  {formatDateLabel(group.date)}
                </span>
              </div>
            </div>

            {/* Línea vertical */}
            <div className="absolute left-3 top-8 bottom-0 w-[1px] bg-white/10 dark:bg-white/5 z-0" />

            <div className="space-y-4 ml-3 pl-8 relative z-10">
              {group.items.map((item) => {
                const globalIdx = hitos.indexOf(item)
                const { cat, cleanDesc } = parseCategoryFromDesc(item.descripcion_item)
                const CatIcon = CATEGORY_ICONS[cat] ?? Clock
                const catCls = CATEGORY_COLORS[cat] ?? CATEGORY_COLORS['Otro']
                
                return (
                  <div key={`${item.fecha}-${item.hora}-${globalIdx}`} className="group relative">
                    {/* Nodo de la línea */}
                    <div className="absolute -left-[37px] top-4 size-4 rounded-full border-2 border-background bg-zinc-200 dark:bg-zinc-800 shadow-[0_0_10px_rgba(255,255,255,0.1)] group-hover:scale-125 transition-transform" />

                    <div className="surface-card rounded-2xl p-4 flex items-center justify-between gap-4 group/card hover:shadow-lg transition-all border border-transparent hover:[border-color:var(--surface-border)]">
                      <div className="flex items-start gap-4">
                        <div className="w-14 text-right pt-1 shrink-0">
                          <span className="text-xs font-mono font-bold [color:var(--text-primary)]">
                            {formatTime(item.hora)}
                          </span>
                        </div>
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`px-2 py-0.5 rounded-md text-[9px] font-bold ring-1 flex items-center gap-1 ${catCls}`}>
                              <CatIcon className="size-2.5" />
                              {cat}
                            </span>
                            <span className="text-[10px] font-bold [color:var(--text-muted)]">
                              x{item.cantidad} unidades
                            </span>
                          </div>
                          <p className="text-sm font-medium [color:var(--text-primary)] leading-snug">
                            {cleanDesc}
                          </p>
                        </div>
                      </div>

                      {/* Controles CRUD (hover) */}
                      <div className="flex gap-1 opacity-0 group-hover/card:opacity-100 transition-opacity">
                        <button 
                          onClick={() => setModal({ open: true, hito: item, index: globalIdx })}
                          className="p-2 rounded-lg hover:bg-white/10 [color:var(--text-muted)] hover:[color:var(--text-primary)] transition-colors"
                        >
                          <Edit2 className="size-4" />
                        </button>
                        <button 
                          onClick={() => handleDelete(globalIdx)}
                          className="p-2 rounded-lg hover:bg-red-500/10 [color:var(--text-muted)] hover:text-red-500 transition-colors"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
