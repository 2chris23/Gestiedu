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
import { marcarGuardia } from '../middleware/guardias';
import { assertClassroomScope } from '../services/authorization.service';

/**
 * RUTAS DE ESTADÍSTICAS JERÁRQUICAS
 * 
 * Todos los endpoints requieren autenticación
 */
/**
 * QUIÉN VE QUÉ PROMEDIO
 *
 * Antes bastaba con tener sesión: un alumno podía leer el promedio de
 * cualquier sección, de un grado entero o del ciclo completo.
 *
 *   - el promedio de una materia en una sección: quien la imparte, el
 *     profesor guía de esa sección, o el admin;
 *   - el promedio global de una sección: su profesor guía o el admin;
 *   - los de grado y ciclo, que son el liceo entero: solo el admin.
 */
async function exigirMateriaPropia(request: any, reply: any) {
  const { sectionId, subjectId } = request.params as { sectionId: string; subjectId: string };
  try {
    await assertClassroomScope(request.tenantPrisma, request.user, sectionId, {
      subjectId,
      accion: 'ver los promedios',
    });
  } catch (error: any) {
    return reply.status(error?.statusCode ?? 403).send({
      error: error?.message || 'No puedes ver estos promedios',
      code: error?.code || 'FORBIDDEN',
    });
  }
}

async function exigirSeccionPropia(request: any, reply: any) {
  const { sectionId } = request.params as { sectionId: string };
  try {
    await assertClassroomScope(request.tenantPrisma, request.user, sectionId, {
      accion: 'ver los promedios',
    });
  } catch (error: any) {
    return reply.status(error?.statusCode ?? 403).send({
      error: error?.message || 'No puedes ver estos promedios',
      code: error?.code || 'FORBIDDEN',
    });
  }
}
// Miran la sección de la dirección, no el formulario: van antes de revisarlo.
marcarGuardia(exigirMateriaPropia);
marcarGuardia(exigirSeccionPropia);

export async function cycleStatisticsRoutes(server: FastifyInstance) {
    // NIVEL 1: Promedio de Materia Específica
    server.get(
        '/subject/:sectionId/:subjectId',
        { preHandler: [authenticate, exigirMateriaPropia] },
        getSubjectAverage as any
    );

    // NIVEL 2: Promedio Global de Sección
    server.get(
        '/section/:sectionId',
        { preHandler: [authenticate, exigirSeccionPropia] },
        getSectionGlobalAverage as any
    );

    // NIVEL 3: Promedio de Grado Completo
    server.get(
        '/grade/:academicYearId/:gradeLevel',
        { preHandler: [authenticate, requireAdmin] },
        getGradeAverage as any
    );

    // NIVEL 4: Promedio Global del Ciclo Escolar
    server.get(
        '/cycle/:academicYearId',
        { preHandler: [authenticate, requireAdmin] },
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
