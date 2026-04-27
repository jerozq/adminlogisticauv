'use client'

import * as React from 'react'
import { Moon, Sun } from 'lucide-react'
import { useTheme } from '@/components/theme-provider'

export function ThemeToggle() {
  const { setTheme, theme } = useTheme()
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true)
  }, [])

  if (!mounted) {
    return (
      <button
        className="flex size-8 items-center justify-center rounded-lg text-foreground/70 opacity-0"
        aria-label="Toggle theme"
      >
        <span className="size-4" />
      </button>
    )
  }

  return (
    <button
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      className="flex size-8 items-center justify-center rounded-lg text-foreground/70 hover:bg-foreground/5 hover:text-foreground transition-colors"
      aria-label="Toggle theme"
    >
      {theme === 'dark' ? (
        <Moon className="size-4" strokeWidth={1.5} />
      ) : (
        <Sun className="size-4" strokeWidth={1.5} />
      )}
    </button>
  )
}
