-- ============================================================
-- MÓDULO DE COTIZACIONES Y REQUERIMIENTOS
-- Estado: requerimientos → cotizaciones → items + reembolsos
-- ============================================================

-- Estado del requerimiento (máquina de estados)
-- cargado       → Excel leído, solo lectura
-- generado      → Cotización v1 creada, editable
-- en_ejecucion  → En campo; cambios crean v2 automáticamente
-- liquidado     → Bloqueado para generar Cuenta de Cobro

CREATE TABLE IF NOT EXISTS public.requerimientos (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Identificación
  numero_requerimiento      TEXT,
  nombre_actividad          TEXT NOT NULL,
  objeto                    TEXT,
  -- Ubicación
  direccion_territorial     TEXT,
  municipio                 TEXT,
  departamento              TEXT,
  lugar_detalle             TEXT,
  -- Fechas
  fecha_solicitud           DATE,
  fecha_inicio              DATE,
  fecha_fin                 DATE,
  hora_inicio               TEXT,
  hora_fin                  TEXT,
  -- Responsable de campo
  responsable_nombre        TEXT,
  responsable_cedula        TEXT,
  responsable_celular       TEXT,
  responsable_correo        TEXT,
  -- Datos operativos
  num_victimas              INTEGER DEFAULT 0,
  monto_reembolso_declarado DECIMAL(15,2),
  -- Trazabilidad
  archivo_origen_nombre     TEXT,
  estado                    TEXT NOT NULL DEFAULT 'cargado'
                            CHECK (estado IN ('cargado','generado','en_ejecucion','liquidado')),
  created_at                TIMESTAMPTZ DEFAULT NOW(),
  updated_at                TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- COTIZACIONES (versiones)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.cotizaciones (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requerimiento_id    UUID NOT NULL REFERENCES public.requerimientos(id) ON DELETE CASCADE,
  version             INTEGER NOT NULL DEFAULT 1,
  estado              TEXT NOT NULL DEFAULT 'borrador'
                      CHECK (estado IN ('borrador','enviada','aprobada','rechazada')),
  -- Totales calculados (se actualizan por trigger o app)
  subtotal_servicios  DECIMAL(15,2) DEFAULT 0,
  total_reembolsos    DECIMAL(15,2) DEFAULT 0,
  total_general       DECIMAL(15,2) DEFAULT 0,
  notas               TEXT,
  creado_por          TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(requerimiento_id, version)
);

-- ============================================================
-- ÍTEMS DE COTIZACIÓN
-- ============================================================
CREATE TABLE IF NOT EXISTS public.cotizacion_items (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cotizacion_id    UUID NOT NULL REFERENCES public.cotizaciones(id) ON DELETE CASCADE,
  -- Referencia al tarifario (opcional para ítems manuales)
  tarifario_id     UUID REFERENCES public.tarifario_2026(id),
  codigo_item      TEXT,
  descripcion      TEXT NOT NULL,
  categoria        TEXT,
  unidad_medida    TEXT,
  cantidad         DECIMAL(10,2) NOT NULL DEFAULT 1,
  precio_unitario  DECIMAL(15,2) NOT NULL DEFAULT 0,
  precio_total     DECIMAL(15,2) GENERATED ALWAYS AS (cantidad * precio_unitario) STORED,
  -- Ítems passthrough = dinero de terceros, sin margen de utilidad
  es_passthrough   BOOLEAN DEFAULT FALSE,
  -- Origen del ítem: tarifario sugerido, manual, o extraído de Excel
  fuente           TEXT DEFAULT 'tarifario'
                   CHECK (fuente IN ('tarifario','manual','excel')),
  -- Trazabilidad de edición
  editado_por      TEXT,
  editado_en       TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- REEMBOLSOS POR BENEFICIARIO (Passthrough: transporte/alojamiento)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.reembolsos_detalle (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cotizacion_id         UUID NOT NULL REFERENCES public.cotizaciones(id) ON DELETE CASCADE,
  -- Datos del beneficiario
  nombre_beneficiario   TEXT NOT NULL,
  documento_identidad   TEXT,
  municipio_origen      TEXT,
  municipio_destino     TEXT,
  -- Valores de reembolso (cada concepto auditado por separado)
  valor_transporte      DECIMAL(15,2) DEFAULT 0,
  valor_alojamiento     DECIMAL(15,2) DEFAULT 0,
  valor_alimentacion    DECIMAL(15,2) DEFAULT 0,
  valor_otros           DECIMAL(15,2) DEFAULT 0,
  total_reembolso       DECIMAL(15,2) GENERATED ALWAYS AS (
                          valor_transporte + valor_alojamiento +
                          valor_alimentacion + valor_otros
                        ) STORED,
  notas                 TEXT,
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- HISTORIAL DE CAMBIOS (Trazabilidad completa)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.cotizacion_historial (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cotizacion_id   UUID NOT NULL REFERENCES public.cotizaciones(id) ON DELETE CASCADE,
  tipo_cambio     TEXT NOT NULL,
  descripcion     TEXT,
  datos_anteriores JSONB,
  datos_nuevos    JSONB,
  usuario         TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ÍNDICES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_cotizaciones_req      ON public.cotizaciones(requerimiento_id);
CREATE INDEX IF NOT EXISTS idx_items_cotizacion      ON public.cotizacion_items(cotizacion_id);
CREATE INDEX IF NOT EXISTS idx_reembolsos_cotizacion ON public.reembolsos_detalle(cotizacion_id);
CREATE INDEX IF NOT EXISTS idx_historial_cotizacion  ON public.cotizacion_historial(cotizacion_id);
CREATE INDEX IF NOT EXISTS idx_requerimientos_estado ON public.requerimientos(estado);

-- ============================================================
-- FUNCIÓN Y TRIGGERS: updated_at automático
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_requerimientos_updated_at'
  ) THEN
    CREATE TRIGGER trg_requerimientos_updated_at
      BEFORE UPDATE ON public.requerimientos
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_cotizaciones_updated_at'
  ) THEN
    CREATE TRIGGER trg_cotizaciones_updated_at
      BEFORE UPDATE ON public.cotizaciones
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;
