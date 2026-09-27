import { FastifyReply, FastifyRequest } from 'fastify';
import { matriculaDelCiclo } from '../services/matricula.service';
import { instituteTimezone, todayInTimezone } from '../utils/school-time';
import { responderErrorClaro } from '../utils/error-claro';

/** LA ESTADÍSTICA DE MATRÍCULA (`services/matricula.service.ts`). Del admin: lo protege la ruta. */
export async function verMatricula(request: FastifyRequest<{ Params: { id: string }; Querystring: { desde?: string; hasta?: string } }>, reply: FastifyReply) {
    try {
        const instituteId = String((request.user as any)?.instituteId ?? (request as any).institute?.id ?? '');
        const hoy = todayInTimezone(await instituteTimezone(request.tenantPrisma));
        return reply.send({
            success: true,
            data: await matriculaDelCiclo(request.tenantPrisma, instituteId, request.params.id, { desde: request.query.desde, hasta: request.query.hasta }, hoy),
        });
    } catch (e) {
        return responderErrorClaro(reply, e);
    }
}
