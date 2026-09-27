import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { authenticate, requireAdmin, requireTeacher } from '../middleware/auth.middleware';
import { cargaHoraria, constanciaDeTrabajo, reglasDeCargaHoraria, ponerReglasDeCargaHoraria } from '../services/personal.service';
import { instituteTimezone, todayInTimezone } from '../utils/school-time';
import { responderErrorClaro } from '../utils/error-claro';
import { AppErrors } from '../middleware/error.middleware';

/**
 * EL PERSONAL (`/api/...`), `services/personal.service.ts`:
 *   GET /teachers/:id/carga-horaria            su carga (el admin, o el propio profesor)
 *   GET /users/:id/constancia-de-trabajo       la constancia (admin)
 *   GET|PUT /institutes/current/carga-horaria  el rango recomendado del liceo (admin)
 */
const id = { type: 'string', minLength: 1, maxLength: 64 } as const;
const liceoDe = (r: FastifyRequest) => String((r.user as any)?.instituteId ?? (r as any).institute?.id ?? '');
const yoDe = (r: FastifyRequest) => String((r.user as any)?.userId ?? (r.user as any)?.id ?? '');
const hoyDe = async (r: FastifyRequest) => todayInTimezone(await instituteTimezone(r.tenantPrisma));
type P = FastifyRequest<{ Params: { id: string }; Body: any }>;
const responder = (fn: (r: P) => Promise<unknown>) => async (r: P, reply: FastifyReply) => {
    try {
        return reply.send({ success: true, data: await fn(r) });
    } catch (e) {
        return responderErrorClaro(reply, e);
    }
};

export async function personalRoutes(fastify: FastifyInstance) {
    fastify.get(
        '/teachers/:id/carga-horaria',
        { preHandler: [authenticate, requireTeacher], schema: { params: { type: 'object', properties: { id } } } },
        responder(async (r) => {
            // El profesor, la suya; la de otro, solo el admin.
            if ((r.user as any)?.role !== 'ADMIN' && yoDe(r) !== r.params.id) {
                throw AppErrors.Forbidden('Solo puedes ver tu propia carga horaria');
            }
            return cargaHoraria(r.tenantPrisma, liceoDe(r), r.params.id, await hoyDe(r));
        }) as any
    );
    fastify.get(
        '/users/:id/constancia-de-trabajo',
        { preHandler: [authenticate, requireAdmin], schema: { params: { type: 'object', properties: { id } } } },
        responder(async (r) => constanciaDeTrabajo(r.tenantPrisma, liceoDe(r), r.params.id, await hoyDe(r))) as any
    );
    fastify.get('/institutes/current/carga-horaria', { preHandler: [authenticate, requireTeacher] }, responder((r) => reglasDeCargaHoraria(liceoDe(r))) as any);
    fastify.put(
        '/institutes/current/carga-horaria',
        {
            preHandler: [authenticate, requireAdmin],
            schema: { body: { type: 'object', additionalProperties: false, required: ['minimo', 'maximo'], properties: { minimo: { type: 'number' }, maximo: { type: 'number' } } } },
        },
        responder((r) => ponerReglasDeCargaHoraria(liceoDe(r), r.body as any)) as any
    );
}
