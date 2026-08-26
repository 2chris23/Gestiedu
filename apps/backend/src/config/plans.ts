/**
 * PLANES DE SUSCRIPCIÓN
 *
 * Define los 3 planes disponibles del sistema con sus límites y precios.
 * Usado por plan-limits.middleware y los endpoints de superadmin.
 */

export type PlanName = 'BASIC' | 'PREMIUM' | 'ENTERPRISE';

export interface PlanConfig {
    name: PlanName;
    displayName: string;
    description: string;
    maxStudents: number;    // Máx. estudiantes activos
    maxTeachers: number;    // Máx. teachers activos
    maxStorage: number;     // GB de almacenamiento
    monthlyPrice: number;   // USD/mes
    features: string[];
}

export const PLANS: Record<PlanName, PlanConfig> = {
    BASIC: {
        name: 'BASIC',
        displayName: 'Básico',
        description: 'Ideal para institutos pequeños',
        maxStudents: 2000,
        maxTeachers: 100,
        maxStorage: 5,
        monthlyPrice: 50,
        features: [
            'Hasta 2,000 estudiantes',
            'Hasta 100 profesores',
            '5 GB de almacenamiento',
            'Dashboard básico',
            'Soporte por email',
        ],
    },
    PREMIUM: {
        name: 'PREMIUM',
        displayName: 'Premium',
        description: 'Para institutos en crecimiento',
        maxStudents: 5000,
        maxTeachers: 300,
        maxStorage: 20,
        monthlyPrice: 150,
        features: [
            'Hasta 5,000 estudiantes',
            'Hasta 300 profesores',
            '20 GB de almacenamiento',
            'Dashboard avanzado con métricas',
            'Exportación de reportes',
            'Soporte prioritario',
            'Dominio personalizado',
        ],
    },
    ENTERPRISE: {
        name: 'ENTERPRISE',
        displayName: 'Enterprise',
        description: 'Sin límites para grandes instituciones',
        maxStudents: 15000,
        maxTeachers: 1000,
        maxStorage: 100,
        monthlyPrice: 500,
        features: [
            'Hasta 15,000 estudiantes',
            'Hasta 1,000 profesores',
            '100 GB de almacenamiento',
            'Dashboard completo con BI',
            'API access completo',
            'SLA garantizado 99.9%',
            'Soporte dedicado 24/7',
            'Múltiples dominios personalizados',
            'Configuraciones avanzadas',
        ],
    },
};

/**
 * Devuelve la configuración de un plan por nombre.
 * Si el plan no existe retorna BASIC como fallback.
 */
export function getPlanConfig(planName: string): PlanConfig {
    return PLANS[planName as PlanName] ?? PLANS.BASIC;
}

/**
 * Retorna todos los planes como array ordenado por precio.
 */
export function getAllPlans(): PlanConfig[] {
    return Object.values(PLANS).sort((a, b) => a.monthlyPrice - b.monthlyPrice);
}
