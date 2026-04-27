'use client'

import { useState, useMemo, useTransition, useRef, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  Search,
  Plus,
  History,
  ChevronDown,
  ChevronUp,
  Check,
  X,
  Pencil,
  Package,
  Tag,
  Star,
  Trash2,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { CATEGORIAS_TARIFARIO } from '@/types/tarifario'
import type { TarifarioItem, TarifarioHistorial, CategoriaTarifario } from '@/types/tarifario'
import {
  actualizarPrecioTarifario,
  agregarItemPersonalizado,
  listarHistorialItem,
  desactivarItem,
} from '@/actions/tarifario'

const fmt = (n: number) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(n)

const fmtDate = (iso: string) =>
  new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(iso))

const CATEGORIA_COLOR: Record<string, string> = {
  'Alimentación': 'bg-orange-500/10 text-orange-700 dark:text-orange-300 border border-orange-500/20',
  'Logística':    'bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/20',
  'Transporte':   'bg-violet-500/10 text-violet-700 dark:text-violet-300 border border-violet-500/20',
  'Alojamiento':  'bg-teal-500/10 text-teal-700 dark:text-teal-300 border border-teal-500/20',
  'Personal':     'bg-pink-500/10 text-pink-700 dark:text-pink-300 border border-pink-500/20',
  'Otro':         'bg-zinc-500/10 text-zinc-600 dark:text-zinc-300 border border-zinc-500/20',
}

interface Props {
  items: TarifarioItem[]
  totalCount: number
  page: number
  pageSize: number
  initialSearch?: string
  initialCategoria?: string
}

type SortKey = 'codigo_item' | 'descripcion' | 'categoria' | 'precio_venta'
type SortDir = 'asc' | 'desc'

// ─────────────────────────────────────────────────────────────────────────────
// Sub-component: Historial Panel
// ─────────────────────────────────────────────────────────────────────────────
function HistorialPanel({ itemId, onClose }: { itemId: string; onClose: () => void }) {
  const [historial, setHistorial] = useState<TarifarioHistorial[] | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    listarHistorialItem(itemId)
      .then(setHistorial)
      .finally(() => setLoading(false))
  }, [itemId])

  return (
    <div className="border-t [border-color:var(--surface-border)] [background:var(--surface)] px-4 py-3">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-bold [color:var(--text-muted)] uppercase tracking-widest flex items-center gap-1.5">
          <History className="size-3.5" /> Historial de Precios
        </p>
        <button onClick={onClose} className="[color:var(--text-muted)] hover:[color:var(--text-primary)] transition-colors">
          <X className="size-3.5" />
        </button>
      </div>
      {loading ? (
        <p className="text-xs [color:var(--text-muted)]">Cargando...</p>
      ) : !historial || historial.length === 0 ? (
        <p className="text-xs [color:var(--text-muted)] italic">Sin cambios registrados</p>
      ) : (
        <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
          {historial.map((h) => (
            <div key={h.id} className="flex items-start gap-3 text-xs">
              <div className="flex-1">
                <span className="[color:var(--text-muted)]">{fmtDate(h.cambiado_en)}</span>
                <span className="mx-1.5 [color:var(--surface-border)]">·</span>
                <span className="font-medium [color:var(--text-secondary)]">{h.usuario}</span>
                {h.motivo && (
                  <span className="[color:var(--text-muted)]"> — {h.motivo}</span>
                )}
              </div>
              <div className="flex items-center gap-1.5 shrink-0 font-mono">
                <span className="line-through [color:var(--state-cancel-fg)]">{fmt(h.precio_anterior)}</span>
                <span className="[color:var(--text-muted)]">→</span>
                <span className="[color:var(--state-ok-fg)] font-bold">{fmt(h.precio_nuevo)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-component: Price Cell (inline edit)
// ─────────────────────────────────────────────────────────────────────────────
function PrecioCell({
  item,
  onUpdated,
}: {
  item: TarifarioItem
  onUpdated: (id: string, newPrecio: number) => void
}) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(String(item.precio_venta))
  const [saving, startSave] = useTransition()
  const [saved, setSaved] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleEdit = () => {
    setEditing(true)
    setValue(String(item.precio_venta))
    setTimeout(() => inputRef.current?.select(), 0)
  }

  const handleSave = () => {
    const parsed = parseFloat(value.replace(/[^0-9.]/g, ''))
    if (isNaN(parsed) || parsed <= 0 || parsed === item.precio_venta) {
      setEditing(false)
      setValue(String(item.precio_venta))
      return
    }
    startSave(async () => {
      const res = await actualizarPrecioTarifario(item.id, parsed)
      if (res.ok) {
        onUpdated(item.id, parsed)
        setSaved(true)
        setTimeout(() => setSaved(false), 1500)
      }
      setEditing(false)
    })
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSave()
    if (e.key === 'Escape') {
      setEditing(false)
      setValue(String(item.precio_venta))
    }
  }

  if (editing) {
    return (
      <div className="flex items-center justify-end gap-1">
        <input
          ref={inputRef}
          type="number"
          step="0.01"
          min="0"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={handleSave}
          onKeyDown={handleKeyDown}
          className="w-28 text-right text-sm font-bold font-mono px-2 py-1 rounded-lg glass-input ring-1 [ring-color:var(--input-ring)] border-0 outline-none"
          autoFocus
        />
        <button
          onClick={handleSave}
          disabled={saving}
          className="p-1 rounded-md pill-ok transition-colors"
        >
          <Check className="size-3.5" />
        </button>
        <button
          onClick={() => { setEditing(false); setValue(String(item.precio_venta)) }}
          className="p-1 rounded-md pill-hold transition-colors"
        >
          <X className="size-3.5" />
        </button>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-end gap-2 group/price">
      <span className={`text-sm font-bold font-mono text-right tabular-nums transition-colors ${
        saved ? '[color:var(--state-ok-fg)]' : '[color:var(--text-primary)]'
      }`}>
        {fmt(item.precio_venta)}
      </span>
      <button
        onClick={handleEdit}
        className="opacity-0 group-hover/price:opacity-100 p-0.5 rounded [color:var(--text-muted)] hover:[color:var(--accent)] transition-all"
        title="Editar precio"
      >
        <Pencil className="size-3" />
      </button>
      {saved && <Check className="size-3.5 [color:var(--state-ok-fg)]" />}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-component: Add Item Form
// ─────────────────────────────────────────────────────────────────────────────
function AddItemForm({ onAdded, onClose }: { onAdded: (item: TarifarioItem) => void; onClose: () => void }) {
  const [form, setForm] = useState({
    descripcion: '',
    categoria: 'Logística' as CategoriaTarifario,
    unidad_medida: 'Unidad',
    precio_venta: '',
    notas: '',
  })
  const [saving, startSave] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const precio = parseFloat(form.precio_venta)
    if (!form.descripcion.trim()) return setError('La descripción es requerida')
    if (isNaN(precio) || precio <= 0) return setError('Ingresa un precio válido mayor a 0')
    setError(null)
    startSave(async () => {
      const res = await agregarItemPersonalizado({
        descripcion: form.descripcion.trim(),
        categoria: form.categoria,
        unidad_medida: form.unidad_medida.trim() || 'Unidad',
        precio_venta: precio,
        notas: form.notas.trim() || undefined,
      })
      if (res.ok && res.item) {
        onAdded(res.item)
        onClose()
      } else {
        setError(res.error ?? 'Error al guardar')
      }
    })
  }

  return (
    <div className="surface-card rounded-3xl overflow-hidden mb-4">
      <div className="px-5 py-4 [background:var(--surface)] border-b [border-color:var(--surface-border)] flex items-center justify-between">
        <h3 className="text-sm font-bold [color:var(--text-primary)] flex items-center gap-2">
          <Plus className="size-4 text-blue-500" />
          Nuevo Elemento
        </h3>
        <button onClick={onClose} className="[color:var(--text-muted)] hover:[color:var(--text-primary)] transition-colors">
          <X className="size-4" />
        </button>
      </div>
      <form onSubmit={handleSubmit} className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Descripción */}
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium [color:var(--text-secondary)] mb-1">
            Descripción <span className="text-red-400">*</span>
          </label>
          <textarea
            rows={2}
            placeholder="Descripción detallada del ítem..."
            value={form.descripcion}
            onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
            className="glass-input w-full px-3 py-2 text-sm resize-none"
          />
        </div>

        {/* Categoría */}
        <div>
          <label className="block text-xs font-medium [color:var(--text-secondary)] mb-1">Categoría</label>
          <select
            value={form.categoria}
            onChange={(e) => setForm({ ...form, categoria: e.target.value as CategoriaTarifario })}
            className="glass-input w-full px-3 py-2 text-sm"
          >
            {CATEGORIAS_TARIFARIO.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        {/* Unidad de medida */}
        <div>
          <label className="block text-xs font-medium [color:var(--text-secondary)] mb-1">Unidad de medida</label>
          <input
            type="text"
            placeholder="Unidad, Día, Hora..."
            value={form.unidad_medida}
            onChange={(e) => setForm({ ...form, unidad_medida: e.target.value })}
            className="glass-input w-full px-3 py-2 text-sm"
          />
        </div>

        {/* Precio */}
        <div>
          <label className="block text-xs font-medium [color:var(--text-secondary)] mb-1">
            Precio de venta (COP) <span className="[color:var(--state-cancel-fg)]">*</span>
          </label>
          <input
            type="number"
            step="0.01"
            min="0"
            placeholder="0"
            value={form.precio_venta}
            onChange={(e) => setForm({ ...form, precio_venta: e.target.value })}
            className="glass-input w-full px-3 py-2 text-sm font-mono text-right"
          />
        </div>

        {/* Notas */}
        <div>
          <label className="block text-xs font-medium [color:var(--text-secondary)] mb-1">Notas (opcional)</label>
          <input
            type="text"
            placeholder="Observaciones..."
            value={form.notas}
            onChange={(e) => setForm({ ...form, notas: e.target.value })}
            className="glass-input w-full px-3 py-2 text-sm"
          />
        </div>

        {error && (
          <div className="sm:col-span-2 text-xs pill-cancel rounded-xl px-3 py-2">
            {error}
          </div>
        )}

        <div className="sm:col-span-2 flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="btn-secondary px-4 py-2 rounded-xl text-sm transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving}
            className="btn-primary px-5 py-2 rounded-xl text-sm font-semibold disabled:opacity-60 transition-colors"
          >
            {saving ? 'Guardando...' : 'Agregar Elemento'}
          </button>
        </div>
      </form>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component: TarifarioEditor
// ─────────────────────────────────────────────────────────────────────────────
export function TarifarioEditor({
  items: initialItems,
  totalCount,
  page,
  pageSize,
  initialSearch = '',
  initialCategoria = '',
}: Props) {
  const router = useRouter()
  const [items, setItems] = useState<TarifarioItem[]>(initialItems)
  const [search, setSearch] = useState(initialSearch)
  const [categoriaFilter, setCategoriaFilter] = useState<string>(initialCategoria || 'all')
  const [sortKey, setSortKey] = useState<SortKey>('categoria')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [expandedHistory, setExpandedHistory] = useState<string | null>(null)
  const searchTimeout = useRef<ReturnType<typeof setTimeout>>(undefined)

  const totalPages = Math.ceil(totalCount / pageSize)

  // ── URL builder ──
  const buildUrl = useCallback(
    (overrides: { page?: number; search?: string; categoria?: string }) => {
      const p = overrides.page ?? page
      const s = overrides.search !== undefined ? overrides.search : search
      const c = overrides.categoria !== undefined ? overrides.categoria : categoriaFilter
      const sp = new URLSearchParams()
      if (s) sp.set('search', s)
      if (c && c !== 'all') sp.set('categoria', c)
      if (p > 1) sp.set('page', String(p))
      return `/tarifario${sp.toString() ? '?' + sp.toString() : ''}`
    },
    [page, search, categoriaFilter]
  )

  // ── Search: debounced URL navigation ──
  const handleSearchChange = (value: string) => {
    setSearch(value)
    clearTimeout(searchTimeout.current)
    searchTimeout.current = setTimeout(() => {
      router.replace(buildUrl({ search: value, page: 1 }))
    }, 400)
  }

  // ── Category filter: immediate URL navigation ──
  const handleCategoriaChange = (value: string) => {
    setCategoriaFilter(value)
    router.replace(buildUrl({ categoria: value, page: 1 }))
  }
  const [showAddForm, setShowAddForm] = useState(false)
  const [, startDelete] = useTransition()

  // ── Sort handler (client-side, within current page) ──
  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir('asc') }
  }

  // ── Sort only (filtering is done server-side) ──
  const sorted = useMemo(() => {
    return [...items].sort((a, b) => {
      let va = a[sortKey]
      let vb = b[sortKey]
      if (typeof va === 'number' && typeof vb === 'number') {
        return sortDir === 'asc' ? va - vb : vb - va
      }
      va = String(va).toLowerCase()
      vb = String(vb).toLowerCase()
      return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va)
    })
  }, [items, sortKey, sortDir])

  const handlePriceUpdated = useCallback((id: string, newPrecio: number) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, precio_venta: newPrecio } : item))
    )
  }, [])

  const handleItemAdded = useCallback((item: TarifarioItem) => {
    setItems((prev) => [item, ...prev])
  }, [])

  const handleDelete = (item: TarifarioItem) => {
    startDelete(async () => {
      const res = await desactivarItem(item.id)
      if (res.ok) setItems((prev) => prev.filter((i) => i.id !== item.id))
    })
  }

  const SortIcon = ({ col }: { col: SortKey }) => (
    <ArrowUpDown
      className={`size-3 inline ml-1 transition-opacity ${sortKey === col ? 'opacity-100 text-blue-500' : 'opacity-30'}`}
    />
  )

  // ── Pagination page numbers ──
  function getPageNumbers(current: number, total: number): (number | '...')[] {
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
    const pages: (number | '...')[] = [1]
    if (current > 3) pages.push('...')
    for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) {
      pages.push(i)
    }
    if (current < total - 2) pages.push('...')
    pages.push(total)
    return pages
  }

  const pageNumbers = getPageNumbers(page, totalPages)
  const rangeFrom = (page - 1) * pageSize + 1
  const rangeTo = Math.min(page * pageSize, totalCount)

  return (
    <div className="space-y-4">
      {/* ── Toolbar ── */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        {/* Search */}
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-zinc-400" />
          <input
            type="text"
            placeholder="Buscar por nombre, código o unidad..."
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="glass-input w-full pl-9 pr-4 py-2.5 text-sm"
          />
          {search && (
            <button
              onClick={() => handleSearchChange('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>

        {/* Category filter */}
        <select
          value={categoriaFilter}
          onChange={(e) => handleCategoriaChange(e.target.value)}
          className="glass-input px-3 py-2.5 text-sm shrink-0"
        >
          <option value="all">Todas las categorías</option>
          {CATEGORIAS_TARIFARIO.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>

        {/* Add button */}
        <button
          onClick={() => setShowAddForm((v) => !v)}
          className="btn-primary flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors shrink-0"
        >
          <Plus className="size-4" />
          Nuevo Elemento
        </button>
      </div>

      {/* ── Add Form ── */}
      {showAddForm && (
        <AddItemForm onAdded={handleItemAdded} onClose={() => setShowAddForm(false)} />
      )}

      {/* ── Stats bar ── */}
      <div className="flex items-center gap-3 text-xs [color:var(--text-muted)]">
        <Package className="size-3.5" />
        <span>
          Mostrando{' '}
          <strong className="[color:var(--text-primary)]">{rangeFrom}–{rangeTo}</strong>
          {' '}de{' '}
          <strong className="[color:var(--text-primary)]">{totalCount}</strong>
          {' '}ítems
        </span>
        {search && (
          <span className="pill-prep px-2 py-0.5 rounded-full text-[10px] font-medium">
            &ldquo;{search}&rdquo;
          </span>
        )}
      </div>

      {/* ── Table ── */}
      <div className="rounded-3xl border border-white/20 bg-white/40 dark:bg-white/5 backdrop-blur-xl overflow-hidden">
        {/* Table header */}
        <div className="hidden sm:grid grid-cols-[100px_1fr_128px_96px_148px] gap-x-4 px-5 py-2 bg-black/5 dark:bg-white/5 border-b border-white/10 text-[11px] font-bold uppercase tracking-widest [color:var(--text-muted)]">
          <button onClick={() => handleSort('codigo_item')} className="text-left hover:[color:var(--text-primary)] transition-colors">
            Código <SortIcon col="codigo_item" />
          </button>
          <button onClick={() => handleSort('descripcion')} className="text-left hover:[color:var(--text-primary)] transition-colors">
            Descripción <SortIcon col="descripcion" />
          </button>
          <button onClick={() => handleSort('categoria')} className="text-left hover:[color:var(--text-primary)] transition-colors">
            Categoría <SortIcon col="categoria" />
          </button>
          <span className="text-left">Unidad</span>
          <button onClick={() => handleSort('precio_venta')} className="text-right hover:[color:var(--text-primary)] transition-colors">
            Precio <SortIcon col="precio_venta" />
          </button>
        </div>

        {/* Rows */}
        <div className="divide-y divide-white/5">
          {sorted.length === 0 ? (
            <div className="text-center py-12 text-sm [color:var(--text-muted)]">
              No se encontraron ítems{search ? ` para \u201C${search}\u201D` : ''}
            </div>
          ) : (
            sorted.map((item) => (
              <div key={item.id} className="group/row">
                {/* Main row — grid estricto: Código | Descripción | Categoría | Unidad | Precio+Acciones */}
                <div className="grid grid-cols-1 sm:grid-cols-[100px_1fr_128px_96px_148px] gap-x-4 gap-y-0.5 px-5 py-1.5 items-center hover:[background:var(--surface)] transition-colors duration-100">
                  {/* Código */}
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="font-mono text-xs font-semibold [color:var(--text-primary)] truncate">
                      {item.codigo_item}
                    </span>
                    {item.es_personalizado && (
                      <span title="Ítem personalizado" className="shrink-0">
                        <Star className="size-3 [color:var(--state-run-fg)] fill-current opacity-80" />
                      </span>
                    )}
                  </div>

                  {/* Descripción — truncada por defecto, completa en hover */}
                  <div className="min-w-0 overflow-hidden">
                    <p
                      className="text-sm [color:var(--text-primary)] leading-snug truncate group-hover/row:whitespace-normal group-hover/row:line-clamp-3 transition-all duration-150"
                      title={item.descripcion}
                    >
                      {item.descripcion}
                    </p>
                    {item.notas && (
                      <p className="text-[11px] [color:var(--text-muted)] truncate" title={item.notas}>{item.notas}</p>
                    )}
                    {/* Mobile-only */}
                    <div className="flex items-center gap-2 mt-0.5 sm:hidden">
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full backdrop-blur-sm ${CATEGORIA_COLOR[item.categoria] ?? CATEGORIA_COLOR['Otro']}`}>
                        {item.categoria}
                      </span>
                      <span className="text-[10px] [color:var(--text-muted)]">{item.unidad_medida}</span>
                    </div>
                  </div>

                  {/* Categoría (desktop) */}
                  <div className="hidden sm:flex items-center min-w-0">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full truncate max-w-full backdrop-blur-sm ${CATEGORIA_COLOR[item.categoria] ?? CATEGORIA_COLOR['Otro']}`}>
                      {item.categoria}
                    </span>
                  </div>

                  {/* Unidad (desktop) */}
                  <div className="hidden sm:flex items-center gap-1 min-w-0 [color:var(--text-muted)]">
                    <Tag className="size-3 shrink-0" />
                    <span className="text-xs truncate">{item.unidad_medida}</span>
                  </div>

                  {/* Precio (mono, derecha) + Acciones */}
                  <div className="flex items-center justify-end gap-1">
                    <PrecioCell item={item} onUpdated={handlePriceUpdated} />
                    <button
                      onClick={() =>
                        setExpandedHistory((prev) => (prev === item.id ? null : item.id))
                      }
                      className={`p-0.5 rounded transition-all duration-150 ${
                        expandedHistory === item.id
                          ? 'opacity-100 [color:var(--accent)]'
                          : 'opacity-0 group-hover/row:opacity-100 [color:var(--text-muted)] hover:[color:var(--accent)]'
                      }`}
                      title="Ver historial de precios"
                    >
                      <History className="size-3.5" />
                    </button>
                    {item.es_personalizado && (
                      <button
                        onClick={() => handleDelete(item)}
                        className="opacity-0 group-hover/row:opacity-100 p-0.5 rounded [color:var(--text-muted)] hover:[color:var(--state-cancel-fg)] transition-all duration-150"
                        title="Desactivar ítem"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Historial expandido */}
                {expandedHistory === item.id && (
                  <HistorialPanel
                    itemId={item.id}
                    onClose={() => setExpandedHistory(null)}
                  />
                )}
              </div>
            ))
          )}
        </div>

        {/* ── Pagination footer ── */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between gap-4 px-5 py-3 border-t border-white/10 bg-black/5 dark:bg-white/5">
            <span className="text-xs [color:var(--text-muted)] hidden sm:block">
              Página {page} de {totalPages}
            </span>
            <div className="flex items-center gap-1 mx-auto sm:mx-0">
              {/* Previous */}
              <button
                onClick={() => router.push(buildUrl({ page: page - 1 }))}
                disabled={page <= 1}
                className="flex items-center justify-center size-7 rounded-lg border border-white/20 bg-white/10 backdrop-blur-sm [color:var(--text-primary)] hover:bg-white/20 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                aria-label="Página anterior"
              >
                <ChevronLeft className="size-3.5" />
              </button>

              {/* Page numbers */}
              {pageNumbers.map((p, i) =>
                p === '...' ? (
                  <span key={`ellipsis-${i}`} className="px-1 text-xs [color:var(--text-muted)]">…</span>
                ) : (
                  <button
                    key={p}
                    onClick={() => router.push(buildUrl({ page: p as number }))}
                    className={`size-7 rounded-lg text-xs font-medium border transition-colors backdrop-blur-sm ${
                      p === page
                        ? 'bg-white/30 border-white/40 [color:var(--text-primary)] font-semibold'
                        : 'border-white/20 bg-white/10 [color:var(--text-muted)] hover:bg-white/20 hover:[color:var(--text-primary)]'
                    }`}
                  >
                    {p}
                  </button>
                )
              )}

              {/* Next */}
              <button
                onClick={() => router.push(buildUrl({ page: page + 1 }))}
                disabled={page >= totalPages}
                className="flex items-center justify-center size-7 rounded-lg border border-white/20 bg-white/10 backdrop-blur-sm [color:var(--text-primary)] hover:bg-white/20 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                aria-label="Página siguiente"
              >
                <ChevronRight className="size-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      <p className="text-[10px] [color:var(--text-muted)] text-center">
        Haz clic en el precio para editarlo · Los cambios quedan registrados en el historial
      </p>
    </div>
  )
}
