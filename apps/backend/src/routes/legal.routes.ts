import { randomUUID } from 'crypto';
import { FastifyInstance, FastifyReply } from 'fastify';
import { authenticate } from '../middleware/auth.middleware';

/**
 * ACEPTAR LOS TÉRMINOS Y LA PRIVACIDAD (19-oct-2026)
 *
 * La primera vez que alguien entra (y cada vez que cambia la versión de lo que
 * se acepta), la app le enseña los términos y la política de privacidad y le
 * pide aceptarlos. Aquí queda la prueba: quién, qué versión, cuándo, desde qué
 * dirección y aparato (`aceptaciones_legales`). Los textos viven en la web
 * (`apps/web/src/lib/legal/documentos.ts`); la versión, copiada aquí: al
 * cambiar una, se cambia la otra (LEGAL-01 lo vigila).
 *
 *   GET  /api/legal/mi-aceptacion    { version, aceptada, aceptadaEn }
 *   POST /api/legal/aceptar          { version }  (la vigente; si no, 400)
 */

export const VERSION_LEGAL = '2026-10-19';

const yo = (r: any): string => r.user?.userId ?? r.user?.id;
const AHORA_UTC = "timezone('UTC', now())";

export async function legalRoutes(fastify: FastifyInstance) {
    fastify.get('/legal/mi-aceptacion', { preHandler: [authenticate] }, async (request: any, reply: FastifyReply) => {
        const [f]: any[] = await request.tenantPrisma.$queryRawUnsafe(
            `SELECT "aceptadaEn" FROM "aceptaciones_legales" WHERE "usuarioId" = $1 AND "version" = $2`,
            yo(request),
            VERSION_LEGAL
        );
        return reply.send({ success: true, data: { version: VERSION_LEGAL, aceptada: !!f, aceptadaEn: f ? new Date(f.aceptadaEn).toISOString() : null } });
    });

    fastify.post(
        '/legal/aceptar',
        {
            preHandler: [authenticate],
            schema: { body: { type: 'object', required: ['version'], additionalProperties: false, properties: { version: { type: 'string', maxLength: 20 } } } },
        },
        async (request: any, reply: FastifyReply) => {
            if (request.body.version !== VERSION_LEGAL) {
                // Una pantalla vieja no acepta en nombre de un texto que ya cambió.
                return reply.status(400).send({ error: 'Esa versión de los términos ya no es la vigente: recarga y léelos otra vez', code: 'VERSION_VIEJA', version: VERSION_LEGAL });
            }
            await request.tenantPrisma.$executeRawUnsafe(
                `INSERT INTO "aceptaciones_legales" ("id", "usuarioId", "version", "aceptadaEn", "direccion", "aparato")
                 VALUES ($1, $2, $3, ${AHORA_UTC}, $4, $5) ON CONFLICT ("usuarioId", "version") DO NOTHING`,
                randomUUID(),
                yo(request),
                VERSION_LEGAL,
                String(request.ip ?? '').slice(0, 64) || null,
                String(request.headers['user-agent'] ?? '').slice(0, 200) || null
            );
            return reply.send({ success: true, data: { version: VERSION_LEGAL, aceptada: true } });
        }
    );
}
