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
        // Sin aula asignada no se inventa un texto: «Sin aula» ocupaba sitio en
        // cada bloque del horario para decir que no hay nada que decir.
        location: block.location || '',
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
 * Materias que el admin le asignó al profesor (sección + materia + bloques
 * semanales). Es lo que alimenta la barra lateral arrastrable del editor y el
 * contador de bloques restantes.
 */
export function useTeacherClassroomSubjects(teacherId: string) {
    return useQuery({
        queryKey: ['teacherClassroomSubjects', teacherId],
        queryFn: async () => {
            const response = await api.get(`/schedules/teacher/${teacherId}/subjects`);
            return response.data.classroomSubjects;
        },
        enabled: !!teacherId,
        staleTime: 5 * 60 * 1000,
    });
}

/**
 * Guarda los movimientos hechos en el horario de un profesor.
 *
 * Escribe sobre los MISMOS `ScheduleBlock` que ve el horario de la sección: por
 * eso invalida también las consultas de sección, o la otra vista se quedaría
 * mostrando el bloque en su sitio anterior.
 */
export function useBulkUpdateTeacherSchedule(teacherId: string) {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (payload: {
            blocks: Array<{
                id?: string;
                classroomSubjectId: string;
                dayOfWeek: number;
                startTime: string;
                endTime: string;
            }>;
            deleteIds?: string[];
        }) => {
            const response = await api.post(`/schedules/teacher/${teacherId}/bulk`, payload);
            return response.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['teacherScheduleBlocks', teacherId] });
            queryClient.invalidateQueries({ queryKey: ['teacherClassroomSubjects', teacherId] });
            queryClient.invalidateQueries({ queryKey: ['schedule', 'classroom'] });
            queryClient.invalidateQueries({ queryKey: ['scheduleSummary'] });
        },
    });
}

/**
 * Coloca al azar los bloques que le faltan al profesor.
 *
 * Las franjas se envían desde el cliente porque salen de la configuración del
 * instituto (`useSchedulePeriods`), que cada liceo puede cambiar.
 */
export function useAutoFillTeacherSchedule(teacherId: string) {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (payload: {
            periods: Array<{ startTime: string; endTime: string }>;
            days?: number[];
        }) => {
            const response = await api.post(`/schedules/teacher/${teacherId}/auto-fill`, payload);
            return response.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['teacherScheduleBlocks', teacherId] });
            queryClient.invalidateQueries({ queryKey: ['teacherClassroomSubjects', teacherId] });
            queryClient.invalidateQueries({ queryKey: ['schedule', 'classroom'] });
            queryClient.invalidateQueries({ queryKey: ['scheduleSummary'] });
        },
    });
}

/**
 * Horas personales del profesor (planificación, guardia…).
 *
 * A diferencia de las clases, que se guardan en lote al pulsar "Guardar
 * Cambios", estas se persisten de inmediato: son registros independientes que
 * no pertenecen a ninguna sección, así que no tiene sentido mezclarlas en el
 * lote del horario de clases.
 */
export function usePersonalBlockMutations(teacherId: string) {
    const queryClient = useQueryClient();

    const invalidate = () => {
        queryClient.invalidateQueries({ queryKey: ['teacherScheduleBlocks', teacherId] });
        queryClient.invalidateQueries({ queryKey: ['schedule', 'classroom'] });
    };

    const create = useMutation({
        mutationFn: async (payload: {
            dayOfWeek: number;
            startTime: string;
            endTime: string;
            title: string;
            notes?: string;
        }) => {
            const response = await api.post(`/schedules/teacher/${teacherId}/personal-blocks`, payload);
            return response.data;
        },
        onSuccess: invalidate,
    });

    const update = useMutation({
        mutationFn: async ({
            id,
            ...payload
        }: {
            id: string;
            dayOfWeek?: number;
            startTime?: string;
            endTime?: string;
            title?: string;
            notes?: string;
        }) => {
            const response = await api.put(`/schedules/personal-blocks/${id}`, payload);
            return response.data;
        },
        onSuccess: invalidate,
    });

    const remove = useMutation({
        mutationFn: async (id: string) => {
            const response = await api.delete(`/schedules/personal-blocks/${id}`);
            return response.data;
        },
        onSuccess: invalidate,
    });

    return { create, update, remove };
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
        location: block.classroomSubject?.classroom?.name || '',
        detail: block.classroomSubject?.classroom
            ? `${block.classroomSubject.classroom.name}`
            : 'Sin sección',
        color: block.classroomSubject?.subject?.color || '#6366f1',
        link: block.classroomSubject?.subject ? `/dashboard/materias/${block.classroomSubject.subject.id}` : '#',
        // Sin esto, el profesor no podía ENTRAR a su clase desde su propio
        // horario: al bloque le faltaban la materia y la sección.
        subjectId: block.classroomSubject?.subject?.id,
        classroomId: block.classroomSubject?.classroom?.id,
    }));
}

export interface ClassSessionHistory {
    blockId: string | null;
    startTime: string;
    endTime: string;
    subject: { id: string; name: string; color: string };
    teacher?: { id: string; firstName: string; lastName: string };
    /** La clase se dio y quedó registrada. Falso si fue suspendida. */
    isRecorded: boolean;
    /** Suspendida (por un profesor o por un evento del liceo). */
    isSuspended?: boolean;
    suspendedReason?: string | null;
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
export function useClassroomHistory(classroomId: string, date: string, activo = true) {
    return useQuery({
        queryKey: ['classroomHistory', classroomId, date],
        queryFn: async () => {
            const response = await api.get<ClassSessionHistory[]>(`/schedules/classroom/${classroomId}/history`, {
                params: { date }
            });
            return response.data;
        },
        // `activo` = "la ventana está abierta". El modal se monta siempre, así
        // que sin esto se pedía el historial —que es de personal— nada más
        // entrar: al alumno le respondía 403 en cada carga de su pantalla.
        enabled: activo && !!classroomId && !!date,
        retry: false,
    });
}
