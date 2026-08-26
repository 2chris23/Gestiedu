import api from '@/lib/axios';
import { getApiErrorMessage } from '@/lib/utils';

export interface ClassroomSubject {
    id: string;
    classroomId: string;
    subjectId: string;
    teacherId?: string;
    weeklyBlocks: number;
    hoursPerWeek: number;
    createdAt: string;
    updatedAt: string;
    subject: {
        id: string;
        name: string;
        code: string;
        color: string;
        description?: string;
    };
    teacher?: {
        id: string;
        firstName: string;
        lastName: string;
        email: string;
        avatar?: string;
    };
    classroom?: {
        id: string;
        name: string;
        grade: number;
        section: string;
    };
    scheduleBlocks?: ScheduleBlock[];
    teacherHistory?: TeacherHistory[];
}

export interface TeacherHistory {
    id: string;
    classroomSubjectId: string;
    teacherId: string;
    startDate: string;
    endDate?: string;
    isActive: boolean;
    notes?: string;
    teacher: {
        id: string;
        firstName: string;
        lastName: string;
        email: string;
    };
}

export interface ScheduleBlock {
    id: string;
    classroomId: string;
    classroomSubjectId?: string;
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    blockType: string;
    location?: string;
    notes?: string;
    classroomSubject?: {
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

class ClassroomSubjectsService {
    /**
     * Obtener todas las materias de una sección
     */
    async getClassroomSubjects(classroomId: string): Promise<ClassroomSubject[]> {
        try {
            const response = await api.get(`/classrooms/${classroomId}/subjects`);
            return response.data.subjects;
        } catch (error) {
            throw new Error(getApiErrorMessage(error, 'Error al obtener materias de la sección'));
        }
    }

    /**
     * Obtener materias disponibles para asignar (no asignadas aún)
     */
    async getAvailableSubjects(classroomId: string): Promise<any[]> {
        try {
            const response = await api.get(`/classrooms/${classroomId}/subjects-available`);
            return response.data.subjects;
        } catch (error) {
            throw new Error(getApiErrorMessage(error, 'Error al obtener materias disponibles'));
        }
    }

    /**
     * Obtener detalle de una materia en una sección
     */
    async getClassroomSubjectDetail(classroomId: string, subjectId: string): Promise<ClassroomSubject> {
        try {
            const response = await api.get(`/classrooms/${classroomId}/subjects/${subjectId}`);
            return response.data.classroomSubject;
        } catch (error) {
            throw new Error(getApiErrorMessage(error, 'Error al obtener detalle de materia'));
        }
    }

    /**
     * Asignar una materia a una sección
     */
    async assignSubjectToClassroom(
        classroomId: string,
        data: {
            subjectId: string;
            teacherId?: string;
            weeklyBlocks?: number;
        }
    ): Promise<ClassroomSubject> {
        try {
            const response = await api.post(`/classrooms/${classroomId}/subjects`, data);
            return response.data.classroomSubject;
        } catch (error) {
            throw new Error(getApiErrorMessage(error, 'Error al asignar materia'));
        }
    }

    /**
     * Actualizar configuración de una materia (bloques semanales)
     */
    async updateClassroomSubject(
        classroomId: string,
        subjectId: string,
        data: {
            weeklyBlocks?: number;
            hoursPerWeek?: number;
        }
    ): Promise<ClassroomSubject> {
        try {
            const response = await api.patch(`/classrooms/${classroomId}/subjects/${subjectId}`, data);
            return response.data.classroomSubject;
        } catch (error) {
            throw new Error(getApiErrorMessage(error, 'Error al actualizar configuración'));
        }
    }

    /**
     * Asignar o cambiar profesor de una materia
     */
    async assignTeacherToSubject(
        classroomId: string,
        subjectId: string,
        data: {
            teacherId: string;
            notes?: string;
        }
    ): Promise<ClassroomSubject> {
        try {
            const response = await api.patch(
                `/classrooms/${classroomId}/subjects/${subjectId}/teacher`,
                data
            );
            return response.data.classroomSubject;
        } catch (error) {
            throw new Error(getApiErrorMessage(error, 'Error al asignar profesor'));
        }
    }

    /**
     * Obtener historial de profesores de una materia
     */
    async getTeacherHistory(classroomId: string, subjectId: string): Promise<TeacherHistory[]> {
        try {
            const response = await api.get(
                `/classrooms/${classroomId}/subjects/${subjectId}/teacher-history`
            );
            return response.data.history;
        } catch (error) {
            throw new Error(getApiErrorMessage(error, 'Error al obtener historial'));
        }
    }

    /**
     * Remover una materia de una sección
     */
    async removeSubjectFromClassroom(classroomId: string, subjectId: string): Promise<void> {
        try {
            await api.delete(`/classrooms/${classroomId}/subjects/${subjectId}`);
        } catch (error) {
            throw new Error(getApiErrorMessage(error, 'Error al remover materia'));
        }
    }

    /**
     * Obtener horario completo de una sección
     */
    async getClassroomSchedule(classroomId: string): Promise<ScheduleBlock[]> {
        try {
            const response = await api.get(`/schedules/classroom/${classroomId}`);
            return response.data.scheduleBlocks;
        } catch (error) {
            throw new Error(getApiErrorMessage(error, 'Error al obtener horario'));
        }
    }

    /**
     * Crear un bloque de horario
     */
    async createScheduleBlock(
        classroomId: string,
        data: {
            classroomSubjectId?: string;
            dayOfWeek: number;
            startTime: string;
            endTime: string;
            blockType?: string;
            location?: string;
            notes?: string;
        }
    ): Promise<ScheduleBlock> {
        try {
            const response = await api.post(`/schedules/classroom/${classroomId}/blocks`, data);
            return response.data.scheduleBlock;
        } catch (error) {
            throw new Error(getApiErrorMessage(error, 'Error al crear bloque de horario'));
        }
    }

    /**
     * Actualizar un bloque de horario
     */
    async updateScheduleBlock(
        blockId: string,
        data: Partial<{
            classroomSubjectId: string;
            dayOfWeek: number;
            startTime: string;
            endTime: string;
            blockType: string;
            location: string;
            notes: string;
        }>
    ): Promise<ScheduleBlock> {
        try {
            const response = await api.put(`/schedules/blocks/${blockId}`, data);
            return response.data.scheduleBlock;
        } catch (error) {
            throw new Error(getApiErrorMessage(error, 'Error al actualizar bloque'));
        }
    }

    /**
     * Eliminar un bloque de horario
     */
    async deleteScheduleBlock(blockId: string): Promise<void> {
        try {
            await api.delete(`/schedules/blocks/${blockId}`);
        } catch (error) {
            throw new Error(getApiErrorMessage(error, 'Error al eliminar bloque'));
        }
    }

    /**
     * Actualización masiva de horario (drag & drop)
     */
    async bulkUpdateSchedule(
        classroomId: string,
        data: {
            blocks: Array<{
                id?: string;
                classroomSubjectId?: string;
                dayOfWeek: number;
                startTime: string;
                endTime: string;
                blockType?: string;
                location?: string;
                notes?: string;
            }>;
            deleteIds?: string[];
        }
    ): Promise<ScheduleBlock[]> {
        try {
            const response = await api.post(`/schedules/classroom/${classroomId}/bulk`, data);
            return response.data.blocks;
        } catch (error) {
            throw new Error(getApiErrorMessage(error, 'Error al actualizar horario'));
        }
    }

    /**
     * Obtener materias con estadísticas (promedio, asistencia, observaciones, estudiantes en riesgo)
     */
    async getClassroomSubjectsStats(classroomId: string, periodId?: string): Promise<SubjectWithStats[]> {
        try {
            const params = new URLSearchParams({ stats: 'true' });
            if (periodId) params.append('periodId', periodId);
            const response = await api.get(`/classrooms/${classroomId}/subjects?${params.toString()}`);
            return response.data.subjects;
        } catch (error) {
            throw new Error(getApiErrorMessage(error, 'Error al obtener estadísticas de materias'));
        }
    }
}

export interface SubjectWithStats {
    id: string;
    name: string;
    color: string;
    code: string;
    slug?: string;
    teacher?: {
        id: string;
        firstName: string;
        lastName: string;
        avatar?: string;
    } | null;
    hoursPerWeek?: number;
    weeklyBlocks?: number;
    stats: {
        average: number | null;
        attendance: number;
        observations: number;
        atRiskStudents: number;
    };
}

export const classroomSubjectsService = new ClassroomSubjectsService();
