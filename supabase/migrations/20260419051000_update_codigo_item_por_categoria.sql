BEGIN;

CREATE TEMP TABLE _new_codigo_map AS
WITH categorized AS (
  SELECT
    id,
    categoria,
    CASE categoria
      WHEN 'Transporte' THEN 'TRA'
      WHEN 'Alimentación' THEN 'ALI'
      WHEN 'Alojamiento' THEN 'ALO'
      WHEN 'Logística' THEN 'LOG'
      WHEN 'Personal' THEN 'PER'
      ELSE 'OTR'
    END AS prefix,
    ROW_NUMBER() OVER (PARTITION BY categoria ORDER BY codigo_item, id) AS rn
  FROM public.tarifario_2026
)
SELECT
  id,
  prefix || '-' || LPAD(rn::text, 3, '0') AS new_codigo_item
FROM categorized;

-- Paso temporal para evitar conflicto de llave única durante el cambio masivo
UPDATE public.tarifario_2026 t
SET codigo_item = 'TMP-' || REPLACE(t.id::text, '-', '')
FROM _new_codigo_map m
WHERE t.id = m.id
  AND t.codigo_item <> m.new_codigo_item;

UPDATE public.tarifario_2026 t
SET codigo_item = m.new_codigo_item
FROM _new_codigo_map m
WHERE t.id = m.id;

DROP TABLE _new_codigo_map;

COMMIT;
