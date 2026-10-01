import { FastifyReply, FastifyRequest } from 'fastify';
import {
    misAvisos,
    marcarLeido,
    suscribir,
    desuscribir,
    preferenciasDeAvisos,
    ponerPreferenciasDeAvisos,
} from '../services/avisos.service';
import { responderErrorClaro } from '../utils/error-claro';

/**
 * LOS AVISOS DE CADA PERSONA (`services/avisos.service.ts`). Todo es de quien
 * llama: sus avisos, sus teléfonos, sus preferencias. Nadie ve ni marca los de
 * otro.
 */

const yoDe = (request: FastifyRequest): string => String((request.user as any)?.userId ?? (request.user as any)?.id ?? '');

type Peticion = FastifyRequest & { params: any; body: any };
const responder = (fn: (request: Peticion) => Promise<unknown>) => async (request: FastifyRequest, reply: FastifyReply) => {
    try {
        return reply.send({ success: true, data: await fn(request as Peticion) });
    } catch (e) {
        return responderErrorClaro(reply, e);
    }
};

export const verMisAvisos = responder((r) => misAvisos(r.tenantPrisma, yoDe(r)));
export const leerUno = responder((r) => marcarLeido(r.tenantPrisma, yoDe(r), r.params.id));
export const leerTodos = responder((r) => marcarLeido(r.tenantPrisma, yoDe(r)));
export const apuntarTelefono = responder((r) => suscribir(r.tenantPrisma, yoDe(r), r.body));
export const quitarTelefono = responder((r) => desuscribir(r.tenantPrisma, yoDe(r), r.body.destino));
export const verPreferencias = responder((r) => preferenciasDeAvisos(r.tenantPrisma, yoDe(r)));
export const ponerPreferencias = responder((r) => ponerPreferenciasDeAvisos(r.tenantPrisma, yoDe(r), r.body.alTelefono));
