-- ============================================================
-- Fix: resync de saldos + trigger robusto que respeta ANULADO
--
-- Problema raíz: el trigger original solo escucha INSERT. Cuando
-- un movimiento se ANULA (UPDATE estado → ANULADO), el saldo ya
-- fue deducido pero la app no lo cuenta → saldo almacenado < saldo
-- visible → el siguiente débito viola CHECK (saldo >= 0).
--
-- Esta migración:
--   1. Remueve temporalmente el CHECK para poder resincronizar.
--   2. Recalcula todos los saldos desde movimientos EJECUTADO.
--   3. Restaura el CHECK.
--   4. Reemplaza el trigger para:
--        a) Verificar fondos ANTES de deducir (no después).
--        b) Revertir el efecto al anular un movimiento.
-- ============================================================

-- ── 1. Quitar CHECK temporalmente para resync seguro ─────────
ALTER TABLE public.cuentas_virtuales
  DROP CONSTRAINT IF EXISTS cuentas_virtuales_saldo_check;

-- ── 2. Resincronizar saldos desde movimientos EJECUTADO ───────
UPDATE public.cuentas_virtuales cv
SET saldo = GREATEST(0, COALESCE(
  (
    SELECT
      COALESCE(SUM(CASE WHEN m.destino_id = cv.id AND m.estado = 'EJECUTADO' THEN m.monto ELSE 0 END), 0) -
      COALESCE(SUM(CASE WHEN m.origen_id  = cv.id AND m.estado = 'EJECUTADO' THEN m.monto ELSE 0 END), 0)
    FROM public.movimientos_bancarios m
    WHERE m.origen_id = cv.id OR m.destino_id = cv.id
  ), 0
));

-- ── 3. Restaurar CHECK (saldos ya correctos) ──────────────────
ALTER TABLE public.cuentas_virtuales
  ADD CONSTRAINT cuentas_virtuales_saldo_check CHECK (saldo >= 0);

-- ── 4. Trigger robusto ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_actualizar_saldo_movimiento()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_saldo DECIMAL(15,2);
BEGIN

  -- ── INSERT: solo procesar movimientos EJECUTADO ─────────────
  IF TG_OP = 'INSERT' THEN

    IF NEW.estado IS DISTINCT FROM 'EJECUTADO' THEN
      RETURN NEW;
    END IF;

    -- Debitar origen con validación previa
    IF NEW.origen_id IS NOT NULL THEN
      SELECT saldo INTO v_saldo
        FROM public.cuentas_virtuales
        WHERE id = NEW.origen_id
        FOR UPDATE;

      IF v_saldo < NEW.monto THEN
        RAISE EXCEPTION
          'Saldo insuficiente en cuenta origen. Disponible: $ %, Requerido: $ %',
          v_saldo, NEW.monto;
      END IF;

      UPDATE public.cuentas_virtuales
        SET saldo = saldo - NEW.monto, updated_at = NOW()
        WHERE id = NEW.origen_id;
    END IF;

    -- Acreditar destino
    IF NEW.destino_id IS NOT NULL THEN
      UPDATE public.cuentas_virtuales
        SET saldo = saldo + NEW.monto, updated_at = NOW()
        WHERE id = NEW.destino_id;
    END IF;

  -- ── UPDATE: revertir cuando un movimiento EJECUTADO se ANULA ─
  ELSIF TG_OP = 'UPDATE' AND OLD.estado = 'EJECUTADO' AND NEW.estado = 'ANULADO' THEN

    -- Devolver el dinero al origen
    IF OLD.origen_id IS NOT NULL THEN
      UPDATE public.cuentas_virtuales
        SET saldo = saldo + OLD.monto, updated_at = NOW()
        WHERE id = OLD.origen_id;
    END IF;

    -- Retirar del destino
    IF OLD.destino_id IS NOT NULL THEN
      UPDATE public.cuentas_virtuales
        SET saldo = saldo - OLD.monto, updated_at = NOW()
        WHERE id = OLD.destino_id;
    END IF;

  END IF;

  RETURN NEW;
END;
$$;

-- ── 5. Recrear trigger para INSERT y UPDATE de estado ─────────
DROP TRIGGER IF EXISTS trg_actualizar_saldo_movimiento ON public.movimientos_bancarios;

CREATE TRIGGER trg_actualizar_saldo_movimiento
  AFTER INSERT OR UPDATE OF estado ON public.movimientos_bancarios
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_actualizar_saldo_movimiento();

COMMENT ON FUNCTION public.fn_actualizar_saldo_movimiento() IS
  'Mantiene cuentas_virtuales.saldo en sincronia con movimientos_bancarios.
   INSERT EJECUTADO: debita origen / acredita destino (con validación previa de fondos).
   UPDATE EJECUTADO→ANULADO: revierte el efecto del movimiento.
   Movimientos no-EJECUTADO en INSERT se ignoran.';
