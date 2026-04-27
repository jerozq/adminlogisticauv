-- ============================================================
-- Migration: actividad_participaciones
-- Tabla para la distribución variable de utilidades por socio.
--
-- Relación: requerimientos 1-N actividad_participaciones
-- Cada fila representa el % de utilidad y aporte de capital
-- de un socio para una actividad específica.
-- ============================================================

CREATE TABLE IF NOT EXISTS actividad_participaciones (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actividad_id  uuid NOT NULL REFERENCES requerimientos(id) ON DELETE CASCADE,
  socio_id      text NOT NULL,           -- identificador del socio (slug o UUID de usuarios)
  nombre_socio  text NOT NULL,           -- desnormalizado para display rápido
  porcentaje    numeric(5, 2) NOT NULL   -- 0.00–100.00
    CHECK (porcentaje > 0 AND porcentaje <= 100),
  monto_aportado numeric(15, 2) NOT NULL DEFAULT 0
    CHECK (monto_aportado >= 0),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  -- Un socio solo puede aparecer una vez por actividad
  UNIQUE (actividad_id, socio_id)
);

-- Índice para carga rápida por actividad
CREATE INDEX IF NOT EXISTS idx_actividad_participaciones_actividad_id
  ON actividad_participaciones (actividad_id);

-- Trigger para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_participaciones_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_participaciones_updated_at ON actividad_participaciones;
CREATE TRIGGER trg_participaciones_updated_at
  BEFORE UPDATE ON actividad_participaciones
  FOR EACH ROW EXECUTE FUNCTION update_participaciones_updated_at();

-- ============================================================
-- Función RPC: redefinir_participaciones
--
-- Reemplaza en bloque la configuración de socios de una actividad.
-- Valida que la suma de porcentajes sea exactamente 100 antes
-- de aplicar los cambios (todo o nada).
--
-- Parámetros:
--   p_actividad_id  uuid
--   p_socios        jsonb  -- array: [{socio_id, nombre_socio, porcentaje, monto_aportado}]
-- ============================================================

CREATE OR REPLACE FUNCTION redefinir_participaciones(
  p_actividad_id uuid,
  p_socios       jsonb
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_suma numeric;
BEGIN
  -- Validar suma de porcentajes
  SELECT COALESCE(SUM((elem->>'porcentaje')::numeric), 0)
    INTO v_suma
    FROM jsonb_array_elements(p_socios) AS elem;

  IF ABS(v_suma - 100) > 0.01 THEN
    RAISE EXCEPTION
      'La suma de porcentajes debe ser 100%%. Suma recibida: %', v_suma;
  END IF;

  -- Borrar configuración anterior
  DELETE FROM actividad_participaciones
    WHERE actividad_id = p_actividad_id;

  -- Insertar la nueva configuración
  INSERT INTO actividad_participaciones
    (actividad_id, socio_id, nombre_socio, porcentaje, monto_aportado)
  SELECT
    p_actividad_id,
    elem->>'socio_id',
    elem->>'nombre_socio',
    (elem->>'porcentaje')::numeric,
    COALESCE((elem->>'monto_aportado')::numeric, 0)
  FROM jsonb_array_elements(p_socios) AS elem;
END;
$$;

-- RLS: solo usuarios autenticados pueden leer/escribir (ajustar según necesidades)
ALTER TABLE actividad_participaciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_all_authenticated" ON actividad_participaciones
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);
