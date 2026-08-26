// apps/web/src/types/dashboard.types.ts

import { LucideIcon } from 'lucide-react';

/**
 * Tipos de datos para el sistema de Dashboard
 */

// ============================================
// KPIs y Métricas
// ============================================

export interface DashboardKPIs {
    totalStudents?: number;
    globalAverage?: number;
    attendancePercentage?: number;
    classesToday?: number;
    failedSubjects?: number;
    totalObservations?: number;
    studentsAtRisk?: number;
    occupancy?: {
        current: number;
        total: number;
        percentage: number;
    };
}

export interface SectionStats {
    sectionId: string;
    sectionName: string;
    academicYearId: string;
    academicYearName: string;
    stats: {
        totalStudents: number;
        capacity: number;
        globalAverage: number;
        minAverage: number;
        maxAverage: number;
        studentsAtRisk: number;
        attendancePercentage: number;
        totalObservations: number;
    };
}

export interface StudentStats {
    studentId: string;
    studentName: string;
    kpis: {
        globalAverage: number;
        attendancePercentage: number;
        failedSubjects: number;
        totalObservations: number;
    };
    subjects?: Array<{
        id: string;
        name: string;
        color?: string;
        average: number;
    }>;
}

// ============================================
// Configuración de DataCard
// ============================================

export type CardColor = 'blue' | 'green' | 'red' | 'amber' | 'indigo' | 'purple';
export type CardStatus = 'success' | 'warning' | 'danger' | 'info';

export interface CardTrend {
    value: number;           // Porcentaje de cambio
    direction: 'up' | 'down' | 'neutral';
}

export interface CardComparison {
    label: string;
    value: string;
}

export interface DataCardProps {
    // Configuración de visualización
    title: string;
    icon: LucideIcon;
    color?: CardColor;

    // Datos (siempre de la API)
    value: number | string;
    subtitle?: string;

    // Características opcionales
    trend?: CardTrend;
    sparkline?: number[];
    comparison?: CardComparison;

    // Estados
    isLoading?: boolean;
    error?: string;

    // Personalización adicional
    className?: string;
}

// ============================================
// Configuración de Tarjetas Predefinidas
// ============================================

export type CardType =
    | 'PROMEDIO_GLOBAL'
    | 'RIESGO_ACADEMICO'
    | 'OCUPACION'
    | 'ASISTENCIA'
    | 'OBSERVACIONES'
    | 'TOTAL_ESTUDIANTES'
    | 'CLASES_HOY'
    | 'MATERIAS_RIESGO';

export interface CardConfig {
    title: string;
    icon: LucideIcon;
    color: CardColor;
    getSubtitle?: (data: DashboardKPIs | StudentStats | SectionStats, context?: { isStudentView?: boolean }) => string | undefined;
    getStatus?: (value: number | string) => CardStatus;
    formatValue?: (value: number | string) => string;
}

// ============================================
// Respuestas de API
// ============================================

export interface DashboardResponse {
    success: boolean;
    message: string;
    data: DashboardKPIs;
}

export interface SectionStatsResponse {
    success: boolean;
    message: string;
    data: SectionStats;
}

export interface StudentStatsResponse {
    success: boolean;
    message: string;
    data: StudentStats;
}
