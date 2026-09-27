import { FastifyInstance } from 'fastify';
import { authenticate, requireAdmin } from '../middleware/auth.middleware';
import { verMatricula } from '../controllers/matricula.controller';

/** LA ESTADÍSTICA DE MATRÍCULA (`/api/academic-years/:id/matricula?desde&hasta`), del admin. */
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
}
