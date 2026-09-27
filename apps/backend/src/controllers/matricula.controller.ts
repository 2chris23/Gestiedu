import { FastifyReply, FastifyRequest } from 'fastify';
import { matriculaDelCiclo } from '../services/matricula.service';
import { graduandos, anotarTitulo } from '../services/graduandos.service';
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

/** LOS GRADUANDOS Y SU TÍTULO (`services/graduandos.service.ts`). Del admin. */
export async function verGraduandos(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    try {
        const instituteId = String((request.user as any)?.instituteId ?? (request as any).institute?.id ?? '');
        const hoy = todayInTimezone(await instituteTimezone(request.tenantPrisma));
        return reply.send({ success: true, data: await graduandos(request.tenantPrisma, instituteId, request.params.id, hoy) });
    } catch (e) {
        return responderErrorClaro(reply, e);
    }
}

export async function ponerTitulo(request: FastifyRequest<{ Params: { id: string; studentId: string }; Body: any }>, reply: FastifyReply) {
    try {
        const instituteId = String((request.user as any)?.instituteId ?? (request as any).institute?.id ?? '');
        const actor = String((request.user as any)?.userId ?? (request.user as any)?.id ?? '');
        return reply.send({ success: true, data: await anotarTitulo(request.tenantPrisma, instituteId, actor, request.params.id, request.params.studentId, request.body as any) });
    } catch (e) {
        return responderErrorClaro(reply, e);
    }
}
