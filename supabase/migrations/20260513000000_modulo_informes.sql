-- ============================================================
-- MÓDULO INFORMES
-- Soporte para generar los 3 PDFs del informe de legalización:
--
--   PDF 1 — Recibo de satisfacción firmado (upload usuario)
--   PDF 2 — Lista asistencia + reembolsos firmados + cédulas
--           (editor visual con drag-and-drop)
--   PDF 3 — Evidencias de campo (auto-generado desde bitacora)
--
-- Cambios en BD:
--   1. items_requerimiento: URLs de documentos firmados por beneficiario
--   2. requerimientos: URLs de documentos de la actividad + estado informe
--   3. Storage bucket 'informes': PDFs generados y docs subidos
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. items_requerimiento — Documentos firmados por beneficiario
--    Solo aplican cuando tipo = 'REEMBOLSO' o 'PASIVO_TERCERO'
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.items_requerimiento
  ADD COLUMN IF NOT EXISTS reembolso_firmado_url TEXT,
  ADD COLUMN IF NOT EXISTS cedula_url            TEXT;

COMMENT ON COLUMN public.items_requerimiento.reembolso_firmado_url IS
  'URL en Storage del formato de reembolso físico firmado por el beneficiario (escaneado/foto).';

COMMENT ON COLUMN public.items_requerimiento.cedula_url IS
  'URL en Storage de la foto/scan de la cédula del beneficiario. Va después del reembolso en el PDF 2.';

-- ────────────────────────────────────────────────────────────
-- 2. requerimientos — Documentos del informe por actividad
-- ────────────────────────────────────────────────────────────

-- PDF 1: Recibo de satisfacción firmado (upload manual)
ALTER TABLE public.requerimientos
  ADD COLUMN IF NOT EXISTS recibo_satisfaccion_firmado_url TEXT;

-- PDF 2: Componentes + resultado final
ALTER TABLE public.requerimientos
  ADD COLUMN IF NOT EXISTS lista_asistencia_firmada_url TEXT,
  ADD COLUMN IF NOT EXISTS informe_pdf2_url             TEXT;

-- PDF 3: Evidencias auto-generado
ALTER TABLE public.requerimientos
  ADD COLUMN IF NOT EXISTS informe_pdf3_url TEXT;

-- Estado general del informe de legalización
ALTER TABLE public.requerimientos
  ADD COLUMN IF NOT EXISTS informe_estado TEXT NOT NULL DEFAULT 'borrador'
    CHECK (informe_estado IN ('borrador', 'en_proceso', 'completo'));

COMMENT ON COLUMN public.requerimientos.recibo_satisfaccion_firmado_url IS
  'PDF 1 del informe: recibo de cumplimiento de requisitos firmado. Se sube manualmente por el usuario.';

COMMENT ON COLUMN public.requerimientos.lista_asistencia_firmada_url IS
  'Primera hoja del PDF 2: lista de asistencia física firmada (escaneada/fotografiada).';

COMMENT ON COLUMN public.requerimientos.informe_pdf2_url IS
  'PDF 2 final generado: asistencia + (reembolso + cédula) × n beneficiarios. Guardado en Storage tras generar.';

COMMENT ON COLUMN public.requerimientos.informe_pdf3_url IS
  'PDF 3 final generado: collage de evidencias de campo (bitacora_entregas). Guardado en Storage tras generar.';

COMMENT ON COLUMN public.requerimientos.informe_estado IS
  'Estado del informe de legalización. borrador=sin completar, en_proceso=subiendo docs, completo=3 PDFs listos.';

-- ────────────────────────────────────────────────────────────
-- 3. Storage bucket 'informes'
--    Almacena:
--      - Docs firmados subidos (cédulas, reembolsos firmados,
--        lista asistencia firmada, recibo satisfacción firmado)
--      - PDFs finales generados (PDF 2 y PDF 3)
-- ────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'informes',
  'informes',
  true,
  26214400,  -- 26 MB por archivo (PDFs combinados pueden ser grandes)
  ARRAY[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'application/pdf'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Lectura pública (para previsualizar y descargar)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'informes_public_select'
  ) THEN
    CREATE POLICY "informes_public_select" ON storage.objects
      FOR SELECT USING (bucket_id = 'informes');
  END IF;
END $$;

-- Inserción autenticada (solo usuarios del sistema suben documentos)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'informes_auth_insert'
  ) THEN
    CREATE POLICY "informes_auth_insert" ON storage.objects
      FOR INSERT
      TO authenticated
      WITH CHECK (bucket_id = 'informes');
  END IF;
END $$;

-- Actualización autenticada (reemplazar archivo subido)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'informes_auth_update'
  ) THEN
    CREATE POLICY "informes_auth_update" ON storage.objects
      FOR UPDATE
      TO authenticated
      USING (bucket_id = 'informes');
  END IF;
END $$;

-- Eliminación autenticada (limpiar archivos reemplazados)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'informes_auth_delete'
  ) THEN
    CREATE POLICY "informes_auth_delete" ON storage.objects
      FOR DELETE
      TO authenticated
      USING (bucket_id = 'informes');
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────
-- 4. Índice auxiliar para consulta rápida de reembolsos
--    con documentos pendientes de subir
-- ────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_items_req_tipo_reembolso
  ON public.items_requerimiento (requerimiento_id)
  WHERE tipo IN ('REEMBOLSO', 'PASIVO_TERCERO');

-- ────────────────────────────────────────────────────────────
-- 5. Índice para consultar actividades con informe incompleto
-- ────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_requerimientos_informe_estado
  ON public.requerimientos (informe_estado)
  WHERE informe_estado != 'completo';
