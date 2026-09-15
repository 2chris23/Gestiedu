import { FastifyInstance } from 'fastify';
import { authenticate, requireAdmin, requireTeacher } from '../middleware/auth.middleware';
import {
    listEvents,
    getEventDay,
    previewEvent,
    createEvent,
    updateEvent,
    deleteEvent,
} from '../controllers/school-events.controller';

export async function schoolEventsRoutes(fastify: FastifyInstance) {
    fastify.register(async (authenticatedRoutes) => {
        authenticatedRoutes.addHook('onRequest', authenticate);

        // Lectura: calendario y vista de día
        authenticatedRoutes.get('/events', { onRequest: [requireTeacher] }, listEvents as any);
        authenticatedRoutes.get('/events/day', { onRequest: [requireTeacher] }, getEventDay as any);

        // Escritura: solo el admin/director crea, mueve y borra eventos
        authenticatedRoutes.register(async (adminRoutes) => {
            adminRoutes.addHook('onRequest', requireAdmin);

            adminRoutes.post('/events/preview', previewEvent as any);
            adminRoutes.post('/events', createEvent as any);
            adminRoutes.put('/events/:id', updateEvent as any);
            adminRoutes.delete('/events/:id', deleteEvent as any);
        });
    });
}
