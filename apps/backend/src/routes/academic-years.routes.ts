import { FastifyPluginAsync } from 'fastify';
import {
    createAcademicYear,
    getAcademicYears,
    getActiveAcademicYear,
    changeYearStatus,
    deleteAcademicYear,
    getAcademicYearStats,
    updateAcademicYear,
    prepareAcademicYearClose,
    confirmAcademicYearClose,
    getCloseStrategies,
    getPromotionContext,
    previewPromotionStrategy
} from '../controllers/academic-years.controller';
import { authenticate, requireAdmin } from '../middleware/auth.middleware';
import { listarRevisiones, guardarRevision, borrarRevision } from '../controllers/revision.controller';

const academicYearsRoutes: FastifyPluginAsync = async (fastify) => {
    // Rutas públicas o protegidas nivel usuario básico (si las hubiera)

    // Rutas protegidas (Admin)
    fastify.register(async (protectedRoutes) => {
        protectedRoutes.addHook('preHandler', authenticate);

        // Todos pueden ver los años escolares (para filtros)
        protectedRoutes.get('/', getAcademicYears);
        protectedRoutes.get('/active', getActiveAcademicYear);
        protectedRoutes.get('/:id/stats', getAcademicYearStats);

        // Solo admin puede modificar
        protectedRoutes.register(async (adminRoutes) => {
            adminRoutes.addHook('preHandler', requireAdmin);

            adminRoutes.post('/', createAcademicYear);
            adminRoutes.put('/:id', updateAcademicYear);
            adminRoutes.put('/:id/status', changeYearStatus);
            adminRoutes.delete('/:id', deleteAcademicYear);

            // Fase 3.5-C — cierre de ciclo escolar + prosecución
            adminRoutes.get('/close/strategies', getCloseStrategies);
            adminRoutes.post('/:id/close/prepare', prepareAcademicYearClose);
            adminRoutes.post('/:id/close', confirmAcademicYearClose);
            // La revisión de las materias reprobadas, antes del cierre
            // (services/revision.service.ts).
            adminRoutes.get('/:id/revisiones', listarRevisiones as any);
            adminRoutes.put('/:id/revisiones', guardarRevision as any);
            adminRoutes.delete('/:id/revisiones/:revisionId', borrarRevision as any);
            // Fase 3.5 Parte 2 — página de promoción
            adminRoutes.get('/:id/promotion-context', getPromotionContext);
            adminRoutes.post('/:id/promotion/strategy-preview', previewPromotionStrategy);
        });
    });
};

export default academicYearsRoutes;
export { academicYearsRoutes };
