'use client'

import { useMemo } from 'react'
import { useRouter } from 'next/navigation'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import esLocale from '@fullcalendar/core/locales/es'
import type { EventClickArg, EventInput } from '@fullcalendar/core'
import type { ActividadCalendarioMaestro } from '@/types/ejecucion'
import './CalendarioMaestro.css'

type EventEstado = 'generado' | 'en_ejecucion' | 'liquidado' | 'aplazado' | 'cancelado'

interface CalendarEventProps {
  actividadId: string
  actividadNombre: string
  actividadEstado: EventEstado | string
  entregableId: string | null
  fecha: string
  hora: string
  descripcionItem: string
  cantidad: number
}

function colorClassByEstado(estado: string): string {
  if (estado === 'generado') return 'master-event-preparado'
  if (estado === 'en_ejecucion') return 'master-event-ejecucion'
  if (estado === 'liquidado') return 'master-event-liquidado'
  if (estado === 'aplazado') return 'master-event-aplazado'
  return 'master-event-default'
}

function useMasterCalendarEvents(actividades: ActividadCalendarioMaestro[]): EventInput[] {
  return useMemo(() => {
    const out: EventInput[] = []

    for (const actividad of actividades) {
      for (const item of actividad.cronograma_items) {
        const start = new Date(`${item.fecha}T${item.hora}:00`)
        if (Number.isNaN(start.getTime())) continue

        const end = new Date(start.getTime() + 60 * 60 * 1000)
        const eventId = item.entregable_id
          ? `${actividad.id}:${item.entregable_id}`
          : `${actividad.id}:${item.fecha}:${item.hora}:${item.descripcion_item}:${item.cantidad}`

        out.push({
          id: eventId,
          title: `${item.descripcion_item} - [${actividad.nombre_actividad}]`,
          start,
          end,
          classNames: [colorClassByEstado(actividad.estado), 'cursor-pointer hover:opacity-80 transition-opacity'],
          extendedProps: {
            actividadId: actividad.id,
            actividadNombre: actividad.nombre_actividad,
            actividadEstado: actividad.estado,
            entregableId: item.entregable_id,
            fecha: item.fecha,
            hora: item.hora,
            descripcionItem: item.descripcion_item,
            cantidad: item.cantidad,
          } satisfies CalendarEventProps,
        })
      }
    }

    return out
  }, [actividades])
}

export function CalendarioMaestro({ actividades }: { actividades: ActividadCalendarioMaestro[] }) {
  const router = useRouter()
  const events = useMasterCalendarEvents(actividades)

  const totalItems = events.length

  function handleEventClick(arg: EventClickArg) {
    const props = arg.event.extendedProps as CalendarEventProps
    // Redirigir al detalle de la actividad enfocando el tab de agenda
    router.push(`/ejecucion/${props.actividadId}`)
  }

  if (totalItems === 0) {
    return (
      <div className="rounded-2xl p-10 text-center bg-white/60 backdrop-blur-xl border border-white/40 shadow-sm">
        <p className="text-sm font-semibold text-slate-700">No hay ítems de cronograma para mostrar.</p>
        <p className="text-xs text-slate-500 mt-1">Genera o completa cronogramas para verlos en el Calendario Maestro.</p>
      </div>
    )
  }

  return (
    <div className="rounded-3xl p-3 md:p-4 bg-white/60 backdrop-blur-xl border border-white/40 shadow-sm calendar-master-wrapper">
      <FullCalendar
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
        locale={esLocale}
        initialView="dayGridMonth"
        headerToolbar={{
          left: 'prev,next today',
          center: 'title',
          right: 'dayGridMonth,timeGridWeek,timeGridDay',
        }}
        buttonText={{
          today: 'Hoy',
          month: 'Mes',
          week: 'Semana',
          day: 'Día',
        }}
        events={events}
        editable={false}
        selectable={false}
        eventClick={handleEventClick}
        height="auto"
      />
    </div>
  )
}
