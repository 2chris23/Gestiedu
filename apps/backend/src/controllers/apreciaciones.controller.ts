import { FastifyReply, FastifyRequest } from 'fastify';
import { apreciacionesDeLaMateria, guardarApreciaciones } from '../services/apreciaciones.service';
import { assertClassroomScope } from '../services/authorization.service';
import { responderErrorClaro } from '../utils/error-claro';

/**
 * Las apreciaciones de una materia cualitativa en una sección
 * (`services/apreciaciones.service.ts`). Las pone el profesor que da esa
 * materia en esa sección, o el admin; el guía de la sección solo las mira.
 */

const instituteIdDe = (request: FastifyRequest): string =>
    String((request.user as any)?.instituteId ?? (request as any).institute?.id ?? '');

const actorDe = (request: FastifyRequest): string =>
    String((request.user as any)?.userId ?? (request.user as any)?.id ?? '');

type Params = { classroomId: string; subjectId: string };

/** GET /api/apreciaciones/:classroomId/:subjectId */
export async function verApreciaciones(request: FastifyRequest<{ Params: Params }>, reply: FastifyReply) {
    const { classroomId, subjectId } = request.params;
    try {
        await assertClassroomScope(request.tenantPrisma, request.user as any, classroomId, {
            subjectId,
            accion: 'ver las apreciaciones',
        });
        const datos = await apreciacionesDeLaMateria(request.tenantPrisma, instituteIdDe(request), classroomId, subjectId);
        return reply.send({ success: true, data: datos });
    } catch (e) {
        return responderErrorClaro(reply, e);
    }
}

/** PUT /api/apreciaciones/:classroomId/:subjectId — las de un momento (un lapso o la final). */
export async function ponerApreciaciones(
    request: FastifyRequest<{
        Params: Params;
        Body: { momento: string; items: Array<{ studentId: string; valor: string; observacion?: string | null }> };
    }>,
    reply: FastifyReply
) {
    const { classroomId, subjectId } = request.params;
    try {
        await assertClassroomScope(request.tenantPrisma, request.user as any, classroomId, {
            subjectId,
            accion: 'poner apreciaciones',
        });
        const hecho = await guardarApreciaciones(request.tenantPrisma, instituteIdDe(request), {
            classroomId,
            subjectId,
            momento: request.body.momento,
            items: request.body.items,
            quien: actorDe(request),
        });
        return reply.send({ success: true, data: hecho });
    } catch (e) {
        return responderErrorClaro(reply, e);
    }
}
