'use client'

import { useState, useTransition } from 'react'
import {
  guardarParticipacionesActividad,
  actualizarAporteSocio,
} from '@/actions/ejecucion'
import type { NuevaParticipacion } from '@/src/types/domain'

// ============================================================
// GestionSocios
//
// Componente cliente que permite configurar la distribución de
// utilidades entre socios para una actividad.
//
// Reglas de negocio visibles al usuario:
//  - Los aportes (capital) se devuelven antes de repartir utilidades.
//  - La utilidad neta se distribuye según los porcentajes definidos.
//  - La suma de porcentajes DEBE ser exactamente 100 % para guardar.
// ============================================================

interface SocioLocal {
  socioId:       string
  nombreSocio:   string
  porcentaje:    number
  montoAportado: number
}

interface GestionSociosProps {
  actividadId:            string
  initialParticipaciones: SocioLocal[]
}

export default function GestionSocios({
  actividadId,
  initialParticipaciones,
}: GestionSociosProps) {
  const [socios, setSocios] = useState<SocioLocal[]>(
    initialParticipaciones.length > 0
      ? initialParticipaciones
      : [
          { socioId: 'jero',  nombreSocio: 'Jeronimo', porcentaje: 50, montoAportado: 0 },
          { socioId: 'luis', nombreSocio: 'Luis',    porcentaje: 50, montoAportado: 0 },
        ]
  )

  const [nuevoSocioId,     setNuevoSocioId]     = useState('')
  const [nuevoNombre,      setNuevoNombre]      = useState('')
  const [nuevoPorcentaje,  setNuevoPorcentaje]  = useState(0)
  const [nuevoMonto,       setNuevoMonto]       = useState(0)

  const [isPending, startTransition] = useTransition()
  const [error,    setError]    = useState<string | null>(null)
  const [success,  setSuccess]  = useState(false)

  const sumaPorcentajes = socios.reduce((acc, s) => acc + s.porcentaje, 0)
  const sumaOk          = Math.abs(sumaPorcentajes - 100) <= 0.01

  // ── Handlers ────────────────────────────────────────────────

  function actualizarCampo<K extends keyof SocioLocal>(
    idx: number,
    campo: K,
    valor: SocioLocal[K]
  ) {
    setSocios((prev) => prev.map((s, i) => (i === idx ? { ...s, [campo]: valor } : s)))
    setSuccess(false)
  }

  function eliminarSocio(idx: number) {
    setSocios((prev) => prev.filter((_, i) => i !== idx))
    setSuccess(false)
  }

  function agregarSocio() {
    if (!nuevoSocioId.trim() || !nuevoNombre.trim()) return
    if (socios.some((s) => s.socioId === nuevoSocioId.trim())) {
      setError('Ya existe un socio con ese ID.')
      return
    }
    setSocios((prev) => [
      ...prev,
      {
        socioId:       nuevoSocioId.trim(),
        nombreSocio:   nuevoNombre.trim(),
        porcentaje:    nuevoPorcentaje,
        montoAportado: nuevoMonto,
      },
    ])
    setNuevoSocioId('')
    setNuevoNombre('')
    setNuevoPorcentaje(0)
    setNuevoMonto(0)
    setError(null)
    setSuccess(false)
  }

  function guardar() {
    if (!sumaOk) return
    setError(null)
    setSuccess(false)

    startTransition(async () => {
      try {
        const payload: NuevaParticipacion[] = socios.map((s) => ({
          socioId:       s.socioId,
          nombreSocio:   s.nombreSocio,
          porcentaje:    s.porcentaje,
          montoAportado: s.montoAportado,
        }))
        await guardarParticipacionesActividad(actividadId, payload)
        setSuccess(true)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error al guardar participaciones.')
      }
    })
  }

  async function handleBlurMonto(socioId: string, nuevoMonto: number) {
    try {
      await actualizarAporteSocio(actividadId, socioId, nuevoMonto)
    } catch {
      // No bloquear la UI por actualización parcial de aporte
    }
  }

  // ── Indicador de suma ────────────────────────────────────────

  const sumaColor = sumaOk
    ? 'text-green-400'
    : sumaPorcentajes > 100
      ? 'text-red-400'
      : 'text-amber-400'

  // ── Render ───────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-slate-100">
          Distribución de socios
        </h3>
        <span className={`text-sm font-medium tabular-nums ${sumaColor}`}>
          Suma: {sumaPorcentajes.toFixed(2)} %{' '}
          {sumaOk ? '✓' : sumaPorcentajes > 100 ? '(excede 100 %)' : '(falta para llegar a 100 %)'}
        </span>
      </div>

      {/* Lista de socios configurados */}
      <div className="space-y-3">
        {socios.map((socio, idx) => (
          <div
            key={socio.socioId}
            className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-3 space-y-2"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-200">
                {socio.nombreSocio}
              </span>
              <button
                type="button"
                onClick={() => eliminarSocio(idx)}
                className="text-xs text-red-500 hover:text-red-700 disabled:opacity-40"
                disabled={isPending}
              >
                Eliminar
              </button>
            </div>

            {/* Porcentaje */}
            <div className="flex items-center gap-3">
              <label className="text-xs text-slate-400 w-24 shrink-0">% Participación</label>
              <input
                type="range"
                min={0}
                max={100}
                step={0.5}
                value={socio.porcentaje}
                onChange={(e) => actualizarCampo(idx, 'porcentaje', Number(e.target.value))}
                className="
                  flex-1 h-2 appearance-none rounded-full bg-white/10 outline-none
                  [&::-webkit-slider-runnable-track]:h-2
                  [&::-webkit-slider-runnable-track]:rounded-full
                  [&::-webkit-slider-runnable-track]:bg-white/10
                  [&::-webkit-slider-thumb]:appearance-none
                  [&::-webkit-slider-thumb]:h-4
                  [&::-webkit-slider-thumb]:w-4
                  [&::-webkit-slider-thumb]:rounded-full
                  [&::-webkit-slider-thumb]:bg-blue-200
                  [&::-webkit-slider-thumb]:border
                  [&::-webkit-slider-thumb]:border-white/80
                  [&::-webkit-slider-thumb]:shadow
                  [&::-webkit-slider-thumb]:-mt-1
                  [&::-moz-range-track]:h-2
                  [&::-moz-range-track]:rounded-full
                  [&::-moz-range-track]:bg-white/10
                  [&::-moz-range-thumb]:h-4
                  [&::-moz-range-thumb]:w-4
                  [&::-moz-range-thumb]:rounded-full
                  [&::-moz-range-thumb]:border
                  [&::-moz-range-thumb]:border-white/80
                  [&::-moz-range-thumb]:bg-blue-200
                "
              />
              <input
                type="number"
                min={0}
                max={100}
                step={0.5}
                value={socio.porcentaje}
                onChange={(e) => actualizarCampo(idx, 'porcentaje', Number(e.target.value))}
                className="w-20 rounded border border-white/20 px-2 py-1 text-sm text-right bg-black/20 text-slate-100"
              />
              <span className="text-xs text-gray-400">%</span>
            </div>

            {/* Aporte de capital */}
            <div className="flex items-center gap-3">
              <label className="text-xs text-slate-400 w-24 shrink-0">Aporte ($)</label>
              <input
                type="number"
                min={0}
                step={1000}
                value={socio.montoAportado}
                onChange={(e) => actualizarCampo(idx, 'montoAportado', Number(e.target.value))}
                onBlur={(e) => handleBlurMonto(socio.socioId, Number(e.target.value))}
                className="w-36 rounded border border-white/20 px-2 py-1 text-sm text-right bg-black/20 text-slate-100"
                placeholder="0"
              />
            </div>
          </div>
        ))}
      </div>

      {/* Formulario para agregar socio */}
      <details className="rounded-lg border border-dashed border-white/20 p-3">
        <summary className="cursor-pointer text-sm text-blue-400 select-none">
          Agregar socio
        </summary>
        <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
          <input
            type="text"
            placeholder="ID del socio (ej: ana)"
            value={nuevoSocioId}
            onChange={(e) => setNuevoSocioId(e.target.value)}
            className="col-span-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-400"
          />
          <input
            type="text"
            placeholder="Nombre del Socio (ej: Ana)"
            value={nuevoNombre}
            onChange={(e) => setNuevoNombre(e.target.value)}
            className="col-span-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-400"
          />
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              max={100}
              step={0.5}
              value={nuevoPorcentaje === 0 ? '' : nuevoPorcentaje}
              onChange={(e) => setNuevoPorcentaje(e.target.value === '' ? 0 : Number(e.target.value))}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-400"
              placeholder="% Participación"
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              step={1000}
              value={nuevoMonto === 0 ? '' : nuevoMonto}
              onChange={(e) => setNuevoMonto(e.target.value === '' ? 0 : Number(e.target.value))}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-400"
              placeholder="Aporte inicial ($)"
            />
          </div>
          <button
            type="button"
            onClick={agregarSocio}
            className="col-span-2 mt-1 rounded-lg bg-slate-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 transition-colors"
          >
            Agregar
          </button>
        </div>
      </details>

      {/* Mensajes de error / éxito */}
      {error && (
        <p className="text-sm text-red-400">{error}</p>
      )}
      {success && (
        <p className="text-sm text-green-600 dark:text-green-400">
          Participaciones guardadas correctamente.
        </p>
      )}

      {/* Botón guardar */}
      <button
        type="button"
        onClick={guardar}
        disabled={!sumaOk || isPending}
        className="w-full rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white
                   hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed
                   transition-colors"
      >
        {isPending ? 'Guardando…' : 'Guardar distribución'}
      </button>

      {!sumaOk && (
        <p className="text-xs text-center text-amber-600 dark:text-amber-400">
          Ajusta los porcentajes hasta que la suma sea exactamente 100 % antes de guardar.
        </p>
      )}
    </div>
  )
}
