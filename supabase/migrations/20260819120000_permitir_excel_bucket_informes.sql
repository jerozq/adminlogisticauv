-- ============================================================
-- Permitir subir archivos Excel (xlsx/xlsm/xls) al bucket 'informes'
--
-- El bucket 'informes' (20260513000000_modulo_informes.sql) solo
-- permitía imágenes y PDF. Pero subirArchivoRequerimiento()
-- (actions/cotizaciones.ts) sube el archivo original del
-- requerimiento (Excel) a ese mismo bucket, causando el error:
-- "mime type application/vnd.openxmlformats-officedocument.spreadsheetml.sheet is not supported"
-- ============================================================

UPDATE storage.buckets
SET allowed_mime_types = allowed_mime_types || ARRAY[
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel.sheet.macroEnabled.12',
  'application/vnd.ms-excel'
]
WHERE id = 'informes'
  AND NOT ('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' = ANY(allowed_mime_types));
