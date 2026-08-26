import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/axios';

export interface ClassSession {
    id: string;
    publicId: string;
    date: string;
    startTime: string | null;
    endTime: string | null;
    topic: string | null;
    observations: string | null;
    subjectId: string;
    classroomId: string;
    subject?: {
        id: string;
        name: string;
        color: string | null;
    };
    classroom?: {
        id: string;
        name: string;
        grade: string;
        section: string;
    };
    attendanceRecords?: any[];
}

interface UpdateSessionData {
    topic?: string;
    observations?: string;
    startTime?: string;
    endTime?: string;
}

export function useClassSession(sessionId: string) {
    return useQuery({
        queryKey: ['classSession', sessionId],
        queryFn: async () => {
            const response = await api.get<ClassSession>(`/sessions/${sessionId}`);
            return response.data;
        },
        enabled: !!sessionId,
    });
}

export function useUpdateClassSession(sessionId: string) {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (data: UpdateSessionData) => {
            const response = await api.put<ClassSession>(`/sessions/${sessionId}`, data);
            return response.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['classSession', sessionId] });
        },
    });
}
