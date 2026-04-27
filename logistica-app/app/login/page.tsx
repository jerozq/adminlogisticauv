'use client'

import { useActionState, useEffect, useRef } from 'react'
import { Loader2, Mail, Lock, Shield, ArrowRight } from 'lucide-react'
import { signIn } from '@/actions/auth'

const initialState = { error: null as string | null }

export default function LoginPage() {
  const [state, formAction, isPending] = useActionState(signIn, initialState)
  const emailRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    emailRef.current?.focus()
  }, [])

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden">
      {/* ── Fondo mesh-gradient oscuro ── */}
      <div
        className="absolute inset-0 -z-10"
        style={{
          background: `
            radial-gradient(ellipse 80% 60% at 20% 10%, rgba(30, 41, 59, 0.95) 0%, transparent 60%),
            radial-gradient(ellipse 60% 80% at 80% 90%, rgba(15, 23, 42, 0.98) 0%, transparent 60%),
            radial-gradient(ellipse 100% 100% at 50% 50%, #0f172a 0%, #020617 100%)
          `,
        }}
      />

      {/* ── Orbes de fondo para dar profundidad al cristal ── */}
      <div
        className="absolute -z-10 pointer-events-none"
        aria-hidden
        style={{
          inset: 0,
          background: `
            radial-gradient(circle 400px at 25% 30%, rgba(99,102,241,0.12) 0%, transparent 70%),
            radial-gradient(circle 300px at 75% 70%, rgba(148,163,184,0.08) 0%, transparent 70%),
            radial-gradient(circle 250px at 60% 20%, rgba(56,189,248,0.07) 0%, transparent 70%)
          `,
        }}
      />

      {/* ── Tarjeta Liquid Glass ── */}
      <div
        className="relative w-full max-w-md mx-4 rounded-3xl p-8 overflow-hidden"
        style={{
          background: 'rgba(255,255,255,0.04)',
          backdropFilter: 'blur(32px) saturate(180%)',
          WebkitBackdropFilter: 'blur(32px) saturate(180%)',
          border: '1px solid rgba(255,255,255,0.10)',
          boxShadow: `
            0 32px 80px rgba(0,0,0,0.6),
            0 1px 0 rgba(255,255,255,0.12) inset,
            0 -1px 0 rgba(0,0,0,0.30) inset
          `,
        }}
      >
        {/* Inner glow top */}
        <div
          className="absolute top-0 left-0 right-0 h-px"
          style={{ background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.20) 50%, transparent 100%)' }}
        />

        {/* ── Logo / título ── */}
        <div className="text-center mb-8">
          <div
            className="inline-flex items-center justify-center size-14 rounded-2xl mb-4"
            style={{
              background: 'rgba(99,102,241,0.20)',
              border: '1px solid rgba(99,102,241,0.30)',
              boxShadow: '0 0 30px rgba(99,102,241,0.15)',
            }}
          >
            <Shield className="size-7 text-indigo-400" strokeWidth={1.5} />
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight leading-none">
            Admin Logística
          </h1>
          <p className="text-sm text-slate-400 mt-1.5 font-medium">
            Sistema de Gestión · UV
          </p>
        </div>

        {/* ── Formulario ── */}
        <form action={formAction} className="space-y-4">
          {/* Email */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">
              Correo Electrónico
            </label>
            <div className="relative">
              <Mail
                className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-slate-500 pointer-events-none"
                strokeWidth={1.5}
              />
              <input
                ref={emailRef}
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                placeholder="jeronimo@gmail.com"
                disabled={isPending}
                className="w-full pl-10 pr-4 py-3 rounded-xl text-sm text-white placeholder:text-slate-600
                           disabled:opacity-50 disabled:cursor-not-allowed outline-none transition-all"
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.10)',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.20) inset',
                }}
                onFocus={(e) => {
                  e.currentTarget.style.border = '1px solid rgba(99,102,241,0.50)'
                  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.12), 0 1px 3px rgba(0,0,0,0.20) inset'
                }}
                onBlur={(e) => {
                  e.currentTarget.style.border = '1px solid rgba(255,255,255,0.10)'
                  e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.20) inset'
                }}
              />
            </div>
          </div>

          {/* Contraseña */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">
              Contraseña
            </label>
            <div className="relative">
              <Lock
                className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-slate-500 pointer-events-none"
                strokeWidth={1.5}
              />
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                placeholder="••••••••"
                disabled={isPending}
                className="w-full pl-10 pr-4 py-3 rounded-xl text-sm text-white placeholder:text-slate-600
                           disabled:opacity-50 disabled:cursor-not-allowed outline-none transition-all"
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.10)',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.20) inset',
                }}
                onFocus={(e) => {
                  e.currentTarget.style.border = '1px solid rgba(99,102,241,0.50)'
                  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.12), 0 1px 3px rgba(0,0,0,0.20) inset'
                }}
                onBlur={(e) => {
                  e.currentTarget.style.border = '1px solid rgba(255,255,255,0.10)'
                  e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.20) inset'
                }}
              />
            </div>
          </div>

          {/* Error message */}
          {state.error && (
            <div
              className="flex items-center gap-2.5 px-3.5 py-3 rounded-xl text-sm font-medium text-red-300 animate-in slide-in-from-top-2 duration-200"
              style={{
                background: 'rgba(239,68,68,0.10)',
                border: '1px solid rgba(239,68,68,0.25)',
              }}
              role="alert"
            >
              <span className="shrink-0">⚠️</span>
              {state.error}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={isPending}
            className="w-full flex items-center justify-center gap-2.5 py-3.5 rounded-xl text-sm font-bold
                       text-white transition-all duration-200 active:scale-[0.98]
                       disabled:opacity-60 disabled:cursor-not-allowed mt-2"
            style={{
              background: isPending
                ? 'rgba(30,41,59,0.80)'
                : 'linear-gradient(135deg, rgba(51,65,85,0.95) 0%, rgba(30,41,59,0.98) 100%)',
              border: '1px solid rgba(148,163,184,0.20)',
              boxShadow: isPending
                ? 'none'
                : '0 4px 20px rgba(0,0,0,0.30), 0 1px 0 rgba(255,255,255,0.10) inset',
            }}
          >
            {isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Verificando...
              </>
            ) : (
              <>
                Iniciar Sesión
                <ArrowRight className="size-4" />
              </>
            )}
          </button>
        </form>

        {/* Footer */}
        <p className="text-center text-[11px] text-slate-600 mt-6">
          Sistema interno · Acceso restringido
        </p>
      </div>
    </div>
  )
}
