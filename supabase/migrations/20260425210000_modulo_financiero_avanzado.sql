-- ============================================================
-- Módulo Financiero Avanzado
--
-- Cambios en ejecucion_costos:
--  1. Nuevo pagador: 'anticipo_uv' (dinero de anticipo de la UV)
--  2. modo_registro: 'por_item' (granular) | 'delegado' (total único)
--  3. cantidad      : unidades del ítem (para desglose granular)
--  4. precio_unitario: precio por unidad (para desglose granular)
--  5. concepto      : etiqueta libre de la variación de precio
--                     (ej: "Almuerzo ejecutivo", "Almuerzo económico")
--
-- El monto sigue siendo la fuente de verdad para cálculos financieros.
-- cantidad × precio_unitario = monto (calculado en el cliente antes de insertar).
-- ============================================================

-- ── 1. Actualizar CHECK de pagador ──────────────────────────
ALTER TABLE public.ejecucion_costos
  DROP CONSTRAINT IF EXISTS ejecucion_costos_pagador_check;

ALTER TABLE public.ejecucion_costos
  ADD CONSTRAINT ejecucion_costos_pagador_check
    CHECK (pagador IN ('jero', 'socio', 'caja_proyecto', 'anticipo_uv'));

-- ── 2. Modo de registro ──────────────────────────────────────
ALTER TABLE public.ejecucion_costos
  ADD COLUMN IF NOT EXISTS modo_registro TEXT NOT NULL DEFAULT 'por_item'
    CHECK (modo_registro IN ('por_item', 'delegado'));

-- ── 3. Cantidad de unidades ─────────────────────────────────
ALTER TABLE public.ejecucion_costos
  ADD COLUMN IF NOT EXISTS cantidad INTEGER NOT NULL DEFAULT 1
    CHECK (cantidad > 0);

-- ── 4. Precio unitario ───────────────────────────────────────
ALTER TABLE public.ejecucion_costos
  ADD COLUMN IF NOT EXISTS precio_unitario DECIMAL(15, 2);

-- ── 5. Concepto / variación ─────────────────────────────────
ALTER TABLE public.ejecucion_costos
  ADD COLUMN IF NOT EXISTS concepto TEXT;

-- ── Índice para análisis por modo ───────────────────────────
CREATE INDEX IF NOT EXISTS idx_costos_modo
  ON public.ejecucion_costos (modo_registro);

-- ── Comentarios de documentación ────────────────────────────
COMMENT ON COLUMN public.ejecucion_costos.modo_registro IS
  'por_item: registro granular con cantidad×precio_unitario. delegado: costo total único sin desglose.';

COMMENT ON COLUMN public.ejecucion_costos.cantidad IS
  'Número de unidades del ítem. Solo aplica cuando modo_registro = por_item.';

COMMENT ON COLUMN public.ejecucion_costos.precio_unitario IS
  'Precio por unidad. Solo aplica cuando modo_registro = por_item. monto = cantidad × precio_unitario.';

COMMENT ON COLUMN public.ejecucion_costos.concepto IS
  'Etiqueta libre de la variación (ej: "Almuerzo ejecutivo"). Útil cuando un ítem tiene variaciones de precio.';

COMMENT ON COLUMN public.ejecucion_costos.pagador IS
  'Origen del fondo: jero (bolsillo Jero), socio (bolsillo Socio), caja_proyecto (caja del proyecto), anticipo_uv (anticipo pagado por la UV).';
