import api from '@/lib/axios';

export interface Teacher {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    avatar?: string;
    isActive: boolean;
}

export interface GetTeachersParams {
    search?: string;
    page?: number;
    limit?: number;
}

class TeachersService {
    async getTeachers(params?: GetTeachersParams) {
        const { data } = await api.get('/users', {
            params: {
                role: 'TEACHER',
                isActive: true,
                ...params,
            },
        });
        return data.users || data;
    }

    async getTeacher(id: string) {
        const { data } = await api.get(`/users/${id}`);
        return data.user || data;
    }
}

export const teachersService = new TeachersService();
