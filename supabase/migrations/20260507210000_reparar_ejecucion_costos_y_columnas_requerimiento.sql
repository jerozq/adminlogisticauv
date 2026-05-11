-- ============================================================
-- REPARACIÓN: Re-crear ejecucion_costos y columnas financieras
-- de requerimientos que fueron eliminadas accidentalmente en la
-- migración FASE 1 (20260507200000).
--
-- La tabla ejecucion_costos se re-crea apuntando a
-- items_requerimiento (la nueva tabla unificada), no a la
-- ya eliminada cotizacion_items.
-- ============================================================

-- ── 1. Re-agregar columnas financieras a requerimientos ───────
ALTER TABLE public.requerimientos
  ADD COLUMN IF NOT EXISTS abonos_recibidos          DECIMAL(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS retenciones_aplicadas     DECIMAL(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS devoluciones_pendientes_unidad DECIMAL(15,2) NOT NULL DEFAULT 0;

-- ── 2. Re-crear tabla ejecucion_costos ────────────────────────
-- item_id ahora referencia items_requerimiento (reemplaza cotizacion_items).
-- Se agrega origen_fondo para el modelo Banca Virtual.
CREATE TABLE IF NOT EXISTS public.ejecucion_costos (
  id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  actividad_id UUID          NOT NULL
    REFERENCES public.requerimientos(id) ON DELETE CASCADE,
  -- Referencia al ítem cotizado en el nuevo modelo unificado
  item_id      UUID
    REFERENCES public.items_requerimiento(id) ON DELETE SET NULL,
  descripcion  TEXT,
  monto        DECIMAL(15,2) NOT NULL DEFAULT 0,
  -- Origen del fondo (modelo Banca Virtual)
  origen_fondo TEXT
    CHECK (origen_fondo IN ('CAJA_GENERAL', 'BOLSILLO_SOCIO_A', 'BOLSILLO_SOCIO_B')),
  -- Compatibilidad con campo pagador anterior
  pagador      TEXT
    CHECK (pagador IN ('jero', 'socio', 'caja_proyecto')),
  soporte_url  TEXT,
  notas        TEXT,
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ── 3. Índices ────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_costos_actividad ON public.ejecucion_costos(actividad_id);
CREATE INDEX IF NOT EXISTS idx_costos_item      ON public.ejecucion_costos(item_id);
CREATE INDEX IF NOT EXISTS idx_costos_pagador   ON public.ejecucion_costos(pagador);

-- ── 4. Trigger updated_at ─────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_costos_updated_at'
  ) THEN
    CREATE TRIGGER trg_costos_updated_at
      BEFORE UPDATE ON public.ejecucion_costos
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

-- ── 5. Row Level Security ─────────────────────────────────────
ALTER TABLE public.ejecucion_costos ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'ejecucion_costos' AND policyname = 'Usuarios autenticados gestionan costos'
  ) THEN
    CREATE POLICY "Usuarios autenticados gestionan costos"
      ON public.ejecucion_costos FOR ALL
      TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;
