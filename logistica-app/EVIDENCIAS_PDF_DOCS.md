# Documentación Técnica: PDF 3 - Reporte de Evidencias Fotográficas

## Descripción General

El **PDF 3: Reporte de Evidencias Fotográficas** es un documento generado automáticamente que recopila todas las evidencias de campo (fotos) de una actividad realizada, organizadas por ítem de ejecución con una grilla adaptativa que optimiza el espacio y la presentación.

## Características Principales

### 1. Portada Profesional
- Encabezado con branding: "UNIDAD PARA LAS VÍCTIMAS · CONTRATO 931 DE 2025"
- Título: "REGISTRO FOTOGRÁFICO DE ACTIVIDAD"
- Tabla informativa con:
  - Nombre de la actividad
  - Número de requerimiento
  - Fecha de inicio
  - Lugar (detalle, municipio, departamento)
  - Responsable
  - Número de beneficiarios
  - Total de evidencias
- Fecha de generación

### 2. Grilla Adaptativa
La grilla se adapta automáticamente según el número de fotos del ítem:

```
1 Foto:
┌─────────────────────────────────┐
│                                 │
│         IMAGEN GRANDE           │
│      (100% ancho, 180pt)        │
│                                 │
└─────────────────────────────────┘

2 Fotos:
┌─────────────────┬─────────────────┐
│  IMAGEN A       │  IMAGEN B       │
│  (49% ancho)    │  (49% ancho)    │
│  (100pt alto)   │  (100pt alto)   │
└─────────────────┴─────────────────┘

3-4 Fotos:
┌─────────────┬─────────────┬─────────────┐
│ IMAGEN A    │ IMAGEN B    │ IMAGEN C    │
│ (32.33%)    │ (32.33%)    │ (32.33%)    │
│ (70pt)      │ (70pt)      │ (70pt)      │
├─────────────┼─────────────┼─────────────┤
│ IMAGEN D    │             │             │
│ (32.33%)    │             │             │
│ (70pt)      │             │             │
└─────────────┴─────────────┴─────────────┘

5+ Fotos:
┌──────────┬──────────┬──────────┬──────────┐
│IMG A     │IMG B     │IMG C     │IMG D     │
│(24%)     │(24%)     │(24%)     │(24%)     │
│(60pt)    │(60pt)    │(60pt)    │(60pt)    │
├──────────┼──────────┼──────────┼──────────┤
│IMG E     │IMG F     │...       │          │
└──────────┴──────────┴──────────┴──────────┘
```

### 3. Organización por Ítem
Cada grupo de fotos está bajo un encabezado que incluye:
- **Nombre del ítem** (de la bitácora de entregas)
- **Fecha de la bitácora** (en formato DD/MM/YYYY)
- Borde izquierdo azul para fácil identificación

### 4. Paginación Inteligente
- Mantiene cada grupo de ítem junto (sin romper a mitad)
- Si un grupo es muy grande (>4 fotos), lo divide automáticamente
- Estima la altura de cada sección para distribuir óptimamente
- Encabezado en cada página con información de la actividad

## Integración en la UI

### Ubicación
Componente `GenerarEvidenciasPDFButton` en la **sección de Evidencias del Tab "Generar Informe"** de `/ejecucion/[id]`.

### Botón
```
┌─────────────────────────────────┐
│  📷  Generar PDF Evidencias     │
└─────────────────────────────────┘
```

Estados del botón:
- **idle (sin PDF)**: "Generar PDF Evidencias"
- **idle (con PDF)**: "Regenerar PDF Evidencias"
- **generating**: "Generando PDF…" (con spinner)
- **uploading**: "Subiendo…"
- **saving**: "Guardando…"
- **done**: "PDF guardado" (con enlace "Ver PDF")
- **error**: "Reintentar"

### Indicadores
- Deshabilitado si no hay evidencias
- Progreso visualizado mediante estados
- Enlace directo a PDF una vez guardado
- Mensaje de error si algo falla

## Estructura de Datos

### Entrada: EvidenciaInforme[]
```typescript
interface EvidenciaInforme {
  id: string                    // UUID
  descripcion: string           // Nombre del ítem (ej: "Taller de sensibilización")
  evidencia_url: string | null  // URL de la imagen
  estado: string                // Estado (ej: "completado")
  fecha_hora_limite: string     // Fecha de la bitácora (ISO string)
}
```

### Procesamiento Interno
```typescript
interface EvidenciaGrupada {
  item: string                  // Nombre del ítem (de descripción)
  fecha: string                // Fecha de la bitácora
  fotos: EvidenciaInforme[]    // Array de fotos de este ítem
}

interface PaginaFotos {
  grupos: EvidenciaGrupada[]   // Grupos en esta página
  esUltimaPagina: boolean      // Flag informativo
}
```

## Ejemplo de Flujo Completo

### Escenario
Actividad: "Taller de sensibilización" con 8 evidencias fotográficas

**Evidencias:**
1. "Entrada del salón" - Foto 1
2. "Entrada del salón" - Foto 2 (misma descripción)
3. "Presentación del tema" - Foto 1
4. "Presentación del tema" - Foto 2
5. "Presentación del tema" - Foto 3
6. "Dinámica grupal" - Foto 1
7. "Dinámica grupal" - Foto 2
8. "Cierre y despedida" - Foto 1

### Agrupación Resultante
```
Grupo 1: "Entrada del salón" (2 fotos)
  - Grid de 2 columnas (49% cada una)
  
Grupo 2: "Presentación del tema" (3 fotos)
  - Grid de 3 columnas (32.33% cada una)
  
Grupo 3: "Dinámica grupal" (2 fotos)
  - Grid de 2 columnas (49% cada una)
  
Grupo 4: "Cierre y despedida" (1 foto)
  - Grid de 1 columna (100%)
```

### Distribución de Páginas
- **Página 1**: Portada
- **Página 2**: 
  - "Entrada del salón" (2 fotos, pequeño header)
  - "Presentación del tema" (3 fotos, pequeño header)
  - "Dinámica grupal" (2 fotos comienzan)
- **Página 3**:
  - "Dinámica grupal" (continuación de 2 fotos)
  - "Cierre y despedida" (1 foto)

## Estilos y Diseño

### Colores
- **Azul marino (nav)**: `#1c3664` - Títulos, bordes de ítem
- **Grises**: `#eee`, `#ddd`, `#999`, `#888` - Bordes, texto secundario
- **Blanco**: `#ffffff` - Fondo principal
- **Gris claro**: `#f5f5f5` - Fondo de captions

### Tipografía
- **Font**: Helvetica (compatible con PDF)
- **Tamaños**: 4.5-18pt según jerarquía

### Espaciado
- Margen de página: 22pt (left/right), 20pt (top/bottom)
- Gap entre fotos: 4pt
- Padding en captions: 2-3pt

## Funcionalidad Técnica

### Componente EvidenciasPDF

**Ubicación**: `components/informes/pdf/EvidenciasPDF.tsx`

**Función Principal**:
```typescript
export function EvidenciasPDF({ actividad, evidencias }: Props) {
  // 1. Agrupa evidencias por descripción
  const gruposEvidencias = agruparEvidenciasPorItem(evidencias)
  
  // 2. Distribuye grupos por página con paginación inteligente
  const paginasFotos = distribuirPorPaginas(gruposEvidencias)
  
  // 3. Renderiza Document con Page por cada página
  return <Document>
    {/* Portada */}
    <Page>...</Page>
    
    {/* Páginas de fotos */}
    {paginasFotos.map(pagina => (
      <Page key={pageIdx}>
        {/* Header común */}
        {/* Grupos de ítems */}
        {pagina.grupos.map(grupo => (
          <ItemSection>
            <ItemHeader>...</ItemHeader>
            <GridAdaptativa fotos={grupo.fotos} />
          </ItemSection>
        ))}
      </Page>
    ))}
  </Document>
}
```

### Funciones Auxiliares

#### `agruparEvidenciasPorItem(evidencias)`
Agrupa por `descripcion`, preservando orden de primera aparición.

```typescript
// Input
[
  { id: '1', descripcion: 'Taller', ... },
  { id: '2', descripcion: 'Dinamica', ... },
  { id: '3', descripcion: 'Taller', ... },
]

// Output
[
  { item: 'Taller', fecha: '...', fotos: [1, 3] },
  { item: 'Dinamica', fecha: '...', fotos: [2] },
]
```

#### `distribuirPorPaginas(grupos)`
Distribuye grupos por página respetando límites de altura (~600pt).

Lógica:
1. Para cada grupo, si >4 fotos: dividir en chunks de 4
2. Estimar altura de cada subgrupo
3. Si altura actual + nueva > 600pt: iniciar nueva página
4. Retornar array de `PaginaFotos`

#### `obtenerEstilosGrid(cantidad)`
Retorna estilos según cantidad de fotos:

```typescript
// cantidad = 1 → photoCard1, photoImg1
// cantidad = 2 → photoCard2, photoImg2
// cantidad = 3-4 → photoCard3, photoImg3
// cantidad >= 5 → photoCard4, photoImg4
```

#### `GridAdaptativa({ fotos })`
Componente React que renderiza la grilla con estilos correctos.

## Botón Generador

### Ubicación
`components/informes/GenerarEvidenciasPDFButton.tsx`

### Flujo
```
1. Click en botón
2. Generar PDF con EvidenciasPDF (mediante dinámico import)
3. Convertir PDF a Blob
4. Subir a Supabase Storage (carpeta "pdfs")
5. Guardar URL en requerimientos.informe_pdf3_url
6. Mostrar enlace de descarga
```

### Estados Visuales
- **Generating**: Spinner + "Generando PDF…"
- **Uploading**: Spinner + "Subiendo…"
- **Saving**: Spinner + "Guardando…"
- **Done**: ✓ "PDF guardado" + Link "Ver PDF"
- **Error**: ⚠ Mensaje de error + Botón "Reintentar"

## Integración con TabInforme

El componente se usa en `TabInforme.tsx`:

```tsx
<GenerarEvidenciasPDFButton
  actividad={actividad}
  evidencias={evidencias}
/>
```

Se integra dentro de la **Sección 3 — Evidencias de Campo** al lado del estado PDF 3.

## Base de Datos

### Tablas Involucradas

#### bitacora_entregas
```sql
SELECT id, descripcion, evidencia_url, estado, fecha_hora_limite
WHERE actividad_id = ?
  AND evidencia_url IS NOT NULL
ORDER BY fecha_hora_limite ASC
```

#### requerimientos
```sql
UPDATE requerimientos
SET informe_pdf3_url = ?
WHERE id = ?
```

## Validaciones y Manejo de Errores

### Casos Especiales

1. **Sin evidencias**
   - Botón deshabilitado
   - Mensaje: "Sin evidencias disponibles"

2. **Evidencia sin URL**
   - Se renderiza placeholder gris
   - Texto: "Sin imagen"

3. **Error en generación**
   - Capturado y mostrado en UI
   - Botón retorna a estado idle
   - Usuario puede reintentar

4. **Error en carga**
   - Muestra mensaje de error específico
   - No afecta a otros PDFs

## Performance y Consideraciones

### Tamaño de PDF
- **Tipico**: 2-5 MB (según cantidad y calidad de fotos)
- **Máximo**: ~10 MB (con muchas fotos en alta resolución)

### Tiempo de Generación
- **Generación**: 2-5 segundos (depende de cantidad de fotos)
- **Upload**: 1-3 segundos (depende del tamaño)
- **Total**: 4-8 segundos promedio

### Optimizaciones
- Fotos se comprimen automáticamente al subir a Supabase
- Dynamic import de dependencias para no cargar sin necesidad
- Lazy rendering de componentes

## Ejemplo de Uso Completo

```typescript
// En una actividad con evidencias
const actividad: InformeActividad = {
  id: 'act-123',
  nombre_actividad: 'Taller de sensibilización',
  numero_requerimiento: 'REQ-2024-0001',
  municipio: 'Cali',
  departamento: 'Valle del Cauca',
  lugar_detalle: 'Centro comunitario El Futuro',
  fecha_inicio: '2024-03-15',
  responsable_nombre: 'Juan Pérez',
  num_victimas: 45,
  informe_pdf3_url: null, // Aún no generado
  // ... otros campos
}

const evidencias: EvidenciaInforme[] = [
  {
    id: 'ev-1',
    descripcion: 'Entrada y bienvenida',
    evidencia_url: 'https://storage.url/img1.jpg',
    estado: 'completado',
    fecha_hora_limite: '2024-03-15T09:00:00',
  },
  // ... más evidencias
]

// Usuario hace click en "Generar PDF Evidencias"
// → PDF se genera, agrupa por descripción, distribuye por página
// → Se sube a Supabase Storage
// → URL se guarda en BD
// → Se muestra enlace "Ver PDF" en la UI
```

## Próximas Mejoras

- [ ] Agregar pie de página con numeración
- [ ] Incluir geolocalización de fotos (si está disponible)
- [ ] Permitir filtros de fecha rango
- [ ] Watermark personalizado por proyecto
- [ ] Exportar también en formato DOCX
- [ ] Firma digital del responsable
- [ ] Incluir metadatos de la cámara/teléfono
