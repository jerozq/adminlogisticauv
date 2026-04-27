'use client'

import { MapPin, Calendar, User, Phone, Mail, Users, Banknote } from 'lucide-react'
import type { RequerimientoEncabezado } from '@/types/cotizacion'

interface RequerimientoHeaderProps {
  encabezado: RequerimientoEncabezado
  onChange: (updated: RequerimientoEncabezado) => void
  readonly?: boolean
}

function Field({
  label,
  value,
  onChange,
  icon,
  type = 'text',
  readonly = false,
}: {
  label: string
  value: string | number
  onChange?: (v: string) => void
  icon?: React.ReactNode
  type?: string
  readonly?: boolean
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="flex items-center gap-1 text-xs font-medium text-zinc-500 uppercase tracking-wide">
        {icon}
        {label}
      </label>
      {readonly ? (
        <p className="rounded-lg bg-zinc-50 px-3 py-2 text-sm text-zinc-800 ring-1 ring-zinc-200 min-h-9">
          {value || <span className="text-zinc-400 italic">No especificado</span>}
        </p>
      ) : (
        <input
          type={type}
          value={value}
          onChange={e => onChange?.(e.target.value)}
          className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 outline-none
                     focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
        />
      )}
    </div>
  )
}

export function RequerimientoHeader({ encabezado, onChange, readonly }: RequerimientoHeaderProps) {
  const set = (key: keyof RequerimientoEncabezado) => (val: string) =>
    onChange({ ...encabezado, [key]: val })

  return (
    <div className="flex flex-col gap-6">
      {/* Número de requerimiento */}
      <div className="rounded-2xl bg-blue-50 p-4 ring-1 ring-blue-100">
        <p className="text-xs font-semibold uppercase tracking-widest text-blue-500 mb-1">
          Número de requerimiento
        </p>
        {readonly ? (
          <h2 className="text-base font-bold text-blue-900 leading-snug">
            {encabezado.numeroRequerimiento || <span className="text-blue-400 italic font-normal">Sin número</span>}
          </h2>
        ) : (
          <input
            value={encabezado.numeroRequerimiento}
            onChange={e => set('numeroRequerimiento')(e.target.value)}
            placeholder="Ej: 629PE"
            className="w-full bg-transparent text-base font-bold text-blue-900 outline-none border-b border-blue-300 pb-1 focus:border-blue-500 placeholder:font-normal placeholder:text-blue-400"
          />
        )}
        {encabezado.nombreActividad && (
          <p className="mt-1 text-xs text-blue-600">{encabezado.nombreActividad}</p>
        )}
      </div>

      {/* Ubicación y Fechas */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field
          label="Municipio"
          value={encabezado.municipio}
          onChange={set('municipio')}
          icon={<MapPin strokeWidth={1.5} className="size-3" />}
          readonly={readonly}
        />
        <Field
          label="Dir. Territorial"
          value={encabezado.direccionTerritorial}
          onChange={set('direccionTerritorial')}
          icon={<MapPin strokeWidth={1.5} className="size-3" />}
          readonly={readonly}
        />
        <Field
          label="Fecha inicio"
          value={encabezado.fechaInicio}
          onChange={set('fechaInicio')}
          icon={<Calendar strokeWidth={1.5} className="size-3" />}
          type="date"
          readonly={readonly}
        />
        <Field
          label="Fecha fin"
          value={encabezado.fechaFin}
          onChange={set('fechaFin')}
          icon={<Calendar strokeWidth={1.5} className="size-3" />}
          type="date"
          readonly={readonly}
        />
      </div>

      {/* Responsable */}
      <div>
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-400">
          Responsable de campo
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label="Nombre"
            value={encabezado.responsableNombre}
            onChange={set('responsableNombre')}
            icon={<User strokeWidth={1.5} className="size-3" />}
            readonly={readonly}
          />
          <Field
            label="Cédula"
            value={encabezado.responsableCedula}
            onChange={set('responsableCedula')}
            icon={<User strokeWidth={1.5} className="size-3" />}
            readonly={readonly}
          />
          <Field
            label="Celular"
            value={encabezado.responsableCelular}
            onChange={set('responsableCelular')}
            icon={<Phone strokeWidth={1.5} className="size-3" />}
            type="tel"
            readonly={readonly}
          />
          <Field
            label="Correo"
            value={encabezado.responsableCorreo}
            onChange={set('responsableCorreo')}
            icon={<Mail strokeWidth={1.5} className="size-3" />}
            type="email"
            readonly={readonly}
          />
        </div>
      </div>

      {/* Números operativos */}
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-xl bg-zinc-50 p-4 ring-1 ring-zinc-200 text-center">
          <Users strokeWidth={1.5} className="mx-auto mb-1 size-5 text-zinc-400" />
          <p className="text-2xl font-bold text-zinc-800">{encabezado.numVictimas}</p>
          <p className="text-xs text-zinc-500">Víctimas / participantes</p>
        </div>
        <div className="rounded-xl bg-emerald-50 p-4 ring-1 ring-emerald-200 text-center">
          <Banknote strokeWidth={1.5} className="mx-auto mb-1 size-5 text-emerald-500" />
          <p className="text-2xl font-bold text-emerald-800">
            {encabezado.montoReembolsoDeclarado > 0
              ? `$${encabezado.montoReembolsoDeclarado.toLocaleString('es-CO')}`
              : '—'}
          </p>
          <p className="text-xs text-emerald-600">Monto reembolso declarado</p>
        </div>
      </div>
    </div>
  )
}
