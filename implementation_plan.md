# Plan de Implementación — Refactor Tesorería + Costos

## Decisiones confirmadas
- ✅ Saldo calculado en tiempo real desde movimientos
- ✅ Cantidades independientes con modal de verificación
- ✅ Cantidad obligatoria
- ✅ CRUD por entrada individual de costo
- ✅ Modal inline para agregar costos
- ✅ Opción C (híbrida): default proyecto + auto-transfer
- ✅ Opción B (toggle): 1 movimiento por costo, estado EJECUTADO/ANULADO
- ✅ Confirmación al desmarcar pagado
- ✅ Movimientos anulados: ocultos por defecto con toggle

## Fases

### Fase 1: SQL Migration + Saldo Fix
- [x] Crear migración SQL (campos nuevos en ejecucion_costos + movimientos_bancarios)
- [x] Calcular saldo en tiempo real en `listarCuentas`
- [x] Helper `calcularSaldoCuenta()`

### Fase 2: Refactor registrarCostoReal
- [x] Nuevos campos: cantidad, precio_unitario, estado_pago, observaciones
- [x] Input flexible: unitario o total
- [x] CRUD completo (crear, editar, eliminar)

### Fase 3: Tabla de Costos UI
- [x] Columnas: cotizado vs costo vs utilidad
- [x] Modal inline para agregar
- [x] Verificación de cantidades distintas

### Fase 4: Toggle de Pago
- [x] Crear/toglear movimiento al marcar pagado
- [x] Diálogo de confirmación al desmarcar
- [x] Saldo solo cuenta EJECUTADO

### Fase 5: Origen Híbrido
- [x] Selector de cuentas (todas las de tesorería)
- [x] Auto-transfer desde socio → proyecto
- [x] Reversión al desmarcar

## Validación
- [x] `npm run build` en `logistica-app`

## Estado actual
- Refactor de costos y tesorería integrado en UI, server actions y documentación del plan.
