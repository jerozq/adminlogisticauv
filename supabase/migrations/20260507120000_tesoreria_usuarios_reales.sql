-- ============================================================
-- Tesorería: reemplazar "Socio A/B" hardcodeados por usuarios
-- reales de auth.users. Se agrega user_id a cuentas_virtuales
-- y se expone auth.users a través de una función SECURITY DEFINER.
-- ============================================================

-- ── 1. Agregar user_id a cuentas_virtuales ────────────────────
ALTER TABLE public.cuentas_virtuales
  ADD COLUMN IF NOT EXISTS user_id UUID
    REFERENCES auth.users(id) ON DELETE SET NULL;

-- ── 2. Eliminar las cuentas raíz fijas de Socio A/B ──────────
-- Deben borrarse ANTES de agregar la constraint (tienen user_id NULL)
DELETE FROM public.cuentas_virtuales
  WHERE id IN (
    '00000000-0000-4000-a000-000000000002',
    '00000000-0000-4000-a000-000000000003'
  );

-- ── 3. Actualizar constraint de SOCIO: ahora requiere user_id ─
ALTER TABLE public.cuentas_virtuales
  DROP CONSTRAINT IF EXISTS ck_socio_necesita_clave;

ALTER TABLE public.cuentas_virtuales
  ADD CONSTRAINT ck_socio_necesita_user_id
    CHECK (tipo != 'SOCIO' OR user_id IS NOT NULL);

-- ── 4. Eliminar columna socio_clave (reemplazada por user_id) ─
ALTER TABLE public.cuentas_virtuales
  DROP CONSTRAINT IF EXISTS cuentas_virtuales_socio_clave_check;

ALTER TABLE public.cuentas_virtuales
  DROP COLUMN IF EXISTS socio_clave;

-- ── 5. Índice en user_id ──────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_cuentas_user_id ON public.cuentas_virtuales(user_id);

-- ============================================================
-- FUNCIÓN SEGURA: listar_usuarios_registrados
-- Expone auth.users (solo id + email + nombre + fecha) a la
-- capa de aplicación usando SECURITY DEFINER (corre como postgres,
-- tiene permiso sobre auth.*).
-- ============================================================
CREATE OR REPLACE FUNCTION public.listar_usuarios_registrados()
RETURNS TABLE (
  id         UUID,
  email      TEXT,
  nombre     TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT
    id,
    email,
    COALESCE(
      raw_user_meta_data->>'full_name',
      raw_user_meta_data->>'name',
      split_part(email, '@', 1)
    ) AS nombre,
    created_at
  FROM auth.users
  ORDER BY created_at;
$$;

-- Permitir que usuarios autenticados y anon la ejecuten
GRANT EXECUTE ON FUNCTION public.listar_usuarios_registrados() TO authenticated;
GRANT EXECUTE ON FUNCTION public.listar_usuarios_registrados() TO anon;

-- ============================================================
-- ACTUALIZAR RPC repartir_utilidades_socios → variable
-- Acepta JSONB con N destinatarios: [{"cuenta_id":"...","monto":...}, ...]
-- ============================================================
DROP FUNCTION IF EXISTS public.repartir_utilidades_socios(UUID, UUID, UUID, DECIMAL, DECIMAL, TEXT);

CREATE OR REPLACE FUNCTION public.repartir_utilidades_variable(
  p_cuenta_proyecto_id UUID,
  p_descripcion        TEXT DEFAULT NULL,
  p_repartos           JSONB DEFAULT '[]'
  -- formato: [{"cuenta_id": "uuid", "monto": 500000}, ...]
)
RETURNS SETOF public.transacciones
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_saldo_proyecto DECIMAL;
  v_total          DECIMAL := 0;
  v_item           JSONB;
  v_cuenta_id      UUID;
  v_monto          DECIMAL;
BEGIN
  -- Calcular total a repartir
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_repartos) LOOP
    v_total := v_total + (v_item->>'monto')::DECIMAL;
  END LOOP;

  IF v_total <= 0 THEN
    RAISE EXCEPTION 'El total a repartir debe ser mayor a cero';
  END IF;

  -- Bloquear y validar saldo del proyecto
  SELECT saldo_disponible INTO v_saldo_proyecto
    FROM public.cuentas_virtuales
    WHERE id = p_cuenta_proyecto_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cuenta de proyecto no encontrada: %', p_cuenta_proyecto_id;
  END IF;

  IF v_saldo_proyecto < v_total THEN
    RAISE EXCEPTION 'Saldo insuficiente. Disponible: $%, Total a repartir: $%',
      v_saldo_proyecto::NUMERIC(15,0)::TEXT, v_total::NUMERIC(15,0)::TEXT;
  END IF;

  -- Descontar del proyecto
  UPDATE public.cuentas_virtuales
    SET saldo_disponible = saldo_disponible - v_total
    WHERE id = p_cuenta_proyecto_id;

  -- Acreditar a cada destinatario + registrar en libro mayor
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_repartos) LOOP
    v_cuenta_id := (v_item->>'cuenta_id')::UUID;
    v_monto     := (v_item->>'monto')::DECIMAL;

    IF v_monto <= 0 THEN CONTINUE; END IF;

    UPDATE public.cuentas_virtuales
      SET saldo_disponible = saldo_disponible + v_monto
      WHERE id = v_cuenta_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Cuenta destino no encontrada: %', v_cuenta_id;
    END IF;

    RETURN QUERY
    INSERT INTO public.transacciones (
      cuenta_origen_id, cuenta_destino_id,
      monto, tipo, descripcion
    ) VALUES (
      p_cuenta_proyecto_id, v_cuenta_id,
      v_monto, 'REPARTO_UTILIDAD',
      COALESCE(p_descripcion, 'Reparto de utilidades')
    ) RETURNING *;
  END LOOP;
END;
$$;
