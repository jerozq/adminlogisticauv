'use client'

import { useEffect } from 'react'

/**
 * Evita que el scroll del mouse cambie el valor de los <input type="number">
 * en toda la app (ej: precios, cantidades) cuando el cursor queda parado
 * sobre el campo mientras se hace scroll de la página.
 *
 * Se registra en fase de captura para quitar el foco del input ANTES de que
 * el navegador aplique su incremento/decremento nativo por wheel.
 */
export function NumberInputGuard() {
  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      const el = document.activeElement
      if (el instanceof HTMLInputElement && el.type === 'number') {
        el.blur()
      }
    }
    document.addEventListener('wheel', onWheel, { capture: true, passive: true })
    return () => document.removeEventListener('wheel', onWheel, { capture: true })
  }, [])

  return null
}
