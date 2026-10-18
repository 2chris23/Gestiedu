import { FastifyReply, FastifyRequest } from 'fastify';
import {
    asignarAlGrupo,
    crearGrupo,
    decidirSolicitud,
    editarGrupo,
    elGrupo,
    gruposDeLaMateria,
    misGrupos,
    paraElAlumno,
    pedirGrupo,
    quitarGrupo,
    retirarSolicitud,
    sinGrupo,
    type DatosDelGrupo,
    type Quien,
} from '../services/grupos-estables.service';
import { responderErrorClaro } from '../utils/error-claro';

/**
 * LOS GRUPOS ESTABLES (`/api/grupos-estables`, `services/grupos-estables.service.ts`).
 * El rol lo exige la ruta; si el grupo es tuyo, el servicio.
 */

const instituteIdDe = (request: FastifyRequest): string =>
    String((request.user as any)?.instituteId ?? (request as any).institute?.id ?? '');
const quienDe = (request: FastifyRequest): Quien => ({
    userId: String((request.user as any)?.userId ?? (request.user as any)?.id ?? ''),
    role: String((request.user as any)?.role ?? ''),
});
const ioDe = (request: FastifyRequest) => (request.server as any).io;

const responder = async (reply: FastifyReply, fn: () => Promise<unknown>) => {
    try {
        return reply.send({ success: true, data: await fn() });
    } catch (e) {
        return responderErrorClaro(reply, e);
    }
};

type ConGrupo = { Params: { grupoId: string } };
type ConMateria = { Params: { subjectId: string }; Querystring: { academicYearId: string } };
type ConSolicitud = { Params: { solicitudId: string } };

// El admin
export const verGruposDeLaMateria = (req: FastifyRequest<ConMateria>, reply: FastifyReply) =>
    responder(reply, () => gruposDeLaMateria(req.tenantPrisma, instituteIdDe(req), req.params.subjectId, req.query.academicYearId));

export const nuevoGrupo = (req: FastifyRequest<ConMateria & { Body: DatosDelGrupo }>, reply: FastifyReply) =>
    responder(reply, () => crearGrupo(req.tenantPrisma, req.params.subjectId, req.query.academicYearId, req.body));

export const cambiarGrupo = (req: FastifyRequest<ConGrupo & { Body: Partial<DatosDelGrupo> }>, reply: FastifyReply) =>
    responder(reply, () => editarGrupo(req.tenantPrisma, instituteIdDe(req), req.params.grupoId, req.body));

export const borrarGrupo = (req: FastifyRequest<ConGrupo>, reply: FastifyReply) =>
    responder(reply, () => quitarGrupo(req.tenantPrisma, req.params.grupoId, quienDe(req)));

export const verSinGrupo = (req: FastifyRequest<ConMateria>, reply: FastifyReply) =>
    responder(reply, () => sinGrupo(req.tenantPrisma, instituteIdDe(req), req.params.subjectId, req.query.academicYearId));

export const asignar = (req: FastifyRequest<ConGrupo & { Body: { studentId: string } }>, reply: FastifyReply) =>
    responder(reply, () => asignarAlGrupo(req.tenantPrisma, instituteIdDe(req), ioDe(req), quienDe(req), req.params.grupoId, req.body.studentId));

// El alumno (para sí mismo: el id sale del token, nunca de la petición)
export const verLosMios = (req: FastifyRequest, reply: FastifyReply) =>
    responder(reply, () => paraElAlumno(req.tenantPrisma, instituteIdDe(req), quienDe(req).userId));

export const pedir = (req: FastifyRequest<ConGrupo>, reply: FastifyReply) =>
    responder(reply, () => pedirGrupo(req.tenantPrisma, instituteIdDe(req), ioDe(req), quienDe(req).userId, req.params.grupoId));

export const retirar = (req: FastifyRequest<ConSolicitud>, reply: FastifyReply) =>
    responder(reply, () => retirarSolicitud(req.tenantPrisma, quienDe(req).userId, req.params.solicitudId));

// El profesor del grupo (o el admin)
export const verMisGrupos = (req: FastifyRequest, reply: FastifyReply) =>
    responder(reply, () => misGrupos(req.tenantPrisma, instituteIdDe(req), quienDe(req).userId));

export const verElGrupo = (req: FastifyRequest<ConGrupo>, reply: FastifyReply) =>
    responder(reply, () => elGrupo(req.tenantPrisma, instituteIdDe(req), quienDe(req), req.params.grupoId));

export const decidir = (
    req: FastifyRequest<ConSolicitud & { Body: { decision: 'ACEPTAR' | 'RECHAZAR'; motivo?: string | null } }>,
    reply: FastifyReply
) => responder(reply, () => decidirSolicitud(req.tenantPrisma, instituteIdDe(req), ioDe(req), quienDe(req), req.params.solicitudId, req.body.decision, req.body.motivo));
