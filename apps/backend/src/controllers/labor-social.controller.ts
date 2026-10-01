import { FastifyReply, FastifyRequest } from 'fastify';
import { anotarActividad, borrarActividad, listaDeLaborSocial, laborSocialDelAlumno } from '../services/labor-social.service';
import { canSeeStudent } from '../services/authorization.service';
import { responderErrorClaro } from '../utils/error-claro';

/**
 * LA LABOR SOCIAL (`services/labor-social.service.ts`). La anotan el admin y
 * el profesor guía de la sección del alumno; el alumno y su representante
 * solo la ven. Lo decide el servicio, alumno por alumno.
 */

const instituteIdDe = (request: FastifyRequest): string =>
    String((request.user as any)?.instituteId ?? (request as any).institute?.id ?? '');
const quienDe = (request: FastifyRequest) => ({
    id: String((request.user as any)?.userId ?? (request.user as any)?.id ?? ''),
    role: String((request.user as any)?.role ?? ''),
});

export async function lista(request: FastifyRequest, reply: FastifyReply) {
    try {
        return reply.send({ success: true, data: await listaDeLaborSocial(request.tenantPrisma, instituteIdDe(request), quienDe(request)) });
    } catch (e) {
        return responderErrorClaro(reply, e);
    }
}

export async function delAlumno(request: FastifyRequest<{ Params: { studentId: string } }>, reply: FastifyReply) {
    try {
        if (!(await canSeeStudent(request.tenantPrisma, request.user as any, request.params.studentId))) {
            return reply.status(403).send({ error: 'Solo puedes consultar a tus estudiantes', code: 'FORBIDDEN' });
        }
        return reply.send({
            success: true,
            data: await laborSocialDelAlumno(request.tenantPrisma, instituteIdDe(request), request.params.studentId, quienDe(request)),
        });
    } catch (e) {
        return responderErrorClaro(reply, e);
    }
}

export async function anotar(request: FastifyRequest<{ Body: any }>, reply: FastifyReply) {
    try {
        const { alumnos, ...datos } = request.body as { alumnos: string[] } & Record<string, any>;
        const hecho = await anotarActividad(request.tenantPrisma, instituteIdDe(request), quienDe(request), alumnos, datos as any);
        return reply.status(201).send({ success: true, data: hecho });
    } catch (e) {
        return responderErrorClaro(reply, e);
    }
}

export async function borrar(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    try {
        return reply.send({ success: true, data: await borrarActividad(request.tenantPrisma, instituteIdDe(request), quienDe(request), request.params.id) });
    } catch (e) {
        return responderErrorClaro(reply, e);
    }
}
