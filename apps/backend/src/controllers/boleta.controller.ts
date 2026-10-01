import { FastifyReply, FastifyRequest } from 'fastify';
import { boletaDelAlumno, puedeVerLaBoleta } from '../services/boleta.service';
import { instituteTimezone, todayInTimezone } from '../utils/school-time';

/**
 * GET /api/students/:id/boleta?academicYearId=
 *
 * La boleta del alumno (notas por lapso, definitiva e inasistencias). La ven
 * el admin, el propio alumno, su representante y su profesor guía
 * (`puedeVerLaBoleta`). Solo lectura. Ver `services/boleta.service.ts`.
 */
export async function obtenerBoleta(
    request: FastifyRequest<{ Params: { id: string }; Querystring: { academicYearId?: string } }>,
    reply: FastifyReply
) {
    const prisma = request.tenantPrisma;
    const { id } = request.params;
    if (!(await puedeVerLaBoleta(prisma, request.user as any, id))) {
        return reply.status(403).send({ error: 'Solo puedes ver la boleta de tus estudiantes', code: 'FORBIDDEN' });
    }
    const instituteId = (request.user as any)?.instituteId ?? (request as any).institute?.id;
    if (!instituteId) {
        return reply.status(400).send({ error: 'No se pudo determinar el liceo', code: 'INSTITUTE_REQUIRED' });
    }
    const hoy = todayInTimezone(await instituteTimezone(prisma));
    const data = await boletaDelAlumno(prisma, instituteId, id, {
        academicYearId: request.query?.academicYearId || undefined,
        hoy,
    });
    return reply.status(200).send({ success: true, data });
}
