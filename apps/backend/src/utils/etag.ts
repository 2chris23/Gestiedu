import { createHash } from 'crypto';
import { FastifyRequest, FastifyReply } from 'fastify';

/**
 * Genera un ETag a partir de cualquier carga util.
 */
export function generateETag(payload: unknown): string {
    const json = typeof payload === 'string' ? payload : JSON.stringify(payload);
    return `"${createHash('sha1').update(json).digest('hex')}"`;
}

/**
 * Responde con 304 Not Modified si el ETag coincide con la cabecera If-None-Match,
 * o envia la respuesta con la cabecera ETag correspondiente para validacion condicional.
 */
export function sendWithETag(
    request: FastifyRequest,
    reply: FastifyReply,
    payload: unknown,
    cacheControl = 'private, must-revalidate, max-age=0'
): FastifyReply {
    const etag = generateETag(payload);
    const clientEtag = request.headers['if-none-match'];

    if (clientEtag && (clientEtag === etag || clientEtag === `W/${etag}`)) {
        return reply.status(304).header('ETag', etag).send();
    }

    return reply
        .header('ETag', etag)
        .header('Cache-Control', cacheControl)
        .send(payload);
}
