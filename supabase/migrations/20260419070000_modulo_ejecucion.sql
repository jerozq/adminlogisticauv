-- ============================================================
-- MÓDULO DE EJECUCIÓN Y COSTOS REALES
-- Tablas: bitacora_entregas, ejecucion_costos
-- Storage: bucket 'evidencias' (evidencias de campo + facturas)
-- ============================================================

-- Bitácora de hitos / entregas de campo
CREATE TABLE IF NOT EXISTS public.bitacora_entregas (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  actividad_id      UUID        NOT NULL REFERENCES public.requerimientos(id) ON DELETE CASCADE,
  descripcion       TEXT        NOT NULL,
  fecha_hora_limite TIMESTAMPTZ NOT NULL,
  estado            TEXT        NOT NULL DEFAULT 'pendiente'
                                CHECK (estado IN ('pendiente', 'listo')),
  evidencia_url     TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- Costos reales de operación (lo que realmente costó cada ítem)
CREATE TABLE IF NOT EXISTS public.ejecucion_costos (
  id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  actividad_id UUID          NOT NULL REFERENCES public.requerimientos(id) ON DELETE CASCADE,
  -- Referencia opcional al ítem cotizado para calcular utilidad
  item_id      UUID          REFERENCES public.cotizacion_items(id) ON DELETE SET NULL,
  descripcion  TEXT,
  monto        DECIMAL(15,2) NOT NULL DEFAULT 0,
  -- Quién puso el dinero: Jero de su bolsillo, Socio de su bolsillo, o fondos del proyecto
  pagador      TEXT          NOT NULL DEFAULT 'jero'
                             CHECK (pagador IN ('jero', 'socio', 'caja_proyecto')),
  soporte_url  TEXT,         -- URL foto de factura en Storage
  notas        TEXT,
  created_at   TIMESTAMPTZ   DEFAULT NOW(),
  updated_at   TIMESTAMPTZ   DEFAULT NOW()
);

-- ============================================================
-- ÍNDICES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_bitacora_actividad ON public.bitacora_entregas(actividad_id);
CREATE INDEX IF NOT EXISTS idx_bitacora_estado    ON public.bitacora_entregas(estado);
CREATE INDEX IF NOT EXISTS idx_costos_actividad   ON public.ejecucion_costos(actividad_id);
CREATE INDEX IF NOT EXISTS idx_costos_pagador     ON public.ejecucion_costos(pagador);

-- ============================================================
-- TRIGGERS updated_at (reutiliza la función de migración anterior)
-- ============================================================
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_bitacora_updated_at'
  ) THEN
    CREATE TRIGGER trg_bitacora_updated_at
      BEFORE UPDATE ON public.bitacora_entregas
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_costos_updated_at'
  ) THEN
    CREATE TRIGGER trg_costos_updated_at
      BEFORE UPDATE ON public.ejecucion_costos
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

-- ============================================================
-- SUPABASE STORAGE: bucket para evidencias de campo y facturas
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'evidencias',
  'evidencias',
  true,
  10485760,  -- 10 MB por archivo
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- Lectura pública (URLs directas para visualizar evidencias)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'evidencias_public_select'
  ) THEN
    CREATE POLICY "evidencias_public_select" ON storage.objects
      FOR SELECT USING (bucket_id = 'evidencias');
  END IF;
END $$;

-- Inserción anónima (operación de campo sin autenticación)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'evidencias_anon_insert'
  ) THEN
    CREATE POLICY "evidencias_anon_insert" ON storage.objects
      FOR INSERT WITH CHECK (bucket_id = 'evidencias');
  END IF;
END $$;
