-- Crear tabla bitacora_entregas si no existe
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

-- Crear índices
CREATE INDEX IF NOT EXISTS idx_bitacora_actividad ON public.bitacora_entregas(actividad_id);
CREATE INDEX IF NOT EXISTS idx_bitacora_estado    ON public.bitacora_entregas(estado);

-- Crear trigger para updated_at (si la función existe)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_bitacora_updated_at'
  ) THEN
    CREATE TRIGGER trg_bitacora_updated_at
      BEFORE UPDATE ON public.bitacora_entregas
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;
