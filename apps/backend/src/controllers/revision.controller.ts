import { FastifyReply, FastifyRequest } from 'fastify';
import { registrarRevision } from '../services/revision.service';
import { borrarGuardandoCopia, quienBorra } from '../utils/papelera';
import { instituteTimezone, todayInTimezone } from '../utils/school-time';

/**
 * Las notas de revisión de un año escolar (`services/revision.service.ts`).
 * Todo esto es del admin: lo protege `requireAdmin` en la ruta.
 */

const instituteIdDe = (request: FastifyRequest): string | undefined =>
    (request.user as any)?.instituteId ?? (request as any).institute?.id;

const actorDe = (request: FastifyRequest): string =>
    String((request.user as any)?.userId ?? (request.user as any)?.id ?? '');

/** GET /api/academic-years/:id/revisiones */
export async function listarRevisiones(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const prisma: any = request.tenantPrisma;
    const filas = await prisma.notaDeRevision.findMany({
        where: { academicYearId: request.params.id },
        include: {
            student: { select: { id: true, firstName: true, lastName: true } },
            subject: { select: { id: true, name: true } },
        },
        orderBy: [{ fecha: 'asc' }],
    });
    return reply.send({ success: true, data: filas });
}

/** PUT /api/academic-years/:id/revisiones — crea o corrige la de un alumno y materia. */
export async function guardarRevision(
    request: FastifyRequest<{
        Params: { id: string };
        Body: { studentId?: string; subjectId?: string; score?: number; fecha?: string; observaciones?: string };
    }>,
    reply: FastifyReply
) {
    const prisma = request.tenantPrisma;
    const instituteId = instituteIdDe(request);
    if (!instituteId) return reply.status(400).send({ error: 'No se pudo determinar el liceo', code: 'INSTITUTE_REQUIRED' });
    const { studentId, subjectId, score, fecha, observaciones } = request.body ?? {};
    if (!studentId || !subjectId) {
        return reply.status(400).send({ error: 'Faltan el estudiante y la materia', code: 'VALIDATION_ERROR' });
    }
    if (fecha !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(String(fecha))) {
        return reply.status(400).send({ error: 'La fecha va como AAAA-MM-DD', code: 'VALIDATION_ERROR' });
    }
    try {
        const nota = await registrarRevision(prisma, instituteId, {
            academicYearId: request.params.id,
            studentId,
            subjectId,
            score: Number(score),
            fecha: fecha ?? todayInTimezone(await instituteTimezone(prisma)),
            observaciones: typeof observaciones === 'string' ? observaciones.slice(0, 500) : null,
            registradaPor: actorDe(request),
        });
        return reply.send({ success: true, data: nota });
    } catch (error: any) {
        // El manejador general cambia el código de un 409 por CONFLICT; la
        // pantalla necesita el motivo (CICLO_CERRADO, NO_REPROBADA…).
        if (error?.statusCode && error.statusCode < 500) {
            return reply.status(error.statusCode).send({ error: error.message, code: error.code });
        }
        throw error;
    }
}

/** DELETE /api/academic-years/:id/revisiones/:revisionId — con copia en la papelera. */
export async function borrarRevision(
    request: FastifyRequest<{ Params: { id: string; revisionId: string } }>,
    reply: FastifyReply
) {
    const prisma: any = request.tenantPrisma;
    const ciclo = await prisma.academicYear.findUnique({ where: { id: request.params.id }, select: { status: true } });
    if (!ciclo) return reply.status(404).send({ error: 'Año escolar no encontrado', code: 'NOT_FOUND' });
    if (ciclo.status === 'COMPLETED') {
        return reply.status(409).send({ error: 'El año escolar ya se cerró', code: 'CICLO_CERRADO' });
    }
    const n = await borrarGuardandoCopia(
        prisma,
        'notaDeRevision',
        { id: request.params.revisionId, academicYearId: request.params.id },
        quienBorra(request as any)
    );
    if (n === 0) return reply.status(404).send({ error: 'Nota de revisión no encontrada', code: 'NOT_FOUND' });
    return reply.send({ success: true });
}
