-- ============================================================
-- Separación de abonos: OPERATIVO vs PASIVO_TERCERO
-- Los abonos operativos alimentan la caja del proyecto.
-- Los abonos PASIVO_TERCERO son fondos exclusivos para
-- reembolsos / inhumaciones — no se mezclan con la operación.
-- ============================================================

ALTER TABLE public.registro_abonos_unidad
  ADD COLUMN IF NOT EXISTS tipo_abono TEXT NOT NULL DEFAULT 'OPERATIVO';

-- Garantizar que solo entren los dos valores válidos
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'registro_abonos_unidad_tipo_abono_check'
  ) THEN
    ALTER TABLE public.registro_abonos_unidad
      ADD CONSTRAINT registro_abonos_unidad_tipo_abono_check
      CHECK (tipo_abono IN ('OPERATIVO', 'PASIVO_TERCERO'));
  END IF;
END $$;

-- Los abonos históricos sin tipo se asumen OPERATIVOS
UPDATE public.registro_abonos_unidad
  SET tipo_abono = 'OPERATIVO'
  WHERE tipo_abono IS NULL;
