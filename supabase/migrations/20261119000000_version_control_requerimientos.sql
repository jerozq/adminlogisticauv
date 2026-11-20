-- ============================================================
-- Control de versiones para requerimientos/cotizaciones
--
-- Problema: la UI de /cotizaciones/[id]/editar mostraba "Cotización v1"
-- y una "Línea de Tiempo" siempre fija en 1 entrada, porque
-- cargarCotizacion() / listarHistorialCotizaciones() devolvían
-- version: 1 e historial hardcodeados. actualizarCotizacion() hacía
-- DELETE+INSERT directo sobre items_requerimiento sin dejar rastro
-- de quién cambió qué ni cuándo (las tablas antiguas cotizaciones/
-- cotizacion_items/cotizacion_historial del módulo original quedaron
-- huérfanas: el modelo real hoy es requerimientos + items_requerimiento).
--
-- Esta migración:
--   1. Agrega una columna version real a requerimientos.
--   2. Crea requerimiento_historial para registrar cada guardado
--      (usuario, fecha, resumen de cambios, snapshot antes/después).
-- ============================================================

ALTER TABLE public.requerimientos
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS public.requerimiento_historial (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requerimiento_id UUID NOT NULL REFERENCES public.requerimientos(id) ON DELETE CASCADE,
  version          INTEGER NOT NULL,
  usuario_email    TEXT,
  resumen_cambios  TEXT,
  datos_anteriores JSONB,
  datos_nuevos     JSONB,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_requerimiento_historial_req
  ON public.requerimiento_historial(requerimiento_id);

ALTER TABLE public.requerimiento_historial ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'requerimiento_historial'
      AND policyname = 'requerimiento_historial_auth_all'
  ) THEN
    CREATE POLICY "requerimiento_historial_auth_all"
      ON public.requerimiento_historial FOR ALL TO authenticated
      USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'requerimiento_historial'
      AND policyname = 'requerimiento_historial_anon_all'
  ) THEN
    CREATE POLICY "requerimiento_historial_anon_all"
      ON public.requerimiento_historial FOR ALL TO anon
      USING (true) WITH CHECK (true);
  END IF;
END $$;
