-- ============================================================
-- Tabla: grupos_costos_liquidacion
-- Permite agrupar varios ítems de una cotización y registrar
-- un costo total para el grupo sin desglosar por ítem.
-- Un ítem puede pertenecer a varios grupos simultáneamente.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.grupos_costos_liquidacion (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  actividad_id  uuid        NOT NULL REFERENCES public.requerimientos(id) ON DELETE CASCADE,
  nombre        text        NOT NULL CHECK (char_length(nombre) > 0),
  monto_total   numeric     NOT NULL DEFAULT 0 CHECK (monto_total >= 0),
  items_ids     uuid[]      NOT NULL DEFAULT '{}',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_grupos_costos_actividad
  ON public.grupos_costos_liquidacion (actividad_id);

-- Trigger: actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION public.set_updated_at_grupos_costos()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_grupos_costos_updated_at
  BEFORE UPDATE ON public.grupos_costos_liquidacion
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_grupos_costos();

-- RLS
ALTER TABLE public.grupos_costos_liquidacion ENABLE ROW LEVEL SECURITY;

-- Usuarios autenticados: acceso completo a los grupos de sus actividades
CREATE POLICY "authenticated_full_access_grupos_costos"
  ON public.grupos_costos_liquidacion
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE public.grupos_costos_liquidacion IS
  'Grupos de ítems cotizados con un costo total único. Permite registrar "estos N ítems me costaron X" sin desglose por ítem.';
COMMENT ON COLUMN public.grupos_costos_liquidacion.items_ids IS
  'Array de IDs de items_requerimiento incluidos en el grupo. Un ítem puede estar en varios grupos.';
COMMENT ON COLUMN public.grupos_costos_liquidacion.monto_total IS
  'Costo total real del grupo, sin distribución entre ítems.';
