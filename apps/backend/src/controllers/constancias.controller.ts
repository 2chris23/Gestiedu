import { FastifyReply, FastifyRequest } from 'fastify';
import { constanciaDelAlumno, esTipoDeConstancia, puedeSacarLaConstancia, TIPOS_DE_CONSTANCIA } from '../services/constancias.service';
import { extrasDeLaborSocial } from '../services/labor-social.service';
import { instituteTimezone, todayInTimezone } from '../utils/school-time';
import { responderErrorClaro } from '../utils/error-claro';

/**
 * GET /api/students/:id/constancia?tipo=ESTUDIO|BUENA_CONDUCTA|PROSECUCION|RETIRO|INSCRIPCION|LABOR_SOCIAL
 *
 * Los datos de la constancia del alumno, con el texto ya relleno con la
 * plantilla del liceo. Quién puede, lo decide `puedeSacarLaConstancia`. Solo
 * lectura. Ver `services/constancias.service.ts`.
 */
export async function obtenerConstancia(
    request: FastifyRequest<{ Params: { id: string }; Querystring: { tipo?: string } }>,
    reply: FastifyReply
) {
    const prisma = request.tenantPrisma;
    const { id } = request.params;
    const tipo = request.query?.tipo ?? 'ESTUDIO';
    if (!esTipoDeConstancia(tipo)) {
        return reply.status(400).send({ error: `Tipo de constancia desconocido: ${TIPOS_DE_CONSTANCIA.join(', ')}`, code: 'TIPO_INVALIDO' });
    }
    if (!(await puedeSacarLaConstancia(prisma, request.user as any, id, tipo))) {
        return reply.status(403).send({
            error: tipo === 'ESTUDIO' || tipo === 'INSCRIPCION' ? 'Solo puedes sacar la constancia de tus estudiantes' : 'Esta constancia la emite el liceo',
            code: 'FORBIDDEN',
        });
    }
    const instituteId = (request.user as any)?.instituteId ?? (request as any).institute?.id;
    if (!instituteId) {
        return reply.status(400).send({ error: 'No se pudo determinar el liceo', code: 'INSTITUTE_REQUIRED' });
    }
    const hoy = todayInTimezone(await instituteTimezone(prisma));
    try {
        const extras = tipo === 'LABOR_SOCIAL' ? await extrasDeLaborSocial(prisma, instituteId, id) : {};
        const data = await constanciaDelAlumno(prisma, instituteId, id, tipo, hoy, extras);
        return reply.status(200).send({ success: true, data });
    } catch (error) {
        // NO_INSCRITO, SIN_PROSECUCION, NO_RETIRADO… con su mensaje: la
        // pantalla dice por qué no sale.
        return responderErrorClaro(reply, error);
    }
}
