-- ============================================================
-- Directorio de profesionales
--
-- El "responsable" de cada requerimiento ya existe como texto libre
-- (requerimientos.responsable_nombre/cedula/celular/correo), repetido
-- en cada actividad sin un lugar central para ver su historial.
--
-- Esta tabla NO reemplaza esas columnas (muchos componentes/PDFs ya
-- las usan) — es una capa liviana para enriquecer cada profesional
-- (especialidad, notas) y servir de directorio. El cruce con el
-- historial de actividades se hace por cédula en la capa de acciones
-- (actions/profesionales.ts), sin tocar requerimientos.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.profesionales (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cedula        TEXT UNIQUE,
  nombre        TEXT NOT NULL,
  celular       TEXT,
  correo        TEXT,
  especialidad  TEXT,
  notas         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profesionales_nombre ON public.profesionales(nombre);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_profesionales_updated_at'
  ) THEN
    CREATE TRIGGER trg_profesionales_updated_at
      BEFORE UPDATE ON public.profesionales
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

ALTER TABLE public.profesionales ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profesionales' AND policyname = 'profesionales_auth_all'
  ) THEN
    CREATE POLICY "profesionales_auth_all"
      ON public.profesionales FOR ALL TO authenticated
      USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profesionales' AND policyname = 'profesionales_anon_all'
  ) THEN
    CREATE POLICY "profesionales_anon_all"
      ON public.profesionales FOR ALL TO anon
      USING (true) WITH CHECK (true);
  END IF;
END $$;
