CREATE TABLE IF NOT EXISTS tarifario_2026 (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo_item TEXT UNIQUE NOT NULL,
    categoria TEXT NOT NULL,
    descripcion TEXT NOT NULL,
    unidad_medida TEXT NOT NULL,
    precio_venta DECIMAL(15,2) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);