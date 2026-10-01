import { FastifyReply, FastifyRequest } from 'fastify';
import { certificacionDelAlumno, cargarAnoExterno, calificacionesExternas, quitarAnoExterno } from '../services/certificacion.service';
import { todasLasPlantillas, guardarPlantilla, esTipoDePlantilla, PLANTILLAS_POR_DEFECTO } from '../services/plantillas-de-documentos.service';
import { recaudosDelLiceo, guardarRecaudos, recaudosDelAlumno, marcarRecaudo, loQueLeFalta, planillaDeInscripcion, avanceDeLaInscripcion } from '../services/inscripcion.service';
import { instituteTimezone, todayInTimezone } from '../utils/school-time';
import { responderErrorClaro } from '../utils/error-claro';

/**
 * LOS DOCUMENTOS OFICIALES DEL LICEO (todo del admin; lo protege la ruta):
 * la certificación de calificaciones, las notas de años cursados en otro
 * plantel y las plantillas de las constancias.
 */

const instituteIdDe = (request: FastifyRequest): string =>
    String((request.user as any)?.instituteId ?? (request as any).institute?.id ?? '');
const actorDe = (request: FastifyRequest): string => String((request.user as any)?.userId ?? (request.user as any)?.id ?? '');

type ConAlumno = FastifyRequest<{ Params: { id: string } }>;

export async function verCertificacion(request: ConAlumno, reply: FastifyReply) {
    try {
        const hoy = todayInTimezone(await instituteTimezone(request.tenantPrisma));
        return reply.send({ success: true, data: await certificacionDelAlumno(request.tenantPrisma, instituteIdDe(request), request.params.id, hoy) });
    } catch (e) {
        return responderErrorClaro(reply, e);
    }
}

export async function verExternas(request: ConAlumno, reply: FastifyReply) {
    try {
        return reply.send({ success: true, data: await calificacionesExternas(request.tenantPrisma, request.params.id) });
    } catch (e) {
        return responderErrorClaro(reply, e);
    }
}

export async function cargarExterno(request: FastifyRequest<{ Params: { id: string }; Body: any }>, reply: FastifyReply) {
    try {
        const hecho = await cargarAnoExterno(request.tenantPrisma, instituteIdDe(request), request.params.id, request.body as any, actorDe(request));
        return reply.status(201).send({ success: true, data: hecho });
    } catch (e) {
        return responderErrorClaro(reply, e);
    }
}

export async function quitarExterno(request: FastifyRequest<{ Params: { id: string; grado: string } }>, reply: FastifyReply) {
    try {
        return reply.send({ success: true, data: await quitarAnoExterno(request.tenantPrisma, request.params.id, Number(request.params.grado), actorDe(request)) });
    } catch (e) {
        return responderErrorClaro(reply, e);
    }
}

export async function verPlantillas(request: FastifyRequest, reply: FastifyReply) {
    try {
        return reply.send({ success: true, data: await todasLasPlantillas(instituteIdDe(request)) });
    } catch (e) {
        return responderErrorClaro(reply, e);
    }
}

export async function ponerPlantilla(request: FastifyRequest<{ Params: { tipo: string }; Body: { titulo: string; texto: string } }>, reply: FastifyReply) {
    const { tipo } = request.params;
    if (!esTipoDePlantilla(tipo)) {
        return reply.status(400).send({ error: `Tipo desconocido: ${Object.keys(PLANTILLAS_POR_DEFECTO).join(', ')}`, code: 'TIPO_INVALIDO' });
    }
    try {
        return reply.send({ success: true, data: await guardarPlantilla(instituteIdDe(request), tipo, request.body) });
    } catch (e) {
        return responderErrorClaro(reply, e);
    }
}

export async function volverALaDeSiempre(request: FastifyRequest<{ Params: { tipo: string } }>, reply: FastifyReply) {
    const { tipo } = request.params;
    if (!esTipoDePlantilla(tipo)) return reply.status(400).send({ error: 'Tipo desconocido', code: 'TIPO_INVALIDO' });
    try {
        return reply.send({ success: true, data: await guardarPlantilla(instituteIdDe(request), tipo, null) });
    } catch (e) {
        return responderErrorClaro(reply, e);
    }
}

// ─── La inscripción: los recaudos y la planilla (`services/inscripcion.service.ts`) ───

export async function verRecaudosDelLiceo(request: FastifyRequest, reply: FastifyReply) {
    try {
        return reply.send({ success: true, data: await recaudosDelLiceo(instituteIdDe(request)) });
    } catch (e) {
        return responderErrorClaro(reply, e);
    }
}

export async function ponerRecaudosDelLiceo(request: FastifyRequest<{ Body: { recaudos: Array<{ clave?: string; nombre: string }> } }>, reply: FastifyReply) {
    try {
        return reply.send({ success: true, data: await guardarRecaudos(instituteIdDe(request), request.body.recaudos) });
    } catch (e) {
        return responderErrorClaro(reply, e);
    }
}

export async function recaudosDeSiempre(request: FastifyRequest, reply: FastifyReply) {
    try {
        return reply.send({ success: true, data: await guardarRecaudos(instituteIdDe(request), null) });
    } catch (e) {
        return responderErrorClaro(reply, e);
    }
}

export async function verRecaudosDelAlumno(request: ConAlumno, reply: FastifyReply) {
    try {
        const instituteId = instituteIdDe(request);
        const [recaudos, falta] = await Promise.all([
            recaudosDelAlumno(request.tenantPrisma, instituteId, request.params.id),
            loQueLeFalta(request.tenantPrisma, instituteId, request.params.id),
        ]);
        return reply.send({ success: true, data: { ...recaudos, falta, avance: avanceDeLaInscripcion(recaudos, falta) } });
    } catch (e) {
        return responderErrorClaro(reply, e);
    }
}

export async function marcarRecaudoDelAlumno(
    request: FastifyRequest<{ Params: { id: string; clave: string }; Body: { entregado: boolean } }>,
    reply: FastifyReply
) {
    try {
        const instituteId = instituteIdDe(request);
        const hecho = await marcarRecaudo(request.tenantPrisma, instituteId, actorDe(request), request.params.id, request.params.clave, request.body.entregado);
        const falta = await loQueLeFalta(request.tenantPrisma, instituteId, request.params.id);
        return reply.send({ success: true, data: { ...hecho, falta, avance: avanceDeLaInscripcion(hecho, falta) } });
    } catch (e) {
        return responderErrorClaro(reply, e);
    }
}

export async function verPlanillaDeInscripcion(request: ConAlumno, reply: FastifyReply) {
    try {
        const hoy = todayInTimezone(await instituteTimezone(request.tenantPrisma));
        return reply.send({ success: true, data: await planillaDeInscripcion(request.tenantPrisma, instituteIdDe(request), request.params.id, hoy) });
    } catch (e) {
        return responderErrorClaro(reply, e);
    }
}
