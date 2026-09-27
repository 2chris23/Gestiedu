import { FastifyReply, FastifyRequest } from 'fastify';
import { puedeVerElResumen, resumenFinalDeLaSeccion, esTipoDeResumen } from '../services/resumen-final.service';
import { instituteTimezone, todayInTimezone } from '../utils/school-time';

/**
 * GET /api/classrooms/:id/resumen-final
 *
 * El resumen final del rendimiento de la sección (`services/resumen-final.service.ts`).
 * Lo ven el admin y el profesor guía de la sección. Solo lectura.
 */
export async function obtenerResumenFinal(request: FastifyRequest<{ Params: { id: string }; Querystring: { tipo?: string } }>, reply: FastifyReply) {
    const prisma = request.tenantPrisma;
    // FINAL (por defecto), REVISION o MATERIA_PENDIENTE: los tres del MPPE.
    const tipo = request.query?.tipo ?? 'FINAL';
    if (!esTipoDeResumen(tipo)) {
        return reply.status(400).send({ error: 'Tipo de resumen: FINAL, REVISION o MATERIA_PENDIENTE', code: 'TIPO_INVALIDO' });
    }
    if (!(await puedeVerElResumen(prisma, request.user as any, request.params.id))) {
        return reply.status(403).send({ error: 'El resumen final lo ven el admin y el profesor guía de la sección', code: 'FORBIDDEN' });
    }
    const instituteId = (request.user as any)?.instituteId ?? (request as any).institute?.id;
    if (!instituteId) return reply.status(400).send({ error: 'No se pudo determinar el liceo', code: 'INSTITUTE_REQUIRED' });
    const hoy = todayInTimezone(await instituteTimezone(prisma));
    const data = await resumenFinalDeLaSeccion(prisma, instituteId, request.params.id, hoy, tipo);
    return reply.send({ success: true, data });
}
