import { FastifyReply, FastifyRequest } from 'fastify';
import { observacionesDelPanel, citar, marcarAsistencia, hojaDeCitacion, citacionesDelRepresentante, type DatosDeLaCitacion } from '../services/citaciones.service';
import { instituteTimezone, todayInTimezone } from '../utils/school-time';
import { responderErrorClaro } from '../utils/error-claro';

/**
 * EL PANEL DE OBSERVACIONES Y LAS CITACIONES (`services/citaciones.service.ts`).
 * Quién puede qué lo decide el servicio, observación por observación.
 */

const instituteIdDe = (request: FastifyRequest): string =>
    String((request.user as any)?.instituteId ?? (request as any).institute?.id ?? '');
const quienDe = (request: FastifyRequest) => ({
    id: String((request.user as any)?.userId ?? (request.user as any)?.id ?? ''),
    role: String((request.user as any)?.role ?? ''),
});
const hoyDe = async (request: FastifyRequest) => todayInTimezone(await instituteTimezone(request.tenantPrisma));

export async function panel(request: FastifyRequest<{ Querystring: Record<string, string> }>, reply: FastifyReply) {
    try {
        const q = request.query;
        return reply.send({
            success: true,
            data: await observacionesDelPanel(request.tenantPrisma, quienDe(request), {
                classroomId: q.seccion || undefined,
                studentId: q.alumno || undefined,
                tipo: q.tipo || undefined,
                desde: q.desde || undefined,
                hasta: q.hasta || undefined,
                conCitacion: String(q.conCitacion) === 'true',
                pagina: Number(q.pagina) || 1,
            }),
        });
    } catch (e) {
        return responderErrorClaro(reply, e);
    }
}

export async function crearCitacion(request: FastifyRequest<{ Params: { id: string }; Body: DatosDeLaCitacion }>, reply: FastifyReply) {
    try {
        const hecha = await citar(
            request.tenantPrisma,
            instituteIdDe(request),
            (request.server as any).io,
            quienDe(request),
            request.params.id,
            request.body,
            await hoyDe(request)
        );
        // Al alumno y a su representante se les pone al día lo que ven.
        request.aQuienAfecta = { studentIds: [hecha.alumnoId] };
        return reply.status(201).send({ success: true, data: hecha });
    } catch (e) {
        return responderErrorClaro(reply, e);
    }
}

export async function asistencia(request: FastifyRequest<{ Params: { id: string }; Body: { estado: string; loQueSeHablo?: string | null } }>, reply: FastifyReply) {
    try {
        return reply.send({
            success: true,
            data: await marcarAsistencia(request.tenantPrisma, quienDe(request), request.params.id, request.body.estado, request.body.loQueSeHablo),
        });
    } catch (e) {
        return responderErrorClaro(reply, e);
    }
}

export async function hoja(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    try {
        return reply.send({ success: true, data: await hojaDeCitacion(request.tenantPrisma, instituteIdDe(request), quienDe(request), request.params.id, await hoyDe(request)) });
    } catch (e) {
        return responderErrorClaro(reply, e);
    }
}

export async function mias(request: FastifyRequest, reply: FastifyReply) {
    try {
        const quien = quienDe(request);
        if (quien.role !== 'TUTOR') return reply.send({ success: true, data: [] });
        return reply.send({ success: true, data: await citacionesDelRepresentante(request.tenantPrisma, quien.id) });
    } catch (e) {
        return responderErrorClaro(reply, e);
    }
}
