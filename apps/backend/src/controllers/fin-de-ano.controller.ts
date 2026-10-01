import { FastifyReply, FastifyRequest } from 'fastify';
import {
    estadoDelFinDeAno,
    faltantesDelUltimoLapso,
    reprobadasParaRevision,
    decidir,
    crearAnoSiguiente,
    corregirDecision,
    filaDeDecision,
    expedientesDelCierre,
} from '../services/fin-de-ano.service';
import { prepareClose } from '../services/promotion/close-cycle.service';
import { revisionDeLaMateria, registrarRevision } from '../services/revision.service';
import { assertClassroomScope } from '../services/authorization.service';
import { instituteTimezone, todayInTimezone } from '../utils/school-time';
import { responderErrorClaro } from '../utils/error-claro';

/**
 * EL FIN DEL AÑO ESCOLAR (`services/fin-de-ano.service.ts`). Lo del admin va
 * bajo `/api/academic-years/:id/cierre` (lo protege `requireAdmin`); la
 * revisión del profesor, bajo `/api/revision/:classroomId/:subjectId`.
 */

const instituteIdDe = (request: FastifyRequest): string =>
    String((request.user as any)?.instituteId ?? (request as any).institute?.id ?? '');
const actorDe = (request: FastifyRequest): string =>
    String((request.user as any)?.userId ?? (request.user as any)?.id ?? '');

type ConCiclo = FastifyRequest<{ Params: { id: string } }>;

export async function verEstado(request: ConCiclo, reply: FastifyReply) {
    try {
        return reply.send({ success: true, data: await estadoDelFinDeAno(request.tenantPrisma, instituteIdDe(request), request.params.id) });
    } catch (e) {
        return responderErrorClaro(reply, e);
    }
}

export async function verFaltantes(request: ConCiclo, reply: FastifyReply) {
    try {
        return reply.send({ success: true, data: await faltantesDelUltimoLapso(request.tenantPrisma, request.params.id) });
    } catch (e) {
        return responderErrorClaro(reply, e);
    }
}

export async function verRevision(request: ConCiclo, reply: FastifyReply) {
    try {
        return reply.send({ success: true, data: await reprobadasParaRevision(request.tenantPrisma, instituteIdDe(request), request.params.id) });
    } catch (e) {
        return responderErrorClaro(reply, e);
    }
}

export async function verExpedientes(request: ConCiclo, reply: FastifyReply) {
    try {
        return reply.send({ success: true, data: await expedientesDelCierre(request.tenantPrisma, request.params.id) });
    } catch (e) {
        return responderErrorClaro(reply, e);
    }
}

export async function verDecisiones(request: ConCiclo, reply: FastifyReply) {
    try {
        const { suggestions } = await prepareClose(request.tenantPrisma, request.params.id, instituteIdDe(request));
        return reply.send({ success: true, data: suggestions.map(filaDeDecision) });
    } catch (e) {
        return responderErrorClaro(reply, e);
    }
}

export async function ponerDecision(
    request: FastifyRequest<{ Params: { id: string; studentId: string }; Body: { condicion: string; motivo?: string } }>,
    reply: FastifyReply
) {
    try {
        const hecho = await decidir(request.tenantPrisma, instituteIdDe(request), request.params.id, request.params.studentId, {
            condicion: request.body.condicion,
            motivo: request.body.motivo ?? '',
            quien: actorDe(request),
        });
        return reply.send({ success: true, data: hecho });
    } catch (e) {
        return responderErrorClaro(reply, e);
    }
}

export async function nuevoAnoSiguiente(request: FastifyRequest<{ Params: { id: string }; Body: any }>, reply: FastifyReply) {
    try {
        const hecho = await crearAnoSiguiente(request.tenantPrisma, request.params.id, request.body ?? {});
        return reply.status(201).send({ success: true, data: hecho });
    } catch (e) {
        return responderErrorClaro(reply, e);
    }
}

export async function corregir(
    request: FastifyRequest<{
        Params: { id: string; studentId: string };
        Body: { condicion: string; motivo: string; destinoClassroomId?: string | null };
    }>,
    reply: FastifyReply
) {
    try {
        const hecho = await corregirDecision(request.tenantPrisma, instituteIdDe(request), request.params.id, request.params.studentId, {
            condicion: request.body.condicion,
            motivo: request.body.motivo,
            destinoClassroomId: request.body.destinoClassroomId ?? null,
            quien: actorDe(request),
        });
        return reply.send({ success: true, data: hecho });
    } catch (e) {
        return responderErrorClaro(reply, e);
    }
}

// ─── La revisión, desde la materia del profesor ────────────────────────────

type ConMateria = FastifyRequest<{ Params: { classroomId: string; subjectId: string } }>;

export async function verRevisionDeLaMateria(request: ConMateria, reply: FastifyReply) {
    const { classroomId, subjectId } = request.params;
    try {
        await assertClassroomScope(request.tenantPrisma, request.user as any, classroomId, { subjectId, accion: 'ver la revisión' });
        return reply.send({ success: true, data: await revisionDeLaMateria(request.tenantPrisma, instituteIdDe(request), classroomId, subjectId) });
    } catch (e) {
        return responderErrorClaro(reply, e);
    }
}

export async function ponerRevisionDeLaMateria(
    request: FastifyRequest<{
        Params: { classroomId: string; subjectId: string };
        Body: { studentId: string; score?: number; componentes?: Array<{ nombre: string; nota: number }>; fecha?: string; observaciones?: string };
    }>,
    reply: FastifyReply
) {
    const { classroomId, subjectId } = request.params;
    const prisma: any = request.tenantPrisma;
    try {
        await assertClassroomScope(prisma, request.user as any, classroomId, { subjectId, accion: 'poner la revisión' });
        const seccion = await prisma.classroom.findUnique({ where: { id: classroomId }, select: { academicYearId: true } });
        if (!seccion?.academicYearId) return reply.status(404).send({ error: 'Sección no encontrada', code: 'NOT_FOUND' });
        // El alumno tiene que ser de ESTA sección: un profesor no pone la
        // revisión de un alumno ajeno aunque dé la misma materia en otra.
        const suyo = await prisma.studentClassroom.count({ where: { classroomId, studentId: request.body.studentId, isActive: true } });
        if (!suyo) return reply.status(403).send({ error: 'Ese alumno no es de esta sección', code: 'ALUMNO_AJENO' });
        const nota = await registrarRevision(prisma, instituteIdDe(request), {
            academicYearId: seccion.academicYearId,
            studentId: request.body.studentId,
            subjectId,
            score: request.body.score,
            componentes: request.body.componentes,
            fecha: request.body.fecha ?? todayInTimezone(await instituteTimezone(prisma)),
            observaciones: typeof request.body.observaciones === 'string' ? request.body.observaciones.slice(0, 500) : null,
            registradaPor: actorDe(request),
        });
        return reply.send({ success: true, data: nota });
    } catch (e) {
        return responderErrorClaro(reply, e);
    }
}
