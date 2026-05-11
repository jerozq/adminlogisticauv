-- Corregir ítems de inhumación existentes:
-- Los servicios de inhumación no generan ingreso real para la unidad
-- (el pagador gira directamente a la funeraria), por lo tanto se excluyen
-- de todos los cálculos financieros manteniendo su valor visible en la cotización.
UPDATE public.cotizacion_items
SET excluir_de_finanzas = TRUE
WHERE codigo_item = 'INHUMACION'
  AND excluir_de_finanzas = FALSE;
