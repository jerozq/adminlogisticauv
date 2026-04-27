-- ============================================================
-- Agregar columna actualizado_por a tablas de ejecución
-- Para auditoría: registra el UUID del usuario que hizo el cambio
-- ============================================================

ALTER TABLE public.ejecucion_costos
  ADD COLUMN IF NOT EXISTS actualizado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.bitacora_entregas
  ADD COLUMN IF NOT EXISTS actualizado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.ejecucion_costos.actualizado_por IS 'UUID del usuario autenticado que registró o modificó el costo';
COMMENT ON COLUMN public.bitacora_entregas.actualizado_por IS 'UUID del usuario autenticado que registró o modificó la entrega';
