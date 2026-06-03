-- ============================================================
-- Limpieza de costos huérfanos por re-cotización de actividad
--
-- Cuando se re-edita la cotización, pueden quedar costos viejos
-- apuntando a item_id que ya no existe en items_requerimiento.
--
-- Esta migración elimina solo esos costos huérfanos para la
-- actividad indicada. No toca pagos de grupo ni costos manuales
-- sin item_id.
-- ============================================================

WITH costos_huerfanos AS (
  SELECT ec.id
  FROM public.ejecucion_costos ec
  WHERE ec.actividad_id = '47f4ae96-9cf8-4ccc-89fa-a7d908832f55'
    AND ec.grupo_id IS NULL
    AND ec.item_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.items_requerimiento ir
      WHERE ir.id = ec.item_id
        AND ir.requerimiento_id = ec.actividad_id
    )
), eliminados AS (
  DELETE FROM public.ejecucion_costos ec
  USING costos_huerfanos ch
  WHERE ec.id = ch.id
  RETURNING ec.id
)
SELECT COUNT(*) AS costos_huerfanos_eliminados
FROM eliminados;