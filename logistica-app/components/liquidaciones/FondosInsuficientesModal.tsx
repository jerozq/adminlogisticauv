'use client'

import { useState, useTransition } from 'react'
import { AlertTriangle, Loader2, X } from 'lucide-react'
import { inyectarCapital, transferirFondos } from '@/actions/liquidaciones'

interface Props {
  isOpen: boolean
  saldoActual: number
  montoRequerido: number
  deficit: number
  cuentaOrigen: any
  cuentaIdOrigen: string
  socios: any[]
  cuentas: any[]
  onClose: () => void
  onExito: (data?: { cuentaOrigenId?: string }) => void
}

const COP = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  minimumFractionDigits: 0,
})

export function FondosInsuficientesModal({
  isOpen,
  saldoActual,
  montoRequerido,
  deficit,
  cuentaOrigen,
  cuentaIdOrigen,
  socios,
  cuentas,
  onClose,
  onExito,
}: Props) {
  const [tab, setTab] = useState<'cambiar' | 'inyectar' | 'transferir'>('cambiar')
  const [isPending, startTransition] = useTransition()

  // Tab 1: Cambiar origen
  const [nuevaCuentaOrigen, setNuevaCuentaOrigen] = useState('')

  // Tab 2: Inyectar capital
  const [socioInyeccion, setSocioInyeccion] = useState('')
  const [montoInyeccion, setMontoInyeccion] = useState(String(deficit))

  // Tab 3: Transferir fondos
  const [cuentaOrigenTransf, setCuentaOrigenTransf] = useState('')
  const [montoTransf, setMontoTransf] = useState(String(deficit))

  const cuentasConFondos = cuentas.filter(
    (c: any) => Number(c.saldo_disponible ?? 0) >= deficit && c.id !== cuentaIdOrigen
  )

  const cuentasConFondosSinCruceProyecto = cuentasConFondos.filter((c: any) => {
    const destinoEsProyecto = cuentaOrigen?.tipo === 'PROYECTO'
    const origenEsProyecto = c?.tipo === 'PROYECTO'
    return !(destinoEsProyecto && origenEsProyecto)
  })

  const handleCambiarOrigen = () => {
    if (!nuevaCuentaOrigen) {
      alert('Selecciona una cuenta de origen')
      return
    }
    onExito({ cuentaOrigenId: nuevaCuentaOrigen })
  }

  const handleInyectar = () => {
    if (!socioInyeccion) {
      alert('Selecciona un socio')
      return
    }
    const monto = Number(montoInyeccion)
    if (monto <= 0 || monto < deficit) {
      alert(`Debes inyectar al menos ${COP.format(deficit)}`)
      return
    }

    startTransition(async () => {
      const result = await inyectarCapital(socioInyeccion, monto, `Inyección para cubrir costo`)
      if (result.ok) {
        const resultTransferencia = await transferirFondos(
          socioInyeccion,
          cuentaIdOrigen,
          deficit,
          'Transferencia automática para destrabar pago de costo'
        )

        if (!resultTransferencia.ok) {
          alert(`Capital inyectado, pero no se pudo transferir al proyecto: ${resultTransferencia.error}`)
          return
        }

        alert(`✓ Capital inyectado y transferido automáticamente al proyecto: ${COP.format(deficit)}`)
        onExito()
      } else {
        alert(`Error: ${result.error}`)
      }
    })
  }

  const handleTransferir = () => {
    if (!cuentaOrigenTransf) {
      alert('Selecciona una cuenta de origen')
      return
    }
    const monto = Number(montoTransf)
    if (monto <= 0 || monto < deficit) {
      alert(`Debes transferir al menos ${COP.format(deficit)}`)
      return
    }

    startTransition(async () => {
      const result = await transferirFondos(
        cuentaOrigenTransf,
        cuentaIdOrigen,
        monto,
        `Transferencia para cubrir costo`
      )
      if (result.ok) {
        alert(`✓ Transferencia completada: ${COP.format(monto)}`)
        onExito()
      } else {
        alert(`Error: ${result.error}`)
      }
    })
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-slate-900 rounded-xl border border-white/10 max-w-xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-white/10">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-400" />
            <h2 className="text-lg font-bold text-white">Fondos insuficientes</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-white/10 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        {/* Info */}
        <div className="p-6 bg-red-500/10 border-b border-white/10">
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <div className="text-slate-400">Saldo actual</div>
              <div className="text-lg font-bold text-slate-100">{COP.format(saldoActual)}</div>
            </div>
            <div>
              <div className="text-slate-400">Monto requerido</div>
              <div className="text-lg font-bold text-amber-400">{COP.format(montoRequerido)}</div>
            </div>
            <div>
              <div className="text-slate-400">Falta</div>
              <div className="text-lg font-bold text-red-400">{COP.format(deficit)}</div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-white/10">
          <button
            onClick={() => setTab('cambiar')}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
              tab === 'cambiar'
                ? 'text-indigo-400 border-b-2 border-indigo-400 bg-indigo-500/5'
                : 'text-slate-400 hover:text-slate-300'
            }`}
          >
            Cambiar origen
          </button>
          <button
            onClick={() => setTab('inyectar')}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
              tab === 'inyectar'
                ? 'text-emerald-400 border-b-2 border-emerald-400 bg-emerald-500/5'
                : 'text-slate-400 hover:text-slate-300'
            }`}
          >
            Inyectar capital
          </button>
          <button
            onClick={() => setTab('transferir')}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
              tab === 'transferir'
                ? 'text-sky-400 border-b-2 border-sky-400 bg-sky-500/5'
                : 'text-slate-400 hover:text-slate-300'
            }`}
          >
            Transferir fondos
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {tab === 'cambiar' && (
            <div className="space-y-4">
              <p className="text-sm text-slate-300">
                Selecciona otra cuenta que tenga fondos suficientes:
              </p>
              <select
                value={nuevaCuentaOrigen}
                onChange={(e) => setNuevaCuentaOrigen(e.target.value)}
                className="w-full px-3 py-2 bg-slate-800 border border-white/10 rounded-lg text-white focus:outline-none focus:border-indigo-500"
              >
                <option value="">-- Seleccionar cuenta --</option>
                {cuentasConFondosSinCruceProyecto.map((c: any) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre} — {COP.format(c.saldo_disponible ?? 0)}
                  </option>
                ))}
              </select>
              <button
                onClick={handleCambiarOrigen}
                disabled={!nuevaCuentaOrigen || isPending}
                className="w-full px-4 py-2 bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
              >
                Usar esta cuenta
              </button>
            </div>
          )}

          {tab === 'inyectar' && (
            <div className="space-y-4">
              <p className="text-sm text-slate-300">
                Un socio aporta capital que entra a su cuenta SOCIO:
              </p>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Socio que aporta</label>
                <select
                  value={socioInyeccion}
                  onChange={(e) => setSocioInyeccion(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800 border border-white/10 rounded-lg text-white focus:outline-none focus:border-emerald-500"
                >
                  <option value="">-- Seleccionar socio --</option>
                  {socios.map((s: any) => (
                    <option key={s.id} value={s.id}>
                      {s.nombre}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Monto a inyectar</label>
                <input
                  type="number"
                  value={montoInyeccion}
                  onChange={(e) => setMontoInyeccion(e.target.value)}
                  min={deficit}
                  className="w-full px-3 py-2 bg-slate-800 border border-white/10 rounded-lg text-white focus:outline-none focus:border-emerald-500"
                />
                <div className="text-xs text-slate-400 mt-1">Mínimo: {COP.format(deficit)}</div>
              </div>
              <button
                onClick={handleInyectar}
                disabled={!socioInyeccion || Number(montoInyeccion) < deficit || isPending}
                className="w-full px-4 py-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                Inyectar capital
              </button>
            </div>
          )}

          {tab === 'transferir' && (
            <div className="space-y-4">
              <p className="text-sm text-slate-300">
                Transfiere fondos desde otra cuenta hacia la cuenta de este costo:
              </p>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Cuenta de origen</label>
                <select
                  value={cuentaOrigenTransf}
                  onChange={(e) => setCuentaOrigenTransf(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800 border border-white/10 rounded-lg text-white focus:outline-none focus:border-sky-500"
                >
                  <option value="">-- Seleccionar cuenta --</option>
                  {cuentasConFondosSinCruceProyecto.map((c: any) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre} — {COP.format(c.saldo_disponible ?? 0)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Monto a transferir</label>
                <input
                  type="number"
                  value={montoTransf}
                  onChange={(e) => setMontoTransf(e.target.value)}
                  min={deficit}
                  className="w-full px-3 py-2 bg-slate-800 border border-white/10 rounded-lg text-white focus:outline-none focus:border-sky-500"
                />
                <div className="text-xs text-slate-400 mt-1">Mínimo: {COP.format(deficit)}</div>
              </div>
              <button
                onClick={handleTransferir}
                disabled={!cuentaOrigenTransf || Number(montoTransf) < deficit || isPending}
                className="w-full px-4 py-2 bg-sky-500 hover:bg-sky-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                Transferir fondos
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-white/10 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white font-medium rounded-lg transition-colors"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}
