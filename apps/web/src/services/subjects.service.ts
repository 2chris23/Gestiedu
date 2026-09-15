import api from '@/lib/axios';
import { getApiErrorMessage } from '@/lib/utils';

export interface SubjectSection {
    id: string;
    name: string;
    slug?: string;
    grade: number;
    capacity: number;
    studentCount: number;
    weeklyBlocks?: number;
    hoursPerWeek?: number;
    teacher: {
        id: string;
        name: string;
        email: string;
        avatar?: string | null;
    } | null;
    schedule: string;
    average: number;
    minAverage?: number;
    maxAverage?: number;
    riskCount: number;
    attendance: string;
    observations: number;
}

export interface SubjectTeacher {
    id: string;
    name: string;
    email: string;
    avatar?: string | null;
    sectionsCount: number;
    subjectWeeklyBlocks?: number;
    subjectWeeklyHours?: number;
}

export interface SubjectStats {
    average: number;
    minAverage?: number;
    maxAverage?: number;
    riskCount: number;
    occupancy: string;
    attendance: string;
    observations: number;
}

export interface GradeSubjectStats {
    grade: number;
    stats: SubjectStats;
}

export interface Subject {
    id: string;
    name: string;
    slug: string;
    code?: string;
    color: string;
    createdAt: string;
    updatedAt: string;
    teacherCount?: number;
    sectionCount?: number;
    totalStudents?: number;
    academicYear?: {
        id: string;
        name: string;
        status: string;
        startDate: string;
        endDate: string;
        periods?: Array<{
            id: string;
            name: string;
            isActive: boolean;
            startDate: string;
            endDate: string;
        }>;
    };
    stats?: SubjectStats;
    gradeStats?: Record<number, GradeSubjectStats>;
    sections?: SubjectSection[];
    teachers?: SubjectTeacher[];
    _count?: {
        classroomSubjects: number;
    };
}

export interface CreateSubjectData {
    name: string;
    color?: string;
}

export interface UpdateSubjectData {
    name?: string;
    color?: string;
}

class SubjectsService {
    /**
     * Obtener todas las materias
     */
    async getAllSubjects(params?: {
        page?: number;
        limit?: number;
        grade?: string;
        search?: string;
        isActive?: boolean;
    }): Promise<{ subjects: Subject[]; total: number; page: number; totalPages: number }> {
        try {
            const response = await api.get('/subjects', { params });
            // El backend devuelve: { success, message, data: { items, meta } }
            // Necesitamos transformarlo a: { subjects, total, page, totalPages }
            const { items, meta } = response.data.data;
            return {
                subjects: items,
                total: meta.total,
                page: meta.page,
                totalPages: meta.totalPages
            };
        } catch (error) {
            throw new Error(getApiErrorMessage(error, 'Error al obtener materias'));
        }
    }

    /**
     * Obtener una materia por ID o slug
     */
    async getSubjectById(id: string, academicYearName?: string, periodId?: string): Promise<Subject> {
        try {
            const response = await api.get(`/subjects/${id}`, {
                params: {
                    ...(academicYearName ? { academicYearName } : {}),
                    ...(periodId ? { periodId } : {})
                }
            });
            return response.data.data;
        } catch (error) {
            throw new Error(getApiErrorMessage(error, 'Error al obtener materia'));
        }
    }

    /**
     * Crear una nueva materia
     */
    async createSubject(data: CreateSubjectData): Promise<Subject> {
        try {
            const response = await api.post('/subjects', data);
            return response.data.data;
        } catch (error) {
            // Mensaje específico para duplicados
            if (error instanceof Error && error.message.includes('DUPLICATE')) {
                throw new Error('Ya existe una materia con este nombre');
            }
            throw new Error(getApiErrorMessage(error, 'Error al crear materia'));
        }
    }

    /**
     * Actualizar una materia
     */
    async updateSubject(id: string, data: UpdateSubjectData): Promise<Subject> {
        try {
            const response = await api.put(`/subjects/${id}`, data);
            return response.data.data;
        } catch (error) {
            throw new Error(getApiErrorMessage(error, 'Error al actualizar materia'));
        }
    }

    /**
     * Eliminar una materia
     */
    async deleteSubject(id: string): Promise<void> {
        try {
            await api.delete(`/subjects/${id}`);
        } catch (error) {
            throw new Error(getApiErrorMessage(error, 'Error al eliminar materia'));
        }
    }

    /**
     * Obtener estadísticas de materias
     */
    async getSubjectStats(): Promise<any> {
        try {
            const response = await api.get('/subjects/stats');
            return response.data;
        } catch (error) {
            throw new Error(getApiErrorMessage(error, 'Error al obtener estadísticas'));
        }
    }

    /**
     * Obtener materias de un grado específico
     */
    async getSubjectsByGrade(grade: number, academicYearId?: string): Promise<Subject[]> {
        try {
            const response = await api.get(`/subjects/grade/${grade}`, {
                params: { academicYearId }
            });
            return response.data.data;
        } catch (error) {
            throw new Error(getApiErrorMessage(error, 'Error al obtener materias del grado'));
        }
    }

    /**
     * Asignar materia a un grado (y profesor)
     */
    async assignSubjectToGrade(grade: number, subjectId: string, teacherId: string, academicYearId?: string): Promise<any> {
        try {
            const response = await api.post(`/subjects/grade/${grade}/assign`, {
                subjectId,
                teacherId,
                academicYearId
            });
            return response.data;
        } catch (error) {
            throw new Error(getApiErrorMessage(error, 'Error al asignar materia'));
        }
    }

    /**
     * Remover materia de un grado
     */
    async removeSubjectFromGrade(grade: number, subjectId: string, academicYearId?: string): Promise<any> {
        try {
            const response = await api.delete(`/subjects/grade/${grade}/${subjectId}`, {
                params: { academicYearId }
            });
            return response.data;
        } catch (error) {
            throw new Error(getApiErrorMessage(error, 'Error al remover materia del grado'));
        }
    }

    /**
     * Obtener profesores asignados a una materia
     */
    async getSubjectTeachers(subjectId: string): Promise<any[]> {
        try {
            const response = await api.get(`/subjects/${subjectId}/teachers`);
            return response.data.data;
        } catch (error) {
            throw new Error(getApiErrorMessage(error, 'Error al obtener profesores de la materia'));
        }
    }
}

export const subjectsService = new SubjectsService();
