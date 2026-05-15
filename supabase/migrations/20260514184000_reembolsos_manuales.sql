-- ============================================================
-- Persistencia de reembolsos manuales (CRUD Ejecucion/Formatos)
--
-- Problema: el repositorio en memoria pierde cambios al recargar.
-- Solucion: tabla durable para overrides manuales de reembolsos.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.reembolsos_manuales (
  id            text PRIMARY KEY,
  actividad_id  uuid NOT NULL REFERENCES public.requerimientos(id) ON DELETE CASCADE,
  tipo          text NOT NULL CHECK (tipo IN ('TRANSPORTE', 'INHUMACION')),
  persona_nombre text NOT NULL,
  documento     text NOT NULL,
  celular       text NULL,
  ruta_origen   text NOT NULL DEFAULT '',
  ruta_destino  text NOT NULL DEFAULT '',
  fecha         date NOT NULL,
  valor         numeric(12,2) NOT NULL CHECK (valor > 0),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reembolsos_manuales_actividad
  ON public.reembolsos_manuales (actividad_id);

ALTER TABLE public.reembolsos_manuales ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'reembolsos_manuales'
      AND policyname = 'reembolsos_manuales_authenticated_all'
  ) THEN
    CREATE POLICY reembolsos_manuales_authenticated_all
      ON public.reembolsos_manuales
      FOR ALL
      TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'reembolsos_manuales'
      AND policyname = 'reembolsos_manuales_anon_all'
  ) THEN
    CREATE POLICY reembolsos_manuales_anon_all
      ON public.reembolsos_manuales
      FOR ALL
      TO anon
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.reembolsos_manuales TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reembolsos_manuales TO authenticated;
