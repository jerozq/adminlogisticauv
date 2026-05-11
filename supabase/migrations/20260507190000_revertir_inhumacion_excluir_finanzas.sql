-- Revertir exclusión financiera de ítems de inhumación.
-- La inhumación se trata como ítem OPERATIVO regular:
-- la diferencia cotizado vs costo real es utilidad absorbida por la Retención Global.
UPDATE public.cotizacion_items
SET excluir_de_finanzas = FALSE
WHERE codigo_item = 'INHUMACION'
  AND excluir_de_finanzas = TRUE;
