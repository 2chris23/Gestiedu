import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { authenticate, requireAdmin } from '../middleware/auth.middleware';
import { clasesSinProfesor, elProfesor, losProfesores } from '../services/profesores.service';
import { responderErrorClaro } from '../utils/error-claro';

/**
 * LOS PROFESORES (`/api/profesores`), `services/profesores.service.ts`. Del admin.
 *   GET /                 cada profesor con sus horas, las de su cargo y su promedio
 *   GET /sin-asignar      las clases del año en curso sin profesor
 *   GET /:id              su ficha: sus clases, por materia, promedio y asistencia
 * Fijar sus horas: `PUT /teachers/:id/horas-del-cargo` (personal.routes).
 */
const id = { type: 'string', minLength: 1, maxLength: 64 } as const;
const liceoDe = (r: FastifyRequest) => String((r.user as any)?.instituteId ?? (r as any).institute?.id ?? '');
type P = FastifyRequest<{ Params: { id: string } }>;
const responder = (fn: (r: P) => Promise<unknown>) => async (r: P, reply: FastifyReply) => {
    try {
        return reply.send({ success: true, data: await fn(r) });
    } catch (e) {
        return responderErrorClaro(reply, e);
    }
};

export async function profesoresRoutes(fastify: FastifyInstance) {
    const soloAdmin = { preHandler: [authenticate, requireAdmin] };
    fastify.get('/', soloAdmin, responder((r) => losProfesores(r.tenantPrisma, liceoDe(r))) as any);
    fastify.get('/sin-asignar', soloAdmin, responder((r) => clasesSinProfesor(r.tenantPrisma)) as any);
    fastify.get(
        '/:id',
        { ...soloAdmin, schema: { params: { type: 'object', properties: { id } } } },
        responder((r) => elProfesor(r.tenantPrisma, liceoDe(r), r.params.id)) as any
    );
}
