-- Agrega columna numero_cuenta_cobro a requerimientos
-- Se asigna de forma consecutiva (MAX + 1) por la API al momento de generar la cuenta de cobro.

ALTER TABLE requerimientos
  ADD COLUMN IF NOT EXISTS numero_cuenta_cobro INTEGER DEFAULT NULL;

-- Índice para acelerar la consulta MAX(numero_cuenta_cobro)
CREATE INDEX IF NOT EXISTS idx_requerimientos_numero_cuenta_cobro
  ON requerimientos (numero_cuenta_cobro)
  WHERE numero_cuenta_cobro IS NOT NULL;
