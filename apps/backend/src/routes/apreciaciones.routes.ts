import { FastifyInstance } from 'fastify';
import { authenticate, requireTeacher } from '../middleware/auth.middleware';
import { ponerApreciaciones, verApreciaciones } from '../controllers/apreciaciones.controller';

/**
 * LAS APRECIACIONES (`/api/apreciaciones`): las materias que se evalúan sin
 * nota. El alumno y su representante las ven en la boleta, no aquí.
 */
const id = { type: 'string', minLength: 1, maxLength: 64 } as const;
const params = {
    type: 'object',
    required: ['classroomId', 'subjectId'],
    properties: { classroomId: id, subjectId: id },
} as const;

export async function apreciacionesRoutes(fastify: FastifyInstance) {
    fastify.get(
        '/:classroomId/:subjectId',
        { schema: { params }, preHandler: [authenticate, requireTeacher] },
        verApreciaciones as any
    );
    fastify.put(
        '/:classroomId/:subjectId',
        {
            schema: {
                params,
                body: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['momento', 'items'],
                    properties: {
                        momento: id,
                        items: {
                            type: 'array',
                            minItems: 1,
                            maxItems: 200,
                            items: {
                                type: 'object',
                                additionalProperties: false,
                                required: ['studentId', 'valor'],
                                properties: {
                                    studentId: id,
                                    valor: { type: 'string', maxLength: 40 },
                                    observacion: { type: ['string', 'null'], maxLength: 300 },
                                },
                            },
                        },
                    },
                },
            },
            preHandler: [authenticate, requireTeacher],
        },
        ponerApreciaciones as any
    );
}
