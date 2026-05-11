-- ============================================================
-- RLS: Política anon para items_requerimiento
--
-- La tabla fue creada con política solo para "authenticated".
-- Las server actions usan el anon key sin sesión de usuario,
-- lo que requiere también una política permisiva para "anon".
-- ============================================================

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'items_requerimiento'
      AND policyname = 'items_requerimiento_anon_all'
  ) THEN
    CREATE POLICY "items_requerimiento_anon_all"
      ON public.items_requerimiento
      FOR ALL
      TO anon
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- Misma corrección para las otras tablas del mismo bloque
-- por si les falta la política anon (cuentas_virtuales, movimientos_bancarios, soportes_proyecto)

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'cuentas_virtuales'
      AND policyname = 'cuentas_virtuales_anon_all'
  ) THEN
    CREATE POLICY "cuentas_virtuales_anon_all"
      ON public.cuentas_virtuales
      FOR ALL
      TO anon
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'movimientos_bancarios'
      AND policyname = 'movimientos_bancarios_anon_all'
  ) THEN
    CREATE POLICY "movimientos_bancarios_anon_all"
      ON public.movimientos_bancarios
      FOR ALL
      TO anon
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'soportes_proyecto'
      AND policyname = 'soportes_proyecto_anon_all'
  ) THEN
    CREATE POLICY "soportes_proyecto_anon_all"
      ON public.soportes_proyecto
      FOR ALL
      TO anon
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;
