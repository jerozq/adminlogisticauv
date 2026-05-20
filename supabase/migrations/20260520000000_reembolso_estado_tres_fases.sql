-- ============================================================
-- Refactor: 3 estados para ítems REEMBOLSO / PASIVO_TERCERO
-- ============================================================
-- Antes: estado ACTIVO/NO_ASISTIO + columna pagado BOOLEAN (confuso)
-- Ahora: estado PENDIENTE | PAGADO | DEVOLUCION (claro y unificado)
--
-- PENDIENTE  = estado inicial, dinero aún no entregado
-- PAGADO     = dinero entregado al beneficiario → egreso en tesorería (GASTO)
-- DEVOLUCION = no se puede pagar → pasa al módulo de devoluciones sin egreso
--
-- Los estados ACTIVO / CANCELADO se conservan para ítems SERVICIO/PASIVO_TERCERO
-- que usan el flujo de cancelación de ítems cotizados.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. Ampliar CHECK constraint de items_requerimiento.estado
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.items_requerimiento
  DROP CONSTRAINT IF EXISTS items_requerimiento_estado_check;

ALTER TABLE public.items_requerimiento
  ADD CONSTRAINT items_requerimiento_estado_check
  CHECK (estado IN (
    'ACTIVO',       -- ítem de servicio activo (no reembolso)
    'CANCELADO',    -- ítem de servicio cancelado (no reembolso)
    'NO_ASISTIO',   -- legacy; se migra a DEVOLUCION abajo
    'PENDIENTE',    -- reembolso pendiente de resolución
    'PAGADO',       -- reembolso pagado → movimiento GASTO creado
    'DEVOLUCION'    -- reembolso que no se pagó → va al módulo devoluciones
  ));

-- ────────────────────────────────────────────────────────────
-- 2. Agregar columna para enlazar el movimiento de pago
--    Solo aplica cuando estado = 'PAGADO'
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.items_requerimiento
  ADD COLUMN IF NOT EXISTS movimiento_reembolso_id UUID
    REFERENCES public.movimientos_bancarios(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.items_requerimiento.movimiento_reembolso_id IS
  'FK al movimiento GASTO en tesorería creado al marcar el reembolso como PAGADO. NULL cuando estado != PAGADO.';

-- ────────────────────────────────────────────────────────────
-- 3. Backfill: migrar datos existentes de tipo REEMBOLSO
--    (ACTIVO + pagado=true → PAGADO, ACTIVO + pagado=false → PENDIENTE,
--     NO_ASISTIO → DEVOLUCION)
-- ────────────────────────────────────────────────────────────
UPDATE public.items_requerimiento
SET estado = 'PAGADO'
WHERE tipo = 'REEMBOLSO'
  AND estado = 'ACTIVO'
  AND pagado = TRUE;

UPDATE public.items_requerimiento
SET estado = 'PENDIENTE'
WHERE tipo = 'REEMBOLSO'
  AND estado = 'ACTIVO'
  AND pagado = FALSE;

UPDATE public.items_requerimiento
SET estado = 'DEVOLUCION'
WHERE tipo = 'REEMBOLSO'
  AND estado = 'NO_ASISTIO';

-- ────────────────────────────────────────────────────────────
-- 4. Backfill para PASIVO_TERCERO (mismo patrón que REEMBOLSO)
-- ────────────────────────────────────────────────────────────
UPDATE public.items_requerimiento
SET estado = 'PAGADO'
WHERE tipo = 'PASIVO_TERCERO'
  AND estado = 'ACTIVO'
  AND pagado = TRUE;

UPDATE public.items_requerimiento
SET estado = 'PENDIENTE'
WHERE tipo = 'PASIVO_TERCERO'
  AND estado = 'ACTIVO'
  AND pagado = FALSE;

UPDATE public.items_requerimiento
SET estado = 'DEVOLUCION'
WHERE tipo = 'PASIVO_TERCERO'
  AND estado = 'NO_ASISTIO';

COMMENT ON COLUMN public.items_requerimiento.estado IS
  'ACTIVO/CANCELADO para ítems SERVICIO. PENDIENTE/PAGADO/DEVOLUCION para ítems REEMBOLSO y PASIVO_TERCERO.';
