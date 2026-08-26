import { FastifyInstance } from 'fastify';
import { superAdminInstitutesController } from '../controllers/superadmin-institutes.controller';
import { superAdminAuthMiddleware } from '../middleware/superadmin-auth.middleware';

export async function superAdminInstitutesRoutes(fastify: FastifyInstance) {
    // Todas las rutas requieren autenticación de SuperAdmin
    fastify.addHook('onRequest', superAdminAuthMiddleware);

    // Planes disponibles (estático, no requiere :id)
    fastify.get('/plans', superAdminInstitutesController.getPlans.bind(superAdminInstitutesController));

    // Estadísticas generales
    fastify.get('/stats', superAdminInstitutesController.stats.bind(superAdminInstitutesController));

    // Validación de puertos
    fastify.get('/ports/check', superAdminInstitutesController.checkPort.bind(superAdminInstitutesController));
    fastify.get('/ports/available', superAdminInstitutesController.getAvailablePort.bind(superAdminInstitutesController));

    // CRUD de institutos
    fastify.get('/', superAdminInstitutesController.list.bind(superAdminInstitutesController));
    fastify.get('/:id', superAdminInstitutesController.getById.bind(superAdminInstitutesController));
    fastify.post('/', superAdminInstitutesController.create.bind(superAdminInstitutesController));
    fastify.patch('/:id', superAdminInstitutesController.update.bind(superAdminInstitutesController));
    fastify.delete('/:id', superAdminInstitutesController.delete.bind(superAdminInstitutesController));

    // Cambio de plan
    fastify.put('/:id/plan', superAdminInstitutesController.changePlan.bind(superAdminInstitutesController));

    // Re-provisionar instituto (actualiza databaseUser/Password/Host/Port en platform DB)
    fastify.post('/:id/reprovision', superAdminInstitutesController.reprovision.bind(superAdminInstitutesController));
}

