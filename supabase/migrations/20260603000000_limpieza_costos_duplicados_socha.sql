-- ============================================================
-- Limpieza puntual de costos duplicados para actividades de Socha
--
-- Este script elimina filas duplicadas exactas en `ejecucion_costos`
-- para una sola actividad concreta.
--
-- Criterio de duplicado:
--   actividad_id + item_id + descripcion + monto + pagador +
--   modo_registro + cantidad + precio_unitario + concepto + soporte_url
--
-- Se conserva la fila más antigua de cada grupo y se eliminan las
-- posteriores.
-- ============================================================

WITH actividades_objetivo AS (
  SELECT id
  FROM public.requerimientos
  WHERE id = '47f4ae96-9cf8-4ccc-89fa-a7d908832f55'
), costos_ordenados AS (
  SELECT
    ec.id,
    row_number() OVER (
      PARTITION BY
        ec.actividad_id,
        COALESCE(ec.item_id, '00000000-0000-0000-0000-000000000000'::uuid),
        COALESCE(ec.descripcion, ''),
        ec.monto,
        COALESCE(ec.pagador, ''),
        COALESCE(ec.modo_registro, 'por_item'),
        COALESCE(ec.cantidad, 1),
        COALESCE(ec.precio_unitario, -1),
        COALESCE(ec.concepto, ''),
        COALESCE(ec.soporte_url, '')
      ORDER BY ec.created_at ASC, ec.id ASC
    ) AS rn
  FROM public.ejecucion_costos ec
  INNER JOIN actividades_objetivo ao ON ao.id = ec.actividad_id
), eliminados AS (
  DELETE FROM public.ejecucion_costos ec
  USING costos_ordenados co
  WHERE ec.id = co.id
    AND co.rn > 1
  RETURNING ec.id
)
SELECT
  COUNT(*) AS filas_eliminadas
FROM eliminados;

-- Verificación rápida: si devuelve filas, todavía hay grupos repetidos
-- en la(s) actividad(es) objetivo.
SELECT
  ec.actividad_id,
  ec.item_id,
  ec.descripcion,
  ec.monto,
  ec.pagador,
  ec.modo_registro,
  ec.cantidad,
  ec.precio_unitario,
  ec.concepto,
  ec.soporte_url,
  COUNT(*) AS repeticiones
FROM public.ejecucion_costos ec
INNER JOIN public.requerimientos r ON r.id = ec.actividad_id
WHERE r.id = '47f4ae96-9cf8-4ccc-89fa-a7d908832f55'
GROUP BY
  ec.actividad_id,
  ec.item_id,
  ec.descripcion,
  ec.monto,
  ec.pagador,
  ec.modo_registro,
  ec.cantidad,
  ec.precio_unitario,
  ec.concepto,
  ec.soporte_url
HAVING COUNT(*) > 1
ORDER BY ec.actividad_id, ec.descripcion, ec.monto;