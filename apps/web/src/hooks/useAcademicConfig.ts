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
    notaMinimaAprobatoria: number;
    maxMateriasPendientesParaPromover: number;
    permitePendientesEnUltimoAno: boolean;
    /** Por debajo de este % de asistencia, el alumno está en riesgo. */
    asistenciaMinima: number;
    language?: string;
    dateFormat?: string;
    schedule: ScheduleConfig;
}

const DEFAULT_CONFIG: AcademicConfig = {
    timezone: 'America/Caracas',
    gradeScale: { min: 0, max: 20 },
    passingGrade: 10,
    notaMinimaAprobatoria: 10,
    maxMateriasPendientesParaPromover: 2,
    permitePendientesEnUltimoAno: false,
    asistenciaMinima: 80,
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
 * Retorna la escala de calificación dinámica, la nota de aprobación y las reglas de promoción.
 */
export function useAcademicConfig() {
    return useQuery({
        queryKey: ['academicConfig'],
        queryFn: async () => {
            try {
                const [data, academicRules] = await Promise.all([
                    instituteService.getConfig().catch(() => null),
                    instituteService.getAcademicConfig().catch(() => null),
                ]);

                let parsed: any = {};
                if (data?.configuration) {
                    parsed = typeof data.configuration === 'string'
                        ? JSON.parse(data.configuration)
                        : data.configuration;
                }

                const minPassing = typeof academicRules?.notaMinimaAprobatoria === 'number'
                    ? academicRules.notaMinimaAprobatoria
                    : (typeof parsed.passingGrade === 'number' ? parsed.passingGrade : DEFAULT_CONFIG.passingGrade);

                return {
                    ...DEFAULT_CONFIG,
                    ...parsed,
                    passingGrade: minPassing,
                    notaMinimaAprobatoria: minPassing,
                    maxMateriasPendientesParaPromover: typeof academicRules?.maxMateriasPendientesParaPromover === 'number'
                        ? academicRules.maxMateriasPendientesParaPromover
                        : DEFAULT_CONFIG.maxMateriasPendientesParaPromover,
                    permitePendientesEnUltimoAno: typeof academicRules?.permitePendientesEnUltimoAno === 'boolean'
                        ? academicRules.permitePendientesEnUltimoAno
                        : DEFAULT_CONFIG.permitePendientesEnUltimoAno,
                    asistenciaMinima: typeof academicRules?.asistenciaMinima === 'number'
                        ? academicRules.asistenciaMinima
                        : DEFAULT_CONFIG.asistenciaMinima,
                    gradeScale: {
                        ...DEFAULT_CONFIG.gradeScale,
                        ...(parsed.gradeScale || {}),
                    },
                    schedule: {
                        ...DEFAULT_CONFIG.schedule,
                        ...(parsed.schedule || {})
                    }
                } as AcademicConfig;
            } catch {
                return DEFAULT_CONFIG;
            }
        },
        staleTime: 60 * 1000, // 1 min
    });
}
