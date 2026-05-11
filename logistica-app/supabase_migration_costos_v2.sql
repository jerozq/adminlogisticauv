-- ============================================================
-- Migration: Refactor Costos + Toggle de Pago
-- Ejecutar en Supabase SQL Editor
-- ============================================================

-- 1. MOVIMIENTOS BANCARIOS: Agregar estado para toggle pagado/anulado
ALTER TABLE movimientos_bancarios 
  ADD COLUMN IF NOT EXISTS estado TEXT NOT NULL DEFAULT 'EJECUTADO'
  CHECK (estado IN ('EJECUTADO', 'ANULADO'));

-- 2. EJECUCION_COSTOS: Agregar campos para el nuevo flujo de costos
ALTER TABLE ejecucion_costos
  ADD COLUMN IF NOT EXISTS cantidad INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS precio_unitario_costo NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS estado_pago TEXT NOT NULL DEFAULT 'PENDIENTE'
    CHECK (estado_pago IN ('PENDIENTE', 'PAGADO')),
  ADD COLUMN IF NOT EXISTS movimiento_id UUID REFERENCES movimientos_bancarios(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS transferencia_id UUID REFERENCES movimientos_bancarios(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cuenta_origen_id UUID REFERENCES cuentas_virtuales(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS observaciones TEXT;

-- 3. Índices para consultas frecuentes
CREATE INDEX IF NOT EXISTS idx_movimientos_estado ON movimientos_bancarios(estado);
CREATE INDEX IF NOT EXISTS idx_costos_estado_pago ON ejecucion_costos(estado_pago);
CREATE INDEX IF NOT EXISTS idx_costos_movimiento ON ejecucion_costos(movimiento_id);

-- 4. Backfill: Costos existentes quedan como PAGADO (ya se ejecutaron)
UPDATE ejecucion_costos 
SET estado_pago = 'PAGADO',
    cantidad = 1,
    precio_unitario_costo = monto
WHERE estado_pago = 'PENDIENTE' AND monto > 0;

-- Verificación
SELECT 
  'movimientos_bancarios.estado' as campo,
  COUNT(*) as registros
FROM movimientos_bancarios
UNION ALL
SELECT 
  'ejecucion_costos.estado_pago',
  COUNT(*)
FROM ejecucion_costos;
