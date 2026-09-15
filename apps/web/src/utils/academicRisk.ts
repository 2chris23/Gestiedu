export type RiskLevel = 'BAJO' | 'MEDIO' | 'ALTO' | 'SIN_CALIFICAR';

export interface RiskStatus {
    level: RiskLevel;
    label: string;
    className: string;
    textColor: string;
    bgColor: string;
}

/**
 * Determina el nivel de riesgo académico de un estudiante según su promedio y la
 * notaMinimaAprobatoria configurable del instituto.
 * 
 * - Promedio < passingGrade => Riesgo Alto (Reprobado)
 * - Promedio >= passingGrade + 4 => Riesgo Bajo (Buen rendimiento)
 * - Promedio entre passingGrade y passingGrade + 3.9 => Riesgo Medio (En zona de riesgo/aprobado raspando)
 * - Sin notas / 0 => Sin Calificar
 */
export function getAcademicRisk(average: number | null | undefined, passingGrade = 10): RiskStatus {
    if (average === null || average === undefined || average <= 0) {
        return {
            level: 'SIN_CALIFICAR',
            label: 'Sin Calificar',
            className: 'bg-gray-100 text-gray-600',
            textColor: 'text-gray-600',
            bgColor: 'bg-gray-100'
        };
    }

    if (average < passingGrade) {
        return {
            level: 'ALTO',
            label: 'Riesgo Alto',
            className: 'bg-red-100 text-red-700',
            textColor: 'text-red-700',
            bgColor: 'bg-red-100'
        };
    }

    const lowRiskThreshold = Math.min(20, passingGrade + 4);
    if (average >= lowRiskThreshold) {
        return {
            level: 'BAJO',
            label: 'Riesgo Bajo',
            className: 'bg-green-100 text-green-700',
            textColor: 'text-green-700',
            bgColor: 'bg-green-100'
        };
    }

    return {
        level: 'MEDIO',
        label: 'Riesgo Medio',
        className: 'bg-amber-100 text-amber-700',
        textColor: 'text-amber-700',
        bgColor: 'bg-amber-100'
    };
}
