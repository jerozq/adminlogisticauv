'use client'

import { useState, useTransition } from 'react'
import { ChevronDown, ChevronUp, MapPin, Phone, Mail, Pencil, Check, X, Loader2 } from 'lucide-react'
import { guardarProfesional, type ProfesionalDirectorio } from '@/actions/profesionales'

const fmtFecha = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium' }).format(new Date(iso)) : '—'

function EditorEspecialidad({
  profesional,
  onClose,
  onSaved,
}: {
  profesional: ProfesionalDirectorio
  onClose: () => void
  onSaved: (especialidad: string, notas: string) => void
}) {
  const [especialidad, setEspecialidad] = useState(profesional.especialidad ?? '')
  const [notas, setNotas] = useState(profesional.notas ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saving, startSaving] = useTransition()

  const handleSave = () => {
    if (!profesional.cedula) return
    startSaving(async () => {
      const res = await guardarProfesional({
        cedula: profesional.cedula!,
        nombre: profesional.nombre,
        celular: profesional.celular,
        correo: profesional.correo,
        especialidad,
        notas,
      })
      if (res.ok) {
        onSaved(especialidad, notas)
        onClose()
      } else {
        setError(res.error ?? 'Error al guardar')
      }
    })
  }

  return (
    <div className="rounded-xl border [border-color:var(--surface-border)] [background:var(--surface)] p-3 space-y-2 mt-2">
      {!profesional.cedula && (
        <p className="text-xs [color:var(--state-cancel-fg)]">
          Esta persona no tiene cédula registrada en ninguna actividad, así que no se puede guardar una especialidad para ella todavía.
        </p>
      )}
      <input
        value={especialidad}
        onChange={(e) => setEspecialidad(e.target.value)}
        placeholder="Especialidad (ej. Psicólogo, Conductor, Logístico...)"
        disabled={!profesional.cedula}
        className="w-full glass-input px-3 py-1.5 text-sm disabled:opacity-50"
      />
      <textarea
        value={notas}
        onChange={(e) => setNotas(e.target.value)}
        placeholder="Notas..."
        rows={2}
        disabled={!profesional.cedula}
        className="w-full glass-input px-3 py-1.5 text-sm resize-none disabled:opacity-50"
      />
      {error && <p className="text-xs [color:var(--state-cancel-fg)]">{error}</p>}
      <div className="flex items-center gap-2">
        <button
          onClick={handleSave}
          disabled={saving || !profesional.cedula}
          className="flex items-center gap-1.5 rounded-lg btn-primary px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
        >
          {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
          Guardar
        </button>
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold [color:var(--text-secondary)] hover:[background:var(--surface-raised)]"
        >
          <X className="size-3.5" />
          Cancelar
        </button>
      </div>
    </div>
  )
}

function TarjetaProfesional({ profesional: inicial }: { profesional: ProfesionalDirectorio }) {
  const [profesional, setProfesional] = useState(inicial)
  const [expanded, setExpanded] = useState(false)
  const [editing, setEditing] = useState(false)

  return (
    <div className="rounded-2xl surface-card overflow-hidden">
      <div className="px-5 py-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-bold text-sm [color:var(--text-primary)]">{profesional.nombre}</h3>
            {profesional.especialidad && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-300 border border-blue-500/20">
                {profesional.especialidad}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1 text-xs [color:var(--text-secondary)] flex-wrap">
            {profesional.celular && (
              <span className="flex items-center gap-1"><Phone className="size-3" />{profesional.celular}</span>
            )}
            {profesional.correo && (
              <span className="flex items-center gap-1"><Mail className="size-3" />{profesional.correo}</span>
            )}
          </div>
          {profesional.zonas.length > 0 && (
            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
              <MapPin className="size-3 [color:var(--text-muted)]" />
              {profesional.zonas.map((z) => (
                <span key={z} className="text-[10px] px-1.5 py-0.5 rounded-full [background:var(--surface-raised)] [color:var(--text-muted)]">
                  {z}
                </span>
              ))}
            </div>
          )}
          {profesional.notas && (
            <p className="text-xs [color:var(--text-muted)] italic mt-1.5">{profesional.notas}</p>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <span className="text-xs font-bold [color:var(--text-primary)] whitespace-nowrap">
            {profesional.totalActividades} activ.
          </span>
          <button
            onClick={() => setEditing((v) => !v)}
            title="Editar especialidad/notas"
            className="p-1.5 rounded-lg [color:var(--text-muted)] hover:[color:var(--accent)] transition-colors"
          >
            <Pencil className="size-3.5" />
          </button>
          <button
            onClick={() => setExpanded((v) => !v)}
            className="p-1.5 rounded-lg [color:var(--text-muted)] hover:[color:var(--text-primary)] transition-colors"
          >
            {expanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
          </button>
        </div>
      </div>

      {editing && (
        <div className="px-5 pb-4">
          <EditorEspecialidad
            profesional={profesional}
            onClose={() => setEditing(false)}
            onSaved={(especialidad, notas) =>
              setProfesional((p) => ({ ...p, especialidad: especialidad || null, notas: notas || null }))
            }
          />
        </div>
      )}

      {expanded && (
        <div className="border-t [border-color:var(--surface-border)] [background:var(--surface)] px-5 py-3 space-y-2">
          {profesional.actividades.map((a) => (
            <div key={a.requerimientoId} className="flex items-center justify-between gap-3 text-xs">
              <div className="min-w-0">
                <p className="[color:var(--text-primary)] truncate">{a.nombreActividad}</p>
                <p className="[color:var(--text-muted)]">
                  {a.municipio ?? '—'}{a.departamento ? `, ${a.departamento}` : ''}
                </p>
              </div>
              <span className="shrink-0 [color:var(--text-muted)]">{fmtFecha(a.fechaInicio ?? a.createdAt)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function DirectorioProfesionales({ profesionales }: { profesionales: ProfesionalDirectorio[] }) {
  const [search, setSearch] = useState('')

  const filtrados = profesionales.filter((p) => {
    const q = search.trim().toLowerCase()
    if (!q) return true
    return (
      p.nombre.toLowerCase().includes(q) ||
      p.zonas.some((z) => z.toLowerCase().includes(q)) ||
      (p.especialidad ?? '').toLowerCase().includes(q)
    )
  })

  return (
    <div className="space-y-4">
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Buscar por nombre, zona o especialidad..."
        className="w-full glass-input px-4 py-2.5 text-sm"
      />

      {filtrados.length === 0 ? (
        <div className="text-center py-12 text-sm [color:var(--text-muted)]">
          No se encontraron profesionales{search ? ` para "${search}"` : ''}
        </div>
      ) : (
        <div className="space-y-3">
          {filtrados.map((p) => (
            <TarjetaProfesional key={p.clave} profesional={p} />
          ))}
        </div>
      )}
    </div>
  )
}
