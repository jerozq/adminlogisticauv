-- ============================================================
-- Agrega el tipo RETIRO_UTILIDAD a movimientos_bancarios.
-- RETIRO          → devuelve capital/aporte del socio (afecta deuda)
-- RETIRO_UTILIDAD → extrae utilidades          (NO afecta deuda)
-- ============================================================

-- 1. Eliminar el CHECK constraint existente sobre 'tipo'
ALTER TABLE public.movimientos_bancarios
  DROP CONSTRAINT IF EXISTS movimientos_bancarios_tipo_check;

-- 2. Recrear el constraint incluyendo el nuevo valor
ALTER TABLE public.movimientos_bancarios
  ADD CONSTRAINT movimientos_bancarios_tipo_check
  CHECK (tipo IN (
    'INYECCION',
    'PAGO_UNIDAD',
    'TRANSFERENCIA',
    'GASTO',
    'REPARTO_50_50',
    'RETIRO',
    'RETIRO_UTILIDAD',
    'DEVOLUCION'
  ));

COMMENT ON COLUMN public.movimientos_bancarios.tipo IS
  'INYECCION: capital externo. PAGO_UNIDAD: giro UV. TRANSFERENCIA: entre cuentas. GASTO: egreso. REPARTO_50_50: split de utilidad. RETIRO: retiro de deuda/aporte socio (reduce deuda). RETIRO_UTILIDAD: retiro de utilidades (no reduce deuda). DEVOLUCION: devolución.';
