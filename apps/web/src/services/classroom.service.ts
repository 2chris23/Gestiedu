import api from '@/lib/axios';
import { getApiErrorMessage } from '@/lib/utils';

export interface Classroom {
    id: string;
    name: string;
    slug: string;
    section: string;
    grade: number;
    capacity?: number;
    academicYearId: string;
    teacherId?: string;
    _count?: {
        students: number;
    };
    teacher?: {
        id: string;
        firstName: string;
        lastName: string;
        avatar?: string;
    };
    academicYear?: {
        id: string;
        name: string;
        status: string;
    }
}

export interface CreateClassroomDto {
    academicYearId: string;
    grade: number;
    section: string;
    capacity?: number;
    teacherId?: string;
}

export interface UpdateClassroomDto extends Partial<CreateClassroomDto> { }

export const classroomService = {
    getClassrooms: async (
        academicYearId?: string,
        options?: { page?: number; limit?: number }
    ): Promise<Classroom[] | { classrooms: Classroom[]; pagination: Record<string, unknown> }> => {
        try {
            const params: Record<string, string | number> = {};
            if (academicYearId) params.academicYearId = academicYearId;
            if (options?.page) params.page = options.page;
            if (options?.limit) params.limit = options.limit;

            const response = await api.get('/classrooms', { params });

            // Si el backend retorna paginación, mantenerla
            if (response.data.classrooms) {
                return response.data;
            }

            // Fallback para respuestas sin paginación
            return response.data;
        } catch (error) {
            throw new Error(getApiErrorMessage(error, 'Error al obtener aulas'));
        }
    },

    getClassroom: async (id: string): Promise<Classroom> => {
        try {
            const response = await api.get(`/classrooms/${id}`);
            return response.data;
        } catch (error) {
            throw new Error(getApiErrorMessage(error, 'Error al obtener aula'));
        }
    },

    getClassroomBySlug: async (slug: string, academicYear?: string): Promise<Classroom> => {
        try {
            const response = await api.get(`/classrooms/slug/${slug}`, {
                params: academicYear ? { academicYear } : {},
            });
            return response.data;
        } catch (error) {
            throw new Error(getApiErrorMessage(error, 'Error al obtener aula'));
        }
    },

    createClassroom: async (data: CreateClassroomDto): Promise<Classroom> => {
        try {
            const response = await api.post('/classrooms', data);
            return response.data;
        } catch (error) {
            throw new Error(getApiErrorMessage(error, 'Error al crear aula'));
        }
    },

    updateClassroom: async (id: string, data: UpdateClassroomDto): Promise<Classroom> => {
        try {
            const response = await api.put(`/classrooms/${id}`, data);
            return response.data;
        } catch (error) {
            throw new Error(getApiErrorMessage(error, 'Error al actualizar aula'));
        }
    },

    deleteClassroom: async (id: string): Promise<void> => {
        try {
            await api.delete(`/classrooms/${id}`);
        } catch (error) {
            throw new Error(getApiErrorMessage(error, 'Error al eliminar aula'));
        }
    },

    assignTeacher: async (classroomId: string, teacherId: string): Promise<Classroom> => {
        try {
            const response = await api.patch(`/classrooms/${classroomId}/teacher`, { teacherId });
            return response.data;
        } catch (error) {
            throw new Error(getApiErrorMessage(error, 'Error al asignar profesor'));
        }
    }
};
