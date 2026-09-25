import { FastifyReply, FastifyRequest } from 'fastify';
import { constanciaDelAlumno, esTipoDeConstancia, puedeSacarLaConstancia } from '../services/constancias.service';
import { instituteTimezone, todayInTimezone } from '../utils/school-time';

/**
 * GET /api/students/:id/constancia?tipo=ESTUDIO|BUENA_CONDUCTA
 *
 * Los datos de la constancia de estudio o de buena conducta del alumno. Quién
 * puede, lo decide `puedeSacarLaConstancia`. Solo lectura. Ver
 * `services/constancias.service.ts`.
 */
export async function obtenerConstancia(
    request: FastifyRequest<{ Params: { id: string }; Querystring: { tipo?: string } }>,
    reply: FastifyReply
) {
    const prisma = request.tenantPrisma;
    const { id } = request.params;
    const tipo = request.query?.tipo ?? 'ESTUDIO';
    if (!esTipoDeConstancia(tipo)) {
        return reply.status(400).send({ error: 'Tipo de constancia desconocido: ESTUDIO o BUENA_CONDUCTA', code: 'TIPO_INVALIDO' });
    }
    if (!(await puedeSacarLaConstancia(prisma, request.user as any, id, tipo))) {
        return reply.status(403).send({
            error: tipo === 'ESTUDIO' ? 'Solo puedes sacar la constancia de tus estudiantes' : 'La constancia de buena conducta la emite el liceo',
            code: 'FORBIDDEN',
        });
    }
    const instituteId = (request.user as any)?.instituteId ?? (request as any).institute?.id;
    if (!instituteId) {
        return reply.status(400).send({ error: 'No se pudo determinar el liceo', code: 'INSTITUTE_REQUIRED' });
    }
    const hoy = todayInTimezone(await instituteTimezone(prisma));
    try {
        const data = await constanciaDelAlumno(prisma, instituteId, id, tipo, hoy);
        return reply.status(200).send({ success: true, data });
    } catch (error: any) {
        // El manejador general cambia el código de un 409 por CONFLICT; la
        // pantalla necesita saber que es «no está inscrito» para decirlo.
        if (error?.code === 'NO_INSCRITO') {
            return reply.status(409).send({ error: error.message, code: 'NO_INSCRITO' });
        }
        throw error;
    }
}
