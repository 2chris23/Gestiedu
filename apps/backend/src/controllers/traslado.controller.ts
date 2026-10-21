import { FastifyReply, FastifyRequest } from 'fastify';
import { retirar, notasParciales, archivoDeTraslado, revisarArchivo, importar, notasTraidas, quitarNotaTraida } from '../services/traslado.service';
import { invalidateUserSession } from '../middleware/auth.middleware';
import { instituteTimezone, todayInTimezone } from '../utils/school-time';
import { responderErrorClaro } from '../utils/error-claro';
import { avisarSiFalla } from '../utils/sin-callar';

/**
 * EL TRASLADO Y EL RETIRO (`services/traslado.service.ts`). Todo del admin: lo
 * protege la ruta.
 */

const instituteIdDe = (request: FastifyRequest): string =>
    String((request.user as any)?.instituteId ?? (request as any).institute?.id ?? '');
const actorDe = (request: FastifyRequest): string => String((request.user as any)?.userId ?? (request.user as any)?.id ?? '');
const hoyDe = async (request: FastifyRequest) => todayInTimezone(await instituteTimezone(request.tenantPrisma));
type ConAlumno = FastifyRequest<{ Params: { id: string } }>;

export async function retiro(request: FastifyRequest<{ Params: { id: string }; Body: any }>, reply: FastifyReply) {
    try {
        const hecho = await retirar(request.tenantPrisma, actorDe(request), request.params.id, request.body as any, await hoyDe(request));
        // Retirado es retirado: su sesión abierta deja de servir en el acto.
        await invalidateUserSession(instituteIdDe(request), request.params.id).catch(avisarSiFalla('traslado.controller'));
        request.aQuienAfecta = { studentIds: [request.params.id] };
        return reply.send({ success: true, data: hecho });
    } catch (e) {
        return responderErrorClaro(reply, e);
    }
}

export async function hojaDeNotas(request: ConAlumno, reply: FastifyReply) {
    try {
        return reply.send({ success: true, data: await notasParciales(request.tenantPrisma, instituteIdDe(request), request.params.id, await hoyDe(request)) });
    } catch (e) {
        return responderErrorClaro(reply, e);
    }
}

export async function archivo(request: ConAlumno, reply: FastifyReply) {
    try {
        const a = await archivoDeTraslado(request.tenantPrisma, instituteIdDe(request), request.params.id, await hoyDe(request));
        const nombre = `traslado-${request.params.id.replace(/[^\w-]/g, '')}.gestiedu`;
        return reply
            .header('Content-Type', 'application/json; charset=utf-8')
            .header('Content-Disposition', `attachment; filename="${nombre}"`)
            .header('Cache-Control', 'no-store')
            .send(a);
    } catch (e) {
        return responderErrorClaro(reply, e);
    }
}

export async function revisar(request: FastifyRequest<{ Body: { archivo: any; classroomId?: string } }>, reply: FastifyReply) {
    try {
        return reply.send({ success: true, data: await revisarArchivo(request.tenantPrisma, request.body.archivo, request.body.classroomId) });
    } catch (e) {
        return responderErrorClaro(reply, e);
    }
}

export async function importarAlumno(request: FastifyRequest<{ Body: any }>, reply: FastifyReply) {
    try {
        const hecho = await importar(request.tenantPrisma, instituteIdDe(request), actorDe(request), request.body as any);
        request.aQuienAfecta = { studentIds: [hecho.alumno.cedula], classroomId: hecho.seccion.id };
        return reply.status(201).send({ success: true, data: hecho });
    } catch (e) {
        return responderErrorClaro(reply, e);
    }
}

export async function verNotasTraidas(request: ConAlumno, reply: FastifyReply) {
    try {
        return reply.send({ success: true, data: await notasTraidas(request.tenantPrisma, request.params.id) });
    } catch (e) {
        return responderErrorClaro(reply, e);
    }
}

export async function quitarTraida(request: FastifyRequest<{ Params: { id: string; notaId: string } }>, reply: FastifyReply) {
    try {
        return reply.send({ success: true, data: await quitarNotaTraida(request.tenantPrisma, actorDe(request), request.params.id, request.params.notaId) });
    } catch (e) {
        return responderErrorClaro(reply, e);
    }
}
