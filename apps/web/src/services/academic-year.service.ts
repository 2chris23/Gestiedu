import api from '@/lib/axios';
import { getApiErrorMessage } from '@/lib/utils';
import { AxiosError } from 'axios';

export interface Period {
    id?: string;
    name: string;
    startDate: string;
    endDate: string;
    isActive?: boolean;
}

export interface AcademicYear {
    id: string;
    name: string;
    startDate: string;
    endDate: string;
    status: 'ACTIVE' | 'COMPLETED' | 'UPCOMING';
    periods?: Period[];
    _count?: {
        classrooms: number;
    };
}

export interface CreateAcademicYearDto {    name: string;
    startDate: string;
    endDate: string;
    status?: 'ACTIVE' | 'COMPLETED' | 'UPCOMING';
    periods?: Period[];
}

export const academicYearService = {
    getAcademicYears: async (): Promise<AcademicYear[]> => {
        try {
            const response = await api.get('/academic-years');
            return response.data;
        } catch (error) {
            throw new Error(getApiErrorMessage(error, 'Error al obtener años escolares'));
        }
    },

    getActiveYear: async (): Promise<AcademicYear> => {
        try {
            const response = await api.get('/academic-years/active');
            return response.data;
        } catch (error) {
            if (error instanceof AxiosError && error.response?.status === 404) {
                throw new Error('No hay año escolar activo');
            }
            throw new Error(getApiErrorMessage(error, 'Error al obtener año activo'));
        }
    },

    createAcademicYear: async (data: CreateAcademicYearDto): Promise<AcademicYear> => {
        try {
            const response = await api.post('/academic-years', data);
            return response.data;
        } catch (error) {
            throw new Error(getApiErrorMessage(error, 'Error al crear año escolar'));
        }
    },

    changeStatus: async (id: string, status: AcademicYear['status']): Promise<AcademicYear> => {
        try {
            const response = await api.put(`/academic-years/${id}/status`, { status });
            return response.data;
        } catch (error) {
            throw new Error(getApiErrorMessage(error, 'Error al cambiar estado'));
        }
    },

    updateAcademicYear: async (id: string, data: CreateAcademicYearDto): Promise<AcademicYear> => {
        try {
            const response = await api.put(`/academic-years/${id}`, data);
            return response.data;
        } catch (error) {
            throw new Error(getApiErrorMessage(error, 'Error al actualizar año escolar'));
        }
    },

    deleteAcademicYear: async (id: string, password?: string): Promise<void> => {
        try {
            await api.delete(`/academic-years/${id}`, {
                data: { password }
            });
        } catch (error) {
            throw new Error(getApiErrorMessage(error, 'Error al eliminar año escolar'));
        }
    },

    getAcademicYearStats: async (id: string, periodId?: string): Promise<Record<number, { stats: Record<string, unknown> }>> => {
        try {
            const params = new URLSearchParams();
            if (periodId) params.append('periodId', periodId);
            const response = await api.get(`/academic-years/${id}/stats?${params.toString()}`);
            // Convert array to object key-value for easier lookup
            const statsMap: Record<number, { stats: Record<string, unknown> }> = {};
            response.data.forEach((item: { grade: number; stats: Record<string, unknown> }) => {
                statsMap[item.grade] = item;
            });
            return statsMap;
        } catch (error) {
            console.error(error);
            return {}; // Return empty stats on error to avoid breaking UI
        }
    },

    // Fase 3.5-C — cierre de ciclo escolar + prosecución
    prepareClose: async (yearId: string): Promise<any> => {
        const response = await api.post(`/academic-years/${yearId}/close/prepare`);
        return response.data;
    },

    confirmClose: async (
        yearId: string,
        decisions: Array<{ studentId: string; finalResult: string; assignedClassroomId?: string | null }>,
        strategyKey?: string,
        strategyMode?: string
    ): Promise<any> => {
        const response = await api.post(`/academic-years/${yearId}/close`, {
            decisions,
            strategyKey,
            strategyMode,
        });
        return response.data;
    },

    getCloseStrategies: async (): Promise<Array<{ key: string; name: string; description: string }>> => {
        const response = await api.get('/academic-years/close/strategies');
        return response.data.strategies;
    },

    // Fase 3.5 Parte 2 — página de promoción
    getPromotionContext: async (yearId: string): Promise<any> => {
        const response = await api.get(`/academic-years/${yearId}/promotion-context`);
        return response.data;
    },

    previewPromotionStrategy: async (yearId: string, strategyKey: string, strategyMode?: string): Promise<any> => {
        const response = await api.post(`/academic-years/${yearId}/promotion/strategy-preview`, {
            strategyKey,
            strategyMode,
        });
        return response.data;
    },

    getAcademicConfig: async (): Promise<any> => {
        const response = await api.get('/institutes/current/academic-config');
        return response.data.data;
    },

    updateAcademicConfig: async (patch: {
        notaMinimaAprobatoria?: number;
        maxMateriasPendientesParaPromover?: number;
        permitePendientesEnUltimoAno?: boolean;
    }): Promise<any> => {
        const response = await api.put('/institutes/current/academic-config', patch);
        return response.data.data;
    },
};
