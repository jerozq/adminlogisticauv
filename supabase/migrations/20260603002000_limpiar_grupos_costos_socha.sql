-- ============================================================
-- Limpieza de grupos de costos temporales para una actividad
--
-- La actividad limpiada dejó un grupo de costos y su pago asociado
-- como residuo, lo que inflaba el total de "Costos registrados".
--
-- Esta migración elimina primero los pagos de grupo en
-- `ejecucion_costos` y luego los grupos en
-- `grupos_costos_liquidacion`, ambos restringidos al mismo
-- `actividad_id`.
-- ============================================================

WITH pagos_grupo_eliminados AS (
  DELETE FROM public.ejecucion_costos
  WHERE actividad_id = '47f4ae96-9cf8-4ccc-89fa-a7d908832f55'
    AND grupo_id IS NOT NULL
  RETURNING id
), grupos_eliminados AS (
  DELETE FROM public.grupos_costos_liquidacion
  WHERE actividad_id = '47f4ae96-9cf8-4ccc-89fa-a7d908832f55'
  RETURNING id
)
SELECT
  (SELECT COUNT(*) FROM pagos_grupo_eliminados) AS pagos_grupo_eliminados,
  (SELECT COUNT(*) FROM grupos_eliminados) AS grupos_eliminados;