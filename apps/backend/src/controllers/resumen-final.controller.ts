import { FastifyReply, FastifyRequest } from 'fastify';
import { puedeVerElResumen, resumenFinalDeLaSeccion } from '../services/resumen-final.service';
import { instituteTimezone, todayInTimezone } from '../utils/school-time';

/**
 * GET /api/classrooms/:id/resumen-final
 *
 * El resumen final del rendimiento de la sección (`services/resumen-final.service.ts`).
 * Lo ven el admin y el profesor guía de la sección. Solo lectura.
 */
export async function obtenerResumenFinal(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const prisma = request.tenantPrisma;
    if (!(await puedeVerElResumen(prisma, request.user as any, request.params.id))) {
        return reply.status(403).send({ error: 'El resumen final lo ven el admin y el profesor guía de la sección', code: 'FORBIDDEN' });
    }
    const instituteId = (request.user as any)?.instituteId ?? (request as any).institute?.id;
    if (!instituteId) return reply.status(400).send({ error: 'No se pudo determinar el liceo', code: 'INSTITUTE_REQUIRED' });
    const hoy = todayInTimezone(await instituteTimezone(prisma));
    const data = await resumenFinalDeLaSeccion(prisma, instituteId, request.params.id, hoy);
    return reply.send({ success: true, data });
}
