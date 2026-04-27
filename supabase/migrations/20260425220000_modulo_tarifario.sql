-- ─────────────────────────────────────────────────────────────────────────────
-- Módulo Tarifario: historial de precios + soporte para ítems personalizados
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Ampliar tarifario_2026 con campos de gestión
ALTER TABLE public.tarifario_2026
  ADD COLUMN IF NOT EXISTS activo           BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS es_personalizado BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notas            TEXT;

-- 2. Tabla de historial de precios
CREATE TABLE IF NOT EXISTS public.tarifario_historial_precios (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tarifario_id    UUID         NOT NULL REFERENCES public.tarifario_2026(id) ON DELETE CASCADE,
  precio_anterior DECIMAL(15,2) NOT NULL,
  precio_nuevo    DECIMAL(15,2) NOT NULL,
  usuario         TEXT         NOT NULL DEFAULT 'sistema',
  motivo          TEXT,
  cambiado_en     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_historial_tarifario_id
  ON public.tarifario_historial_precios(tarifario_id);

CREATE INDEX IF NOT EXISTS idx_historial_cambiado_en
  ON public.tarifario_historial_precios(cambiado_en DESC);

-- 3. Función para actualizar precio y registrar historial en una sola transacción
CREATE OR REPLACE FUNCTION public.actualizar_precio_tarifario(
  p_tarifario_id   UUID,
  p_precio_nuevo   DECIMAL(15,2),
  p_usuario        TEXT DEFAULT 'sistema',
  p_motivo         TEXT DEFAULT NULL
)
RETURNS public.tarifario_historial_precios
LANGUAGE plpgsql
AS $$
DECLARE
  v_precio_anterior DECIMAL(15,2);
  v_historial       public.tarifario_historial_precios;
BEGIN
  SELECT precio_venta INTO v_precio_anterior
  FROM public.tarifario_2026
  WHERE id = p_tarifario_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item tarifario con id % no encontrado', p_tarifario_id;
  END IF;

  UPDATE public.tarifario_2026
  SET precio_venta = p_precio_nuevo
  WHERE id = p_tarifario_id;

  INSERT INTO public.tarifario_historial_precios
    (tarifario_id, precio_anterior, precio_nuevo, usuario, motivo)
  VALUES
    (p_tarifario_id, v_precio_anterior, p_precio_nuevo, p_usuario, p_motivo)
  RETURNING * INTO v_historial;

  RETURN v_historial;
END;
$$;
