import { useQuery } from '@tanstack/react-query';
import api from '@/lib/axios';

export interface ReemplazoDeClase {
    id: string;
    classroomId: string;
    date: string;
    startTime: string;
    endTime: string;
    reason: string | null;
    suspendedSubject: { id: string; name: string };
    subject: { id: string; name: string; color: string | null };
    teacher: { id: string; firstName: string; lastName: string };
    classroom: { id: string; name: string };
}

/**
 * Los reemplazos de un día, de una sección o de un profesor.
 * Sin sección ni profesor no pregunta: el servidor exige uno de los dos.
 */
export function useClassReplacements(opciones: { classroomId?: string; teacherId?: string; fecha?: string }) {
    const { classroomId, teacherId, fecha } = opciones;
    return useQuery({
        queryKey: ['classReplacements', classroomId ?? null, teacherId ?? null, fecha],
        queryFn: async () => {
            const { data } = await api.get('/class-replacements', {
                params: { classroomId, teacherId, from: fecha, to: fecha },
            });
            return (data?.replacements ?? []) as ReemplazoDeClase[];
        },
        enabled: Boolean((classroomId || teacherId) && fecha && /^\d{4}-\d{2}-\d{2}$/.test(fecha)),
        staleTime: 60_000,
    });
}
