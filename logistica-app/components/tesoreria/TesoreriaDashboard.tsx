'use client'

import { useState, useTransition, useMemo, useEffect } from 'react'
import {
  ArrowLeftRight,
  ArrowUpRight,
  ArrowDownLeft,
  TrendingUp,
  Vault,
  Wallet,
  AlertCircle,
  CheckCircle2,
  X,
  Loader2,
  Plus,
  Send,
  Upload,
  Filter,
  RefreshCw,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import {
  inyectarCapital,
  repartirUtilidadVariable,
  obtenerBaseRepartoProyecto,
  registrarRetiro,
  transferirEntreCuentas,
  crearCuentaProyecto,
  crearCuentaSocio,
  type CuentaVirtual,
  type MovimientoBancario,
  type ResumenDevolucionesUnidad,
  type TipoMovimiento,
  type UsuarioRegistrado,
} from '@/actions/tesoreria'

// ── Formatters ────────────────────────────────────────────────
const COP = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
})

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('es-CO', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

// ── Estilos por tipo de cuenta (paleta rotativa para socios) ─
const SOCIO_PALETTES = [
  { gradient: 'from-emerald-600 via-emerald-700 to-teal-800', glow: 'shadow-emerald-900/60', badge: 'bg-emerald-400/20 text-emerald-200 border-emerald-400/30', accent: 'text-emerald-200' },
  { gradient: 'from-amber-600 via-amber-700 to-orange-800',   glow: 'shadow-amber-900/60',   badge: 'bg-amber-400/20 text-amber-200 border-amber-400/30',     accent: 'text-amber-200'   },
  { gradient: 'from-sky-600 via-sky-700 to-cyan-800',         glow: 'shadow-sky-900/60',     badge: 'bg-sky-400/20 text-sky-200 border-sky-400/30',           accent: 'text-sky-200'     },
  { gradient: 'from-rose-600 via-rose-700 to-pink-800',       glow: 'shadow-rose-900/60',    badge: 'bg-rose-400/20 text-rose-200 border-rose-400/30',        accent: 'text-rose-200'    },
]

function getCuentaTheme(cuenta: CuentaVirtual, socioIndex = 0) {
  if (cuenta.tipo === 'GENERAL') return {
    gradient: 'from-slate-600 via-slate-700 to-zinc-800',
    glow:     'shadow-slate-900/60',
    badge:    'bg-slate-500/30 text-slate-200 border-slate-500/40',
    accent:   'text-slate-300',
    label:    'Caja General',
  }
  if (cuenta.tipo === 'PROYECTO') return {
    gradient: 'from-indigo-600 via-indigo-700 to-purple-800',
    glow:     'shadow-indigo-900/60',
    badge:    'bg-indigo-400/20 text-indigo-200 border-indigo-400/30',
    accent:   'text-indigo-200',
    label:    cuenta.numero_requerimiento ? `Proyecto ${cuenta.numero_requerimiento}` : 'Proyecto',
  }
  // SOCIO: usa el email/nombre como label, paleta rotativa por índice
  const palette = SOCIO_PALETTES[socioIndex % SOCIO_PALETTES.length]
  return {
    ...palette,
    label: cuenta.user_nombre || cuenta.user_email?.split('@')[0] || 'Socio',
  }
}

const TIPO_LABEL: Record<TipoMovimiento, string> = {
  TRANSFERENCIA: 'Transferencia',
  INYECCION:     'Inyección',
  PAGO_UNIDAD:   'Pago UV',
  REPARTO_50_50: 'Reparto 50/50',
  RETIRO:        'Retiro',
  GASTO:         'Gasto',
  DEVOLUCION:    'Devolución',
}
const TIPO_COLOR: Record<TipoMovimiento, string> = {
  TRANSFERENCIA: 'bg-blue-500/20 text-blue-300',
  INYECCION:     'bg-violet-500/20 text-violet-300',
  PAGO_UNIDAD:   'bg-cyan-500/20 text-cyan-300',
  REPARTO_50_50: 'bg-emerald-500/20 text-emerald-300',
  RETIRO:        'bg-red-500/20 text-red-300',
  GASTO:         'bg-orange-500/20 text-orange-300',
  DEVOLUCION:    'bg-amber-500/20 text-amber-300',
}

// ── Credit Card ───────────────────────────────────────────────
function CuentaCard({
  cuenta,
  socioIndex = 0,
  onRetiro,
}: {
  cuenta: CuentaVirtual
  socioIndex?: number
  onRetiro?: (c: CuentaVirtual) => void
}) {
  const theme = getCuentaTheme(cuenta, socioIndex)
  const tail = cuenta.id.replace(/-/g, '').slice(-8).toUpperCase()
  // Para socios mostramos el email completo en el subtítulo de la tarjeta
  const subtitulo = cuenta.tipo === 'SOCIO' ? cuenta.user_email : cuenta.nombre_actividad

  return (
    <div
      className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${theme.gradient}
        border border-white/10 shadow-xl ${theme.glow} p-5 flex flex-col gap-3`}
      style={{ minHeight: 168 }}
    >
      <div className="absolute -right-6 -top-6 w-28 h-28 rounded-full bg-white/5 pointer-events-none" />
      <div className="absolute -right-2 bottom-0 w-16 h-16 rounded-full bg-white/4 pointer-events-none" />

      {/* Header */}
      <div className="flex items-start justify-between relative z-10">
        <div>
          <p className="text-[9px] font-black uppercase tracking-widest text-white/40 mb-0.5">{theme.label}</p>
          <p className="text-sm font-bold text-white/90 leading-tight">{cuenta.nombre}</p>
          {subtitulo && (
            <p className="text-[10px] text-white/40 mt-0.5 truncate max-w-[160px]">{subtitulo}</p>
          )}
        </div>
        <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border ${theme.badge}`}>
          {cuenta.tipo}
        </span>
      </div>

      {/* Balance */}
      <div className="relative z-10 flex-1">
        <p className="text-[9px] text-white/35 uppercase tracking-widest mb-0.5">Saldo Disponible</p>
        <p className="text-xl font-black text-white tabular-nums leading-none">
          {COP.format(cuenta.saldo)}
        </p>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between relative z-10">
        <p className="font-mono text-[9px] text-white/25 tracking-widest">
          ···· {tail.slice(0, 4)} {tail.slice(4)}
        </p>
        {onRetiro && cuenta.tipo === 'SOCIO' && cuenta.saldo > 0 && (
          <button
            onClick={() => onRetiro(cuenta)}
            className={`text-[10px] font-semibold px-2.5 py-1 rounded-lg bg-white/10
              hover:bg-white/20 ${theme.accent} transition-all`}
          >
            Retirar
          </button>
        )}
      </div>
    </div>
  )
}

// ── INPUT CLASS ───────────────────────────────────────────────
const INP = 'w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500 placeholder:text-slate-500'
const SEL = 'w-full bg-slate-900 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500'

// ── Modal base ────────────────────────────────────────────────
function Modal({ title, icon, onClose, children }: {
  title: string; icon: React.ReactNode; onClose: () => void; children: React.ReactNode
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-slate-900 border border-white/10 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            {icon}{title}
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X className="size-4" />
          </button>
        </div>
        <div className="px-5 py-4 space-y-4 max-h-[75vh] overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  )
}

function ErrorMsg({ msg }: { msg: string }) {
  return (
    <div className="flex items-start gap-2 text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
      <AlertCircle className="size-3.5 shrink-0 mt-0.5" />
      <span>{msg}</span>
    </div>
  )
}

// ── Modal: Inyectar Capital ───────────────────────────────────
function ModalInyectar({
  cuentas,
  onClose,
  onOk,
}: { cuentas: CuentaVirtual[]; onClose: () => void; onOk: () => void }) {
  const proyectos = cuentas.filter((c) => c.tipo === 'PROYECTO')
  const socios    = cuentas.filter((c) => c.tipo === 'SOCIO')
  const [socioId, setSocioId]   = useState(socios[0]?.id ?? '')
  const [proyId, setProyId]     = useState('')
  const [monto, setMonto]       = useState('')
  const [desc, setDesc]         = useState('')
  const [soporte, setSoporte]   = useState('')
  const [err, setErr]           = useState<string | null>(null)
  const [isPending, start]      = useTransition()

  function submit() {
    if (!socioId) { setErr('No hay socios registrados. Crea una cuenta de socio primero.'); return }
    if (Number(monto) <= 0) { setErr('El monto debe ser mayor a cero.'); return }
    setErr(null)
    start(async () => {
      try {
        await inyectarCapital({
          cuentaSocioId:    socioId,
          cuentaProyectoId: proyId || undefined,
          monto:            Number(monto),
          descripcion:      desc || undefined,
          soporteUrl:       soporte || undefined,
        })
        onOk()
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Error al inyectar capital.')
      }
    })
  }

  return (
    <Modal title="Inyectar Capital" icon={<ArrowUpRight className="size-4 text-violet-400" />} onClose={onClose}>
      <p className="text-xs text-slate-400 leading-relaxed">
        Registra un aporte de dinero de un socio. El monto queda en la cuenta del socio.
        Si lo deseas, puedes transferirlo de inmediato a un proyecto (opcional).
      </p>
      <label className="block">
        <span className="text-xs text-slate-400 mb-1 block">Socio que inyecta</span>
        <select value={socioId} onChange={(e) => setSocioId(e.target.value)} className={SEL}>
          {socios.length === 0 && <option value="">Sin socios — crea una cuenta primero</option>}
          {socios.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nombre}{s.user_email ? ` (${s.user_email})` : ''}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="text-xs text-slate-400 mb-1 block">Transferir también a proyecto <span className="text-slate-500">(opcional)</span></span>
        <select value={proyId} onChange={(e) => setProyId(e.target.value)} className={SEL}>
          <option value="">— No transferir, solo inyectar al socio —</option>
          {proyectos.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre} {p.numero_requerimiento ? `(${p.numero_requerimiento})` : ''}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="text-xs text-slate-400 mb-1 block">Monto (COP)</span>
        <input type="number" min={1} value={monto} onChange={(e) => setMonto(e.target.value)}
          placeholder="0" className={INP} />
      </label>
      <label className="block">
        <span className="text-xs text-slate-400 mb-1 block">Descripción (opcional)</span>
        <input type="text" value={desc} onChange={(e) => setDesc(e.target.value)}
          placeholder="Ej. Compra de materiales campo" className={INP} />
      </label>
      <label className="block">
        <span className="text-xs text-slate-400 mb-1 block">URL Soporte transferencia (opcional)</span>
        <input type="url" value={soporte} onChange={(e) => setSoporte(e.target.value)}
          placeholder="https://..." className={INP} />
      </label>
      {err && <ErrorMsg msg={err} />}
      <button onClick={submit} disabled={isPending}
        className="w-full flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white font-semibold py-2 rounded-xl transition-colors text-sm">
        {isPending ? <Loader2 className="size-4 animate-spin" /> : <ArrowUpRight className="size-4" />}
        {isPending ? 'Registrando…' : 'Confirmar Inyección'}
      </button>
    </Modal>
  )
}

// ── Modal: Repartir Utilidades ────────────────────────────────
function ModalRepartir({
  cuentas,
  onClose,
  onOk,
}: { cuentas: CuentaVirtual[]; onClose: () => void; onOk: () => void }) {
  const proyectos = cuentas.filter((c) => c.tipo === 'PROYECTO')
  const socios    = cuentas.filter((c) => c.tipo === 'SOCIO')
  const [proyId, setProyId] = useState(proyectos[0]?.id ?? '')
  const [modo, setModo] = useState<'PORCENTAJE' | 'MONTO'>('PORCENTAJE')
  const [porcentajeA, setPorcentajeA] = useState(50)
  const [montoAInput, setMontoAInput] = useState('0')
  const [desc, setDesc] = useState('')
  const [base, setBase] = useState({ saldoDisponible: 0, devolucionesPendientes: 0, utilidadNeta: 0 })
  const [cargandoBase, setCargandoBase] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [isPending, start] = useTransition()

  const socioA = socios[0]
  const socioB = socios[1]

  useEffect(() => {
    if (!proyId) return
    setCargandoBase(true)
    setErr(null)
    ;(async () => {
      try {
        const data = await obtenerBaseRepartoProyecto(proyId)
        setBase(data)
        setPorcentajeA(50)
        const mitad = (Math.round(data.utilidadNeta * 100) / 100) / 2
        setMontoAInput(String(Math.round(mitad * 100) / 100))
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'No se pudo cargar la base de reparto.')
      } finally {
        setCargandoBase(false)
      }
    })()
  }, [proyId])

  function clamp(v: number, min: number, max: number) {
    return Math.max(min, Math.min(max, v))
  }

  const utilidadCentavos = Math.round(base.utilidadNeta * 100)

  const distribucionPorPorcentaje = useMemo(() => {
    const pA = clamp(Number(porcentajeA || 0), 0, 100)
    const pB = 100 - pA
    const montoBCent = Math.round(utilidadCentavos * (pB / 100))
    // Regla de negocio: el ajuste/sobrante va al Socio 1
    const montoACent = utilidadCentavos - montoBCent
    return {
      porcentajeA: pA,
      porcentajeB: pB,
      montoA: montoACent / 100,
      montoB: montoBCent / 100,
    }
  }, [porcentajeA, utilidadCentavos])

  const distribucionPorMonto = useMemo(() => {
    const mA = clamp(Number(montoAInput || 0), 0, base.utilidadNeta)
    const mACent = Math.round(mA * 100)
    const mBCent = Math.max(0, utilidadCentavos - mACent)
    const pA = utilidadCentavos > 0 ? (mACent / utilidadCentavos) * 100 : 0
    const pB = utilidadCentavos > 0 ? (mBCent / utilidadCentavos) * 100 : 0
    return {
      porcentajeA: pA,
      porcentajeB: pB,
      montoA: mACent / 100,
      montoB: mBCent / 100,
    }
  }, [montoAInput, base.utilidadNeta, utilidadCentavos])

  const d = modo === 'PORCENTAJE' ? distribucionPorPorcentaje : distribucionPorMonto

  function onChangePorcentajeA(v: string) {
    setPorcentajeA(clamp(Number(v || 0), 0, 100))
  }

  function onChangePorcentajeB(v: string) {
    const pB = clamp(Number(v || 0), 0, 100)
    setPorcentajeA(100 - pB)
  }

  function onChangeMontoA(v: string) {
    const mA = clamp(Number(v || 0), 0, base.utilidadNeta)
    setMontoAInput(String(Math.round(mA * 100) / 100))
  }

  function onChangeMontoB(v: string) {
    const mB = clamp(Number(v || 0), 0, base.utilidadNeta)
    const mA = Math.max(0, base.utilidadNeta - mB)
    setMontoAInput(String(Math.round(mA * 100) / 100))
  }

  function submit() {
    if (!proyId) { setErr('Selecciona un proyecto.'); return }
    if (!socioA || !socioB) { setErr('Se requieren exactamente 2 socios para repartir utilidades.'); return }
    if (d.montoA <= 0 && d.montoB <= 0) { setErr('Ingresa una distribución válida mayor a cero.'); return }
    setErr(null)
    start(async () => {
      try {
        await repartirUtilidadVariable({
          cuentaProyectoId: proyId,
          cuentaSocioAId: socioA.id,
          cuentaSocioBId: socioB.id,
          modo,
          porcentajeSocioA: d.porcentajeA,
          porcentajeSocioB: d.porcentajeB,
          montoSocioA: d.montoA,
          descripcion: desc || undefined,
        })
        onOk()
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Error al repartir.')
      }
    })
  }

  return (
    <Modal title="Repartir Utilidades" icon={<TrendingUp className="size-4 text-emerald-400" />} onClose={onClose}>
      <p className="text-xs text-slate-400 leading-relaxed">
        Distribuye las utilidades del proyecto entre los socios. No sale dinero del banco —
        solo cambia la propiedad dentro del sistema.
      </p>
      <label className="block">
        <span className="text-xs text-slate-400 mb-1 block">Proyecto origen</span>
        <select value={proyId} onChange={(e) => setProyId(e.target.value)} className={SEL}>
          {proyectos.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre} — {COP.format(p.saldo)}
            </option>
          ))}
        </select>
      </label>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
        <div className="flex justify-between text-slate-400 bg-white/5 rounded-lg px-3 py-2">
          <span>Saldo disponible</span>
          <span className="font-semibold text-white">{COP.format(base.saldoDisponible)}</span>
        </div>
        <div className="flex justify-between text-slate-400 bg-white/5 rounded-lg px-3 py-2">
          <span>Devoluciones pendientes</span>
          <span className="font-semibold text-amber-300">{COP.format(base.devolucionesPendientes)}</span>
        </div>
        <div className="flex justify-between text-slate-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">
          <span>Utilidad neta a repartir</span>
          <span className="font-semibold text-emerald-300">{COP.format(base.utilidadNeta)}</span>
        </div>
      </div>

      {socios.length !== 2 && (
        <p className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
          Este flujo requiere exactamente 2 socios registrados.
        </p>
      )}

      <div className="grid grid-cols-2 gap-2 rounded-lg bg-white/5 p-1 border border-white/10">
        <button
          type="button"
          onClick={() => setModo('PORCENTAJE')}
          className={`px-3 py-2 text-xs font-semibold rounded-md transition-colors ${modo === 'PORCENTAJE' ? 'bg-emerald-500/20 text-emerald-300' : 'text-slate-400 hover:text-white'}`}
        >
          Porcentaje (%)
        </button>
        <button
          type="button"
          onClick={() => setModo('MONTO')}
          className={`px-3 py-2 text-xs font-semibold rounded-md transition-colors ${modo === 'MONTO' ? 'bg-emerald-500/20 text-emerald-300' : 'text-slate-400 hover:text-white'}`}
        >
          Valor ($)
        </button>
      </div>

      {socioA && socioB && (
        <div className="space-y-3">
          <label className="block">
            <span className="text-xs text-slate-400 mb-1 block">
              Para {socioA.nombre}{socioA.user_email ? ` (${socioA.user_email})` : ''}
            </span>
            {modo === 'PORCENTAJE' ? (
              <input type="number" min={0} max={100} value={d.porcentajeA.toFixed(2)} onChange={(e) => onChangePorcentajeA(e.target.value)} className={INP} />
            ) : (
              <input type="number" min={0} max={base.utilidadNeta} value={d.montoA.toFixed(2)} onChange={(e) => onChangeMontoA(e.target.value)} className={INP} />
            )}
            <div className="text-[10px] text-slate-500 mt-1">{d.porcentajeA.toFixed(2)}% · {COP.format(d.montoA)}</div>
          </label>

          <label className="block">
            <span className="text-xs text-slate-400 mb-1 block">
              Para {socioB.nombre}{socioB.user_email ? ` (${socioB.user_email})` : ''}
            </span>
            {modo === 'PORCENTAJE' ? (
              <input type="number" min={0} max={100} value={d.porcentajeB.toFixed(2)} onChange={(e) => onChangePorcentajeB(e.target.value)} className={INP} />
            ) : (
              <input type="number" min={0} max={base.utilidadNeta} value={d.montoB.toFixed(2)} onChange={(e) => onChangeMontoB(e.target.value)} className={INP} />
            )}
            <div className="text-[10px] text-slate-500 mt-1">{d.porcentajeB.toFixed(2)}% · {COP.format(d.montoB)}</div>
          </label>
        </div>
      )}

      <div className="text-xs rounded-lg px-3 py-2 flex justify-between bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
        <span>Total a repartir</span>
        <span className="font-bold">{COP.format(d.montoA + d.montoB)}</span>
      </div>

      {cargandoBase && (
        <p className="text-xs text-slate-400">Calculando utilidad neta del proyecto…</p>
      )}

      <label className="block">
        <span className="text-xs text-slate-400 mb-1 block">Descripción (opcional)</span>
        <input type="text" value={desc} onChange={(e) => setDesc(e.target.value)}
          placeholder="Ej. Cierre actividad mayo 2026" className={INP} />
      </label>
      {err && <ErrorMsg msg={err} />}
      <button onClick={submit} disabled={isPending || socios.length !== 2 || cargandoBase || base.utilidadNeta <= 0}
        className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold py-2 rounded-xl transition-colors text-sm">
        {isPending ? <Loader2 className="size-4 animate-spin" /> : <TrendingUp className="size-4" />}
        {isPending ? 'Repartiendo…' : 'Confirmar Reparto'}
      </button>
    </Modal>
  )
}

// ── Modal: Retiro ─────────────────────────────────────────────
function ModalRetiro({
  cuenta,
  onClose,
  onOk,
}: { cuenta: CuentaVirtual; onClose: () => void; onOk: () => void }) {
  const [monto, setMonto]       = useState('')
  const [desc, setDesc]         = useState('')
  const [soporte, setSoporte]   = useState('')
  const [err, setErr]           = useState<string | null>(null)
  const [isPending, start]      = useTransition()

  function submit() {
    if (Number(monto) <= 0) { setErr('El monto debe ser mayor a cero.'); return }
    if (Number(monto) > cuenta.saldo) {
      setErr(`Saldo insuficiente. Disponible: ${COP.format(cuenta.saldo)}.`); return
    }
    setErr(null)
    start(async () => {
      try {
        await registrarRetiro({
          cuentaSocioId: cuenta.id,
          monto:         Number(monto),
          descripcion:   desc || undefined,
          soporteUrl:    soporte || undefined,
        })
        onOk()
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Error al registrar retiro.')
      }
    })
  }

  return (
    <Modal title={`Retiro — ${cuenta.nombre}`} icon={<ArrowDownLeft className="size-4 text-red-400" />} onClose={onClose}>
      <p className="text-xs text-slate-400 leading-relaxed">
        Registra el retiro de fondos del socio. El saldo de la cuenta se reduce
        y queda el registro inmutable de cuándo y cuánto se pagó.
      </p>
      <div className="bg-white/5 rounded-xl p-3 border border-white/10 text-center">
        <p className="text-xs text-slate-400 mb-1">Saldo disponible</p>
        <p className="text-2xl font-black text-white">{COP.format(cuenta.saldo)}</p>
      </div>
      <label className="block">
        <span className="text-xs text-slate-400 mb-1 block">Monto a retirar (COP)</span>
        <input type="number" min={1} max={cuenta.saldo} value={monto}
          onChange={(e) => setMonto(e.target.value)} placeholder="0" className={INP} />
      </label>
      <label className="block">
        <span className="text-xs text-slate-400 mb-1 block">Descripción (opcional)</span>
        <input type="text" value={desc} onChange={(e) => setDesc(e.target.value)}
          placeholder="Ej. Pago servicios mayo" className={INP} />
      </label>
      <label className="block">
        <span className="text-xs text-slate-400 mb-1 block">URL Soporte (opcional)</span>
        <input type="url" value={soporte} onChange={(e) => setSoporte(e.target.value)}
          placeholder="https://..." className={INP} />
      </label>
      {err && <ErrorMsg msg={err} />}
      <button onClick={submit} disabled={isPending}
        className="w-full flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-semibold py-2 rounded-xl transition-colors text-sm">
        {isPending ? <Loader2 className="size-4 animate-spin" /> : <ArrowDownLeft className="size-4" />}
        {isPending ? 'Registrando…' : 'Confirmar Retiro'}
      </button>
    </Modal>
  )
}

// ── Modal: Transferencia Genérica ─────────────────────────────
function ModalTransferir({
  cuentas,
  onClose,
  onOk,
}: { cuentas: CuentaVirtual[]; onClose: () => void; onOk: () => void }) {
  const [origenId, setOrigenId] = useState(cuentas[0]?.id ?? '')
  const [destinoId, setDestinoId] = useState(cuentas[1]?.id ?? '')
  const [monto, setMonto]       = useState('')
  const [desc, setDesc]         = useState('')
  const [tipo, setTipo]         = useState<'TRANSFERENCIA' | 'GASTO'>('TRANSFERENCIA')
  const [err, setErr]           = useState<string | null>(null)
  const [isPending, start]      = useTransition()

  function submit() {
    if (origenId === destinoId) { setErr('Origen y destino deben ser distintos.'); return }
    if (Number(monto) <= 0) { setErr('El monto debe ser mayor a cero.'); return }
    setErr(null)
    start(async () => {
      try {
        await transferirEntreCuentas({
          origenId,
          destinoId,
          monto: Number(monto),
          tipo,
          descripcion: desc || undefined,
        })
        onOk()
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Error al transferir.')
      }
    })
  }

  return (
    <Modal title="Transferir Dinero" icon={<ArrowLeftRight className="size-4 text-blue-400" />} onClose={onClose}>
      <label className="block">
        <span className="text-xs text-slate-400 mb-1 block">Tipo de movimiento</span>
        <select value={tipo} onChange={(e) => setTipo(e.target.value as any)} className={SEL}>
          <option value="TRANSFERENCIA">Transferencia entre cuentas</option>
          <option value="GASTO">Gasto (salida de fondos)</option>
        </select>
      </label>
      <label className="block">
        <span className="text-xs text-slate-400 mb-1 block">Origen</span>
        <select value={origenId} onChange={(e) => setOrigenId(e.target.value)} className={SEL}>
          {cuentas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre} — {COP.format(c.saldo)}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="text-xs text-slate-400 mb-1 block">Destino</span>
        <select value={destinoId} onChange={(e) => setDestinoId(e.target.value)} className={SEL}>
          {cuentas.filter((c) => c.id !== origenId).map((c) => (
            <option key={c.id} value={c.id}>{c.nombre}</option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="text-xs text-slate-400 mb-1 block">Monto (COP)</span>
        <input type="number" min={1} value={monto} onChange={(e) => setMonto(e.target.value)}
          placeholder="0" className={INP} />
      </label>
      <label className="block">
        <span className="text-xs text-slate-400 mb-1 block">Descripción (opcional)</span>
        <input type="text" value={desc} onChange={(e) => setDesc(e.target.value)}
          placeholder="Ej. Liquidación parcial" className={INP} />
      </label>
      {err && <ErrorMsg msg={err} />}
      <button onClick={submit} disabled={isPending}
        className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold py-2 rounded-xl transition-colors text-sm">
        {isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
        {isPending ? 'Transfiriendo…' : 'Confirmar Transferencia'}
      </button>
    </Modal>
  )
}

// ── Modal: Crear Cuenta Proyecto ──────────────────────────────
function ModalCrearProyecto({
  onClose,
  onOk,
}: { onClose: () => void; onOk: () => void }) {
  const [actId, setActId]   = useState('')
  const [nombre, setNombre] = useState('')
  const [err, setErr]       = useState<string | null>(null)
  const [isPending, start]  = useTransition()

  function submit() {
    if (!actId.trim()) { setErr('Ingresa el ID de la actividad.'); return }
    if (!nombre.trim()) { setErr('Ingresa un nombre para la cuenta.'); return }
    setErr(null)
    start(async () => {
      try {
        await crearCuentaProyecto(actId.trim(), nombre.trim(), actId.trim().substring(0, 8).toUpperCase())
        onOk()
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Error al crear la cuenta.')
      }
    })
  }

  return (
    <Modal title="Nueva Cuenta de Proyecto" icon={<Plus className="size-4 text-indigo-400" />} onClose={onClose}>
      <p className="text-xs text-slate-400 leading-relaxed">
        Vincula una cuenta virtual a una actividad existente para rastrear
        sus flujos de capital de forma independiente.
      </p>
      <label className="block">
        <span className="text-xs text-slate-400 mb-1 block">ID de la Actividad (UUID)</span>
        <input type="text" value={actId} onChange={(e) => setActId(e.target.value)}
          placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" className={INP} />
        <p className="text-[10px] text-slate-500 mt-1">Puedes copiarlo desde la URL de la actividad en Ejecución.</p>
      </label>
      <label className="block">
        <span className="text-xs text-slate-400 mb-1 block">Nombre de la cuenta</span>
        <input type="text" value={nombre} onChange={(e) => setNombre(e.target.value)}
          placeholder="Ej. Caja 685PE – Villavicencio" className={INP} />
      </label>
      {err && <ErrorMsg msg={err} />}
      <button onClick={submit} disabled={isPending}
        className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold py-2 rounded-xl transition-colors text-sm">
        {isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
        {isPending ? 'Creando…' : 'Crear Cuenta'}
      </button>
    </Modal>
  )
}

// ── Modal: Crear Cuenta Socio ────────────────────────────────
function ModalCrearSocio({
  usuarios,
  cuentas,
  onClose,
  onOk,
}: { usuarios: UsuarioRegistrado[]; cuentas: CuentaVirtual[]; onClose: () => void; onOk: () => void }) {
  // Excluir usuarios que ya tienen cuenta de socio
  const socioUserIds = new Set(cuentas.filter((c) => c.tipo === 'SOCIO' && c.user_id).map((c) => c.user_id!))
  const disponibles  = usuarios.filter((u) => !socioUserIds.has(u.id))

  const [userId, setUserId] = useState(disponibles[0]?.id ?? '')
  const [nombre, setNombre] = useState('')
  const [err, setErr]       = useState<string | null>(null)
  const [isPending, start]  = useTransition()

  function submit() {
    if (!userId) { setErr('Selecciona un usuario.'); return }
    const nombreFinal = nombre.trim() || (usuarios.find((u) => u.id === userId)?.nombre ?? 'Socio')
    setErr(null)
    start(async () => {
      try {
        await crearCuentaSocio(userId, nombreFinal)
        onOk()
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Error al crear la cuenta.')
      }
    })
  }

  return (
    <Modal title="Agregar Socio" icon={<Plus className="size-4 text-amber-400" />} onClose={onClose}>
      <p className="text-xs text-slate-400 leading-relaxed">
        Crea una cuenta virtual para un usuario registrado. Solo aparecen usuarios que
        aún no tienen cuenta de socio.
      </p>
      {disponibles.length === 0 ? (
        <p className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
          Todos los usuarios registrados ya tienen cuenta de socio.
        </p>
      ) : (
        <>
          <label className="block">
            <span className="text-xs text-slate-400 mb-1 block">Usuario</span>
            <select value={userId} onChange={(e) => setUserId(e.target.value)} className={SEL}>
              {disponibles.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nombre || u.email} {u.nombre ? `(${u.email})` : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs text-slate-400 mb-1 block">Nombre de la cuenta (opcional)</span>
            <input type="text" value={nombre} onChange={(e) => setNombre(e.target.value)}
              placeholder={usuarios.find((u) => u.id === userId)?.nombre ?? 'Ej. Cuenta Socio Juan'}
              className={INP} />
            <p className="text-[10px] text-slate-500 mt-1">Si lo dejas vacío se usa el nombre del usuario.</p>
          </label>
        </>
      )}
      {err && <ErrorMsg msg={err} />}
      <button onClick={submit} disabled={isPending || disponibles.length === 0}
        className="w-full flex items-center justify-center gap-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-semibold py-2 rounded-xl transition-colors text-sm">
        {isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
        {isPending ? 'Creando…' : 'Crear Cuenta Socio'}
      </button>
    </Modal>
  )
}

// ── Trazabilidad de Deuda ─────────────────────────────────────
function DeudaPanel({
  cuentas,
  transacciones,
}: { cuentas: CuentaVirtual[]; transacciones: MovimientoBancario[] }) {
  const socios = cuentas.filter((c) => c.tipo === 'SOCIO')

  const calcDeuda = (socioId: string) => {
    const inyectado = transacciones
      .filter((t) => t.tipo === 'INYECCION' && t.destino_id === socioId)
      .reduce((s, t) => s + t.monto, 0)
    const retirado = transacciones
      .filter((t) => t.tipo === 'RETIRO' && t.origen_id === socioId)
      .reduce((s, t) => s + t.monto, 0)
    return { inyectado, retirado, pendiente: Math.max(0, inyectado - retirado) }
  }

  if (socios.every((s) => calcDeuda(s.id).inyectado === 0)) return null

  return (
    <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-5">
      <h3 className="text-sm font-bold text-amber-300 flex items-center gap-2 mb-4">
        <Wallet className="size-4" />
        Trazabilidad de Deuda — Aportes de Socios
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {socios.map((socio) => {
          const datos = calcDeuda(socio.id)
          const label = socio.nombre || socio.user_email?.split('@')[0] || 'Socio'
          return (
            <div key={socio.id} className="bg-white/5 rounded-xl p-4 border border-white/10 space-y-2">
              <p className="text-xs font-bold text-slate-300">{label}</p>
              {socio.user_email && (
                <p className="text-[10px] text-slate-500">{socio.user_email}</p>
              )}
              <div className="flex justify-between text-xs text-slate-400">
                <span>Total inyectado</span>
                <span className="text-violet-400 font-semibold">{COP.format(datos.inyectado)}</span>
              </div>
              <div className="flex justify-between text-xs text-slate-400">
                <span>Total retirado</span>
                <span className="text-red-400 font-semibold">{COP.format(datos.retirado)}</span>
              </div>
              <div className="border-t border-white/10 pt-2 flex justify-between text-xs font-bold">
                <span className="text-amber-300">La sociedad le debe</span>
                <span className="text-amber-300">{COP.format(datos.pendiente)}</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Extracto Bancario ─────────────────────────────────────────
const FILTROS: { label: string; value: TipoMovimiento | 'TODOS' }[] = [
  { label: 'Todos',         value: 'TODOS' },
  { label: 'Inyecciones',   value: 'INYECCION' },
  { label: 'Pagos UV',      value: 'PAGO_UNIDAD' },
  { label: 'Repartos',      value: 'REPARTO_50_50' },
  { label: 'Devoluciones',  value: 'DEVOLUCION' },
  { label: 'Retiros',       value: 'RETIRO' },
  { label: 'Transferencias',value: 'TRANSFERENCIA' },
  { label: 'Gastos',        value: 'GASTO' },
]

function ExtractoBancario({
  transacciones,
  cuentas,
}: { transacciones: MovimientoBancario[]; cuentas: CuentaVirtual[] }) {
  const [filtro, setFiltro] = useState<TipoMovimiento | 'TODOS'>('TODOS')

  const filtered = useMemo(
    () => filtro === 'TODOS' ? transacciones : transacciones.filter((t) => t.tipo === filtro),
    [transacciones, filtro]
  )

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <Filter className="size-4 text-slate-400" />
          Extracto Bancario
        </h3>
        <span className="text-xs text-slate-500">{filtered.length} movimiento{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Filter tabs */}
      <div className="flex flex-wrap gap-2 mb-4">
        {FILTROS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFiltro(f.value)}
            className={`text-[11px] font-semibold px-3 py-1 rounded-full border transition-all ${
              filtro === f.value
                ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-300'
                : 'bg-white/5 border-white/10 text-slate-400 hover:text-white'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Transactions */}
      <div className="space-y-2">
        {filtered.length === 0 && (
          <p className="text-slate-500 text-sm text-center py-6">No hay movimientos.</p>
        )}
        {filtered.map((tx) => {
          const esSalida  = tx.origen_id !== null
          const esEntrada = tx.destino_id !== null && tx.origen_id === null
          const signo     = esEntrada ? '+' : '-'
          const color     = esEntrada ? 'text-emerald-400' : 'text-red-400'

          return (
            <div key={tx.id}
              className="flex items-center gap-3 px-4 py-3 bg-white/5 hover:bg-white/10 rounded-xl border border-white/5 transition-colors">
              <div className={`p-1.5 rounded-lg ${esEntrada ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'}`}>
                {esEntrada
                  ? <ArrowDownLeft className="size-3.5" />
                  : <ArrowUpRight className="size-3.5" />
                }
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-semibold text-white/80 truncate">
                    {tx.descripcion ?? `${tx.cuenta_origen?.nombre ?? 'Externo'} → ${tx.cuenta_destino?.nombre ?? 'Externo'}`}
                  </span>
                  <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${TIPO_COLOR[tx.tipo]}`}>
                    {TIPO_LABEL[tx.tipo]}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-[10px] text-slate-500 mt-0.5">
                  <span>{fmtDate(tx.fecha)}</span>
                  {tx.cuenta_origen && (
                    <span>{tx.cuenta_origen.nombre} → {tx.cuenta_destino?.nombre ?? 'Externo'}</span>
                  )}
                  {tx.soporte_url && (
                    <a href={tx.soporte_url} target="_blank" rel="noopener noreferrer"
                      className="text-indigo-400 hover:underline flex items-center gap-0.5">
                      <Upload className="size-2.5" /> Soporte
                    </a>
                  )}
                </div>
              </div>
              <div className={`text-sm font-black tabular-nums shrink-0 ${color}`}>
                {signo}{COP.format(tx.monto)}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────
type ModalType = 'inyectar' | 'repartir' | 'transferir' | 'proyecto' | 'socio' | null

export function TesoreriaDashboard({
  cuentas: initialCuentas,
  transacciones: initialTxs,
  usuarios,
  resumenDevoluciones,
}: {
  cuentas: CuentaVirtual[]
  transacciones: MovimientoBancario[]
  usuarios: UsuarioRegistrado[]
  resumenDevoluciones: ResumenDevolucionesUnidad
}) {
  const router = useRouter()
  const [modal, setModal]               = useState<ModalType>(null)
  const [retiroCuenta, setRetiroCuenta] = useState<CuentaVirtual | null>(null)
  const [isPending, start]              = useTransition()

  const cuentas       = initialCuentas
  const transacciones = initialTxs

  const general   = cuentas.find((c) => c.tipo === 'GENERAL')
  const socios    = cuentas.filter((c) => c.tipo === 'SOCIO')
  const proyectos = cuentas.filter((c) => c.tipo === 'PROYECTO')

  const totalActivos = cuentas.reduce((s, c) => s + c.saldo, 0)

  function handleSuccess() {
    setModal(null)
    setRetiroCuenta(null)
    start(() => router.refresh())
  }

  return (
    <div className="space-y-6">

      {/* ── Resumen general ── */}
      <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-indigo-500/15 border border-indigo-500/20">
              <Vault className="size-5 text-indigo-400" />
            </div>
            <div>
              <p className="text-xs text-slate-400">Patrimonio Total UV</p>
              <p className="text-2xl font-black text-white tabular-nums">{COP.format(totalActivos)}</p>
            </div>
          </div>
          <button onClick={() => start(() => router.refresh())} disabled={isPending}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded-lg border border-white/10 transition-colors disabled:opacity-50">
            <RefreshCw className={`size-3.5 ${isPending ? 'animate-spin' : ''}`} />
            Actualizar
          </button>
        </div>
      </div>

      {/* ── KPIs de devoluciones ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className={`rounded-xl border p-4 ${resumenDevoluciones.deudaPendienteUnidad > 0 ? 'border-red-500/30 bg-red-500/10' : 'border-white/10 bg-white/5'}`}>
          <p className="text-xs text-slate-400">Deuda Pendiente (Unidad)</p>
          <p className={`text-xl font-black tabular-nums mt-1 ${resumenDevoluciones.deudaPendienteUnidad > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
            {resumenDevoluciones.deudaPendienteUnidad > 0 ? COP.format(resumenDevoluciones.deudaPendienteUnidad) : '✓ Sin deuda'}
          </p>
        </div>
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
          <p className="text-xs text-slate-400">Total Devuelto</p>
          <p className="text-xl font-black text-emerald-400 tabular-nums mt-1">
            {COP.format(resumenDevoluciones.totalDevuelto)}
          </p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <p className="text-xs text-slate-400">Movimientos de devolución</p>
          <p className="text-xl font-black text-amber-300 tabular-nums mt-1">
            {resumenDevoluciones.totalMovimientosDevolucion}
          </p>
        </div>
      </div>

      {/* ── Tarjetas de cuentas ── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400">Cuentas</h2>
          <button onClick={() => setModal('proyecto')}
            className="flex items-center gap-1.5 text-xs font-semibold text-indigo-400 hover:text-indigo-300 transition-colors">
            <Plus className="size-3.5" /> Nueva cuenta proyecto
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {general && <CuentaCard cuenta={general} />}
          {socios.map((s, idx) => (
            <CuentaCard key={s.id} cuenta={s} socioIndex={idx} onRetiro={setRetiroCuenta} />
          ))}
          {proyectos.map((p) => (
            <CuentaCard key={p.id} cuenta={p} />
          ))}
        </div>
      </div>

      {/* ── Acciones rápidas ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Inyectar Capital',     icon: ArrowUpRight,  color: 'text-violet-400 hover:bg-violet-500/20 border-violet-500/20', onClick: () => setModal('inyectar') },
          { label: 'Repartir Utilidades',  icon: TrendingUp,    color: 'text-emerald-400 hover:bg-emerald-500/20 border-emerald-500/20', onClick: () => setModal('repartir') },
          { label: 'Transferir Dinero',    icon: ArrowLeftRight, color: 'text-blue-400 hover:bg-blue-500/20 border-blue-500/20', onClick: () => setModal('transferir') },
          { label: 'Agregar Socio',        icon: Plus,          color: 'text-amber-400 hover:bg-amber-500/20 border-amber-500/20', onClick: () => setModal('socio') },
        ].map(({ label, icon: Icon, color, onClick }) => (
          <button key={label} onClick={onClick}
            className={`flex items-center gap-2 px-4 py-3 rounded-xl bg-white/5 border ${color} font-semibold text-sm transition-all`}>
            <Icon className="size-4" />
            {label}
          </button>
        ))}
      </div>

      {/* ── Trazabilidad de deuda ── */}
      <DeudaPanel cuentas={cuentas} transacciones={transacciones} />

      {/* ── Extracto bancario ── */}
      <ExtractoBancario transacciones={transacciones} cuentas={cuentas} />

      {/* ── Modales ── */}
      {modal === 'inyectar'   && <ModalInyectar   cuentas={cuentas} onClose={() => setModal(null)} onOk={handleSuccess} />}
      {modal === 'repartir'   && <ModalRepartir   cuentas={cuentas} onClose={() => setModal(null)} onOk={handleSuccess} />}
      {modal === 'transferir' && <ModalTransferir cuentas={cuentas} onClose={() => setModal(null)} onOk={handleSuccess} />}
      {modal === 'proyecto'   && <ModalCrearProyecto              onClose={() => setModal(null)} onOk={handleSuccess} />}
      {modal === 'socio'      && <ModalCrearSocio usuarios={usuarios} cuentas={cuentas} onClose={() => setModal(null)} onOk={handleSuccess} />}
      {retiroCuenta           && <ModalRetiro cuenta={retiroCuenta} onClose={() => setRetiroCuenta(null)} onOk={handleSuccess} />}
    </div>
  )
}
