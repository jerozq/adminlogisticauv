-- Agregar número de celular por beneficiario en items_requerimiento
-- Corresponde al campo "CELULAR" / "TELÉFONO" de la hoja ALOJAMIENTO del Excel UARIV.

ALTER TABLE public.items_requerimiento
  ADD COLUMN IF NOT EXISTS beneficiario_celular TEXT;

COMMENT ON COLUMN public.items_requerimiento.beneficiario_celular
  IS 'Número de celular del beneficiario de reembolso, extraído de la hoja ALOJAMIENTO del Excel UARIV.';
