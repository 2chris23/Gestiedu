import { FastifyInstance } from 'fastify';
import { authenticate, requireTeacher } from '../middleware/auth.middleware';
import { verRevisionDeLaMateria, ponerRevisionDeLaMateria } from '../controllers/fin-de-ano.controller';

/**
 * LA REVISIÓN, DESDE LA MATERIA (`/api/revision/:classroomId/:subjectId`).
 * La pone el profesor que da esa materia en esa sección; el admin corrige;
 * el guía solo mira (`assertClassroomScope`, en el controlador).
 */
const id = { type: 'string', minLength: 1, maxLength: 64 } as const;
const params = {
    type: 'object',
    required: ['classroomId', 'subjectId'],
    properties: { classroomId: id, subjectId: id },
} as const;

export async function revisionRoutes(fastify: FastifyInstance) {
    fastify.get('/:classroomId/:subjectId', { schema: { params }, preHandler: [authenticate, requireTeacher] }, verRevisionDeLaMateria as any);
    fastify.put(
        '/:classroomId/:subjectId',
        {
            schema: {
                params,
                body: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['studentId'],
                    properties: {
                        studentId: id,
                        score: { type: 'number', minimum: 0, maximum: 20 },
                        componentes: {
                            type: 'array',
                            maxItems: 6,
                            items: {
                                type: 'object',
                                additionalProperties: false,
                                required: ['nombre', 'nota'],
                                properties: { nombre: { type: 'string', maxLength: 40 }, nota: { type: 'number', minimum: 0, maximum: 20 } },
                            },
                        },
                        fecha: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
                        observaciones: { type: 'string', maxLength: 500 },
                    },
                },
            },
            preHandler: [authenticate, requireTeacher],
        },
        ponerRevisionDeLaMateria as any
    );
}
