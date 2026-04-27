-- =============================================================================
-- Módulo: Historial de estados y transiciones validadas
-- =============================================================================

-- 1. Tabla de auditoría de cambios de estado
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.historial_estados (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  requerimiento_id uuid        NOT NULL REFERENCES public.requerimientos(id) ON DELETE CASCADE,
  estado_anterior  text        NOT NULL,
  estado_nuevo     text        NOT NULL,
  motivo           text,
  autor            text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS historial_estados_req_idx
  ON public.historial_estados (requerimiento_id, created_at DESC);

-- 2. Asegurar que el ENUM de estados cubre todos los valores necesarios
-- =============================================================================
ALTER TABLE public.requerimientos
  DROP CONSTRAINT IF EXISTS requerimientos_estado_check;

ALTER TABLE public.requerimientos
  ADD CONSTRAINT requerimientos_estado_check
  CHECK (estado IN ('cargado', 'generado', 'en_ejecucion', 'liquidado', 'aplazado', 'cancelado'));

-- 3. Función RPC centralizada con validación estricta de transiciones
-- =============================================================================
CREATE OR REPLACE FUNCTION public.cambiar_estado_requerimiento(
  p_requerimiento_id uuid,
  p_nuevo_estado      text,
  p_motivo            text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_estado_actual text;
  v_permitidos    text[];
BEGIN
  -- Bloquear fila y leer estado actual
  SELECT estado
  INTO   v_estado_actual
  FROM   public.requerimientos
  WHERE  id = p_requerimiento_id
  FOR UPDATE;

  IF v_estado_actual IS NULL THEN
    RAISE EXCEPTION 'Requerimiento no encontrado: %', p_requerimiento_id;
  END IF;

  -- Definir transiciones permitidas para cada estado
  CASE v_estado_actual
    WHEN 'generado'     THEN v_permitidos := ARRAY['en_ejecucion', 'cancelado'];
    WHEN 'en_ejecucion' THEN v_permitidos := ARRAY['aplazado', 'liquidado', 'cancelado'];
    WHEN 'aplazado'     THEN v_permitidos := ARRAY['en_ejecucion'];
    ELSE                     v_permitidos := ARRAY[]::text[];  -- liquidado / cancelado son finales
  END CASE;

  -- Validar que la transición sea legal
  IF NOT (p_nuevo_estado = ANY(v_permitidos)) THEN
    IF array_length(v_permitidos, 1) IS NULL THEN
      RAISE EXCEPTION 'El estado "%" es final y no permite cambios.', v_estado_actual;
    ELSE
      RAISE EXCEPTION 'Transición inválida: "%" → "%". Estados permitidos desde aquí: [%]',
        v_estado_actual,
        p_nuevo_estado,
        array_to_string(v_permitidos, ', ');
    END IF;
  END IF;

  -- Aplicar cambio de estado
  UPDATE public.requerimientos
  SET    estado = p_nuevo_estado
  WHERE  id = p_requerimiento_id;

  -- Registrar en bitácora de auditoría
  INSERT INTO public.historial_estados (requerimiento_id, estado_anterior, estado_nuevo, motivo)
  VALUES (p_requerimiento_id, v_estado_actual, p_nuevo_estado, p_motivo);
END;
$$;
