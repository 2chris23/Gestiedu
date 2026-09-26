import { FastifyReply } from 'fastify';

/**
 * EL ERROR DE UNA REGLA SE DICE TAL CUAL
 *
 * El manejador global (`middleware/error.middleware.ts`) cambia todo 4xx por
 * uno genérico: «Solicitud inválida», código `BAD_REQUEST`. Para un error de
 * una regla del liceo («esa apreciación no existe», «el año ya se cerró») eso
 * borra justo lo que la pantalla necesita enseñar. Los servicios lo lanzan con
 * `createError(400, 'mensaje', 'CODIGO')`; aquí sale con su mensaje y su código.
 *
 *   try { ... } catch (e) { return responderErrorClaro(reply, e); }
 *
 * Lo que no es un 4xx con código sigue al manejador global, que no enseña
 * detalles del servidor.
 */
export function responderErrorClaro(reply: FastifyReply, error: any): FastifyReply {
    const status = error?.statusCode;
    if (typeof status === 'number' && status >= 400 && status < 500) {
        return reply.status(status).send({ error: error.message, code: error.code ?? undefined });
    }
    throw error;
}
