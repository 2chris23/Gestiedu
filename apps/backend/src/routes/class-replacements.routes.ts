import { FastifyInstance } from 'fastify';
import { authenticate, requireAdmin } from '../middleware/auth.middleware';
import {
    createClassReplacement,
    deleteClassReplacement,
    listClassReplacements,
} from '../controllers/class-replacements.controller';

/** Reemplazo de una clase suspendida por otra materia. Poner y quitar: solo el admin. */
export async function classReplacementsRoutes(fastify: FastifyInstance) {
    fastify.get(
        '/',
        {
            schema: {
                querystring: {
                    type: 'object',
                    properties: {
                        classroomId: { type: 'string', maxLength: 64 },
                        teacherId: { type: 'string', maxLength: 64 },
                        from: { type: 'string', maxLength: 10 },
                        to: { type: 'string', maxLength: 10 },
                    },
                },
            },
            // Sin `requireTeacher`: el alumno ve los reemplazos de SU sección
            // (es su horario). Quién puede ver qué se decide en el controlador.
            preHandler: [authenticate],
        },
        listClassReplacements as any
    );

    fastify.post(
        '/',
        {
            schema: {
                body: {
                    type: 'object',
                    required: ['classroomId', 'suspendedSubjectId', 'subjectId', 'date'],
                    additionalProperties: false,
                    properties: {
                        classroomId: { type: 'string', minLength: 1, maxLength: 64 },
                        suspendedSubjectId: { type: 'string', minLength: 1, maxLength: 64 },
                        subjectId: { type: 'string', minLength: 1, maxLength: 64 },
                        date: { type: 'string', minLength: 10, maxLength: 10 },
                        reason: { type: 'string', maxLength: 200 },
                    },
                },
            },
            preHandler: [authenticate, requireAdmin],
        },
        createClassReplacement as any
    );

    fastify.delete(
        '/:id',
        {
            schema: {
                params: { type: 'object', required: ['id'], properties: { id: { type: 'string', maxLength: 64 } } },
            },
            preHandler: [authenticate, requireAdmin],
        },
        deleteClassReplacement as any
    );
}
