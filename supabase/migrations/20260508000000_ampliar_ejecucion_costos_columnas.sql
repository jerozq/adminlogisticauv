-- ============================================================
-- AMPLIAR ejecucion_costos con columnas requeridas por
-- SupabaseActivityRepository (modo_registro, cantidad,
-- precio_unitario, concepto, actualizado_por).
-- ============================================================

ALTER TABLE public.ejecucion_costos
  ADD COLUMN IF NOT EXISTS modo_registro    TEXT    NOT NULL DEFAULT 'por_item'
    CHECK (modo_registro IN ('por_item', 'global', 'manual')),
  ADD COLUMN IF NOT EXISTS cantidad         DECIMAL(10,2) NOT NULL DEFAULT 1
    CHECK (cantidad > 0),
  ADD COLUMN IF NOT EXISTS precio_unitario  DECIMAL(15,2),
  ADD COLUMN IF NOT EXISTS concepto         TEXT,
  ADD COLUMN IF NOT EXISTS actualizado_por  UUID
    REFERENCES auth.users(id) ON DELETE SET NULL;
