import api from '@/lib/axios';
import { StudentDashboardStats } from '@/types/student';

interface PaginationOptions {
    page?: number;
    limit?: number;
    search?: string;
    periodId?: string;
    subjectId?: string;
}

interface PaginatedResponse<T> {
    data: T[];
    pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
    };
}

export interface SectionStudent {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    avatar?: string;
    studentCode?: string;
    isActive: boolean;
    average?: number;
    failedSubjectsCount?: number;
    failedSubjects?: Array<{ subjectId: string; average: number }>;
    attendancePercentage?: number;
}

export const studentsService = {
    getDashboardStats: async (): Promise<StudentDashboardStats> => {
        const response = await api.get('/students/my-dashboard');
        return response.data;
    },

    getStudentDashboardStatsById: async (studentId: string, periodId?: string, academicYearId?: string): Promise<StudentDashboardStats> => {
        const params = new URLSearchParams();
        if (periodId) params.append('periodId', periodId);
        if (academicYearId) params.append('academicYearId', academicYearId);
        const response = await api.get(`/students/${studentId}/dashboard?${params.toString()}`);
        return response.data;
    },

    getAvailableStudents: async (search?: string, academicYearId?: string): Promise<{ id: string, firstName: string, lastName: string, email: string, studentCode: string, avatar: string | null, currentStatus?: string }[]> => {
        const params = new URLSearchParams();
        if (search) params.append('search', search);
        if (academicYearId) params.append('academicYearId', academicYearId);

        const response = await api.get(`/students/available?${params.toString()}`);
        return response.data;
    },

    assignStudentToSection: async (studentId: string, sectionId: string): Promise<void> => {
        await api.post(`/classrooms/${sectionId}/students`, { studentId });
    },

    getStudentsBySection: async (
        sectionId: string,
        options?: PaginationOptions
    ): Promise<{
        students: SectionStudent[];
        users: SectionStudent[];
        pagination?: {
            page: number;
            limit: number;
            total: number;
            totalPages: number;
        };
    }> => {
        const params = new URLSearchParams({
            classroomId: sectionId,
            isActive: 'true',
        });

        if (options?.page) params.append('page', options.page.toString());
        if (options?.limit) params.append('limit', options.limit.toString());
        if (options?.search) params.append('search', options.search);
        if (options?.periodId) params.append('periodId', options.periodId);
        if (options?.subjectId) params.append('subjectId', options.subjectId);

        const response = await api.get(`/students?${params.toString()}`);

        // El backend devuelve { students: [], pagination: {} }
        if (response.data.students) {
            return {
                students: response.data.students,
                users: response.data.students, // Mantener compatibilidad
                pagination: response.data.pagination
            };
        }

        // Fallback para respuestas sin paginación
        return {
            students: Array.isArray(response.data) ? response.data : [],
            users: Array.isArray(response.data) ? response.data : []
        };
    }
};
