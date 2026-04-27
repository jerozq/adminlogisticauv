/**
 * EJEMPLO DE INTEGRACIÓN: AgendaSemanal en el Tablero de Ejecución
 * 
 * Este archivo muestra cómo integrar el componente <AgendaSemanal /> en la página
 * de detalle de actividades ([id]/page.tsx) o como tab adicional en ActivityTabs.
 * 
 * El componente espera:
 *   - entregables: Array de HitoCronogramaIA (con campos: fecha, hora, descripcion_item, cantidad)
 *   - fechaInicio: Date de inicio (YYYY-MM-DD) para calcular la semana actual
 *   - onSaveEntregable: Callback para actualizar/crear entregables
 *   - onDeleteEntregable: Callback para eliminar entregables
 */

// ============================================================
// OPCIÓN 1: Como Tab dentro de ActivityTabs
// ============================================================

// En components/ejecucion/ActivityTabs.tsx, añade una nueva pestaña:

import { AgendaSemanal } from './AgendaSemanal'

export function ActivityTabs({
  actividadId,
  initialEntregas,
  fechaInicioDefault,
  horaInicioDefault,
  cronogramaIACache,
}: Props) {
  const [activeTab, setActiveTab] = useState<'agenda-ia' | 'agenda-semanal' | 'costos' | 'reembolsos'>('agenda-ia')

  return (
    <div className="space-y-4">
      {/* Tabs Navigation */}
      <div className="flex gap-2 border-b border-zinc-200">
        <button
          onClick={() => setActiveTab('agenda-ia')}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === 'agenda-ia'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-zinc-600 hover:text-zinc-900'
          }`}
        >
          Agenda IA (Timeline)
        </button>
        <button
          onClick={() => setActiveTab('agenda-semanal')}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === 'agenda-semanal'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-zinc-600 hover:text-zinc-900'
          }`}
        >
          Semana (Grid)
        </button>
        {/* Otros tabs */}
      </div>

      {/* Tab Content */}
      {activeTab === 'agenda-ia' && <AgendaView {...agendaViewProps} />}
      {activeTab === 'agenda-semanal' && (
        <AgendaSemanal
          entregables={cronogramaIACache || []}
          fechaInicio={fechaInicioDefault}
          onSaveEntregable={async (e) => {
            // TODO: Implementar actualización en BD
            console.log('Guardar entregable:', e)
          }}
          onDeleteEntregable={async (id) => {
            // TODO: Implementar eliminación en BD
            console.log('Eliminar entregable:', id)
          }}
        />
      )}
    </div>
  )
}

// ============================================================
// OPCIÓN 2: Panel independiente en la página de ejecución
// ============================================================

// En app/ejecucion/[id]/page.tsx (Server Component), renderiza:

export default async function ActividadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const sb = getSupabase()

  // ... cargar actividad y cronogramaCIA (datos ya existentes)
  const actividad = rawResult.data
  const cronogramaIACache = Array.isArray(actividad.cronograma_ia) && actividad.cronograma_ia.length > 0
    ? actividad.cronograma_ia
    : null

  return (
    <div className="space-y-8">
      {/* Header con detalles de la actividad */}
      <header>{/* ... */}</header>

      {/* Tabs with Agenda Semanal */}
      <section>
        <h2 className="text-lg font-bold text-zinc-900 mb-4">Coordinación Logística</h2>
        <ActivityTabs
          actividadId={id}
          initialEntregas={entregas}
          fechaInicioDefault={actividad.fecha_inicio}
          horaInicioDefault={actividad.hora_inicio}
          cronogramaIACache={cronogramaIACache}
        />
      </section>
    </div>
  )
}

// ============================================================
// DATOS DE ENTRADA: Estructura del cronograma_ia
// ============================================================

/*
La tabla 'requerimientos' (o 'actividades') contiene una columna JSONB:

  cronograma_ia: [
    {
      "fecha": "2026-05-20",
      "hora": "08:00",
      "descripcion_item": "Montaje de salón principal",
      "cantidad": 1
    },
    {
      "fecha": "2026-05-20",
      "hora": "12:00",
      "descripcion_item": "Almuerzo",
      "cantidad": 150
    },
    ...
  ]

El componente AgendaSemanal renderiza este array en una vista de Grid
semanal (Días en columnas, Horas de 6 AM a 8 PM en filas).
*/

// ============================================================
// FUNCIONALIDADES IMPLEMENTADAS
// ============================================================

/*
1. VISUALIZACIÓN SEMANAL (Grid CSS):
   - Encabezado: Etiqueta de hora + días de la semana
   - Filas: 15 filas (6 AM a 8 PM)
   - Columnas: 7 columnas (Lunes a Domingo)
   - Navegación: Botones "< Semana Anterior", "Hoy", "Próxima Semana >"

2. TARJETAS DE ENTREGABLE (Liquid Glass):
   - Fondo translúcido: bg-white/10, backdrop-blur-md, ring-1 ring-white/10
   - Color según estado:
     * Pendiente: bg-yellow-400/20 ring-yellow-300/50
     * Entregado: bg-emerald-400/20 ring-emerald-300/50
   - Contenido: Emoji + Descripción + Cantidad (ej: "🍽️ Almuerzos x150")
   - Hover: Scale 1.05, botones de Editar y Eliminar aparecen

3. INTERACCIÓN: CLICK EN TARJETA
   - Abre modal de edición
   - Campos: Fecha, Hora, Descripción, Cantidad
   - Botones: "Actualizar" / "Cancelar"
   - Callback: onSaveEntregable(entregable)

4. INTERACCIÓN: CLICK EN ESPACIO VACÍO
   - Abre modal de creación
   - Pre-llena fecha y hora según celda clickeada
   - Campos editables: Descripción, Cantidad
   - Botones: "Crear" / "Cancelar"
   - Callback: onSaveEntregable(newEntregable)

5. CODIFICACIÓN DE COLORES:
   - Horarios 6-10 AM: bg-amber-100/40 (mañana)
   - Horarios 12-14 (almuerzo): bg-orange-100/40
   - Horarios 14-17 (tarde): bg-blue-100/40
   - Otros: bg-white/5

6. EMOJIS AUTOMÁTICOS:
   - Detecta palabras en descripcion_item
   - "almuerzo" → 🍽️, "transporte" → 🚚, "alojamiento" → 🏨, etc.
*/

// ============================================================
// PRÓXIMOS PASOS / EXTENSIONES
// ============================================================

/*
1. EDICIÓN Y PERSISTENCIA:
   - onSaveEntregable debe hacer un PATCH a bitacora_entregas (DB)
   - onDeleteEntregable debe hacer un DELETE de bitacora_entregas (DB)
   - Ambos deben invalidar/revalidar la caché de cronograma_ia

2. DRAG & DROP (opcional):
   - Permitir arrastrar tarjetas de entregable a otras celdas
   - Al soltar, actualizar fecha y hora en DB

3. MULTIDÍA (opcional):
   - Permitir crear un entregable que abarque múltiples días
   - Renderizar con un fondo continuo

4. NOTIFICACIONES EN TIEMPO REAL:
   - WebSocket o polling para actualizar entregas cuando otros usuarios editan
   - Refrescar el grid sin necesidad de recargar la página

5. EXPORTACIÓN:
   - Botón "Descargar PDF" o "Enviar por correo" de la semana actual
   - Incluir todos los entregables, estados, responsables
*/

export {}
