'use client'

import { useEffect, useState, useTransition } from 'react'
import {
  Plus,
  Trash2,
  Search,
  AlertTriangle,
  CheckCircle2,
  Info,
} from 'lucide-react'
import { getSupabase } from '@/lib/supabase'
import type {
  CotizacionItemDraft,
  TarifarioSugerencia,
} from '@/types/cotizacion'

// ============================================================
// Formateador de moneda COP
// ============================================================
const cop = (n: number) =>
  n.toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })

// ============================================================
// Fila de un ítem editable
// ============================================================
function ItemRow({
  item,
  onUpdate,
  onDelete,
  locked,
}: {
  item: CotizacionItemDraft
  onUpdate: (updated: CotizacionItemDraft) => void
  onDelete: () => void
  locked: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  // Abrir picker automáticamente si hay opciones pendientes
  const [pickerOpen, setPickerOpen] = useState(() => item.opcionesTarifario.length > 0)
  const hasPendingOptions = item.opcionesTarifario.length > 0
  const total = item.cantidad * item.precioUnitario

  function applyOption(opt: TarifarioSugerencia) {
    onUpdate({
      ...item,
      tarifarioId: opt.id,
      codigoItem: opt.codigoItem,
      precioUnitario: opt.precioVenta,
      unidadMedida: opt.unidadMedida,
      fuente: 'tarifario' as const,
      opcionesTarifario: [],
    })
    setPickerOpen(false)
  }

  return (
    <div
      className={[
        'rounded-xl ring-1 transition-colors',
        item.esPassthrough
          ? 'bg-amber-50 ring-amber-200'
          : hasPendingOptions
          ? 'bg-orange-50 ring-orange-200'
          : 'bg-white ring-zinc-200',
      ].join(' ')}
    >
      {/* Fila principal */}
      <div className="flex items-center gap-2 px-3 py-3">
        {/* Descripción */}
        <div className="flex-1 min-w-0">
          {locked ? (
            <p className="truncate text-sm font-medium text-zinc-800">{item.descripcion}</p>
          ) : (
            <input
              value={item.descripcion}
              onChange={e => onUpdate({ ...item, descripcion: e.target.value })}
              className="w-full rounded-lg border-0 bg-transparent text-sm font-medium
                         text-zinc-800 outline-none focus:bg-zinc-50 focus:ring-1 focus:ring-blue-300 px-1 py-0.5"
              placeholder="Descripción del ítem"
            />
          )}

          {/* Badge: ya vinculado al tarifario */}
          {item.tarifarioId && !hasPendingOptions && (
            <span className="inline-flex items-center gap-1 mt-0.5 text-xs font-medium text-emerald-700">
              <CheckCircle2 className="size-3" />
              {item.codigoItem}
            </span>
          )}

          {/* Badge + toggle: opciones pendientes de elegir */}
          {hasPendingOptions && !locked && (
            <button
              onClick={() => setPickerOpen(v => !v)}
              className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-orange-700 hover:text-orange-900"
            >
              <AlertTriangle className="size-3" />
              {pickerOpen
                ? 'Ocultar opciones del tarifario'
                : `${item.opcionesTarifario.length} coincidencia${item.opcionesTarifario.length > 1 ? 's' : ''} — elegir`}
            </button>
          )}

          {item.esPassthrough && (
            <span className="mt-0.5 inline-flex items-center gap-1 text-xs font-medium text-amber-700">
              <AlertTriangle className="size-3" />
              Passthrough — sin margen
            </span>
          )}
        </div>

        {/* Cantidad */}
        <div className="w-14 shrink-0">
          {locked ? (
            <span className="block text-center text-sm text-zinc-700">{item.cantidad}</span>
          ) : (
            <input
              type="number"
              min="0"
              step="1"
              value={item.cantidad}
              onChange={e => onUpdate({ ...item, cantidad: parseFloat(e.target.value) || 0 })}
              className="w-full rounded-lg border border-zinc-200 bg-white px-2 py-1 text-center text-sm
                         outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
            />
          )}
        </div>

        {/* Precio unitario */}
        <div className="w-28 shrink-0">
          {locked ? (
            <span className="block text-right text-sm text-zinc-700">{cop(item.precioUnitario)}</span>
          ) : (
            <input
              type="number"
              min="0"
              step="1000"
              value={item.precioUnitario}
              onChange={e =>
                onUpdate({ ...item, precioUnitario: parseFloat(e.target.value) || 0 })
              }
              className="w-full rounded-lg border border-zinc-200 bg-white px-2 py-1 text-right text-sm
                         outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
            />
          )}
        </div>

        {/* Total */}
        <div className="w-28 shrink-0 text-right">
          <span className="text-sm font-semibold text-zinc-900">{cop(total)}</span>
        </div>

        {/* Acciones */}
        {!locked && (
          <div className="flex shrink-0 items-center gap-1">
            <button
              onClick={() => setExpanded(v => !v)}
              className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 transition-colors"
              title="Más opciones"
            >
              <Info className="size-4" />
            </button>
            <button
              onClick={onDelete}
              className="rounded-lg p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-500 transition-colors"
              title="Eliminar ítem"
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        )}
      </div>

      {/* ─── Panel selector de tarifario ─── */}
      {pickerOpen && hasPendingOptions && !locked && (
        <div className="border-t border-orange-200 px-3 py-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-orange-800">
            ¿A qué ítem del tarifario corresponde{' '}
            <span className="italic font-normal normal-case">&quot;{item.descripcion}&quot;</span>?
          </p>
          <div className="flex flex-col gap-1.5">
            {item.opcionesTarifario.map(opt => (
              <button
                key={opt.id}
                onClick={() => applyOption(opt)}
                className="flex items-start justify-between gap-3 rounded-lg bg-white px-3 py-2.5 text-left
                           ring-1 ring-zinc-200 hover:ring-emerald-400 hover:bg-emerald-50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="font-mono text-xs font-bold text-zinc-400">{opt.codigoItem}</span>
                    <span className="text-xs text-zinc-300">·</span>
                    <span className="text-xs text-zinc-500">{opt.unidadMedida}</span>
                    <span className="text-xs text-zinc-300">·</span>
                    <span className="text-xs text-zinc-400">{opt.categoria}</span>
                  </div>
                  <p className="text-sm text-zinc-800 leading-snug">
                    {opt.descripcion.split('.')[0]}
                  </p>
                </div>
                <div className="shrink-0 text-right pt-0.5">
                  <p className="text-sm font-bold text-emerald-700">{cop(opt.precioVenta)}</p>
                  <p className="text-xs text-zinc-400">× {item.cantidad} = {cop(opt.precioVenta * item.cantidad)}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Panel expandido: categoría, unidad, passthrough */}
      {expanded && !locked && (
        <div className="border-t border-zinc-100 px-3 py-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-zinc-400 uppercase font-medium">Categoría</label>
            <input
              value={item.categoria}
              onChange={e => onUpdate({ ...item, categoria: e.target.value })}
              className="rounded-lg border border-zinc-200 px-2 py-1 text-sm outline-none focus:border-blue-300"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-zinc-400 uppercase font-medium">Unidad</label>
            <input
              value={item.unidadMedida}
              onChange={e => onUpdate({ ...item, unidadMedida: e.target.value })}
              className="rounded-lg border border-zinc-200 px-2 py-1 text-sm outline-none focus:border-blue-300"
            />
          </div>
          <div className="flex items-end gap-2 col-span-2 sm:col-span-1">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={item.esPassthrough}
                onChange={e => onUpdate({ ...item, esPassthrough: e.target.checked })}
                className="size-4 rounded accent-amber-500"
              />
              <span className="text-zinc-700">Passthrough</span>
            </label>
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================================
// Tabla editable de ítems
// ============================================================
interface CotizacionPreviewProps {
  items: CotizacionItemDraft[]
  onItemsChange: (items: CotizacionItemDraft[]) => void
  locked: boolean
}

export function CotizacionPreview({
  items,
  onItemsChange,
  locked,
}: CotizacionPreviewProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<TarifarioSugerencia[]>([])
  const [isPending, startTransition] = useTransition()

  // Ítems con opciones de tarifario pendientes de vincular
  const itemsConSugerencia = items.filter(i => i.opcionesTarifario.length > 0)

  // Aplicar la primera (mejor) opción de cada ítem pendiente
  function aplicarTodasSugerencias() {
    onItemsChange(
      items.map(item =>
        item.opcionesTarifario.length > 0
          ? {
              ...item,
              tarifarioId: item.opcionesTarifario[0].id,
              codigoItem: item.opcionesTarifario[0].codigoItem,
              precioUnitario: item.opcionesTarifario[0].precioVenta,
              unidadMedida: item.opcionesTarifario[0].unidadMedida,
              fuente: 'tarifario' as const,
              opcionesTarifario: [],
            }
          : item
      )
    )
  }

  // Buscar en tarifario cuando cambia la query
  useEffect(() => {
    if (searchQuery.length < 3) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSearchResults([])
      return
    }
    startTransition(async () => {
      const { data } = await getSupabase()
        .from('tarifario_2026')
        .select('id, codigo_item, descripcion, precio_venta, unidad_medida, categoria')
        .ilike('descripcion', `%${searchQuery}%`)
        .limit(8)

      setSearchResults(
        (data ?? []).map(r => ({
          id: r.id,
          codigoItem: r.codigo_item,
          descripcion: r.descripcion,
          precioVenta: Number(r.precio_venta),
          unidadMedida: r.unidad_medida ?? 'und',
          categoria: r.categoria ?? '',
        }))
      )
    })
  }, [searchQuery])

  function addFromTarifario(sug: TarifarioSugerencia) {
    const newItem: CotizacionItemDraft = {
      id: crypto.randomUUID(),
      tarifarioId: sug.id,
      codigoItem: sug.codigoItem,
      descripcion: sug.descripcion,
      categoria: sug.categoria,
      unidadMedida: sug.unidadMedida,
      cantidad: 1,
      precioUnitario: sug.precioVenta,
      esPassthrough: false,
      excluirDeFinanzas: false,
      ocultarEnCotizacion: false,
      fuente: 'tarifario',
      opcionesTarifario: [],
    }
    onItemsChange([...items, newItem])
    setSearchQuery('')
    setSearchResults([])
  }

  function addManual() {
    const newItem: CotizacionItemDraft = {
      id: crypto.randomUUID(),
      tarifarioId: null,
      codigoItem: '',
      descripcion: 'Nuevo ítem',
      categoria: '',
      unidadMedida: 'und',
      cantidad: 1,
      precioUnitario: 0,
      esPassthrough: false,
      excluirDeFinanzas: false,
      ocultarEnCotizacion: false,
      fuente: 'manual',
      opcionesTarifario: [],
    }
    onItemsChange([...items, newItem])
  }

  function updateItem(id: string, updated: CotizacionItemDraft) {
    onItemsChange(items.map(i => (i.id === id ? updated : i)))
  }

  function deleteItem(id: string) {
    onItemsChange(items.filter(i => i.id !== id))
  }

  // Totales
  const subtotalServicios = items
    .filter(i => !i.esPassthrough)
    .reduce((s, i) => s + i.cantidad * i.precioUnitario, 0)

  const totalPassthrough = items
    .filter(i => i.esPassthrough)
    .reduce((s, i) => s + i.cantidad * i.precioUnitario, 0)

  const totalGeneral = subtotalServicios + totalPassthrough

  return (
    <div className="flex flex-col gap-6">
      {/* ─── Banner: sugerencias de precios pendientes ─── */}
      {!locked && itemsConSugerencia.length > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-xl bg-blue-50 px-4 py-3 ring-1 ring-blue-200">
          <div className="flex items-center gap-2 text-sm text-blue-800">
            <CheckCircle2 className="size-4 shrink-0 text-blue-500" />
            <span>
              <span className="font-semibold">{itemsConSugerencia.length} ítem{itemsConSugerencia.length > 1 ? 's' : ''}</span>
              {' '}con precio sugerido del tarifario. Revisa cada uno o aplícalos todos.
            </span>
          </div>
          <button
            onClick={aplicarTodasSugerencias}
            className="shrink-0 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white
                       hover:bg-blue-700 active:bg-blue-800 transition-colors"
          >
            Aplicar todos
          </button>
        </div>
      )}

      {/* ─── Sección ítems ─── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-zinc-700">
            Ítems de cotización ({items.length})
          </h3>
          {!locked && (
            <button
              onClick={addManual}
              className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold
                         text-white shadow-sm hover:bg-blue-700 active:bg-blue-800 transition-colors"
            >
              <Plus className="size-3.5" />
              Añadir manual
            </button>
          )}
        </div>

        {/* Encabezados de columna */}
        <div className="hidden sm:grid grid-cols-[1fr_56px_112px_112px_48px] gap-2 px-3 py-1 text-xs font-medium uppercase tracking-wide text-zinc-400 mb-1">
          <span>Descripción</span>
          <span className="text-center">Cant.</span>
          <span className="text-right">Precio unit.</span>
          <span className="text-right">Total</span>
          <span />
        </div>

        <div className="flex flex-col gap-2">
          {items.length === 0 ? (
            <p className="rounded-xl bg-zinc-50 px-4 py-8 text-center text-sm text-zinc-400 ring-1 ring-zinc-200">
              No hay ítems. Añade desde el tarifario o manualmente.
            </p>
          ) : (
            items.map(item => (
              <ItemRow
                key={item.id}
                item={item}
                onUpdate={u => updateItem(item.id, u)}
                onDelete={() => deleteItem(item.id)}
                locked={locked}
              />
            ))
          )}
        </div>
      </div>

      {/* ─── Buscador de tarifario ─── */}
      {!locked && (
        <div className="rounded-2xl bg-zinc-50 p-4 ring-1 ring-zinc-200">
          <label className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">
            <Search className="size-3.5" />
            Buscar en tarifario 2026
          </label>
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Ej: almuerzo, transporte, arreglo floral…"
            className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none
                       focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
          />
          {isPending && (
            <p className="mt-2 text-xs text-zinc-400">Buscando…</p>
          )}
          {searchResults.length > 0 && (
            <div className="mt-2 flex flex-col gap-1">
              {searchResults.map(r => (
                <button
                  key={r.id}
                  onClick={() => addFromTarifario(r)}
                  className="flex items-center justify-between rounded-lg bg-white px-3 py-2 text-left
                             text-sm ring-1 ring-zinc-200 hover:ring-blue-300 hover:bg-blue-50 transition-colors"
                >
                  <span className="flex-1 font-medium text-zinc-800 truncate">{r.descripcion}</span>
                  <span className="ml-2 shrink-0 text-xs text-zinc-500">
                    {r.codigoItem} · {cop(r.precioVenta)} / {r.unidadMedida}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── Totales ─── */}
      <div className="rounded-2xl bg-zinc-900 p-5 text-white">
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-400">
          Resumen financiero
        </p>
        <div className="flex flex-col gap-2">
          {subtotalServicios > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-zinc-300">Servicios con margen</span>
              <span className="font-semibold">{cop(subtotalServicios)}</span>
            </div>
          )}
          {totalPassthrough > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-zinc-300">Ítems passthrough</span>
              <span className="font-semibold text-amber-300">{cop(totalPassthrough)}</span>
            </div>
          )}
          <div className="mt-2 flex justify-between border-t border-zinc-700 pt-3">
            <span className="text-base font-bold">TOTAL GENERAL</span>
            <span className="text-base font-bold text-emerald-400">{cop(totalGeneral)}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
