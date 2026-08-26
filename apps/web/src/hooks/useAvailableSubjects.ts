import { useQuery } from '@tanstack/react-query';
import api from '@/lib/axios';

interface AvailableSubject {
    id: string;
    name: string;
    code: string;
    color: string;
    description?: string;
}

export function useAvailableSubjects(classroomId: string) {
    return useQuery({
        queryKey: ['available-subjects', classroomId],
        queryFn: async () => {
            const response = await api.get(`/classrooms/${classroomId}/subjects-available`);
            return response.data.subjects as AvailableSubject[];
        },
        enabled: !!classroomId,
        retry: 2,
        retryDelay: 1000,
    });
}
