import { FastifyInstance } from 'fastify';
import { superAdminInstitutesController } from '../controllers/superadmin-institutes.controller';
import { superAdminAuthMiddleware } from '../middleware/superadmin-auth.middleware';
import { validateBody } from '../middleware/validation.middleware';
import {
    updateInstituteSchema,
    changePlanSchema,
    UpdateInstituteInput,
    ChangePlanInput,
} from '../schemas/superadmin-institutes.schema';

export async function superAdminInstitutesRoutes(fastify: FastifyInstance) {
    // Todas las rutas requieren autenticación de SuperAdmin
    fastify.addHook('onRequest', superAdminAuthMiddleware);

    // Planes disponibles (estático, no requiere :id)
    fastify.get('/plans', superAdminInstitutesController.getPlans.bind(superAdminInstitutesController));

    // Estadísticas generales
    fastify.get('/stats', superAdminInstitutesController.stats.bind(superAdminInstitutesController));

    // Estado del esquema de cada liceo y reintento de migraciones
    fastify.get(
        '/migrations',
        superAdminInstitutesController.migrationsStatus.bind(superAdminInstitutesController)
    );
    fastify.post(
        '/migrations/run',
        superAdminInstitutesController.migrateAll.bind(superAdminInstitutesController)
    );

    // Validación de puertos
    fastify.get('/ports/check', superAdminInstitutesController.checkPort.bind(superAdminInstitutesController));
    fastify.get('/ports/available', superAdminInstitutesController.getAvailablePort.bind(superAdminInstitutesController));

    // CRUD de institutos
    fastify.get('/', superAdminInstitutesController.list.bind(superAdminInstitutesController));
    fastify.get('/:id', superAdminInstitutesController.getById.bind(superAdminInstitutesController));
    fastify.post('/', superAdminInstitutesController.create.bind(superAdminInstitutesController));
    // El body de PATCH va directo a `prisma.institute.update({ data })`, así que
    // la lista blanca estricta del schema es lo único que impide escribir columnas
    // que el endpoint no expone (subdomain, slug, code, databaseHost/User/Password...).
    fastify.patch<{ Params: { id: string }; Body: UpdateInstituteInput }>(
        '/:id',
        { preHandler: validateBody(updateInstituteSchema) },
        superAdminInstitutesController.update.bind(superAdminInstitutesController)
    );
    fastify.delete('/:id', superAdminInstitutesController.delete.bind(superAdminInstitutesController));

    // Cambio de plan
    fastify.put<{ Params: { id: string }; Body: ChangePlanInput }>(
        '/:id/plan',
        { preHandler: validateBody(changePlanSchema) },
        superAdminInstitutesController.changePlan.bind(superAdminInstitutesController)
    );

    // Re-provisionar instituto (actualiza databaseUser/Password/Host/Port en platform DB)
    fastify.post('/:id/reprovision', superAdminInstitutesController.reprovision.bind(superAdminInstitutesController));

    // Aplicar las migraciones pendientes a un liceo
    fastify.post<{ Params: { id: string } }>(
        '/:id/migrate',
        superAdminInstitutesController.migrateInstitute.bind(superAdminInstitutesController)
    );
}

