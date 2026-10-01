import { FastifyInstance } from 'fastify';
import { authenticate, requireAdmin } from '../middleware/auth.middleware';
import { verMatricula, verGraduandos, ponerTitulo } from '../controllers/matricula.controller';

/**
 * DEL CICLO, PARA LA SECRETARÍA (`/api/academic-years/:id/...`), del admin:
 *   GET /matricula?desde&hasta                  la estadística de matrícula
 *   GET /graduandos                             los graduandos y su título
 *   PUT /graduandos/:studentId/titulo           anotar su título
 */
export async function matriculaRoutes(fastify: FastifyInstance) {
    const dia = { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' } as const;
    fastify.get(
        '/academic-years/:id/matricula',
        {
            preHandler: [authenticate, requireAdmin],
            schema: {
                params: { type: 'object', properties: { id: { type: 'string', minLength: 1, maxLength: 64 } } },
                querystring: { type: 'object', properties: { desde: dia, hasta: dia } },
            },
        },
        verMatricula as any
    );
    const id = { type: 'string', minLength: 1, maxLength: 64 } as const;
    fastify.get('/academic-years/:id/graduandos', { preHandler: [authenticate, requireAdmin], schema: { params: { type: 'object', properties: { id } } } }, verGraduandos as any);
    fastify.put(
        '/academic-years/:id/graduandos/:studentId/titulo',
        {
            preHandler: [authenticate, requireAdmin],
            schema: {
                params: { type: 'object', properties: { id, studentId: id } },
                body: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                        mencion: { type: 'string', maxLength: 120 },
                        serial: { type: 'string', maxLength: 30 },
                        fechaDeExpedicion: { type: 'string', maxLength: 10 },
                    },
                },
            },
        },
        ponerTitulo as any
    );
}
