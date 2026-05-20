-- Paso B: Recolumna bitacora para alinear búsquedas a item_requerimiento_id
-- No es necesario si Paso A ya está aplicado, pero para documentar el modelo final:
-- bitacora_entregas ahora es 1:1 con items_requerimiento (1 entrega por ítem cotizado)
-- Los hitos sin item_requerimiento_id son ítems manuales añadidos en UI (compatibilidad hacia atrás)

-- Índice para búsquedas rápidas: actividad + item
CREATE INDEX IF NOT EXISTS idx_bitacora_actividad_item
  ON public.bitacora_entregas(actividad_id, item_requerimiento_id);
