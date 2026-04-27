DO $$
BEGIN
  IF to_regclass('public.actividades') IS NOT NULL THEN
    ALTER TABLE public.actividades
      ADD COLUMN IF NOT EXISTS cronograma_ia JSONB DEFAULT NULL;

    COMMENT ON COLUMN public.actividades.cronograma_ia IS
      'Cache del cronograma IA. Formato estricto: [{fecha, hora, descripcion_item, cantidad}]';
  END IF;
END $$;
