-- ============================================================
-- Agrega columna notas JSONB a movimientos_bancarios
-- Necesaria para guardar metadata de abonos:
--   { retencion_aplicada, tipo_abono, monto_bruto, es_reparacion }
-- ============================================================

ALTER TABLE public.movimientos_bancarios
  ADD COLUMN IF NOT EXISTS notas JSONB;

COMMENT ON COLUMN public.movimientos_bancarios.notas IS 'Metadata adicional del movimiento. Para PAGO_UNIDAD: { retencion_aplicada, tipo_abono, monto_bruto, es_reparacion }.';
