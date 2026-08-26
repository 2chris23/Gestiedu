
/**
 * Utility functions for calculating dashboard KPIs.
 * Extracted from useDataCards.ts to improve testability and separate concerns.
 */

import { DashboardKPIs, SectionStats, StudentStats } from '@/types/dashboard.types';

// ============================================
// Student Helpers
// ============================================

export function formatGlobalAverage(value?: number): string {
    return value?.toFixed(1) || '0.0';
}

export function formatAttendance(value?: number): string {
    return `${value || 0}%`;
}

// ============================================
// Subtitle Generators (Pure Functions)
// ============================================

// Shared shape of KPI fields accessed by subtitle generators
interface KPIFields {
    globalAverage?: number;
    attendancePercentage?: number;
    failedSubjects?: number;
    totalObservations?: number;
    studentsAtRisk?: number;
}

// Helper to extract KPI data regardless of shape
const getKPIData = (data: DashboardKPIs | StudentStats | SectionStats): KPIFields => {
    if ('kpis' in data) return (data as StudentStats).kpis;
    if ('stats' in data) return (data as SectionStats).stats;
    return data; // DashboardKPIs is flat
};

export const getGlobalAverageSubtitle = (
    data: DashboardKPIs | StudentStats | SectionStats,
    isStudentView: boolean
): string => {
    if (isStudentView) {
        // For student view, we might want to compare with class average if available in data
        // Currently extracting logic from original file:
        // Original: config.PROMEDIO_GLOBAL.getSubtitle?.(data, { isStudentView: true }) which returned "Promedio general acumulado" usually
        return "Promedio general acumulado";
    }
    // For admin/teacher view
    return "Promedio general del instituto";
};

export const getRiskSubtitle = (
    data: DashboardKPIs | StudentStats | SectionStats,
    isStudentView: boolean
): string => {
    const kpis = getKPIData(data);

    if (isStudentView) {
        const failed = kpis.failedSubjects || 0;
        return failed > 0 ? `${failed} materias reprobadas` : "Sin materias reprobadas";
    }
    const riskCount = kpis.studentsAtRisk || 0;
    return `${riskCount} estudiantes en riesgo académico`;
};

export const getAttendanceSubtitle = (
    data: DashboardKPIs | StudentStats | SectionStats,
    isStudentView: boolean
): string => {
    const kpis = getKPIData(data);
    const percentage = kpis.attendancePercentage || 0;

    if (percentage < 75) return "Asistencia crítica";
    if (percentage < 85) return "Asistencia regular";
    return "Asistencia óptima";
};

export const getObservationsSubtitle = (
    data: DashboardKPIs | StudentStats | SectionStats,
    isStudentView: boolean
): string => {
    const kpis = getKPIData(data);
    const obs = kpis.totalObservations || 0;
    return obs === 1 ? "1 nueva observación" : `${obs} nuevas observaciones`;
};
