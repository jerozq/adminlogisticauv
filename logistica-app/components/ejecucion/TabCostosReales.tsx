'use client'

import { useState, useTransition } from 'react'
import {
  ReceiptText,
  Trash2,
  Loader2,
  Camera,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  X,
  Package,
  DollarSign,
} from 'lucide-react'
import { eliminarCosto } from '@/actions/ejecucion'
import { ResumenLiquidacion } from './ResumenLiquidacion'
import GestionSocios from './GestionSocios'
import { FormCostoAvanzado } from './FormCostoAvanzado'
import { ImageModal } from '@/components/ui/ImageModal'
import type { EjecucionCostoConItem, ItemCotizado, Pagador } from '@/types/ejecucion'
import type { NuevaParticipacion } from '@/src/types/domain'

const fmt = (n: number) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(n)

// ============================================================
// Configuración de pagadores / origen de fondos
// ============================================================

const PAGADORES_FIJOS: { value: string; label: string; color: string }[] = [
  { value: 'jero',          label: 'Fondo Jero',         color: 'pill-prep' },
  { value: 'socio',         label: 'Fondo Socio',        color: 'pill-hold' },
  { value: 'anticipo_uv',   label: 'Anticipo UV',        color: 'pill-ok'   },
  { value: 'caja_proyecto', label: 'Caja Proyecto',      color: 'pill-run'  },
  { value: 'pago_unidad',   label: 'Pago de la Unidad',  color: 'pill-ok'   },
]

// ============================================================
// Props
// ============================================================

interface Props {
  actividadId: string
  initialCostos: EjecucionCostoConItem[]
  itemsCotizados: ItemCotizado[]
  ingresoTotal: number
  participaciones?: NuevaParticipacion[]
}

// ============================================================
// TabCostosReales
// ============================================================

export function TabCostosReales({
  actividadId,
  initialCostos,
  itemsCotizados,
  ingresoTotal,
  participaciones,
}: Props) {
  const [costos, setCostos] = useState<EjecucionCostoConItem[]>(initialCostos)
  const [showForm, setShowForm]     = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [errorMsg, setErrorMsg]     = useState<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  // ----- Eliminar costo -----
  async function handleDelete(costoId: string) {
    setDeletingId(costoId)
    try {
      await eliminarCosto(costoId, actividadId)
      setCostos((prev) => prev.filter((c) => c.id !== costoId))
    } catch {
      setErrorMsg('Error al eliminar el gasto.')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="space-y-4">
      {/* Cabecera de sección: título + botón top-right */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-white/70 uppercase tracking-wider">Costos Reales</h3>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-2 px-5 py-2 rounded-full text-sm font-semibold text-white
                     bg-white/10 hover:bg-white/20 border border-white/15
                     backdrop-blur-md shadow-lg transition-all"
        >
          <ReceiptText strokeWidth={1.5} size={15} />
          Agregar costo
        </button>
      </div>

      {/* Error global */}
      {errorMsg && (
        <div className="flex items-center gap-2 pill-cancel text-sm px-4 py-3 rounded-xl">
          <AlertTriangle strokeWidth={1.5} className="size-4 shrink-0" />
          <span>{errorMsg}</span>
          <button onClick={() => setErrorMsg(null)} className="ml-auto">
            <X strokeWidth={1.5} className="size-4" />
          </button>
        </div>
      )}

      {/* Resumen de liquidación en tiempo real */}
      <ResumenLiquidacion
        costos={costos}
        ingresoTotal={ingresoTotal}
        itemsCotizados={itemsCotizados}
        participaciones={participaciones}
      />

      {/* Gestión de socios */}
      <div className="glass-panel rounded-3xl p-5">
        <GestionSocios
          actividadId={actividadId}
          initialParticipaciones={participaciones ?? []}
        />
      </div>

      {/* Formulario avanzado */}
      {showForm && (
        <FormCostoAvanzado
          actividadId={actividadId}
          itemsCotizados={itemsCotizados}
          costos={costos}
          socios={
            (participaciones ?? []).length > 0
              ? participaciones
              : [
                  { socioId: 'jero',  nombreSocio: 'Jeronimo', porcentaje: 50, montoAportado: 0 },
                  { socioId: 'luis',  nombreSocio: 'Luis',      porcentaje: 50, montoAportado: 0 },
                ]
          }
          onAgregado={(nuevos) => {
            setCostos((prev) => [...prev, ...nuevos])
            setShowForm(false)
          }}
          onCancelar={() => setShowForm(false)}
        />
      )}

      {/* Lista de costos */}
      {costos.length === 0 ? (
        <div className="flex flex-col items-center py-12 text-zinc-400">
          <Package strokeWidth={1.5} className="size-10 mb-3 opacity-40" />
          <p className="text-sm">Sin gastos registrados</p>
          <p className="text-xs mt-1">Registra lo que realmente costó cada ítem</p>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider px-1">
            Gastos registrados ({costos.length})
          </p>

          {costos.map((costo) => {
            const pagadorCfg = (() => {
              // Primero: buscar en socios activos de la actividad
              const socio = (participaciones ?? []).find((p) => p.socioId === costo.pagador)
              if (socio) return { label: `Fondo ${socio.nombreSocio}`, color: 'pill-prep' }
              // Luego: buscar en valores fijos (legado + pago_unidad)
              return PAGADORES_FIJOS.find((p) => p.value === costo.pagador) ?? { label: costo.pagador, color: 'pill-run' }
            })()
            const precioVenta  = costo.cotizacion_items?.precio_total ?? null
            const utilidad     = precioVenta !== null ? precioVenta - costo.monto : null
            const isDeleting   = deletingId === costo.id
            const esDelegado   = (costo.modo_registro ?? 'por_item') === 'delegado'
            const tieneDesglose =
              !esDelegado &&
              (costo.cantidad ?? 1) > 1 || (costo.precio_unitario ?? null) !== null

            return (
              <div
                key={costo.id}
                className="glass-panel rounded-3xl p-5 hover:-translate-y-0.5 transition-transform duration-200"
              >
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    {/* Nombre */}
                    <p className="text-sm font-semibold text-white/90 truncate">
                      {costo.concepto
                        ? `${costo.cotizacion_items?.descripcion ?? costo.descripcion ?? 'Gasto'} — ${costo.concepto}`
                        : costo.cotizacion_items?.descripcion ?? costo.descripcion ?? 'Gasto sin descripción'}
                    </p>

                    {/* Desglose cantidad × precio (Por Ítem) */}
                    {tieneDesglose && (
                      <p className="text-[11px] text-zinc-400 mt-0.5 font-medium">
                        {costo.cantidad ?? 1} × {fmt(costo.precio_unitario ?? 0)}
                      </p>
                    )}

                    {/* Tags */}
                    <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                      {/* Modo delegado badge */}
                      {esDelegado && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-md pill-run">
                          <DollarSign strokeWidth={2} className="size-2.5" />
                          Delegado
                        </span>
                      )}

                      {/* Por ítem badge */}
                      {!esDelegado && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-md pill-prep">
                          <Package strokeWidth={2} className="size-2.5" />
                          Por Ítem
                        </span>
                      )}

                      {/* Origen de fondos */}
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${pagadorCfg.color}`}>
                        {pagadorCfg.label}
                      </span>

                      {precioVenta !== null && (
                        <span className="text-xs text-zinc-400">
                          Cotizado: {fmt(precioVenta)}
                        </span>
                      )}
                    </div>

                    {/* Utilidad por ítem */}
                    {utilidad !== null && (
                      <div
                        className={`flex items-center gap-1 mt-1.5 text-xs font-bold ${
                          utilidad >= 0 ? '[color:var(--state-ok-fg)]' : '[color:var(--state-cancel-fg)]'
                        }`}
                      >
                        {utilidad >= 0 ? (
                          <TrendingUp strokeWidth={1.5} className="size-3.5" />
                        ) : (
                          <TrendingDown strokeWidth={1.5} className="size-3.5" />
                        )}
                        Utilidad ítem: {fmt(utilidad)}
                      </div>
                    )}

                    {/* Soporte (Evidencia) */}
                    {costo.soporte_url && (
                      <div className="mt-2">
                        <button
                          onClick={() => setPreviewUrl(costo.soporte_url!)}
                          className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-semibold
                                     btn-secondary rounded-lg transition-colors"
                        >
                          <Camera strokeWidth={1.5} className="size-3.5" />
                          Ver evidencia fotográfica
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Monto + delete */}
                  <div className="text-right shrink-0">
                    <p className="text-base font-extrabold text-white/90">{fmt(costo.monto)}</p>
                    <button
                      onClick={() => handleDelete(costo.id)}
                      disabled={isDeleting}
                      className="mt-1 p-1.5 text-white/30 hover:text-red-400 rounded-lg
                                 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                      title="Eliminar gasto"
                    >
                      {isDeleting ? (
                        <Loader2 strokeWidth={1.5} className="size-3.5 animate-spin" />
                      ) : (
                        <Trash2 strokeWidth={1.5} className="size-3.5" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal para ver la evidencia */}
      <ImageModal url={previewUrl} onClose={() => setPreviewUrl(null)} />
    </div>
  )
}
