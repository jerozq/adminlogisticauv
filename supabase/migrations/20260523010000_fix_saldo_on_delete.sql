-- ============================================================
-- Fix: resync de saldos + soporte DELETE en trigger
--
-- Problema: el trigger anterior solo escucha INSERT y UPDATE.
-- Cuando un movimiento EJECUTADO se borra directamente de la BD
-- el saldo almacenado queda desincronizado (demasiado alto si
-- era un crédito, demasiado bajo si era un débito).
--
-- Esta migración:
--   1. Remueve el CHECK para resync seguro.
--   2. Recalcula todos los saldos desde movimientos EJECUTADO.
--   3. Restaura el CHECK.
--   4. Extiende la función del trigger para manejar DELETE.
--   5. Recrea el trigger incluyendo DELETE.
-- ============================================================

-- ── 1. Quitar CHECK temporalmente ────────────────────────────
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

-- ── 3. Restaurar CHECK ────────────────────────────────────────
ALTER TABLE public.cuentas_virtuales
  ADD CONSTRAINT cuentas_virtuales_saldo_check CHECK (saldo >= 0);

-- ── 4. Función de trigger actualizada (INSERT + UPDATE + DELETE)
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

    IF NEW.destino_id IS NOT NULL THEN
      UPDATE public.cuentas_virtuales
        SET saldo = saldo + NEW.monto, updated_at = NOW()
        WHERE id = NEW.destino_id;
    END IF;

    RETURN NEW;

  -- ── UPDATE: revertir cuando EJECUTADO → ANULADO ─────────────
  ELSIF TG_OP = 'UPDATE' AND OLD.estado = 'EJECUTADO' AND NEW.estado = 'ANULADO' THEN

    IF OLD.origen_id IS NOT NULL THEN
      UPDATE public.cuentas_virtuales
        SET saldo = saldo + OLD.monto, updated_at = NOW()
        WHERE id = OLD.origen_id;
    END IF;

    IF OLD.destino_id IS NOT NULL THEN
      UPDATE public.cuentas_virtuales
        SET saldo = saldo - OLD.monto, updated_at = NOW()
        WHERE id = OLD.destino_id;
    END IF;

    RETURN NEW;

  -- ── DELETE: revertir efecto si el movimiento era EJECUTADO ───
  ELSIF TG_OP = 'DELETE' AND OLD.estado = 'EJECUTADO' THEN

    -- Devolver dinero al origen
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

    RETURN OLD;

  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- ── 5. Recrear trigger incluyendo DELETE ─────────────────────
DROP TRIGGER IF EXISTS trg_actualizar_saldo_movimiento ON public.movimientos_bancarios;

CREATE TRIGGER trg_actualizar_saldo_movimiento
  AFTER INSERT OR UPDATE OF estado OR DELETE ON public.movimientos_bancarios
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_actualizar_saldo_movimiento();

COMMENT ON FUNCTION public.fn_actualizar_saldo_movimiento() IS
  'Mantiene cuentas_virtuales.saldo en sincronia con movimientos_bancarios.
   INSERT EJECUTADO: debita origen / acredita destino (con validación previa de fondos).
   UPDATE EJECUTADO→ANULADO: revierte el efecto del movimiento.
   DELETE EJECUTADO: revierte el efecto del movimiento eliminado.
   Movimientos no-EJECUTADO en INSERT se ignoran.';
