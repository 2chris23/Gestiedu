// apps/web/src/hooks/useDataCards.ts

import { useQuery } from '@tanstack/react-query';
import { dashboardService } from '@/services/dashboard.service';
import { DataCardProps } from '@/components/common/DataCard';
import { CARD_CONFIGS } from '@/config/dataCardConfigs';
import { DashboardKPIs, SectionStats, StudentStats } from '@/types/dashboard.types';
import {
    getGlobalAverageSubtitle,
    getAttendanceSubtitle,
    getObservationsSubtitle,
    getRiskSubtitle,
    formatAttendance,
    formatGlobalAverage
} from '@/utils/kpi-calculators';

/**
 * Hooks personalizados para obtener datos de tarjetas
 * Todos los hooks usan React Query y retornan datos reales de la API
 */

// ============================================
// Hook para Dashboard Principal
// ============================================

export function useDashboardCards(role: string) {
    const { data, isLoading, error } = useQuery({
        queryKey: ['dashboardKPIs', role],
        queryFn: () => dashboardService.getDashboardKPIs(role),
        staleTime: 2 * 60 * 1000, // 2 minutos
    });

    const cards: DataCardProps[] = [];

    if (role === 'STUDENT' && data) {
        // Tarjetas para estudiante
        const config = CARD_CONFIGS;

        cards.push({
            ...config.PROMEDIO_GLOBAL,
            value: formatGlobalAverage(data.globalAverage),
            subtitle: getGlobalAverageSubtitle(data, true),
            isLoading,
            error: error ? 'Error al cargar' : undefined,
        });

        cards.push({
            ...config.ASISTENCIA,
            value: formatAttendance(data.attendancePercentage),
            subtitle: getAttendanceSubtitle(data, true),
            isLoading,
            error: error ? 'Error al cargar' : undefined,
        });

        cards.push({
            ...config.MATERIAS_RIESGO,
            value: data.failedSubjects || 0,
            subtitle: getRiskSubtitle(data, true),
            isLoading,
            error: error ? 'Error al cargar' : undefined,
        });

        cards.push({
            ...config.OBSERVACIONES,
            value: data.totalObservations || 0,
            subtitle: getObservationsSubtitle(data, true),
            isLoading,
            error: error ? 'Error al cargar' : undefined,
        });
    } else if (data) {
        // Tarjetas para admin/teacher
        const config = CARD_CONFIGS;

        cards.push({
            ...config.TOTAL_ESTUDIANTES,
            value: data.totalStudents || 0,
            subtitle: config.TOTAL_ESTUDIANTES.getSubtitle?.(data),
            isLoading,
            error: error ? 'Error al cargar' : undefined,
        });

        cards.push({
            ...config.PROMEDIO_GLOBAL,
            value: data.globalAverage?.toFixed(1) || '0.0',
            subtitle: config.PROMEDIO_GLOBAL.getSubtitle?.(data, { isStudentView: false }),
            isLoading,
            error: error ? 'Error al cargar' : undefined,
        });

        cards.push({
            ...config.ASISTENCIA,
            value: `${data.attendancePercentage || 0}%`,
            subtitle: config.ASISTENCIA.getSubtitle?.(data, { isStudentView: false }),
            isLoading,
            error: error ? 'Error al cargar' : undefined,
        });

        cards.push({
            ...config.CLASES_HOY,
            value: data.classesToday || 0,
            subtitle: config.CLASES_HOY.getSubtitle?.(data),
            isLoading,
            error: error ? 'Error al cargar' : undefined,
        });
    }

    return { cards, isLoading, error };
}

// ============================================
// Hook para Tarjetas de Sección
// ============================================

export function useSectionCards(sectionId: string, academicYearId: string) {
    const { data, isLoading, error } = useQuery({
        queryKey: ['sectionStats', sectionId, academicYearId],
        queryFn: () => dashboardService.getSectionStats(sectionId, academicYearId),
        enabled: !!sectionId && !!academicYearId,
        staleTime: 2 * 60 * 1000,
    });

    const cards: DataCardProps[] = [];

    if (data?.stats) {
        const config = CARD_CONFIGS;
        const stats = data.stats;

        cards.push({
            ...config.PROMEDIO_GLOBAL,
            value: formatGlobalAverage(stats.globalAverage),
            subtitle: `Min: ${stats.minAverage} / Max: ${stats.maxAverage}`,
            isLoading,
            error: error ? 'Error al cargar' : undefined,
        });

        cards.push({
            ...config.RIESGO_ACADEMICO,
            value: stats.studentsAtRisk || 0,
            subtitle: getRiskSubtitle(stats, false),
            isLoading,
            error: error ? 'Error al cargar' : undefined,
        });

        cards.push({
            ...config.OCUPACION,
            value: `${stats.totalStudents}/${stats.capacity}`,
            subtitle: config.OCUPACION.getSubtitle?.(stats),
            isLoading,
            error: error ? 'Error al cargar' : undefined,
        });

        cards.push({
            ...config.ASISTENCIA,
            value: formatAttendance(stats.attendancePercentage),
            subtitle: getAttendanceSubtitle(stats, false),
            isLoading,
            error: error ? 'Error al cargar' : undefined,
        });

        cards.push({
            ...config.OBSERVACIONES,
            value: stats.totalObservations || 0,
            subtitle: getObservationsSubtitle(stats, false),
            isLoading,
            error: error ? 'Error al cargar' : undefined,
        });
    }

    return { cards, isLoading, error };
}

// ============================================
// Hook para Tarjetas de Estudiante
// ============================================

export function useStudentCards(studentId: string) {
    const { data, isLoading, error } = useQuery({
        queryKey: ['studentStats', studentId],
        queryFn: () => dashboardService.getStudentStats(studentId),
        enabled: !!studentId,
        staleTime: 2 * 60 * 1000,
    });

    const cards: DataCardProps[] = [];

    if (data?.kpis) {
        const config = CARD_CONFIGS;
        const kpis = data.kpis;

        cards.push({
            ...config.PROMEDIO_GLOBAL,
            value: formatGlobalAverage(kpis.globalAverage),
            subtitle: getGlobalAverageSubtitle(kpis, true),
            isLoading,
            error: error ? 'Error al cargar' : undefined,
        });

        cards.push({
            ...config.ASISTENCIA,
            value: formatAttendance(kpis.attendancePercentage),
            subtitle: getAttendanceSubtitle(kpis, true),
            isLoading,
            error: error ? 'Error al cargar' : undefined,
        });

        cards.push({
            ...config.MATERIAS_RIESGO,
            value: kpis.failedSubjects || 0,
            subtitle: getRiskSubtitle(kpis, true),
            isLoading,
            error: error ? 'Error al cargar' : undefined,
        });

        cards.push({
            ...config.OBSERVACIONES,
            value: kpis.totalObservations || 0,
            subtitle: getObservationsSubtitle(kpis, true),
            isLoading,
            error: error ? 'Error al cargar' : undefined,
        });
    }

    return { cards, isLoading, error };
}

// ============================================
// Hook para Tarjetas de Año Académico
// ============================================

export function useAcademicYearCards(yearId: string) {
    const { data, isLoading, error } = useQuery({
        queryKey: ['academicYearStats', yearId],
        queryFn: () => dashboardService.getInstituteStats(),
        enabled: !!yearId,
        staleTime: 5 * 60 * 1000, // 5 minutos (datos menos volátiles)
    });

    const cards: DataCardProps[] = [];

    if (data) {
        const config = CARD_CONFIGS;

        cards.push({
            ...config.TOTAL_ESTUDIANTES,
            value: data.totalStudents || 0,
            subtitle: config.TOTAL_ESTUDIANTES.getSubtitle?.(data),
            isLoading,
            error: error ? 'Error al cargar' : undefined,
        });

        cards.push({
            ...config.PROMEDIO_GLOBAL,
            value: data.globalAverage?.toFixed(1) || '0.0',
            subtitle: config.PROMEDIO_GLOBAL.getSubtitle?.(data, { isStudentView: false }),
            isLoading,
            error: error ? 'Error al cargar' : undefined,
        });

        cards.push({
            ...config.RIESGO_ACADEMICO,
            value: data.studentsAtRisk || 0,
            subtitle: getRiskSubtitle(data, false),
            isLoading,
            error: error ? 'Error al cargar' : undefined,
        });

        cards.push({
            ...config.ASISTENCIA,
            value: `${data.attendancePercentage || 0}%`,
            subtitle: config.ASISTENCIA.getSubtitle?.(data, { isStudentView: false }),
            isLoading,
            error: error ? 'Error al cargar' : undefined,
        });
    }

    return { cards, isLoading, error };
}
