import { FastifyReply, FastifyRequest } from 'fastify';
import { certificacionDelAlumno, cargarAnoExterno, calificacionesExternas, quitarAnoExterno } from '../services/certificacion.service';
import { todasLasPlantillas, guardarPlantilla, esTipoDePlantilla, PLANTILLAS_POR_DEFECTO } from '../services/plantillas-de-documentos.service';
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
