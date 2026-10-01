import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/axios';
import { hacerODejarPendiente } from '@/lib/por-enviar';
import { toLocalYMD } from '@/utils/date.utils';

export type EventScope = 'INSTITUTE' | 'GRADES' | 'CLASSROOMS';

export interface SchoolEvent {
    id: string;
    title: string;
    description: string | null;
    /** YYYY-MM-DD */
    date: string;
    startTime: string;
    endTime: string;
    scope: EventScope;
    grades: number[];
    classroomIds: string[];
    academicYearId: string;
    suspendedCount?: number;
    createdBy: { id: string; firstName: string; lastName: string } | null;
}

/**
 * UN DÍA SIN CLASES
 *
 * Es un evento más, con la franja del día entero: así cubre la mañana y la
 * tarde, y el servidor suspende y reactiva sus clases por el mismo camino que
 * las de cualquier evento.
 */
export const DIA_ENTERO = { startTime: '00:00', endTime: '23:59' } as const;

export const esDiaEntero = (e: Pick<SchoolEvent, 'startTime' | 'endTime'>) =>
    e.startTime === DIA_ENTERO.startTime && e.endTime === DIA_ENTERO.endTime;

export interface ClassInSlot {
    blockId: string;
    classroomId: string;
    classroomName: string;
    grade: number;
    subjectId: string;
    subjectName: string;
    subjectColor: string | null;
    teacherId: string | null;
    teacherName: string | null;
    startTime: string;
    endTime: string;
}

export interface EventDay {
    date: string;
    dayOfWeek: number;
    academicYear: { id: string; name: string };
    classes: ClassInSlot[];
    classrooms: Array<{ id: string; name: string; grade: number; section: string }>;
    events: SchoolEvent[];
}

export interface EventPayload {
    title: string;
    description?: string;
    date: string;
    startTime: string;
    endTime: string;
    scope: EventScope;
    grades?: number[];
    classroomIds?: string[];
}

/**
 * Fecha LOCAL como YYYY-MM-DD. No usar `toISOString()`: en Venezuela (UTC-4) a
 * partir de las 8 de la noche devolvería el día siguiente.
 */
// Alias: la implementación única vive en utils/date.utils.ts
export const toYMD = toLocalYMD;

/** Eventos de un rango (para pintar el mes). */
export function useEventsRange(from: string, to: string) {
    return useQuery({
        queryKey: ['schoolEvents', 'range', from, to],
        queryFn: async () => {
            const res = await api.get(`/events`, { params: { from, to } });
            return res.data.events as SchoolEvent[];
        },
        enabled: Boolean(from && to),
        staleTime: 60 * 1000,
    });
}

/** Todo lo de un día: clases por bloque, eventos y secciones del ciclo. */
export function useEventDay(date: string | null) {
    return useQuery({
        queryKey: ['schoolEvents', 'day', date],
        queryFn: async () => {
            const res = await api.get(`/events/day`, { params: { date } });
            return res.data as EventDay;
        },
        enabled: Boolean(date),
        staleTime: 30 * 1000,
    });
}

/**
 * Las clases que suspendería un evento, sin guardarlo. La calcula el servidor
 * con la misma función que la suspensión real, así que el número que se muestra
 * en la ventana es el que se va a cumplir.
 */
export function usePreviewEvent() {
    return useMutation({
        mutationFn: async (payload: Omit<EventPayload, 'title'>) => {
            const res = await api.post(`/events/preview`, payload);
            return res.data as { classes: ClassInSlot[]; count: number };
        },
    });
}

function useInvalidateEvents() {
    const queryClient = useQueryClient();
    return () => {
        queryClient.invalidateQueries({ queryKey: ['schoolEvents'] });
        // Las clases suspendidas cambian lo que ve Clase en Vivo e historial
        queryClient.invalidateQueries({ queryKey: ['classroomHistory'] });
        queryClient.invalidateQueries({ queryKey: ['liveClass'] });
    };
}

export function useCreateEvent() {
    const invalidate = useInvalidateEvents();
    return useMutation({
        mutationFn: async (payload: EventPayload) =>
            // Sin conexión queda pendiente (⏱) y se crea al volver; el
            // servidor no lo crea dos veces aunque llegue repetido (X-Cambio).
            hacerODejarPendiente(async () => (await api.post(`/events`, payload)).data as { event: SchoolEvent; affectedClasses: number; suspendedSessions: number }, {
                tipo: 'evento',
                grupo: 2,
                metodo: 'post',
                url: '/events',
                objeto: `evento|${crypto.randomUUID()}`,
                resumen: `Evento «${payload.title}» (${payload.date})`,
                datos: payload,
            }),
        onSuccess: invalidate,
    });
}

export function useDeleteEvent() {
    const invalidate = useInvalidateEvents();
    return useMutation({
        mutationFn: async (id: string) =>
            hacerODejarPendiente(async () => (await api.delete(`/events/${id}`)).data as { revertedSessions: number }, {
                tipo: 'evento',
                grupo: 4,
                metodo: 'delete',
                url: `/events/${id}`,
                objeto: `evento|${id}`,
                resumen: 'Borrar un evento',
            }),
        onSuccess: invalidate,
    });
}
