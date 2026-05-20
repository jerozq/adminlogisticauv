-- Paso A: Vínculo fuerte item_requerimiento_id en bitacora_entregas
-- y campos de observación/fecha-entrega en items_requerimiento

ALTER TABLE public.bitacora_entregas
ADD COLUMN IF NOT EXISTS item_requerimiento_id UUID REFERENCES public.items_requerimiento(id) ON DELETE CASCADE;

COMMENT ON COLUMN public.bitacora_entregas.item_requerimiento_id IS
  'FK a items_requerimiento: vincula hito de agenda a ítem cotizado. Si se elimina el ítem, se elimina la entrega.';

CREATE INDEX IF NOT EXISTS idx_bitacora_item_requerimiento
  ON public.bitacora_entregas(item_requerimiento_id);

-- Campos en items_requerimiento para metadatos de entrega extraídos de observación
ALTER TABLE public.items_requerimiento
ADD COLUMN IF NOT EXISTS observacion_item TEXT DEFAULT NULL;

COMMENT ON COLUMN public.items_requerimiento.observacion_item IS
  'Observación o notas específicas del ítem (ej: restricciones, detalles de entrega, horario).';

ALTER TABLE public.items_requerimiento
ADD COLUMN IF NOT EXISTS fecha_entrega_estimada DATE DEFAULT NULL;

COMMENT ON COLUMN public.items_requerimiento.fecha_entrega_estimada IS
  'Fecha estimada de entrega/ejecución del ítem, extraída de observación o inferida.';

ALTER TABLE public.items_requerimiento
ADD COLUMN IF NOT EXISTS hora_entrega_estimada TIME DEFAULT NULL;

COMMENT ON COLUMN public.items_requerimiento.hora_entrega_estimada IS
  'Hora estimada de entrega/ejecución del ítem, extraída de observación o inferida.';
