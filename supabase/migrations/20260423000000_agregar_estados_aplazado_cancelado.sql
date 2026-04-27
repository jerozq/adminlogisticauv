-- ============================================================
-- Ampliar estados de requerimientos: aplazado y cancelado
-- ============================================================

-- 1. Eliminar la restricción CHECK existente
ALTER TABLE public.requerimientos
  DROP CONSTRAINT IF EXISTS requerimientos_estado_check;

-- 2. Crear nueva restricción con todos los estados
ALTER TABLE public.requerimientos
  ADD CONSTRAINT requerimientos_estado_check
  CHECK (estado IN ('cargado', 'generado', 'en_ejecucion', 'liquidado', 'aplazado', 'cancelado'));
