-- 8. Asistencia en Reembolsos
ALTER TABLE public.reembolsos_detalle
  ADD COLUMN IF NOT EXISTS estado_asistencia TEXT DEFAULT 'ASISTIO'
    CHECK (estado_asistencia IN ('ASISTIO', 'NO_ASISTIO'));
