-- Añadir campos para manejo especial de Inhumación y Transporte
ALTER TABLE public.cotizacion_items
ADD COLUMN IF NOT EXISTS excluir_de_finanzas BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS ocultar_en_cotizacion BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN public.cotizacion_items.excluir_de_finanzas IS 'Si es TRUE, el valor de este ítem no suma para el subtotal de servicios (ej: Inhumación)';
COMMENT ON COLUMN public.cotizacion_items.ocultar_en_cotizacion IS 'Si es TRUE, el ítem no se debe mostrar en la plantilla de exportación (ej: Transporte)';
