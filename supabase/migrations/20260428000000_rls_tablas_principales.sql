-- ============================================================
-- RLS: Políticas de acceso para tablas principales de inserción
-- Garantiza que los roles authenticated y anon puedan ejecutar
-- INSERT, UPDATE, SELECT y DELETE sin restricciones de RLS.
--
-- Si RLS estaba deshabilitada, habilitarla + agregar políticas
-- permisivas es equivalente en comportamiento a no tenerla, PERO
-- protege contra activaciones accidentales desde el Dashboard.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. cotizacion_items
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.cotizacion_items ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'cotizacion_items'
      AND policyname = 'cotizacion_items_auth_all'
  ) THEN
    CREATE POLICY "cotizacion_items_auth_all"
      ON public.cotizacion_items
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
      AND tablename  = 'cotizacion_items'
      AND policyname = 'cotizacion_items_anon_all'
  ) THEN
    CREATE POLICY "cotizacion_items_anon_all"
      ON public.cotizacion_items
      FOR ALL
      TO anon
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────
-- 2. reembolsos_detalle
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.reembolsos_detalle ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'reembolsos_detalle'
      AND policyname = 'reembolsos_detalle_auth_all'
  ) THEN
    CREATE POLICY "reembolsos_detalle_auth_all"
      ON public.reembolsos_detalle
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
      AND tablename  = 'reembolsos_detalle'
      AND policyname = 'reembolsos_detalle_anon_all'
  ) THEN
    CREATE POLICY "reembolsos_detalle_anon_all"
      ON public.reembolsos_detalle
      FOR ALL
      TO anon
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────
-- 3. ejecucion_costos
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.ejecucion_costos ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'ejecucion_costos'
      AND policyname = 'ejecucion_costos_auth_all'
  ) THEN
    CREATE POLICY "ejecucion_costos_auth_all"
      ON public.ejecucion_costos
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
      AND tablename  = 'ejecucion_costos'
      AND policyname = 'ejecucion_costos_anon_all'
  ) THEN
    CREATE POLICY "ejecucion_costos_anon_all"
      ON public.ejecucion_costos
      FOR ALL
      TO anon
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────
-- Garantizar grants de Postgres para los roles de Supabase
-- (necesario en proyectos Supabase >=2024 con safe defaults)
-- ────────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cotizacion_items  TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reembolsos_detalle TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ejecucion_costos  TO authenticated, anon;
