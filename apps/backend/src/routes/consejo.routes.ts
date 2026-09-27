import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { authenticate, requireTeacher } from '../middleware/auth.middleware';
import { consejosDeLaSeccion, consejo, guardarConsejo, borrarConsejo, actaParaImprimir } from '../services/consejo.service';
import { instituteTimezone, todayInTimezone } from '../utils/school-time';
import { responderErrorClaro } from '../utils/error-claro';

/**
 * EL CONSEJO DE SECCIÓN (`/api/classrooms/:id/consejos[...]`). Del personal
 * (admin y profesores); quién escribe y quién lee lo decide el servicio
 * (`services/consejo.service.ts`).
 *   GET    /classrooms/:id/consejos                     los lapsos, con o sin acta
 *   GET    /classrooms/:id/consejos/:periodId           el acta (o lo propuesto)
 *   PUT    /classrooms/:id/consejos/:periodId           guardarla
 *   DELETE /classrooms/:id/consejos/:periodId           borrarla (con copia)
 *   GET    /classrooms/:id/consejos/:periodId/acta      para imprimir
 */
const id = { type: 'string', minLength: 1, maxLength: 64 } as const;
const quienDe = (r: FastifyRequest) => ({ id: String((r.user as any)?.userId ?? (r.user as any)?.id ?? ''), role: String((r.user as any)?.role ?? '') });
const liceoDe = (r: FastifyRequest) => String((r.user as any)?.instituteId ?? (r as any).institute?.id ?? '');
type P = FastifyRequest<{ Params: { id: string; periodId: string }; Body: any }>;
const responder = (fn: (r: P) => Promise<unknown>) => async (r: P, reply: FastifyReply) => {
    try {
        return reply.send({ success: true, data: await fn(r) });
    } catch (e) {
        return responderErrorClaro(reply, e);
    }
};

export async function consejoRoutes(fastify: FastifyInstance) {
    const personal = [authenticate, requireTeacher];
    const params = { type: 'object', properties: { id, periodId: id } } as const;
    fastify.get('/classrooms/:id/consejos', { preHandler: personal, schema: { params } }, responder((r) => consejosDeLaSeccion(r.tenantPrisma, quienDe(r), r.params.id)) as any);
    fastify.get('/classrooms/:id/consejos/:periodId', { preHandler: personal, schema: { params } }, responder((r) => consejo(r.tenantPrisma, liceoDe(r), quienDe(r), r.params.id, r.params.periodId)) as any);
    fastify.put(
        '/classrooms/:id/consejos/:periodId',
        {
            preHandler: personal,
            schema: {
                params,
                body: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['fecha', 'asistentes', 'casos'],
                    properties: {
                        fecha: { type: 'string', maxLength: 10 },
                        acuerdosGenerales: { type: 'string', maxLength: 4000 },
                        asistentes: { type: 'array', maxItems: 60, items: { type: 'object', required: ['id', 'asistio'], properties: { id, asistio: { type: 'boolean' } } } },
                        casos: {
                            type: 'array',
                            maxItems: 60,
                            items: {
                                type: 'object',
                                required: ['studentId'],
                                properties: { studentId: id, loTratado: { type: 'string', maxLength: 2000 }, acuerdo: { type: 'string', maxLength: 2000 } },
                            },
                        },
                    },
                },
            },
        },
        responder((r) => guardarConsejo(r.tenantPrisma, liceoDe(r), quienDe(r), r.params.id, r.params.periodId, r.body as any)) as any
    );
    fastify.delete('/classrooms/:id/consejos/:periodId', { preHandler: personal, schema: { params } }, responder((r) => borrarConsejo(r.tenantPrisma, quienDe(r), r.params.id, r.params.periodId)) as any);
    fastify.get(
        '/classrooms/:id/consejos/:periodId/acta',
        { preHandler: personal, schema: { params } },
        responder(async (r) => actaParaImprimir(r.tenantPrisma, liceoDe(r), quienDe(r), r.params.id, r.params.periodId, todayInTimezone(await instituteTimezone(r.tenantPrisma)))) as any
    );
}
