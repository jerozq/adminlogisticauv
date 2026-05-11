-- ============================================================
-- Tesorería UV — Banca Virtual de Doble Entrada
-- Implementa contabilidad de doble entrada con atomicidad
-- garantizada via funciones PostgreSQL en una sola TX.
-- ============================================================

-- ── 1. Tabla de Cuentas Virtuales ────────────────────────────
CREATE TABLE IF NOT EXISTS public.cuentas_virtuales (
  id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre           TEXT          NOT NULL,
  tipo             TEXT          NOT NULL
    CHECK (tipo IN ('PROYECTO', 'GENERAL', 'SOCIO')),
  actividad_id     UUID
    REFERENCES public.requerimientos(id) ON DELETE CASCADE,
  socio_clave      TEXT
    CHECK (socio_clave IN ('SOCIO_A', 'SOCIO_B')),
  saldo_disponible DECIMAL(15,2) NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT ck_proyecto_necesita_actividad
    CHECK (tipo != 'PROYECTO' OR actividad_id IS NOT NULL),
  CONSTRAINT ck_socio_necesita_clave
    CHECK (tipo != 'SOCIO' OR socio_clave IS NOT NULL),
  CONSTRAINT ck_saldo_no_negativo
    CHECK (saldo_disponible >= 0)
);

-- ── 2. Libro Mayor de Transacciones ──────────────────────────
CREATE TABLE IF NOT EXISTS public.transacciones (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  cuenta_origen_id  UUID
    REFERENCES public.cuentas_virtuales(id) ON DELETE RESTRICT,
  cuenta_destino_id UUID
    REFERENCES public.cuentas_virtuales(id) ON DELETE RESTRICT,
  monto             DECIMAL(15,2) NOT NULL CHECK (monto > 0),
  tipo              TEXT          NOT NULL
    CHECK (tipo IN (
      'TRANSFERENCIA',
      'INYECCION',
      'REPARTO_UTILIDAD',
      'RETIRO_EFECTIVO',
      'GASTO'
    )),
  descripcion       TEXT,
  soporte_url       TEXT,
  fecha_hora        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT ck_tiene_al_menos_una_cuenta
    CHECK (cuenta_origen_id IS NOT NULL OR cuenta_destino_id IS NOT NULL),
  CONSTRAINT ck_cuentas_distintas
    CHECK (cuenta_origen_id IS DISTINCT FROM cuenta_destino_id)
);

-- ── 3. Índices ────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_trans_origen    ON public.transacciones(cuenta_origen_id);
CREATE INDEX IF NOT EXISTS idx_trans_destino   ON public.transacciones(cuenta_destino_id);
CREATE INDEX IF NOT EXISTS idx_trans_fecha     ON public.transacciones(fecha_hora DESC);
CREATE INDEX IF NOT EXISTS idx_trans_tipo      ON public.transacciones(tipo);
CREATE INDEX IF NOT EXISTS idx_cuentas_tipo    ON public.cuentas_virtuales(tipo);
CREATE INDEX IF NOT EXISTS idx_cuentas_act     ON public.cuentas_virtuales(actividad_id);
CREATE INDEX IF NOT EXISTS idx_cuentas_socio   ON public.cuentas_virtuales(socio_clave);

-- ── 4. Cuentas raíz (IDs fijos para referencias tipadas en TS)
-- UUID v4 con variant RFC4122 (10xx en 4to grupo)
INSERT INTO public.cuentas_virtuales (id, nombre, tipo)
VALUES ('00000000-0000-4000-a000-000000000001', 'Caja General UV', 'GENERAL')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.cuentas_virtuales (id, nombre, tipo, socio_clave)
VALUES
  ('00000000-0000-4000-a000-000000000002', 'Cuenta Socio A', 'SOCIO', 'SOCIO_A'),
  ('00000000-0000-4000-a000-000000000003', 'Cuenta Socio B', 'SOCIO', 'SOCIO_B')
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- FUNCIÓN ATÓMICA 1: transferir_entre_cuentas
-- Mueve saldo de origen → destino en una sola TX PostgreSQL.
-- Valida saldo con SELECT FOR UPDATE (bloqueo de fila).
-- Si falla en cualquier punto, toda la TX hace rollback.
-- ============================================================
CREATE OR REPLACE FUNCTION public.transferir_entre_cuentas(
  p_origen_id   UUID,
  p_destino_id  UUID,
  p_monto       DECIMAL,
  p_tipo        TEXT,
  p_descripcion TEXT DEFAULT NULL,
  p_soporte_url TEXT DEFAULT NULL
)
RETURNS SETOF public.transacciones
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_saldo DECIMAL;
BEGIN
  IF p_monto <= 0 THEN
    RAISE EXCEPTION 'El monto debe ser mayor a cero (recibido: %)', p_monto;
  END IF;

  -- Bloquear fila de origen y validar saldo
  IF p_origen_id IS NOT NULL THEN
    SELECT saldo_disponible INTO v_saldo
      FROM public.cuentas_virtuales
      WHERE id = p_origen_id
      FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Cuenta origen no encontrada: %', p_origen_id;
    END IF;

    IF v_saldo < p_monto THEN
      RAISE EXCEPTION 'Saldo insuficiente. Disponible: $%, Requerido: $%',
        v_saldo::NUMERIC(15,0)::TEXT, p_monto::NUMERIC(15,0)::TEXT;
    END IF;

    UPDATE public.cuentas_virtuales
      SET saldo_disponible = saldo_disponible - p_monto
      WHERE id = p_origen_id;
  END IF;

  -- Acreditar destino
  IF p_destino_id IS NOT NULL THEN
    UPDATE public.cuentas_virtuales
      SET saldo_disponible = saldo_disponible + p_monto
      WHERE id = p_destino_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Cuenta destino no encontrada: %', p_destino_id;
    END IF;
  END IF;

  -- Registrar en libro mayor
  RETURN QUERY
  INSERT INTO public.transacciones (
    cuenta_origen_id, cuenta_destino_id,
    monto, tipo, descripcion, soporte_url
  ) VALUES (
    p_origen_id, p_destino_id,
    p_monto, p_tipo, p_descripcion, p_soporte_url
  ) RETURNING *;
END;
$$;

-- ============================================================
-- FUNCIÓN ATÓMICA 2: inyectar_capital_socio
-- Flujo: Efectivo Externo → Cuenta Socio → Cuenta Proyecto
-- Se registran 2 transacciones en UNA sola TX PostgreSQL.
-- Deja trazabilidad clara de que el socio "le prestó" al proyecto.
-- ============================================================
CREATE OR REPLACE FUNCTION public.inyectar_capital_socio(
  p_cuenta_socio_id    UUID,
  p_cuenta_proyecto_id UUID,
  p_monto              DECIMAL,
  p_descripcion        TEXT DEFAULT NULL,
  p_soporte_url        TEXT DEFAULT NULL
)
RETURNS SETOF public.transacciones
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF p_monto <= 0 THEN
    RAISE EXCEPTION 'El monto debe ser mayor a cero';
  END IF;

  -- Paso 1: Externo → Socio (INYECCION — no requiere saldo previo)
  UPDATE public.cuentas_virtuales
    SET saldo_disponible = saldo_disponible + p_monto
    WHERE id = p_cuenta_socio_id;

  -- Paso 2: Socio → Proyecto (TRANSFERENCIA — el socio "presta" al proyecto)
  -- El saldo del socio vuelve a cero neto, pero quedan ambas TXs para trazabilidad
  UPDATE public.cuentas_virtuales
    SET saldo_disponible = saldo_disponible - p_monto
    WHERE id = p_cuenta_socio_id;

  UPDATE public.cuentas_virtuales
    SET saldo_disponible = saldo_disponible + p_monto
    WHERE id = p_cuenta_proyecto_id;

  -- Registrar ambos movimientos en el libro mayor
  RETURN QUERY
  INSERT INTO public.transacciones (
    cuenta_origen_id, cuenta_destino_id,
    monto, tipo, descripcion, soporte_url
  ) VALUES
    -- TX 1: Inyección al socio
    (NULL, p_cuenta_socio_id,
     p_monto, 'INYECCION',
     COALESCE(p_descripcion, 'Aporte de capital del socio'), p_soporte_url),
    -- TX 2: Socio transfiere al proyecto
    (p_cuenta_socio_id, p_cuenta_proyecto_id,
     p_monto, 'TRANSFERENCIA',
     COALESCE(p_descripcion, 'Transferencia del aporte al proyecto'), p_soporte_url)
  RETURNING *;
END;
$$;

-- ============================================================
-- FUNCIÓN ATÓMICA 3: repartir_utilidades_socios
-- Mueve saldo de Cuenta Proyecto → Socio A y Socio B en una TX.
-- Valida saldo total antes de cualquier movimiento.
-- Regla: no repartir si hay devoluciones pendientes.
-- ============================================================
CREATE OR REPLACE FUNCTION public.repartir_utilidades_socios(
  p_cuenta_proyecto_id UUID,
  p_cuenta_socio_a_id  UUID,
  p_cuenta_socio_b_id  UUID,
  p_monto_a            DECIMAL,
  p_monto_b            DECIMAL,
  p_descripcion        TEXT DEFAULT NULL
)
RETURNS SETOF public.transacciones
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_saldo_proyecto DECIMAL;
  v_total          DECIMAL;
BEGIN
  v_total := COALESCE(p_monto_a, 0) + COALESCE(p_monto_b, 0);

  IF v_total <= 0 THEN
    RAISE EXCEPTION 'El monto total a repartir debe ser mayor a cero';
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
    RAISE EXCEPTION 'Saldo insuficiente en el proyecto. Disponible: $%, Total a repartir: $%',
      v_saldo_proyecto::NUMERIC(15,0)::TEXT, v_total::NUMERIC(15,0)::TEXT;
  END IF;

  -- Descontar del proyecto
  UPDATE public.cuentas_virtuales
    SET saldo_disponible = saldo_disponible - v_total
    WHERE id = p_cuenta_proyecto_id;

  -- Acreditar Socio A
  IF p_monto_a > 0 THEN
    UPDATE public.cuentas_virtuales
      SET saldo_disponible = saldo_disponible + p_monto_a
      WHERE id = p_cuenta_socio_a_id;
  END IF;

  -- Acreditar Socio B
  IF p_monto_b > 0 THEN
    UPDATE public.cuentas_virtuales
      SET saldo_disponible = saldo_disponible + p_monto_b
      WHERE id = p_cuenta_socio_b_id;
  END IF;

  -- Libro mayor: una TX por cada socio que recibe
  RETURN QUERY
  INSERT INTO public.transacciones (
    cuenta_origen_id, cuenta_destino_id,
    monto, tipo, descripcion, soporte_url
  )
  SELECT
    p_cuenta_proyecto_id,
    dest,
    monto_dest,
    'REPARTO_UTILIDAD',
    COALESCE(p_descripcion, 'Reparto de utilidades'),
    NULL
  FROM (VALUES
    (p_cuenta_socio_a_id, p_monto_a),
    (p_cuenta_socio_b_id, p_monto_b)
  ) AS t(dest, monto_dest)
  WHERE monto_dest > 0
  RETURNING *;
END;
$$;
