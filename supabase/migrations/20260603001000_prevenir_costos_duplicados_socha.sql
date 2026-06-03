-- ============================================================
-- Prevención de costos duplicados para la actividad corregida
--
-- Este índice único parcial bloquea inserciones duplicadas exactas
-- en `ejecucion_costos` para la actividad específica limpiada en la
-- migración anterior.
--
-- Se usan los mismos campos de negocio del script de limpieza para
-- evitar que el mismo costo vuelva a entrar con otro `id`.
-- ============================================================

CREATE UNIQUE INDEX IF NOT EXISTS ux_ejecucion_costos_socha_actividad_dup
  ON public.ejecucion_costos (
    actividad_id,
    COALESCE(item_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(descripcion, ''),
    monto,
    COALESCE(pagador, ''),
    COALESCE(modo_registro, 'por_item'),
    COALESCE(cantidad, 1),
    COALESCE(precio_unitario, -1),
    COALESCE(concepto, ''),
    COALESCE(soporte_url, '')
  )
  WHERE actividad_id = '47f4ae96-9cf8-4ccc-89fa-a7d908832f55';

COMMENT ON INDEX public.ux_ejecucion_costos_socha_actividad_dup IS
  'Evita duplicados exactos en ejecucion_costos para la actividad corregida de Socha.';