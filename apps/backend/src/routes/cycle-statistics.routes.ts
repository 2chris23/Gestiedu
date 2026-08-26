import { FastifyInstance } from 'fastify';
import {
    getSubjectAverage,
    getSectionGlobalAverage,
    getGradeAverage,
    getCycleGlobalAverage,
    clearSectionCache,
    clearCycleCache,
} from '../controllers/cycle-statistics.controller';
import { authenticate, requireAdmin } from '../middleware/auth.middleware';

/**
 * RUTAS DE ESTADÍSTICAS JERÁRQUICAS
 * 
 * Todos los endpoints requieren autenticación
 */
export async function cycleStatisticsRoutes(server: FastifyInstance) {
    // NIVEL 1: Promedio de Materia Específica
    server.get(
        '/subject/:sectionId/:subjectId',
        { preHandler: [authenticate] },
        getSubjectAverage as any
    );

    // NIVEL 2: Promedio Global de Sección
    server.get(
        '/section/:sectionId',
        { preHandler: [authenticate] },
        getSectionGlobalAverage as any
    );

    // NIVEL 3: Promedio de Grado Completo
    server.get(
        '/grade/:academicYearId/:gradeLevel',
        { preHandler: [authenticate] },
        getGradeAverage as any
    );

    // NIVEL 4: Promedio Global del Ciclo Escolar
    server.get(
        '/cycle/:academicYearId',
        { preHandler: [authenticate] },
        getCycleGlobalAverage as any
    );

    // Administración de Cache (Admin only)
    server.post(
        '/cache/clear/section/:sectionId',
        { preHandler: [authenticate, requireAdmin] },
        clearSectionCache as any
    );

    server.post(
        '/cache/clear/cycle/:academicYearId',
        { preHandler: [authenticate, requireAdmin] },
        clearCycleCache as any
    );
}

export default cycleStatisticsRoutes;
