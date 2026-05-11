-- ============================================================
-- FASE 1: RESET FINANCIERO — BANCA VIRTUAL
-- Wipe total del módulo financiero anterior e implementación
-- del nuevo modelo de Banca Virtual con cuentas por proyecto,
-- división 50/50 entre administradores y parser inteligente.
--
-- PRESERVA: requerimientos (core de proyecto), tarifario_2026,
--            bitacora_entregas, historial_estados, perfiles auth.
-- ============================================================

-- ── 0. ELIMINAR FUNCIONES PG del módulo anterior ─────────────
DROP FUNCTION IF EXISTS public.transferir_entre_cuentas(UUID, UUID, DECIMAL, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.inyectar_capital_socio(UUID, UUID, DECIMAL, TEXT, TEXT);

-- ── 1. DROP TABLAS FINANCIERAS (CASCADE limpia FKs huérfanas) ─
-- Orden: hijos antes que padres para evitar conflictos aunque
-- CASCADE se encarga; lo dejamos explícito para claridad.

DROP TABLE IF EXISTS public.transacciones                  CASCADE;
DROP TABLE IF EXISTS public.cuentas_por_pagar_socios       CASCADE;
DROP TABLE IF EXISTS public.ejecucion_costos               CASCADE;
DROP TABLE IF EXISTS public.reembolsos_detalle             CASCADE;
DROP TABLE IF EXISTS public.cotizacion_items               CASCADE;
DROP TABLE IF EXISTS public.cotizaciones                   CASCADE;
DROP TABLE IF EXISTS public.registro_abonos_unidad         CASCADE;
DROP TABLE IF EXISTS public.registro_devoluciones_unidad   CASCADE;
DROP TABLE IF EXISTS public.cuentas_virtuales              CASCADE;

-- ── 2. LIMPIAR COLUMNAS FINANCIERAS DE REQUERIMIENTOS ────────
-- Se eliminan columnas que solo tenían sentido en el modelo anterior.
ALTER TABLE public.requerimientos
  DROP COLUMN IF EXISTS abonos_recibidos,
  DROP COLUMN IF EXISTS retenciones_aplicadas,
  DROP COLUMN IF EXISTS devoluciones_pendientes_unidad,
  DROP COLUMN IF EXISTS numero_cuenta_cobro;

-- ── 3. NUEVA TABLA: cuentas_virtuales ────────────────────────
-- Modelo simplificado con numero_cuenta legible por humanos.
-- numero_cuenta: 'CTA-GENERAL', 'CTA-SOCIO-A', 'CTA-685PE', etc.
CREATE TABLE public.cuentas_virtuales (
  id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_cuenta    TEXT          NOT NULL UNIQUE,
  nombre           TEXT          NOT NULL,
  tipo             TEXT          NOT NULL
    CHECK (tipo IN ('PROYECTO', 'GENERAL', 'SOCIO')),
  saldo            DECIMAL(15,2) NOT NULL DEFAULT 0
    CHECK (saldo >= 0),
  -- Para tipo PROYECTO: referencia a la actividad
  requerimiento_id UUID
    REFERENCES public.requerimientos(id) ON DELETE CASCADE,
  -- Para tipo SOCIO: referencia al usuario real
  user_id          UUID
    REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  -- Validaciones de integridad por tipo
  CONSTRAINT ck_proyecto_necesita_requerimiento
    CHECK (tipo != 'PROYECTO' OR requerimiento_id IS NOT NULL),
  CONSTRAINT ck_socio_necesita_user
    CHECK (tipo != 'SOCIO' OR user_id IS NOT NULL)
);

COMMENT ON TABLE  public.cuentas_virtuales              IS 'Cuentas de la Banca Virtual. GENERAL=caja central, PROYECTO=por actividad, SOCIO=bolsillo individual.';
COMMENT ON COLUMN public.cuentas_virtuales.numero_cuenta IS 'Identificador legible: CTA-GENERAL, CTA-SOCIO-A, CTA-685PE, etc.';
COMMENT ON COLUMN public.cuentas_virtuales.saldo        IS 'Saldo disponible en COP. Se actualiza atómicamente vía trigger en movimientos_bancarios.';

-- ── 4. NUEVA TABLA: movimientos_bancarios ─────────────────────
-- Libro mayor de doble entrada. Cada operación financiera genera
-- un registro aquí. La actualización del saldo es atómica vía trigger.
CREATE TABLE public.movimientos_bancarios (
  id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Cuentas involucradas (al menos una debe ser no nula)
  origen_id    UUID
    REFERENCES public.cuentas_virtuales(id) ON DELETE RESTRICT,
  destino_id   UUID
    REFERENCES public.cuentas_virtuales(id) ON DELETE RESTRICT,
  monto        DECIMAL(15,2) NOT NULL
    CHECK (monto > 0),
  tipo         TEXT          NOT NULL
    CHECK (tipo IN (
      'INYECCION',     -- Entrada de dinero externo (sin origen interno)
      'PAGO_UNIDAD',   -- La UV gira dinero a la cuenta del proyecto
      'TRANSFERENCIA', -- Movimiento entre dos cuentas internas
      'GASTO',         -- Egreso del proyecto (sin destino interno)
      'REPARTO_50_50', -- División automática de utilidad entre socios
      'RETIRO'         -- Retiro de fondos por un socio
    )),
  descripcion  TEXT,
  soporte_url  TEXT,          -- URL al recibo/comprobante en Storage
  fecha        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  registrado_por UUID
    REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT ck_tiene_al_menos_una_cuenta
    CHECK (origen_id IS NOT NULL OR destino_id IS NOT NULL),
  CONSTRAINT ck_cuentas_distintas
    CHECK (origen_id IS DISTINCT FROM destino_id)
);

COMMENT ON TABLE  public.movimientos_bancarios       IS 'Libro mayor de todos los movimientos financieros. Doble entrada.';
COMMENT ON COLUMN public.movimientos_bancarios.tipo  IS 'INYECCION: capital externo. PAGO_UNIDAD: giro UV. TRANSFERENCIA: entre cuentas. GASTO: egreso. REPARTO_50_50: split de utilidad. RETIRO: retiro socio.';

-- ── 5. TRIGGER: actualizar saldo en cuentas_virtuales ─────────
-- Se ejecuta AFTER INSERT en movimientos_bancarios y actualiza
-- saldo del origen (-) y destino (+) en la misma TX.
CREATE OR REPLACE FUNCTION public.fn_actualizar_saldo_movimiento()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Debitar origen si existe
  IF NEW.origen_id IS NOT NULL THEN
    UPDATE public.cuentas_virtuales
      SET saldo     = saldo - NEW.monto,
          updated_at = NOW()
      WHERE id = NEW.origen_id;

    -- Verificar que el saldo no quedó negativo (constraint de tabla)
    IF (SELECT saldo FROM public.cuentas_virtuales WHERE id = NEW.origen_id) < 0 THEN
      RAISE EXCEPTION 'Saldo insuficiente en cuenta origen % (%.2f requerido)',
        NEW.origen_id, NEW.monto;
    END IF;
  END IF;

  -- Acreditar destino si existe
  IF NEW.destino_id IS NOT NULL THEN
    UPDATE public.cuentas_virtuales
      SET saldo     = saldo + NEW.monto,
          updated_at = NOW()
      WHERE id = NEW.destino_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_actualizar_saldo_movimiento
  AFTER INSERT ON public.movimientos_bancarios
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_actualizar_saldo_movimiento();

-- ── 6. NUEVA TABLA: soportes_proyecto ────────────────────────
-- Galería general de recibos/imágenes por proyecto.
-- NO atada a ítems individuales — es un álbum a nivel actividad.
CREATE TABLE public.soportes_proyecto (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  requerimiento_id UUID        NOT NULL
    REFERENCES public.requerimientos(id) ON DELETE CASCADE,
  tipo_archivo     TEXT        NOT NULL DEFAULT 'IMAGEN'
    CHECK (tipo_archivo IN ('IMAGEN', 'PDF', 'EXCEL', 'OTRO')),
  url              TEXT        NOT NULL,
  nombre_archivo   TEXT,
  descripcion      TEXT,
  -- Quién subió el soporte
  subido_por       UUID
    REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.soportes_proyecto IS 'Galería de soportes (recibos, PDFs, Excels) por proyecto/actividad. Sin atar a ítems individuales.';

-- ── 7. NUEVA TABLA: items_requerimiento ──────────────────────
-- Tabla unificada de cotización. Reemplaza cotizaciones +
-- cotizacion_items + reembolsos_detalle en un solo modelo plano.
-- Los ítems de reembolso llevan datos del beneficiario en la misma fila.
CREATE TABLE public.items_requerimiento (
  id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  requerimiento_id UUID          NOT NULL
    REFERENCES public.requerimientos(id) ON DELETE CASCADE,

  -- Referencia al tarifario (NULL para ítems manuales, PDF o LLM)
  tarifario_id     UUID
    REFERENCES public.tarifario_2026(id) ON DELETE SET NULL,
  codigo_item      TEXT,

  -- Descripción e identificación
  descripcion      TEXT          NOT NULL,
  categoria        TEXT,
  tipo             TEXT          NOT NULL DEFAULT 'SERVICIO'
    CHECK (tipo IN (
      'SERVICIO',       -- Ítem de servicio estándar
      'REEMBOLSO',      -- Passthrough para beneficiario (transporte, alojamiento)
      'PASIVO_TERCERO'  -- Inhumaciones u otros pasivos de terceros
    )),

  -- Valores económicos
  unidad_medida    TEXT,
  cantidad         DECIMAL(10,2) NOT NULL DEFAULT 1
    CHECK (cantidad > 0),
  precio_unitario  DECIMAL(15,2) NOT NULL DEFAULT 0
    CHECK (precio_unitario >= 0),
  precio_total     DECIMAL(15,2) GENERATED ALWAYS AS (cantidad * precio_unitario) STORED,

  -- Estado del ítem (para manejo de cancelaciones y no-asistencias)
  estado           TEXT          NOT NULL DEFAULT 'ACTIVO'
    CHECK (estado IN ('ACTIVO', 'CANCELADO', 'NO_ASISTIO')),

  -- Origen del ítem (para trazabilidad del parser inteligente)
  fuente           TEXT          NOT NULL DEFAULT 'manual'
    CHECK (fuente IN (
      'tarifario',  -- Seleccionado del tarifario
      'manual',     -- Ingresado a mano en UI
      'excel',      -- Extraído de un Excel
      'pdf',        -- Extraído de un PDF
      'llm'         -- Generado/sugerido por modelo LLM
    )),

  -- Datos del beneficiario (aplica cuando tipo = REEMBOLSO)
  beneficiario_nombre    TEXT,
  beneficiario_documento TEXT,
  municipio_origen       TEXT,

  -- Notas libres y trazabilidad
  notas            TEXT,
  creado_por       UUID
    REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  public.items_requerimiento              IS 'Tabla unificada de cotización. Reemplaza cotizaciones + cotizacion_items + reembolsos_detalle.';
COMMENT ON COLUMN public.items_requerimiento.tipo         IS 'SERVICIO: ítem estándar. REEMBOLSO: passthrough para beneficiario. PASIVO_TERCERO: inhumaciones y similares.';
COMMENT ON COLUMN public.items_requerimiento.fuente       IS 'Origen del ítem: tarifario, manual, excel, pdf, llm (parser inteligente).';
COMMENT ON COLUMN public.items_requerimiento.precio_total IS 'Calculado: cantidad × precio_unitario. Columna generada, solo lectura.';

-- ── 8. TRIGGER updated_at en nuevas tablas ────────────────────
-- Reutiliza la función set_updated_at() existente en el esquema.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_cuentas_virtuales_updated_at'
  ) THEN
    CREATE TRIGGER trg_cuentas_virtuales_updated_at
      BEFORE UPDATE ON public.cuentas_virtuales
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_items_requerimiento_updated_at'
  ) THEN
    CREATE TRIGGER trg_items_requerimiento_updated_at
      BEFORE UPDATE ON public.items_requerimiento
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

-- ── 9. ÍNDICES ────────────────────────────────────────────────
CREATE INDEX idx_cuentas_tipo         ON public.cuentas_virtuales(tipo);
CREATE INDEX idx_cuentas_requerimiento ON public.cuentas_virtuales(requerimiento_id);
CREATE INDEX idx_cuentas_user         ON public.cuentas_virtuales(user_id);

CREATE INDEX idx_movimientos_origen   ON public.movimientos_bancarios(origen_id);
CREATE INDEX idx_movimientos_destino  ON public.movimientos_bancarios(destino_id);
CREATE INDEX idx_movimientos_tipo     ON public.movimientos_bancarios(tipo);
CREATE INDEX idx_movimientos_fecha    ON public.movimientos_bancarios(fecha DESC);

CREATE INDEX idx_soportes_requerimiento ON public.soportes_proyecto(requerimiento_id);
CREATE INDEX idx_soportes_tipo          ON public.soportes_proyecto(tipo_archivo);

CREATE INDEX idx_items_requerimiento_id   ON public.items_requerimiento(requerimiento_id);
CREATE INDEX idx_items_tipo               ON public.items_requerimiento(tipo);
CREATE INDEX idx_items_estado             ON public.items_requerimiento(estado);
CREATE INDEX idx_items_fuente             ON public.items_requerimiento(fuente);
CREATE INDEX idx_items_tarifario          ON public.items_requerimiento(tarifario_id);

-- ── 10. CUENTA RAÍZ: Caja General UV (ID fijo) ───────────────
-- Única cuenta con ID fijo para referencias tipadas en TypeScript.
-- Las cuentas SOCIO se crean desde la UI con user_id real.
INSERT INTO public.cuentas_virtuales (id, numero_cuenta, nombre, tipo)
VALUES (
  '00000000-0000-4000-a000-000000000001',
  'CTA-GENERAL',
  'Caja General UV',
  'GENERAL'
)
ON CONFLICT (id) DO NOTHING;

-- ── 11. RLS ───────────────────────────────────────────────────
ALTER TABLE public.cuentas_virtuales    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.movimientos_bancarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.soportes_proyecto    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.items_requerimiento  ENABLE ROW LEVEL SECURITY;

-- Política permisiva para usuarios autenticados (se refinará en Fase 2)
CREATE POLICY "auth_read_cuentas"
  ON public.cuentas_virtuales FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "auth_write_cuentas"
  ON public.cuentas_virtuales FOR ALL
  TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "auth_read_movimientos"
  ON public.movimientos_bancarios FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "auth_write_movimientos"
  ON public.movimientos_bancarios FOR ALL
  TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "auth_all_soportes"
  ON public.soportes_proyecto FOR ALL
  TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "auth_all_items"
  ON public.items_requerimiento FOR ALL
  TO authenticated USING (true) WITH CHECK (true);
