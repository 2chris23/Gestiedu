import { useQuery } from '@tanstack/react-query';
import { instituteService } from '@/services/institute.service';
import { ScheduleConfig } from '@/utils/schedule.utils';

export interface GradeScale {
    min: number;
    max: number;
}

export interface AcademicConfig {
    timezone?: string;
    gradeScale: GradeScale;
    passingGrade: number;
    language?: string;
    dateFormat?: string;
    schedule: ScheduleConfig;
}

const DEFAULT_CONFIG: AcademicConfig = {
    timezone: 'America/Caracas',
    gradeScale: { min: 0, max: 20 },
    passingGrade: 10,
    language: 'es',
    dateFormat: 'DD/MM/YYYY',
    schedule: {
        startTime: '07:00',
        blockDuration: 45,
        totalBlocks: 7,
        breakAfterBlock: 3,
        breakDuration: 15
    }
};

/**
 * Hook para obtener la configuración académica del instituto.
 * Retorna la escala de calificación dinámica y la nota de aprobación.
 */
export function useAcademicConfig() {
    return useQuery({
        queryKey: ['academicConfig'],
        queryFn: async () => {
            try {
                const data = await instituteService.getConfig();
                if (data?.configuration) {
                    const parsed = typeof data.configuration === 'string'
                        ? JSON.parse(data.configuration)
                        : data.configuration;
                    return {
                        ...DEFAULT_CONFIG,
                        ...parsed,
                        gradeScale: {
                            ...DEFAULT_CONFIG.gradeScale,
                            ...(parsed.gradeScale || {}),
                        },
                        schedule: {
                            ...DEFAULT_CONFIG.schedule,
                            ...(parsed.schedule || {})
                        }
                    } as AcademicConfig;
                }
                return DEFAULT_CONFIG;
            } catch {
                return DEFAULT_CONFIG;
            }
        },
        staleTime: 10 * 60 * 1000, // 10 min
    });
}
