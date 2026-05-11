'use client'

import { useState, useTransition } from 'react'
import { MapPin, Calendar, Clock, User, Users, Pencil, Check, X } from 'lucide-react'
import { actualizarHorasActividad } from '@/actions/ejecucion'

interface Props {
  actividadId: string
  municipio: string | null
  departamento: string | null
  fechaInicio: string | null
  fechaFin: string | null
  horaInicio: string | null
  horaFin: string | null
  responsable: string | null
  numVictimas: number
  estadoLabel: string
  estadoCls: string
}

function fmtDate(d: string | null): string | null {
  if (!d) return null
  return new Date(d + 'T00:00').toLocaleDateString('es-CO', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function fmtTime(t: string | null): string | null {
  if (!t) return null
  if (t.includes('T')) {
    const parts = t.split('T')[1]?.substring(0, 5)
    return parts && /^\d{2}:\d{2}$/.test(parts) ? parts : null
  }
  if (/^\d{2}:\d{2}$/.test(t)) return t
  return null
}

export function MetaCardEjecucion({
  actividadId,
  municipio,
  departamento,
  fechaInicio,
  fechaFin,
  horaInicio,
  horaFin,
  responsable,
  numVictimas,
  estadoLabel,
  estadoCls,
}: Props) {
  const [editing, setEditing] = useState(false)
  const [inicio, setInicio] = useState(fmtTime(horaInicio) ?? '')
  const [fin, setFin] = useState(fmtTime(horaFin) ?? '')
  const [saved, setSaved] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleSave() {
    startTransition(async () => {
      const res = await actualizarHorasActividad(
        actividadId,
        inicio || null,
        fin || null
      )
      if (res.ok) {
        setSaved(true)
        setEditing(false)
        setTimeout(() => setSaved(false), 2000)
      }
    })
  }

  function handleCancel() {
    setInicio(fmtTime(horaInicio) ?? '')
    setFin(fmtTime(horaFin) ?? '')
    setEditing(false)
  }

  const fechaInicioFmt = fmtDate(fechaInicio)
  const fechaFinFmt = fmtDate(fechaFin)
  const showFechaFin = fechaFin && fechaFin !== fechaInicio

  return (
    <div className="surface-card rounded-2xl p-4 mb-4">
      {/* Fila superior: estado + ubicación + responsable */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mb-3">
        <span
          className={`inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-full ${estadoCls}`}
        >
          {estadoLabel}
        </span>

        {municipio && (
          <span className="flex items-center gap-1 text-xs [color:var(--text-secondary)]">
            <MapPin strokeWidth={1.5} className="size-3.5 [color:var(--text-muted)]" />
            {municipio}
            {departamento ? `, ${departamento}` : ''}
          </span>
        )}

        {responsable && (
          <span className="flex items-center gap-1 text-xs [color:var(--text-secondary)]">
            <User strokeWidth={1.5} className="size-3.5 [color:var(--text-muted)]" />
            {responsable}
          </span>
        )}

        {numVictimas > 0 && (
          <span className="flex items-center gap-1 text-xs [color:var(--text-muted)]">
            <Users strokeWidth={1.5} className="size-3.5" />
            {numVictimas} beneficiarios
          </span>
        )}
      </div>

      {/* Separador */}
      <div className="border-t border-[var(--surface-border)] mb-3" />

      {/* Bloque de fechas + horas */}
      <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
        {/* Fechas */}
        {fechaInicioFmt && (
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-bold uppercase tracking-wider [color:var(--text-muted)]">
              {showFechaFin ? 'Fechas' : 'Fecha'}
            </span>
            <div className="flex items-center gap-1.5 text-sm font-medium [color:var(--text-primary)]">
              <Calendar strokeWidth={1.5} className="size-3.5 [color:var(--text-muted)] shrink-0" />
              <span>
                {fechaInicioFmt}
                {showFechaFin && (
                  <>
                    <span className="mx-1.5 [color:var(--text-muted)]">→</span>
                    {fechaFinFmt}
                  </>
                )}
              </span>
            </div>
          </div>
        )}

        {/* Horas — siempre visible con edición inline */}
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider [color:var(--text-muted)]">
              Horario
            </span>
            {!editing && (
              <button
                onClick={() => setEditing(true)}
                className="p-0.5 rounded hover:bg-white/10 transition-colors"
                title="Editar horario"
              >
                <Pencil className="size-2.5 [color:var(--text-muted)]" />
              </button>
            )}
            {saved && (
              <span className="text-[10px] text-emerald-400 font-semibold">Guardado ✓</span>
            )}
          </div>

          {editing ? (
            /* — Modo edición — */
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] [color:var(--text-muted)]">Inicio</span>
                <input
                  type="time"
                  value={inicio}
                  onChange={(e) => setInicio(e.target.value)}
                  className="glass-input px-2 py-1 text-xs w-[110px]"
                />
              </div>
              <span className="[color:var(--text-muted)] text-sm">—</span>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] [color:var(--text-muted)]">Fin</span>
                <input
                  type="time"
                  value={fin}
                  onChange={(e) => setFin(e.target.value)}
                  className="glass-input px-2 py-1 text-xs w-[110px]"
                />
              </div>
              <div className="flex gap-1 ml-1">
                <button
                  onClick={handleSave}
                  disabled={isPending}
                  className="p-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 transition-colors disabled:opacity-50"
                  title="Guardar"
                >
                  <Check className="size-3" />
                </button>
                <button
                  onClick={handleCancel}
                  disabled={isPending}
                  className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 [color:var(--text-muted)] transition-colors"
                  title="Cancelar"
                >
                  <X className="size-3" />
                </button>
              </div>
            </div>
          ) : (
            /* — Modo lectura — */
            <div className="flex items-center gap-1.5 text-sm font-medium [color:var(--text-primary)]">
              <Clock strokeWidth={1.5} className="size-3.5 [color:var(--text-muted)] shrink-0" />
              {inicio || fin ? (
                <span>
                  {inicio || '—'}
                  {fin && (
                    <>
                      <span className="mx-1.5 [color:var(--text-muted)]">–</span>
                      {fin}
                    </>
                  )}
                </span>
              ) : (
                <span className="[color:var(--text-muted)] text-xs italic">Sin horario definido</span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
