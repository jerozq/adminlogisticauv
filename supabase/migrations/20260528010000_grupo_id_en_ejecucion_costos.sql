-- ============================================================
-- Migración: 20260528010000_grupo_id_en_ejecucion_costos.sql
--
-- Agrega la columna grupo_id a ejecucion_costos para registrar
-- pagos parciales asociados a grupos de costos.
-- Los pagos de grupo usan item_id = NULL y grupo_id = <uuid>.
-- ============================================================

ALTER TABLE public.ejecucion_costos
  ADD COLUMN IF NOT EXISTS grupo_id uuid NULL
    REFERENCES public.grupos_costos_liquidacion(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_costos_grupo
  ON public.ejecucion_costos(grupo_id)
  WHERE grupo_id IS NOT NULL;

COMMENT ON COLUMN public.ejecucion_costos.grupo_id IS
  'FK al grupo de costos al que pertenece este pago. NULL = pago de ítem individual.';
