# Guía de Prueba - PDF 3: Reporte de Evidencias Fotográficas

## 🧪 Cómo Probar la Nueva Funcionalidad

### Prerequisitos
- Aplicación ejecutándose localmente o en Vercel
- Una actividad creada en `/ejecucion/[id]`
- Evidencias/fotos asociadas a la actividad

### Paso 1: Acceder a la Actividad

1. Navega a la sección **Ejecución** (http://localhost:3000/ejecucion o la URL de tu ambiente)
2. Selecciona una actividad existente o crea una nueva
3. En la vista de detalle `/ejecucion/[id]`, ve al tab **"Generar Informe"**

### Paso 2: Localizar el Botón de Evidencias

En el tab "Generar Informe":
- Scroll hacia la sección **"Evidencias de Campo"**
- Verás un botón con icono 📷 que dice:
  - **"Generar PDF Evidencias"** (si no existe PDF3 aún)
  - **"Regenerar PDF Evidencias"** (si ya fue generado)

### Paso 3: Generar el PDF

1. **Click en el botón** "Generar PDF Evidencias"
2. **Observa los estados**:
   - Spinner + "Generando PDF…" (2-5 segundos)
   - Spinner + "Subiendo…" (1-3 segundos)
   - Spinner + "Guardando…" (1 segundo)
   - Checkmark + "PDF guardado" (completado)

### Paso 4: Verificar el PDF

Una vez completado:
1. Verás un enlace azul **"Ver PDF"** debajo del botón
2. **Click en "Ver PDF"** abre el PDF en nueva pestaña
3. Observa la estructura:
   - **Página 1**: Portada con información de la actividad
   - **Páginas 2+**: Evidencias agrupadas por ítem

### Paso 5: Validar Grilla Adaptativa

En las páginas de contenido del PDF, verifica:

#### Para Ítems con 1 Foto
- La foto ocupa **el 100% del ancho** (centrada 60-70%)
- Imagen de **mayor tamaño** para visibilidad

#### Para Ítems con 2 Fotos
- Cada foto ocupa **49% del ancho**
- Disposición **lado a lado** (1 fila, 2 columnas)

#### Para Ítems con 3-4 Fotos
- Cada foto ocupa **32.33% del ancho**
- Disposición **3 columnas** (o 2x2 si exactamente 4 fotos)

#### Para Ítems con 5+ Fotos
- Cada foto ocupa **24% del ancho**
- Disposición **4 columnas**
- **Page break automático** si hay muchas fotos

### Paso 6: Validar Headers de Ítem

Para cada grupo de fotos:
- Verás un **header con el nombre del ítem** (ej: "Taller de sensibilización")
- **Fecha** de la bitácora en formato DD/MM/YYYY
- **Borde azul** a la izquierda para separación visual

### Paso 7: Validar Numeración

Cada foto debe mostrar:
- **"Foto #1", "Foto #2"**, etc.
- Descripción de la foto si existe
- Número progresivo por página

---

## 🎯 Casos de Prueba Específicos

### Test Case 1: Actividad con Pocas Evidencias (1-2)

**Objetivo**: Verificar grilla con 1-2 fotos

**Pasos**:
1. Usa una actividad con 1-2 evidencias
2. Genera el PDF
3. Verifica que las fotos ocupan **mucho espacio** (grilla grande)

**Resultado esperado**: ✅ Fotos grandes (100% o 49% ancho)

---

### Test Case 2: Actividad con Evidencias Variadas (3-6)

**Objetivo**: Verificar adaptabilidad de grilla

**Pasos**:
1. Usa una actividad con ítems de diferente cantidad:
   - Ítem A: 2 fotos
   - Ítem B: 4 fotos
   - Ítem C: 3 fotos
2. Genera el PDF
3. Verifica cada grupo adapta su grilla

**Resultado esperado**: ✅ Cada grupo usa tamaño diferente según cantidad

---

### Test Case 3: Fotos sin URL (Fallback)

**Objetivo**: Verificar manejo de imágenes faltantes

**Pasos**:
1. Si hay evidencias sin URL en BD
2. Genera el PDF
3. Busca placeholders grises

**Resultado esperado**: ✅ Placeholder gris con texto "Sin imagen"

---

### Test Case 4: Múltiples Ítems en Una Página

**Objetivo**: Verificar paginación inteligente

**Pasos**:
1. Usa actividad con varios ítems pequeños (1-2 fotos cada uno)
2. Genera PDF
3. Verifica que varios ítems aparecen en misma página

**Resultado esperado**: ✅ Página 2 muestra 2-3 ítems diferentes

---

### Test Case 5: Ítem Grande con Muchas Fotos (5+)

**Objetivo**: Verificar page break automático

**Pasos**:
1. Usa actividad con ítem que tiene 6+ fotos
2. Genera PDF
3. Verifica que:
   - Primeras 4 fotos en grilla 4x1
   - Siguientes 4 fotos continúan en nueva página
   - Header dice "(continuación)"

**Resultado esperado**: ✅ Page break automático, grupo mantiene unidad

---

## 📊 Métricas de Validación

| Métrica | Esperado | Método de Verificación |
|---------|----------|----------------------|
| Tiempo generación | 2-5 seg | Cronómetro desde click hasta "PDF guardado" |
| Tamaño PDF | 2-5 MB | Inspector de archivos en Supabase Storage |
| Páginas | 1+ (portada + contenido) | Contador de páginas en visor PDF |
| Grupos visibles | Todos los ítems | Contar secciones con headers |
| Grilla correcta | 1/2/3-4/5+ según cantidad | Medir proporciones visuales en PDF |
| Headers presentes | 1 por grupo | Contar encabezados azules |
| Numeración | Foto #1, #2, etc. | Verificar números en captions |

---

## 🐛 Troubleshooting

### Problema: "Botón deshabilitado"
**Posible causa**: No hay evidencias con URL
**Solución**: 
1. Verifica que la actividad tiene evidencias en `bitacora_entregas`
2. Verifica que `evidencia_url` no es null

### Problema: "Error al generar PDF"
**Posible causa**: URL de imagen inválida o acceso denegado
**Solución**:
1. Verifica URLs en BD
2. Verifica permisos en Supabase Storage
3. Reintentar con botón

### Problema: "Error al subir"
**Posible causa**: Problema con Supabase Storage
**Solución**:
1. Verifica conexión a Supabase
2. Verifica bucket `storage` existe
3. Verifica permisos de escritura

### Problema: "Error guardando en BD"
**Posible causa**: Fallo al actualizar `requerimientos`
**Solución**:
1. Verifica `requerimientos` tabla existe
2. Verifica columna `informe_pdf3_url` existe
3. Verifica permisos de actualización

### Problema: "Fotos se ven cortadas/distorsionadas"
**Posible causa**: Imágenes no caben bien
**Solución**:
1. Verifica dimensiones de imagen original
2. Nota: `object-fit: cover` mantiene proporciones
3. Podría ser intención del diseño

---

## ✅ Checklist de Validación Final

Después de probar todos los casos, marca:

- [ ] PDF se genera en 4-8 segundos
- [ ] Estados de botón cambian correctamente (generating → uploading → saving → done)
- [ ] Portada muestra información correcta
- [ ] Cada grupo tiene su header con título y fecha
- [ ] 1 foto por ítem ocupa 100% ancho
- [ ] 2 fotos por ítem muestran lado a lado (49% cada una)
- [ ] 3-4 fotos por ítem en grilla 3 columnas
- [ ] 5+ fotos por ítem en grilla 4 columnas
- [ ] Fotos sin URL muestran placeholder gris
- [ ] Numeración (#1, #2, etc.) es correcta
- [ ] Múltiples ítems distribuyen bien por páginas
- [ ] Ítems con 5+ fotos hacen page break
- [ ] PDF se descarga correctamente
- [ ] Enlace "Ver PDF" abre en nueva pestaña
- [ ] URL se guardó en BD (`requerimientos.informe_pdf3_url`)

---

## 📞 Soporte

Si encuentras algún problema:

1. **Revisa console del navegador** (F12 → Console)
2. **Revisa logs del servidor** (terminal de Next.js)
3. **Revisa logs de Supabase** (dashboard de Supabase)
4. **Verifica compilación**: `npm run build`
5. **Verifica tests**: `npm run test`

---

## 🎉 Validación Completada

Cuando hayas probado todos los casos y el checklist esté 100% marcado:

✅ **PDF 3: Reporte de Evidencias Fotográficas está listo para producción**

---

## 📸 Esperado Visual

### Portada (Página 1)
```
┌─────────────────────────────────────┐
│                                     │
│  UNIDAD PARA LAS VÍCTIMAS           │
│  CONTRATO 931 DE 2025               │
│                                     │
│  REGISTRO FOTOGRÁFICO DE ACTIVIDAD  │
│  Evidencias de campo                │
│                                     │
│  ┌─────────────────────────────────┐│
│  │ Actividad: Taller...            ││
│  │ Requerimiento: REQ-2024-0001    ││
│  │ Fecha: 15/03/2024               ││
│  │ Lugar: Cali, Valle del Cauca    ││
│  │ Responsable: Juan Pérez         ││
│  │ Beneficiarios: 45               ││
│  │ Total evidencias: 8             ││
│  └─────────────────────────────────┘│
│                                     │
│  Generado el 28 de marzo de 2024    │
│                                     │
└─────────────────────────────────────┘
```

### Página de Contenido
```
┌─────────────────────────────────────┐
│ 🏢 UNIDAD PARA LAS VÍCTIMAS         │
│ REGISTRO FOTOGRÁFICO DE ACTIVIDAD   │
│ Taller de sensibilización           │
│ Req. REQ-2024-0001 • 15/03 • Pág. 2 │
└─────────────────────────────────────┘

┌─ ENTRADA DEL SALÓN ─────────────────┐
│ 15 de marzo de 2024                 │
│                                     │
│  ┌──────────────┐  ┌──────────────┐ │
│  │              │  │              │ │
│  │  Foto #1     │  │  Foto #2     │ │
│  │              │  │              │ │
│  └──────────────┘  └──────────────┘ │
│  Foto #1          Foto #2           │
│  Registro...      Registro...       │
│                                     │
└─────────────────────────────────────┘

┌─ DINÁMICA GRUPAL ───────────────────┐
│ 15 de marzo de 2024                 │
│                                     │
│  ┌────────┐ ┌────────┐ ┌────────┐  │
│  │Foto #1 │ │Foto #2 │ │Foto #3 │  │
│  └────────┘ └────────┘ └────────┘  │
│  Foto #1    Foto #2    Foto #3     │
│                                     │
└─────────────────────────────────────┘
```

---

**Última actualización**: 2024
**Versión**: 1.0 - Inicial
**Estado**: ✅ READY FOR TESTING
