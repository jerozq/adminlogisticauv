-- Módulo de edición de documentos por proyecto (Cotización / Cuenta de Cobro)

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tipo_documento_proyecto') THEN
    CREATE TYPE tipo_documento_proyecto AS ENUM ('COTIZACION', 'CUENTA_COBRO');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.documentos_proyecto (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proyecto_id uuid NOT NULL REFERENCES public.requerimientos(id) ON DELETE CASCADE,
  tipo_documento tipo_documento_proyecto NOT NULL,
  contenido_html text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT documentos_proyecto_proyecto_tipo_unique UNIQUE (proyecto_id, tipo_documento)
);

CREATE INDEX IF NOT EXISTS idx_documentos_proyecto_proyecto_id
  ON public.documentos_proyecto (proyecto_id);

CREATE INDEX IF NOT EXISTS idx_documentos_proyecto_tipo
  ON public.documentos_proyecto (tipo_documento);

CREATE OR REPLACE FUNCTION public.set_documentos_proyecto_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_documentos_proyecto_updated_at ON public.documentos_proyecto;
CREATE TRIGGER trg_documentos_proyecto_updated_at
BEFORE UPDATE ON public.documentos_proyecto
FOR EACH ROW
EXECUTE FUNCTION public.set_documentos_proyecto_updated_at();

ALTER TABLE public.documentos_proyecto ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "documentos_proyecto_select_all" ON public.documentos_proyecto;
CREATE POLICY "documentos_proyecto_select_all"
  ON public.documentos_proyecto
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "documentos_proyecto_insert_all" ON public.documentos_proyecto;
CREATE POLICY "documentos_proyecto_insert_all"
  ON public.documentos_proyecto
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "documentos_proyecto_update_all" ON public.documentos_proyecto;
CREATE POLICY "documentos_proyecto_update_all"
  ON public.documentos_proyecto
  FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);
