-- ============================================================
-- Ampliar el campo pagador en ejecucion_costos
--
-- El diseño evolucionó: pagador ya no es un valor fijo sino
-- dinámico. Puede ser el UUID de un socio (quién puso el dinero)
-- o 'pago_unidad' (fondos directos del proyecto/UV).
--
-- La validación ahora es responsabilidad de la capa de aplicación.
-- ============================================================

-- Eliminar el CHECK constraint restrictivo (valores fijos obsoletos)
ALTER TABLE public.ejecucion_costos
  DROP CONSTRAINT IF EXISTS ejecucion_costos_pagador_check;

-- Actualizar el DEFAULT al nuevo valor estándar
ALTER TABLE public.ejecucion_costos
  ALTER COLUMN pagador SET DEFAULT 'pago_unidad';

COMMENT ON COLUMN public.ejecucion_costos.pagador IS
  'Origen del fondo: UUID de un socio (quién puso el dinero de su bolsillo) o ''pago_unidad'' (fondos del proyecto/UV).';
