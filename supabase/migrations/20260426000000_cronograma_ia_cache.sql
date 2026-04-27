-- ============================================================
-- Caché de cronograma generado por IA
-- Evita llamadas redundantes a Gemini y errores 429.
-- ============================================================

ALTER TABLE requerimientos
  ADD COLUMN IF NOT EXISTS cronograma_ia JSONB DEFAULT NULL;

COMMENT ON COLUMN requerimientos.cronograma_ia IS
  'Cache del cronograma operativo generado por Gemini. Formato: [{descripcion, hora, dia, categoria}]. Nulo si aún no se ha generado.';
