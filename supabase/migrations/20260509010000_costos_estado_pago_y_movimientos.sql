-- ============================================================
-- Costos v2: estado de pago + vínculo con movimientos bancarios
--
-- Esta migración alinea la base de datos con la nueva lógica de
-- liquidaciones:
--   - Cada costo puede quedar PENDIENTE o PAGADO.
--   - Si está pagado, se enlaza a un movimiento bancario.
--   - Los movimientos pueden quedar EJECUTADO o ANULADO.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. movimientos_bancarios: estado del movimiento
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.movimientos_bancarios
  ADD COLUMN IF NOT EXISTS estado TEXT NOT NULL DEFAULT 'EJECUTADO'
    CHECK (estado IN ('EJECUTADO', 'ANULADO'));

CREATE INDEX IF NOT EXISTS idx_movimientos_bancarios_estado
  ON public.movimientos_bancarios (estado);

-- ────────────────────────────────────────────────────────────
-- 2. ejecucion_costos: estado de pago y trazabilidad
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.ejecucion_costos
  ADD COLUMN IF NOT EXISTS estado_pago TEXT NOT NULL DEFAULT 'PENDIENTE'
    CHECK (estado_pago IN ('PENDIENTE', 'PAGADO')),
  ADD COLUMN IF NOT EXISTS movimiento_id UUID REFERENCES public.movimientos_bancarios(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS transferencia_id UUID REFERENCES public.movimientos_bancarios(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cuenta_origen_id UUID REFERENCES public.cuentas_virtuales(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS observaciones TEXT;

CREATE INDEX IF NOT EXISTS idx_ejecucion_costos_estado_pago
  ON public.ejecucion_costos (estado_pago);

CREATE INDEX IF NOT EXISTS idx_ejecucion_costos_movimiento_id
  ON public.ejecucion_costos (movimiento_id);

CREATE INDEX IF NOT EXISTS idx_ejecucion_costos_cuenta_origen_id
  ON public.ejecucion_costos (cuenta_origen_id);

-- ────────────────────────────────────────────────────────────
-- 3. Backfill conservador
-- ────────────────────────────────────────────────────────────
-- Los costos existentes se mantienen como PAGADO si ya tenían monto.
UPDATE public.ejecucion_costos
SET estado_pago = 'PAGADO'
WHERE estado_pago = 'PENDIENTE'
  AND monto > 0;

-- Si hay movimientos viejos sin estado, el default ya los toma como EJECUTADO.

-- ────────────────────────────────────────────────────────────
-- 4. Comentarios de ayuda
-- ────────────────────────────────────────────────────────────
COMMENT ON COLUMN public.ejecucion_costos.estado_pago IS 'Estado lógico del costo: PENDIENTE no afecta caja, PAGADO genera o enlaza un movimiento bancario.';
COMMENT ON COLUMN public.ejecucion_costos.movimiento_id IS 'Movimiento bancario asociado al costo cuando está pagado.';
COMMENT ON COLUMN public.ejecucion_costos.transferencia_id IS 'Movimiento bancario usado para trazabilidad adicional de la transferencia, si aplica.';
COMMENT ON COLUMN public.ejecucion_costos.cuenta_origen_id IS 'Cuenta virtual desde la que salió el pago del costo.';
COMMENT ON COLUMN public.ejecucion_costos.observaciones IS 'Notas libres del costo, incluidas justificaciones de cantidad distinta a la cotizada.';
COMMENT ON COLUMN public.movimientos_bancarios.estado IS 'EJECUTADO cuenta para saldos; ANULADO mantiene trazabilidad sin afectar caja.';
