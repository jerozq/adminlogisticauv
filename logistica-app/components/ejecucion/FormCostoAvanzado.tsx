'use client'

import { useState, useTransition, useRef, useEffect } from 'react'
import {
  Plus,
  Trash2,
  Loader2,
  Camera,
  X,
  Package,
  DollarSign,
  AlertTriangle,
  ChevronRight,
  ChevronDown,
} from 'lucide-react'
import { agregarCosto, agregarCostoBatch } from '@/actions/ejecucion'
import { uploadEvidencia } from '@/lib/supabase-browser'
import type {
  EjecucionCostoConItem,
  ItemCotizado,
  ModoRegistroCosto,
  NuevoCostoForm,
  Pagador,
} from '@/types/ejecucion'
import type { NuevaParticipacion } from '@/src/types/domain'

// ============================================================
// Constantes de UI
// ============================================================

const fmt = (n: number) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(n)

// ============================================================
// Tipos internos del formulario
// ============================================================

interface FilaVariacion {
  id: number
  cantidad: string
  precioUnitario: string
  concepto: string
}

const filaNueva = (id: number): FilaVariacion => ({
  id,
  cantidad: '1',
  precioUnitario: '',
  concepto: '',
})

// ============================================================
// Props
// ============================================================

interface Props {
  actividadId:    string
  itemsCotizados: ItemCotizado[]
  costos:         EjecucionCostoConItem[]
  onAgregado:     (nuevos: EjecucionCostoConItem[]) => void
  onCancelar:     () => void
  socios?:        NuevaParticipacion[]
}

// ============================================================
// FormCostoAvanzado
// ============================================================

export function FormCostoAvanzado({
  actividadId,
  itemsCotizados,
  costos,
  onAgregado,
  onCancelar,
  socios,
}: Props) {
  // ── Opciones de origen de fondos (dinámicas) ────────────────
  const pagadorOpciones: { value: Pagador; label: string; desc: string }[] = [
    ...(socios ?? []).map((s) => ({
      value: s.socioId,
      label: `Fondo ${s.nombreSocio}`,
      desc:  'El socio cubrió este gasto',
    })),
    {
      value: 'pago_unidad',
      label: 'Pago de la Unidad',
      desc:  'Cubierto con fondos directos del proyecto/UV',
    },
  ]

  const [modo, setModo] = useState<ModoRegistroCosto>('por_item')

  // ── Filtrar ítems cuyo presupuesto ya fue cubierto ──────────
  const gastoAcumulado = costos.reduce<Record<string, number>>((acc, c) => {
    if (c.item_id) acc[c.item_id] = (acc[c.item_id] ?? 0) + c.monto
    return acc
  }, {})
  const itemsDisponibles = itemsCotizados.filter(
    (item) => (gastoAcumulado[item.id] ?? 0) < item.precio_total
  )

  // ── Campos comunes ──────────────────────────────────────────
  const [itemId,       setItemId]       = useState('')
  const [descripcion,  setDescripcion]  = useState('')
  const [pagador,      setPagador]      = useState<Pagador>(
    () => pagadorOpciones[0]?.value ?? 'pago_unidad'
  )
  const [soporteFile,  setSoporteFile]  = useState<File | null>(null)
  const [errorMsg,     setErrorMsg]     = useState<string | null>(null)

  // ── Modo Por Ítem: filas de variación ───────────────────────
  const [filas, setFilas] = useState<FilaVariacion[]>([filaNueva(0)])
  const [nextId, setNextId] = useState(1)

  // ── Modo Delegado: monto total único ────────────────────────
  const [montoTotal, setMontoTotal] = useState('')

  const [submitting, startSubmit] = useTransition()
  const [uploadingFile, setUploadingFile] = useState(false)
  const isLoading = submitting || uploadingFile

  // ── Helpers Por Ítem ─────────────────────────────────────────

  function actualizarFila(id: number, campo: keyof FilaVariacion, valor: string) {
    setFilas((prev) =>
      prev.map((f) => (f.id === id ? { ...f, [campo]: valor } : f))
    )
  }

  function agregarFila() {
    setFilas((prev) => [...prev, filaNueva(nextId)])
    setNextId((n) => n + 1)
  }

  function eliminarFila(id: number) {
    if (filas.length === 1) return
    setFilas((prev) => prev.filter((f) => f.id !== id))
  }

  // ── Totales Por Ítem ─────────────────────────────────────────

  const subtotalesPorFila = filas.map((f) => {
    const qty   = parseFloat(f.cantidad) || 0
    const price = parseFloat(f.precioUnitario) || 0
    return qty * price
  })
  const totalPorItem = subtotalesPorFila.reduce((a, b) => a + b, 0)

  // ── Validación ───────────────────────────────────────────────

  function puedeEnviar(): boolean {
    if (modo === 'delegado') {
      const monto = parseFloat(montoTotal)
      return monto > 0 && !!descripcion.trim()
    }
    // por_item: al menos una fila con cantidad y precio
    return filas.some((f) => {
      const qty   = parseFloat(f.cantidad) || 0
      const price = parseFloat(f.precioUnitario) || 0
      return qty > 0 && price > 0
    })
  }

  // ── Enviar ───────────────────────────────────────────────────

  function handleSubmit() {
    if (!puedeEnviar()) return
    setErrorMsg(null)

    startSubmit(async () => {
      let soporteUrl: string | undefined
      if (soporteFile) {
        setUploadingFile(true)
        try {
          soporteUrl = await uploadEvidencia(soporteFile, 'soportes')
        } catch {
          setErrorMsg('Error subiendo el soporte. Intenta de nuevo.')
          setUploadingFile(false)
          return
        } finally {
          setUploadingFile(false)
        }
      }

      try {
        const item = itemsCotizados.find((i) => i.id === itemId)
        const descBase = descripcion.trim() || item?.descripcion || 'Gasto'

        if (modo === 'delegado') {
          const form: NuevoCostoForm = {
            item_id:       itemId || null,
            descripcion:   descBase,
            monto:         parseFloat(montoTotal),
            pagador,
            soporte_url:   soporteUrl,
            modo_registro: 'delegado',
            cantidad:      1,
            precio_unitario: null,
            concepto:      null,
          }
          const nuevo = await agregarCosto(actividadId, form)
          onAgregado([{
            ...nuevo,
            cotizacion_items: item
              ? { descripcion: item.descripcion, precio_total: item.precio_total, categoria: item.categoria }
              : null,
          }])
        } else {
          // Por Ítem: una fila = un registro
          const filasValidas = filas.filter((f) => {
            const qty   = parseFloat(f.cantidad) || 0
            const price = parseFloat(f.precioUnitario) || 0
            return qty > 0 && price > 0
          })

          const forms: NuevoCostoForm[] = filasValidas.map((f) => {
            const qty   = parseFloat(f.cantidad)
            const price = parseFloat(f.precioUnitario)
            return {
              item_id:         itemId || null,
              descripcion:     descBase,
              monto:           qty * price,
              pagador,
              soporte_url:     soporteUrl,
              modo_registro:   'por_item',
              cantidad:        qty,
              precio_unitario: price,
              concepto:        f.concepto.trim() || null,
            }
          })

          const nuevos = await agregarCostoBatch(actividadId, forms)
          onAgregado(
            nuevos.map((n) => ({
              ...n,
              cotizacion_items: item
                ? { descripcion: item.descripcion, precio_total: item.precio_total, categoria: item.categoria }
                : null,
            }))
          )
        }
      } catch {
        setErrorMsg('Error al guardar el gasto. Intenta de nuevo.')
        return
      }
    })
  }

  // ── Render ───────────────────────────────────────────────────

  const pagadorActual = pagadorOpciones.find((p) => p.value === pagador) ?? pagadorOpciones[pagadorOpciones.length - 1]

  return (
    <div className="glass-panel rounded-3xl p-5 space-y-5 animate-in fade-in slide-in-from-top-2 duration-300">

      {/* ── Modo toggle ─────────────────────────────── */}
      <div>
        <p className="text-xs font-semibold tracking-wider uppercase text-white/40 mb-2">
          Tipo de registro
        </p>
        <div className="grid grid-cols-2 gap-2">
          <ModoBtn
            active={modo === 'por_item'}
            icon={<Package strokeWidth={1.5} className="size-4" />}
            label="Por Ítem"
            sublabel="Variaciones de precio"
            onClick={() => setModo('por_item')}
          />
          <ModoBtn
            active={modo === 'delegado'}
            icon={<DollarSign strokeWidth={1.5} className="size-4" />}
            label="Delegado"
            sublabel="Total único"
            onClick={() => {
              setModo('delegado')
              setItemId('')  // limpia la vinculación al cambiar de modo
            }}
          />
        </div>
      </div>

      {/* ── Ítem cotizado (sólo en modo Por Ítem) ──────────── */}
      {modo === 'por_item' && itemsCotizados.length > 0 && (
        <div>
          <label className="text-xs font-semibold text-white/40 mb-1.5 block">
            Ítem cotizado <span className="font-normal opacity-60">(opcional)</span>
          </label>
          <ItemSelect
            items={itemsDisponibles}
            value={itemId}
            onChange={(id, item) => {
              setItemId(id)
              if (item && !descripcion) setDescripcion(item.descripcion)
            }}
          />
        </div>
      )}

      {/* ── Descripción general ─────────────────────── */}
      <input
        type="text"
        placeholder={
          modo === 'delegado'
            ? 'Descripción del gasto (ej: Transporte vereda El Roble)'
            : 'Descripción del ítem (ej: Almuerzo de trabajo)'
        }
        value={descripcion}
        onChange={(e) => setDescripcion(e.target.value)}
        className="w-full px-4 py-3 text-sm bg-white/5 border border-white/15 rounded-xl
                   focus:outline-none focus:bg-white/10 focus:border-white/30 focus:ring-1 focus:ring-white/30
                   text-white placeholder:text-white/30 transition-all"
      />

      {/* ── Modo Por Ítem: filas de variación ───────── */}
      {modo === 'por_item' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold tracking-wider uppercase text-white/40">
              Variaciones de precio
            </p>
            {totalPorItem > 0 && (
              <span className="text-xs font-bold text-blue-600">
                Total: {fmt(totalPorItem)}
              </span>
            )}
          </div>

          {/* Cabecera de columnas */}
          <div className="grid grid-cols-[3fr_4fr_4fr_auto] gap-1.5 px-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-white/30">Cantidad</p>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-white/30">Precio unit.</p>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-white/30">Concepto</p>
            <div />
          </div>

          {filas.map((fila, idx) => {
            const subtotal = subtotalesPorFila[idx]
            return (
              <div key={fila.id} className="grid grid-cols-[3fr_4fr_4fr_auto] gap-1.5 items-center">
                <input
                  type="number"
                  placeholder="1"
                  value={fila.cantidad}
                  onChange={(e) => actualizarFila(fila.id, 'cantidad', e.target.value)}
                  min="1"
                  step="1"
                  className="px-3 py-2.5 text-sm bg-black/20 border border-white/10 rounded-xl
                             text-white placeholder:text-white/30 focus:outline-none focus:ring-1
                             focus:ring-slate-400 focus:border-slate-400 transition-all"
                />
                <div className="relative">
                  <input
                    type="number"
                    placeholder="0"
                    value={fila.precioUnitario}
                    onChange={(e) => actualizarFila(fila.id, 'precioUnitario', e.target.value)}
                    min="0"
                    step="500"
                    inputMode="numeric"
                    className="w-full px-3 py-2.5 text-sm bg-white/5 border border-white/15 rounded-xl
                               text-white placeholder:text-white/30 focus:outline-none focus:bg-white/10
                               focus:border-white/30 focus:ring-1 focus:ring-white/30 transition-all"
                  />
                  {subtotal > 0 && (
                    <span className="absolute -bottom-4 left-0 text-[10px] font-semibold text-zinc-400">
                      = {fmt(subtotal)}
                    </span>
                  )}
                </div>
                <input
                  type="text"
                  placeholder="ej: Ejecutivo"
                  value={fila.concepto}
                  onChange={(e) => actualizarFila(fila.id, 'concepto', e.target.value)}
                  className="px-3 py-2.5 text-sm bg-white/5 border border-white/15 rounded-xl
                             text-white placeholder:text-white/30 focus:outline-none focus:bg-white/10
                             focus:border-white/30 focus:ring-1 focus:ring-white/30 transition-all"
                />
                <button
                  onClick={() => eliminarFila(fila.id)}
                  disabled={filas.length === 1}
                  className="p-2 text-zinc-400 hover:text-red-500 disabled:opacity-30 transition-colors"
                >
                  <Trash2 strokeWidth={1.5} className="size-4" />
                </button>
              </div>
            )
          })}

          {/* Separador para acomodar los subtotales */}
          {filas.some((_, i) => subtotalesPorFila[i] > 0) && <div className="h-2" />}

          <button
            onClick={agregarFila}
            className="flex items-center gap-1.5 text-xs font-semibold text-blue-600
                       hover:text-blue-700 transition-colors"
          >
            <Plus strokeWidth={2} className="size-3.5" />
            Agregar variación
          </button>
        </div>
      )}

      {/* ── Modo Delegado: campo total único ────────── */}
      {modo === 'delegado' && (
        <div>
          <label className="text-xs font-semibold text-zinc-500 mb-1.5 block">
            Costo de Ejecución Total (COP)
          </label>
          <input
            type="number"
            placeholder="0"
            value={montoTotal}
            onChange={(e) => setMontoTotal(e.target.value)}
            className="w-full px-4 py-3 text-sm bg-white/5 border border-white/15 rounded-xl
                       focus:outline-none focus:bg-white/10 focus:border-white/30 focus:ring-1 focus:ring-white/30
                       text-white placeholder:text-white/30 transition-all"
            min="0"
            step="1000"
            inputMode="numeric"
          />
          {parseFloat(montoTotal) > 0 && (
            <p className="mt-1 text-xs font-bold text-zinc-500">
              {fmt(parseFloat(montoTotal))}
            </p>
          )}
        </div>
      )}

      {/* ── Origen de Fondos ────────────────────────── */}
      <div>
        <p className="text-xs font-semibold tracking-wider uppercase text-white/40 mb-2">
          ¿De dónde salió la plata?
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {pagadorOpciones.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => setPagador(p.value)}
              className={`flex flex-col gap-0.5 px-3 py-2.5 rounded-xl border text-left transition-all text-xs
                ${
                  pagador === p.value
                    ? 'bg-white/15 border-white/40 shadow-[0_0_15px_rgba(255,255,255,0.05)] text-white font-medium'
                    : 'bg-white/5 border-white/10 text-muted-foreground hover:bg-white/10'
                }`}
            >
              <span className="font-bold">{p.label}</span>
              <span className={`font-normal ${
                pagador === p.value ? 'text-white/70' : 'text-white/50'
              }`}>
                {p.desc}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Soporte / foto factura ───────────────────── */}
      <label
        className="flex items-center gap-2 py-3 px-3 text-sm bg-white/5 border border-white/15
                   rounded-xl cursor-pointer hover:bg-white/10 transition-all"
      >
        <Camera strokeWidth={1.5} className="size-4 text-white/50 shrink-0" />
        <span className="truncate text-xs text-white/60">
          {soporteFile ? soporteFile.name : 'Foto factura / soporte (opcional)'}
        </span>
        {soporteFile && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault()
              setSoporteFile(null)
            }}
            className="ml-auto shrink-0"
          >
            <X strokeWidth={1.5} className="size-4 text-white/40" />
          </button>
        )}
        <input
          type="file"
          accept="image/*,application/pdf"
          capture="environment"
          className="hidden"
          onChange={(e) => setSoporteFile(e.target.files?.[0] ?? null)}
        />
      </label>

      {/* ── Error ────────────────────────────────────── */}
      {errorMsg && (
        <div className="flex items-center gap-2 bg-red-50 text-red-700 text-sm px-4 py-3 rounded-xl ring-1 ring-red-200">
          <AlertTriangle strokeWidth={1.5} className="size-4 shrink-0" />
          <span className="text-xs">{errorMsg}</span>
          <button onClick={() => setErrorMsg(null)} className="ml-auto">
            <X strokeWidth={1.5} className="size-4" />
          </button>
        </div>
      )}

      {/* ── Resumen previo al envío ──────────────────── */}
      {puedeEnviar() && (
        <div className="flex items-center justify-between px-4 py-3 rounded-xl text-xs font-semibold
                         bg-white/10 border border-white/20 text-white">
          <span>
            {modo === 'por_item'
              ? `${filas.filter((_, i) => subtotalesPorFila[i] > 0).length} variación(es) · ${fmt(totalPorItem)}`
              : fmt(parseFloat(montoTotal) || 0)
            }
          </span>
          <span className="flex items-center gap-1">
            {pagadorActual.label}
            <ChevronRight strokeWidth={2} className="size-3" />
          </span>
        </div>
      )}

      {/* ── Acciones ────────────────────────────────── */}
      <div className="flex gap-2">
        <button
          onClick={handleSubmit}
          disabled={isLoading || !puedeEnviar()}
          className="flex-1 flex items-center justify-center gap-2 py-3 text-sm font-semibold
                     text-white bg-white/10 hover:bg-white/20 border border-white/20
                     shadow-lg backdrop-blur-md rounded-lg disabled:opacity-40 transition-all"
        >
          {isLoading && <Loader2 strokeWidth={1.5} className="size-4 animate-spin" />}
          {isLoading ? 'Guardando…' : 'Guardar gasto'}
        </button>
        <button
          onClick={onCancelar}
          className="px-4 py-3 text-sm text-white bg-white/5 hover:bg-white/10
                     border border-white/10 rounded-lg transition-colors"
        >
          Cancelar
        </button>
      </div>
    </div>
  )
}

// ============================================================
// Subcomponente: botón de modo de registro
// ============================================================

function ModoBtn({
  active,
  icon,
  label,
  sublabel,
  onClick,
}: {
  active: boolean
  icon: React.ReactNode
  label: string
  sublabel: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col gap-0.5 px-4 py-3 rounded-xl border text-left transition-all
        ${active
          ? 'bg-white/15 border-white/40 shadow-[0_0_15px_rgba(255,255,255,0.05)] text-white font-medium'
          : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10'
        }`}
    >
      <span className={`flex items-center gap-1.5 text-sm font-bold ${active ? 'text-white' : 'text-white/60'}`}>
        {icon}
        {label}
      </span>
      <span className={`text-[10px] font-medium ${active ? 'text-white/60' : 'text-white/30'}`}>
        {sublabel}
      </span>
    </button>
  )
}
// ============================================================
// Subcomponente: select personalizado con Liquid Glass
// ============================================================

function ItemSelect({
  items,
  value,
  onChange,
}: {
  items: ItemCotizado[]
  value: string
  onChange: (id: string, item: ItemCotizado | undefined) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const selected = items.find((i) => i.id === value)

  return (
    <div ref={ref} className="relative">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm
                   bg-black/20 border border-white/10 rounded-xl text-white
                   focus:outline-none focus:ring-1 focus:ring-slate-400 focus:border-slate-400
                   transition-all"
      >
        <span className={selected ? 'text-white' : 'text-white/30'}>
          {selected ? selected.descripcion : '— Sin vincular —'}
        </span>
        <ChevronDown
          strokeWidth={1.5}
          className={`size-4 text-white/40 transition-transform duration-200 ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>

      {/* Dropdown */}
      {open && (
        <div
          className="absolute z-50 mt-1 w-full
                     bg-slate-950/90 backdrop-blur-2xl border border-white/10
                     text-white shadow-2xl rounded-xl overflow-hidden"
        >
          <div className="py-1.5 px-1.5 max-h-56 overflow-y-auto space-y-0.5">
            {/* Opción vacía */}
            <button
              type="button"
              onClick={() => { onChange('', undefined); setOpen(false) }}
              className={`w-full text-left px-3 py-2 text-sm rounded-lg transition-colors cursor-pointer
                          hover:bg-white/10 ${
                            !value ? 'text-white/60' : 'text-white/40'
                          }`}
            >
              — Sin vincular —
            </button>

            {/* Ítems */}
            {items.length === 0 ? (
              <p className="px-3 py-3 text-sm text-white/30 text-center">
                Todos los ítems han sido registrados
              </p>
            ) : (
              items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => { onChange(item.id, item); setOpen(false) }}
                  className={`w-full text-left px-3 py-2.5 text-sm rounded-lg transition-colors cursor-pointer
                              hover:bg-white/10 ${
                                value === item.id ? 'bg-white/8 text-white font-medium' : 'text-white/70'
                              }`}
                >
                  <span className="block leading-snug">{item.descripcion}</span>
                  <span className="text-[11px] text-white/40 font-mono">
                    {item.cantidad} uds × {fmt(item.precio_unitario)} — Presupuesto: {fmt(item.precio_total)}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}