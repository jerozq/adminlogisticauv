'use client'

import { useEffect, useMemo, useState } from 'react'

export function HomeLiveDateTime() {
  const [now, setNow] = useState(() => new Date())

  const timeFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat('es-CO', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
        timeZone: 'America/Bogota',
      }),
    []
  )

  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat('es-CO', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        timeZone: 'America/Bogota',
      }),
    []
  )

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(new Date())
    }, 1000)

    return () => window.clearInterval(timer)
  }, [])

  return (
    <div className="grid sm:grid-cols-2 gap-3 min-w-[250px]" aria-live="polite">
      <div className="rounded-2xl bg-black/20 border border-white/10 px-4 py-3 text-right">
        <p className="text-[11px] uppercase tracking-wider [color:var(--text-muted)]">Hora Bogotá</p>
        <p className="text-xl font-bold font-mono [color:var(--text-primary)] leading-tight">{timeFormatter.format(now)}</p>
      </div>
      <div className="rounded-2xl bg-black/20 border border-white/10 px-4 py-3 text-right">
        <p className="text-[11px] uppercase tracking-wider [color:var(--text-muted)]">Fecha</p>
        <p className="text-sm capitalize font-semibold [color:var(--text-primary)] leading-tight">{dateFormatter.format(now)}</p>
      </div>
    </div>
  )
}
