-- ============================================================
-- REFACTORIZACI"N FINANCIERA Y CAJA
-- ============================================================

-- 1. Modificar cotizacion_items (tipo_rubro y estado_ejecucion)
ALTER TABLE public.cotizacion_items
  ADD COLUMN IF NOT EXISTS tipo_rubro TEXT DEFAULT 'OPERATIVO'
    CHECK (tipo_rubro IN ('OPERATIVO', 'PASIVO_TERCERO')),
  ADD COLUMN IF NOT EXISTS estado_ejecucion TEXT DEFAULT 'EJECUTADO'
    CHECK (estado_ejecucion IN ('EJECUTADO', 'CANCELADO', 'NO_ASISTIO'));

-- 2. Actualizar tipo_rubro automǭticamente para Inhumaciones
UPDATE public.cotizacion_items
SET tipo_rubro = 'PASIVO_TERCERO'
WHERE categoria = 'Otros' AND descripcion ILIKE '%inhumaci%n%';

-- 3. Modificar ejecucion_costos (origen_fondo)
ALTER TABLE public.ejecucion_costos
  ADD COLUMN IF NOT EXISTS origen_fondo TEXT DEFAULT 'CAJA_GENERAL'
    CHECK (origen_fondo IN ('CAJA_GENERAL', 'BOLSILLO_SOCIO_A', 'BOLSILLO_SOCIO_B'));

-- 4. Nueva tabla: cuentas_por_pagar_socios
CREATE TABLE IF NOT EXISTS public.cuentas_por_pagar_socios (
  id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  actividad_id UUID          NOT NULL REFERENCES public.requerimientos(id) ON DELETE CASCADE,
  costo_id     UUID          REFERENCES public.ejecucion_costos(id) ON DELETE SET NULL,
  socio_origen TEXT          NOT NULL CHECK (socio_origen IN ('BOLSILLO_SOCIO_A', 'BOLSILLO_SOCIO_B')),
  monto        DECIMAL(15,2) NOT NULL DEFAULT 0,
  estado       TEXT          NOT NULL DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE', 'PAGADO')),
  fecha_pago   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ   DEFAULT NOW(),
  updated_at   TIMESTAMPTZ   DEFAULT NOW()
);

-- 5. Nuevas columnas en requerimientos (actividad maestra) para manejar retenciones y devoluciones
ALTER TABLE public.requerimientos
  ADD COLUMN IF NOT EXISTS devoluciones_pendientes_unidad DECIMAL(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS retenciones_aplicadas DECIMAL(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS abonos_recibidos DECIMAL(15,2) DEFAULT 0;

-- 6. Nueva tabla: registro_devoluciones_unidad
CREATE TABLE IF NOT EXISTS public.registro_devoluciones_unidad (
  id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  actividad_id UUID          NOT NULL REFERENCES public.requerimientos(id) ON DELETE CASCADE,
  monto        DECIMAL(15,2) NOT NULL,
  fecha_salida TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  evidencia_url TEXT,
  notas        TEXT,
  created_at   TIMESTAMPTZ   DEFAULT NOW()
);

-- 7. Nueva tabla: registro_abonos_unidad
CREATE TABLE IF NOT EXISTS public.registro_abonos_unidad (
  id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  actividad_id UUID          NOT NULL REFERENCES public.requerimientos(id) ON DELETE CASCADE,
  monto        DECIMAL(15,2) NOT NULL,
  retencion_aplicada DECIMAL(15,2) NOT NULL DEFAULT 0,
  fecha_abono  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  created_at   TIMESTAMPTZ   DEFAULT NOW()
);
