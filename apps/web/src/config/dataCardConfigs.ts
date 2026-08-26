// apps/web/src/config/dataCardConfigs.ts

import {
    GraduationCap,
    AlertTriangle,
    Users,
    Calendar,
    Bell,
    TrendingUp,
    Clock,
    BookOpen,
} from 'lucide-react';
import { CardConfig, CardType } from '@/types/dashboard.types';

/**
 * Configuraciones predefinidas para tarjetas de datos
 * Estas configuraciones se reutilizan en todo el sistema
 */

export const CARD_CONFIGS: Record<CardType, CardConfig> = {
    PROMEDIO_GLOBAL: {
        title: 'Promedio Global',
        icon: GraduationCap,
        color: 'blue',
        getSubtitle: (data, context) => {
            if (context?.isStudentView) {
                return 'Ciclo actual';
            }
            if ('minAverage' in data && 'maxAverage' in data) {
                const sectionData = data as { minAverage: number; maxAverage: number };
                return `Min: ${sectionData.minAverage} / Max: ${sectionData.maxAverage}`;
            }
            return 'Ciclo actual';
        },
        getStatus: (value) => {
            const numValue = typeof value === 'string' ? parseFloat(value) : value;
            if (numValue >= 14) return 'success';
            if (numValue >= 10) return 'warning';
            return 'danger';
        },
        formatValue: (value) => {
            const numValue = typeof value === 'string' ? parseFloat(value) : value;
            return numValue.toFixed(1);
        },
    },

    RIESGO_ACADEMICO: {
        title: 'Riesgo Académico',
        icon: AlertTriangle,
        color: 'red',
        getSubtitle: (data, context) => {
            if (context?.isStudentView) {
                return 'Materias reprobadas';
            }
            return 'Estudiantes con promedio < 10';
        },
        getStatus: (value) => {
            const numValue = typeof value === 'string' ? parseInt(value) : value;
            if (numValue === 0) return 'success';
            if (numValue <= 5) return 'warning';
            return 'danger';
        },
    },

    OCUPACION: {
        title: 'Ocupación',
        icon: Users,
        color: 'green',
        getSubtitle: () => 'Estudiantes / Capacidad',
        formatValue: (value) => {
            // Si value es un objeto { current, total }
            if (typeof value === 'object' && value !== null && 'current' in value && 'total' in value) {
                const objValue = value as { current: number; total: number };
                return `${objValue.current}/${objValue.total}`;
            }
            return String(value);
        },
    },

    ASISTENCIA: {
        title: 'Asistencia',
        icon: Calendar,
        color: 'indigo',
        getSubtitle: (data, context) => {
            if (context?.isStudentView) {
                return 'Acumulada';
            }
            return 'Promedio general';
        },
        getStatus: (value) => {
            const numValue = typeof value === 'string' ? parseFloat(value) : value;
            if (numValue >= 90) return 'success';
            if (numValue >= 70) return 'warning';
            return 'danger';
        },
        formatValue: (value) => {
            const numValue = typeof value === 'string' ? parseFloat(value) : value;
            return `${numValue}%`;
        },
    },

    OBSERVACIONES: {
        title: 'Observaciones',
        icon: Bell,
        color: 'amber',
        getSubtitle: (data, context) => {
            if (context?.isStudentView) {
                return 'Total acumulado';
            }
            return 'Total registrado';
        },
    },

    TOTAL_ESTUDIANTES: {
        title: 'Total Estudiantes',
        icon: Users,
        color: 'blue',
        getSubtitle: () => 'Inscritos actualmente',
    },

    CLASES_HOY: {
        title: 'Clases Hoy',
        icon: Clock,
        color: 'indigo',
        getSubtitle: () => 'Programadas',
    },

    MATERIAS_RIESGO: {
        title: 'Materias en Riesgo',
        icon: BookOpen,
        color: 'red',
        getSubtitle: () => 'Con promedio < 10',
        getStatus: (value) => {
            const numValue = typeof value === 'string' ? parseInt(value) : value;
            if (numValue === 0) return 'success';
            return 'warning';
        },
    },
};

/**
 * Helper para obtener configuración de tarjeta
 */
export function getCardConfig(type: CardType): CardConfig {
    return CARD_CONFIGS[type];
}

/**
 * Helper para formatear valor según configuración
 */
export function formatCardValue(type: CardType, value: number | string): string {
    const config = CARD_CONFIGS[type];
    if (config.formatValue) {
        return config.formatValue(value);
    }
    return String(value);
}
