-- ============================================================
-- FASE 1 — Checklist de Reembolsos/Terceros + Devoluciones Parciales
-- ============================================================
-- Cambios:
--   1. pagado BOOLEAN en items_requerimiento (checklist por beneficiario)
--   2. Tipo DEVOLUCION en movimientos_bancarios (trazabilidad contable)
--   3. Tabla devoluciones_deuda (deuda pendiente de devolver a la Unidad)
--   4. Backfill: crear registros de deuda para ítems CANCELADO/NO_ASISTIO existentes
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. Checklist por beneficiario (reembolsos / terceros)
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.items_requerimiento
  ADD COLUMN IF NOT EXISTS pagado BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.items_requerimiento.pagado IS
  'Confirmación manual de que el dinero fue entregado al beneficiario. Solo aplica a ítems REEMBOLSO y PASIVO_TERCERO.';

-- ────────────────────────────────────────────────────────────
-- 2. Extender tipo de movimiento bancario con DEVOLUCION
--    (necesario para distinguir devoluciones a la Unidad de
--     simples retiros o gastos operativos)
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.movimientos_bancarios
  DROP CONSTRAINT IF EXISTS movimientos_bancarios_tipo_check;

ALTER TABLE public.movimientos_bancarios
  ADD CONSTRAINT movimientos_bancarios_tipo_check
  CHECK (tipo IN (
    'INYECCION',
    'PAGO_UNIDAD',
    'TRANSFERENCIA',
    'GASTO',
    'REPARTO_50_50',
    'RETIRO',
    'DEVOLUCION'
  ));

COMMENT ON COLUMN public.movimientos_bancarios.tipo IS
  'DEVOLUCION = salida de fondos que se devuelven a la Unidad (no es gasto operativo). Se diferencia de RETIRO para reportes contables.';

-- ────────────────────────────────────────────────────────────
-- 3. Tabla: devoluciones_deuda
--    Cada registro representa dinero que se debe devolver a la
--    Unidad, ya sea por cancelación total de un ítem, por
--    cancelación parcial (cantidad_cancelada < cantidad total)
--    o por un beneficiario que no asistió.
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.devoluciones_deuda (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  requerimiento_id  UUID          NOT NULL REFERENCES public.requerimientos(id) ON DELETE CASCADE,
  item_origen_id    UUID          REFERENCES public.items_requerimiento(id) ON DELETE SET NULL,
  cantidad_cancelada DECIMAL(10,2) NOT NULL DEFAULT 0,
  monto_total       DECIMAL(15,2) NOT NULL CHECK (monto_total >= 0),
  tipo              TEXT          NOT NULL DEFAULT 'OPERATIVO'
                    CHECK (tipo IN ('OPERATIVO', 'TERCERO')),
  motivo            TEXT          NOT NULL DEFAULT '',
  estado_deuda      TEXT          NOT NULL DEFAULT 'PENDIENTE'
                    CHECK (estado_deuda IN ('PENDIENTE', 'SALDADO')),
  -- Enlace al movimiento bancario que saldó esta deuda
  movimiento_id     UUID          REFERENCES public.movimientos_bancarios(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ   DEFAULT NOW(),
  updated_at        TIMESTAMPTZ   DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_devoluciones_deuda_requerimiento
  ON public.devoluciones_deuda (requerimiento_id);
CREATE INDEX IF NOT EXISTS idx_devoluciones_deuda_estado
  ON public.devoluciones_deuda (estado_deuda);
CREATE INDEX IF NOT EXISTS idx_devoluciones_deuda_item_origen
  ON public.devoluciones_deuda (item_origen_id);

COMMENT ON TABLE public.devoluciones_deuda IS
  'Registro de deudas pendientes de devolver a la Unidad. PENDIENTE suma a la tarjeta roja de deuda global; SALDADO indica que ya se registró el egreso físico.';

-- ────────────────────────────────────────────────────────────
-- RLS — misma política permisiva que el resto del módulo
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.devoluciones_deuda ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename  = 'devoluciones_deuda'
      AND policyname = 'devoluciones_deuda_auth_all'
  ) THEN
    CREATE POLICY "devoluciones_deuda_auth_all"
      ON public.devoluciones_deuda FOR ALL TO authenticated
      USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename  = 'devoluciones_deuda'
      AND policyname = 'devoluciones_deuda_anon_all'
  ) THEN
    CREATE POLICY "devoluciones_deuda_anon_all"
      ON public.devoluciones_deuda FOR ALL TO anon
      USING (true) WITH CHECK (true);
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.devoluciones_deuda
  TO authenticated, anon;

-- ────────────────────────────────────────────────────────────
-- 4. Backfill — ítems CANCELADO ya existentes
--    (evita doble conteo: solo se crea si no hay deuda PENDIENTE
--     para ese ítem)
-- ────────────────────────────────────────────────────────────
INSERT INTO public.devoluciones_deuda
  (requerimiento_id, item_origen_id, cantidad_cancelada, monto_total, tipo, motivo, estado_deuda)
SELECT
  ir.requerimiento_id,
  ir.id                                                               AS item_origen_id,
  COALESCE(ir.cantidad, 1)                                            AS cantidad_cancelada,
  COALESCE(ir.precio_total, ir.cantidad * ir.precio_unitario, 0)     AS monto_total,
  CASE WHEN ir.tipo = 'PASIVO_TERCERO' THEN 'TERCERO'
       ELSE 'OPERATIVO' END                                           AS tipo,
  'Ítem cancelado (migrado automáticamente)'                          AS motivo,
  'PENDIENTE'                                                         AS estado_deuda
FROM public.items_requerimiento ir
WHERE ir.estado = 'CANCELADO'
  AND NOT EXISTS (
    SELECT 1 FROM public.devoluciones_deuda dd
    WHERE dd.item_origen_id = ir.id
      AND dd.estado_deuda   = 'PENDIENTE'
  );

-- ────────────────────────────────────────────────────────────
-- 5. Backfill — ítems NO_ASISTIO (reembolsos de terceros)
-- ────────────────────────────────────────────────────────────
INSERT INTO public.devoluciones_deuda
  (requerimiento_id, item_origen_id, cantidad_cancelada, monto_total, tipo, motivo, estado_deuda)
SELECT
  ir.requerimiento_id,
  ir.id                                                               AS item_origen_id,
  COALESCE(ir.cantidad, 1)                                            AS cantidad_cancelada,
  COALESCE(ir.precio_total, ir.precio_unitario, 0)                   AS monto_total,
  'TERCERO'                                                           AS tipo,
  'Beneficiario no asistió (migrado automáticamente)'                 AS motivo,
  'PENDIENTE'                                                         AS estado_deuda
FROM public.items_requerimiento ir
WHERE ir.estado = 'NO_ASISTIO'
  AND NOT EXISTS (
    SELECT 1 FROM public.devoluciones_deuda dd
    WHERE dd.item_origen_id = ir.id
      AND dd.estado_deuda   = 'PENDIENTE'
  );
