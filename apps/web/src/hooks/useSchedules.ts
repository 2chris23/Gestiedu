import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/axios';
import { ScheduleBlock } from '@/components/schedule/UniversalScheduleViewer';

interface BackendScheduleBlock {
    id: string;
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    location: string;
    classroomSubject: {
        id: string;
        subject: {
            id: string;
            name: string;
            code: string;
            color: string;
        };
        teacher?: {
            id: string;
            firstName: string;
            lastName: string;
        };
    };
}

interface ClassroomScheduleResponse {
    scheduleBlocks: BackendScheduleBlock[];
    total: number;
}

const DAYS_MAP = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

/**
 * Hook para obtener el horario de una sección/aula
 */
export function useClassroomSchedule(classroomId: string) {
    return useQuery({
        queryKey: ['schedule', 'classroom', classroomId],
        queryFn: async () => {
            const response = await api.get<{ data: ClassroomScheduleResponse | BackendScheduleBlock[] }>(`/schedules/classroom/${classroomId}`);
            // Manejar compatibilidad si el backend envía directamente el array o dentro de .data.scheduleBlocks
            const data = response.data?.data || response.data;
            return (data as ClassroomScheduleResponse)?.scheduleBlocks || data;
        },
        enabled: !!classroomId,
        staleTime: 5 * 60 * 1000, // 5 minutos
    });
}

/**
 * Transforma los datos del backend al formato esperado por el componente
 */
export function transformScheduleData(data: BackendScheduleBlock[] | undefined): ScheduleBlock[] {
    if (!data || !Array.isArray(data)) return [];

    return data.map((block) => ({
        id: block.id,
        day: DAYS_MAP[block.dayOfWeek] || 'Lun',
        startTime: block.startTime,
        endTime: block.endTime,
        subject: block.classroomSubject?.subject?.name || 'Materia desconocida',
        location: block.location || 'Sin aula',
        detail: block.classroomSubject?.teacher
            ? `Prof. ${block.classroomSubject.teacher.firstName} ${block.classroomSubject.teacher.lastName}`
            : 'Sin profesor',
        color: block.classroomSubject?.subject?.color || '#6366f1',
        link: block.classroomSubject?.subject ? `/dashboard/materias/${block.classroomSubject.subject.id}` : '#',
        subjectId: block.classroomSubject?.subject?.id,
    }));
}

/**
 * Mutación para generar horario automático
 */
export function useAutoGenerateSchedule() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (classroomId: string) => {
            const response = await api.post(`/schedules/classroom/${classroomId}/auto-generate`);
            return response.data;
        },
        onSuccess: (_, classroomId) => {
            queryClient.invalidateQueries({ queryKey: ['schedule', 'classroom', classroomId] });
        },
    });
}

/**
 * Mutación para actualización masiva (Drag & Drop)
 */
export function useBulkUpdateSchedule(classroomId: string) {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (payload: { blocks: any[], deleteIds?: string[] }) => {
            const response = await api.post(`/schedules/classroom/${classroomId}/bulk`, payload);
            return response.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['schedule', 'classroom', classroomId] });
        },
    });
}

/**
 * Hook para obtener resumen de horarios por ciclo escolar
 */
export function useScheduleSummary(academicYearId: string) {
    return useQuery({
        queryKey: ['scheduleSummary', academicYearId],
        queryFn: async () => {
            const response = await api.get(`/schedules/summary/${academicYearId}`);
            return response.data;
        },
        enabled: !!academicYearId,
        staleTime: 2 * 60 * 1000,
    });
}

/**
 * Hook para obtener horario de un profesor
 */
export function useTeacherScheduleBlocks(teacherId: string) {
    return useQuery({
        queryKey: ['teacherScheduleBlocks', teacherId],
        queryFn: async () => {
            const response = await api.get(`/schedules/teacher/${teacherId}/blocks`);
            return response.data.scheduleBlocks;
        },
        enabled: !!teacherId,
        staleTime: 5 * 60 * 1000,
    });
}

/**
 * Transforma datos de horario de profesor al formato del viewer
 */
export function transformTeacherScheduleData(data: any[] | undefined): ScheduleBlock[] {
    if (!data || !Array.isArray(data)) return [];
    return data.map((block: any) => ({
        id: block.id,
        day: DAYS_MAP[block.dayOfWeek] || 'Lun',
        startTime: block.startTime,
        endTime: block.endTime,
        subject: block.classroomSubject?.subject?.name || 'Materia desconocida',
        location: block.classroomSubject?.classroom?.name || 'Sin aula',
        detail: block.classroomSubject?.classroom
            ? `${block.classroomSubject.classroom.name}`
            : 'Sin sección',
        color: block.classroomSubject?.subject?.color || '#6366f1',
        link: block.classroomSubject?.subject ? `/dashboard/materias/${block.classroomSubject.subject.id}` : '#'
    }));
}

export interface ClassSessionHistory {
    blockId: string | null;
    startTime: string;
    endTime: string;
    subject: { id: string; name: string; color: string };
    teacher?: { id: string; firstName: string; lastName: string };
    isRecorded: boolean;
    isExtra?: boolean;
    sessionInfo: {
        id: string;
        topic: string;
        observations: string;
        startTime: string;
        endTime: string;
    } | null;
}

/**
 * Hook para obtener el historial de clases por fecha
 */
export function useClassroomHistory(classroomId: string, date: string) {
    return useQuery({
        queryKey: ['classroomHistory', classroomId, date],
        queryFn: async () => {
            const response = await api.get<ClassSessionHistory[]>(`/schedules/classroom/${classroomId}/history`, {
                params: { date }
            });
            return response.data;
        },
        enabled: !!classroomId && !!date,
    });
}
