import { FastifyReply, FastifyRequest } from 'fastify';
import {
    listarPendientes,
    pendientesDelAlumno,
    evaluarMomento,
    quitarMomento,
    asignarProfesor,
    actaDeCompromiso,
} from '../services/materias-pendientes.service';
import { canSeeStudent } from '../services/authorization.service';
import { instituteTimezone, todayInTimezone } from '../utils/school-time';
import { responderErrorClaro } from '../utils/error-claro';

/**
 * LAS MATERIAS PENDIENTES (`services/materias-pendientes.service.ts`).
 * Quién puede qué:
 *   - la lista: el admin, todas; el profesor, las que evalúa él;
 *   - poner o quitar un momento: el profesor asignado, o el admin;
 *   - cambiar el profesor: el admin (lo protege la ruta);
 *   - las de un alumno y su acta: quien puede ver a ese alumno (él mismo, su
 *     representante, el personal que le da clase, el admin).
 */

const instituteIdDe = (request: FastifyRequest): string =>
    String((request.user as any)?.instituteId ?? (request as any).institute?.id ?? '');
const quienDe = (request: FastifyRequest) => ({
    id: String((request.user as any)?.userId ?? (request.user as any)?.id ?? ''),
    role: String((request.user as any)?.role ?? ''),
});

export async function listar(request: FastifyRequest<{ Querystring: { cicloId?: string } }>, reply: FastifyReply) {
    try {
        const datos = await listarPendientes(request.tenantPrisma, instituteIdDe(request), quienDe(request), { cicloId: request.query?.cicloId });
        return reply.send({ success: true, data: datos });
    } catch (e) {
        return responderErrorClaro(reply, e);
    }
}

export async function delAlumno(request: FastifyRequest<{ Params: { studentId: string } }>, reply: FastifyReply) {
    try {
        if (!(await canSeeStudent(request.tenantPrisma, request.user as any, request.params.studentId))) {
            return reply.status(403).send({ error: 'Solo puedes consultar a tus estudiantes', code: 'FORBIDDEN' });
        }
        return reply.send({ success: true, data: await pendientesDelAlumno(request.tenantPrisma, request.params.studentId) });
    } catch (e) {
        return responderErrorClaro(reply, e);
    }
}

export async function acta(request: FastifyRequest<{ Params: { studentId: string }; Querystring: { cicloId?: string } }>, reply: FastifyReply) {
    try {
        if (!(await canSeeStudent(request.tenantPrisma, request.user as any, request.params.studentId))) {
            return reply.status(403).send({ error: 'Solo puedes consultar a tus estudiantes', code: 'FORBIDDEN' });
        }
        return reply.send({ success: true, data: await actaDeCompromiso(request.tenantPrisma, request.params.studentId, request.query?.cicloId) });
    } catch (e) {
        return responderErrorClaro(reply, e);
    }
}

export async function ponerMomento(
    request: FastifyRequest<{ Params: { id: string; momento: string }; Body: { nota: number; fecha?: string; observaciones?: string } }>,
    reply: FastifyReply
) {
    try {
        const prisma: any = request.tenantPrisma;
        const hecho = await evaluarMomento(prisma, instituteIdDe(request), quienDe(request), {
            id: request.params.id,
            momento: Number(request.params.momento),
            nota: request.body.nota,
            fecha: request.body.fecha ?? todayInTimezone(await instituteTimezone(prisma)),
            observaciones: request.body.observaciones?.slice(0, 300) ?? null,
        });
        return reply.send({ success: true, data: hecho });
    } catch (e) {
        return responderErrorClaro(reply, e);
    }
}

export async function borrarMomento(request: FastifyRequest<{ Params: { id: string; momento: string } }>, reply: FastifyReply) {
    try {
        const hecho = await quitarMomento(request.tenantPrisma, instituteIdDe(request), quienDe(request), request.params.id, Number(request.params.momento));
        return reply.send({ success: true, data: hecho });
    } catch (e) {
        return responderErrorClaro(reply, e);
    }
}

export async function cambiarProfesor(request: FastifyRequest<{ Params: { id: string }; Body: { profesorId: string | null } }>, reply: FastifyReply) {
    try {
        return reply.send({ success: true, data: await asignarProfesor(request.tenantPrisma, request.params.id, request.body.profesorId ?? null) });
    } catch (e) {
        return responderErrorClaro(reply, e);
    }
}
