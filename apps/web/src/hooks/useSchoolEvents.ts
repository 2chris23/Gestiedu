import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/axios';
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
        mutationFn: async (payload: EventPayload) => {
            const res = await api.post(`/events`, payload);
            return res.data as { event: SchoolEvent; affectedClasses: number; suspendedSessions: number };
        },
        onSuccess: invalidate,
    });
}

export function useDeleteEvent() {
    const invalidate = useInvalidateEvents();
    return useMutation({
        mutationFn: async (id: string) => {
            const res = await api.delete(`/events/${id}`);
            return res.data as { revertedSessions: number };
        },
        onSuccess: invalidate,
    });
}
