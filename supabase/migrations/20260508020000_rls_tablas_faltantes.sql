-- ============================================================
-- RLS: Habilitar y agregar políticas para tablas que aparecen
-- como "RLS Disabled in Public" en Supabase Advisor.
--
-- Tablas afectadas:
--   1. public.requerimientos
--   2. public.cotizacion_historial
--   3. public.historial_estados
--   4. public.tarifario_2026
--   5. public.tarifario_historial_precios
--   6. public.bitacora_entregas
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. requerimientos
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.requerimientos ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'requerimientos'
      AND policyname = 'requerimientos_auth_all'
  ) THEN
    CREATE POLICY "requerimientos_auth_all"
      ON public.requerimientos FOR ALL TO authenticated
      USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'requerimientos'
      AND policyname = 'requerimientos_anon_all'
  ) THEN
    CREATE POLICY "requerimientos_anon_all"
      ON public.requerimientos FOR ALL TO anon
      USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────
-- 2. cotizacion_historial
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.cotizacion_historial ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'cotizacion_historial'
      AND policyname = 'cotizacion_historial_auth_all'
  ) THEN
    CREATE POLICY "cotizacion_historial_auth_all"
      ON public.cotizacion_historial FOR ALL TO authenticated
      USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'cotizacion_historial'
      AND policyname = 'cotizacion_historial_anon_all'
  ) THEN
    CREATE POLICY "cotizacion_historial_anon_all"
      ON public.cotizacion_historial FOR ALL TO anon
      USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────
-- 3. historial_estados
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.historial_estados ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'historial_estados'
      AND policyname = 'historial_estados_auth_all'
  ) THEN
    CREATE POLICY "historial_estados_auth_all"
      ON public.historial_estados FOR ALL TO authenticated
      USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'historial_estados'
      AND policyname = 'historial_estados_anon_all'
  ) THEN
    CREATE POLICY "historial_estados_anon_all"
      ON public.historial_estados FOR ALL TO anon
      USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────
-- 4. tarifario_2026
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.tarifario_2026 ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'tarifario_2026'
      AND policyname = 'tarifario_2026_auth_all'
  ) THEN
    CREATE POLICY "tarifario_2026_auth_all"
      ON public.tarifario_2026 FOR ALL TO authenticated
      USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'tarifario_2026'
      AND policyname = 'tarifario_2026_anon_all'
  ) THEN
    CREATE POLICY "tarifario_2026_anon_all"
      ON public.tarifario_2026 FOR ALL TO anon
      USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────
-- 5. tarifario_historial_precios
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.tarifario_historial_precios ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'tarifario_historial_precios'
      AND policyname = 'tarifario_historial_precios_auth_all'
  ) THEN
    CREATE POLICY "tarifario_historial_precios_auth_all"
      ON public.tarifario_historial_precios FOR ALL TO authenticated
      USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'tarifario_historial_precios'
      AND policyname = 'tarifario_historial_precios_anon_all'
  ) THEN
    CREATE POLICY "tarifario_historial_precios_anon_all"
      ON public.tarifario_historial_precios FOR ALL TO anon
      USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────
-- 6. bitacora_entregas
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.bitacora_entregas ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'bitacora_entregas'
      AND policyname = 'bitacora_entregas_auth_all'
  ) THEN
    CREATE POLICY "bitacora_entregas_auth_all"
      ON public.bitacora_entregas FOR ALL TO authenticated
      USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'bitacora_entregas'
      AND policyname = 'bitacora_entregas_anon_all'
  ) THEN
    CREATE POLICY "bitacora_entregas_anon_all"
      ON public.bitacora_entregas FOR ALL TO anon
      USING (true) WITH CHECK (true);
  END IF;
END $$;
