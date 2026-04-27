'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2, X } from 'lucide-react'
import { useRouter, usePathname } from 'next/navigation'

export function LoginToastClient() {
  const [show, setShow] = useState(true)
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    // Remove query param from URL cleanly
    router.replace(pathname, { scroll: false })
    
    // Auto-dismiss after 3s
    const t = setTimeout(() => setShow(false), 3000)
    return () => clearTimeout(t)
  }, [router, pathname])

  if (!show) return null

  return (
    <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-3 px-5 py-3.5 rounded-2xl bg-background/60 backdrop-blur-xl border border-white/10 text-foreground shadow-2xl animate-in fade-in slide-in-from-top-4 duration-300">
      <CheckCircle2 className="size-5 text-emerald-400" strokeWidth={1.5} />
      <span className="text-sm font-medium">
        Sesión iniciada con éxito. ¡Bienvenido!
      </span>
      <button 
        onClick={() => setShow(false)} 
        className="ml-2 text-muted-foreground hover:text-foreground transition-colors"
      >
        <X className="size-4" strokeWidth={2} />
      </button>
    </div>
  )
}
