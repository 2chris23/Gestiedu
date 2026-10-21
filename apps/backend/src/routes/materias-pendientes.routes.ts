import { FastifyInstance } from 'fastify';
import { authenticate, requireAdmin, requireTeacher } from '../middleware/auth.middleware';
import {
    listar,
    delAlumno,
    acta,
    ponerMomento,
    borrarMomento,
    cambiarProfesor,
    ponerLaOpcion,
    quitarLaOpcion,
    deLaClase,
    deLaSeccion,
    cambiarDeClase,
    verCronograma,
    guardarElCronograma,
    guardarElPlan,
    ponerLaNotaDelPlan,
    nuevoEncuentro,
    cambiarEncuentro,
    quitarEncuentro,
    asistenciaDelEncuentro,
} from '../controllers/materias-pendientes.controller';

/**
 * LAS MATERIAS PENDIENTES (`/api/materias-pendientes`). Cada ruta lleva
 * `authenticate` además de su guardia de rol (los guardias se adelantan).
 */
const id = { type: 'string', minLength: 1, maxLength: 64 } as const;
const fecha = { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' } as const;
const momentoYOpcion = {
    type: 'object',
    required: ['id', 'momento', 'opcion'],
    properties: { id, momento: { type: 'string', pattern: '^[1-9]$' }, opcion: { type: 'string', pattern: '^[12]$' } },
} as const;

export async function materiasPendientesRoutes(fastify: FastifyInstance) {
    fastify.get(
        '/',
        { schema: { querystring: { type: 'object', properties: { cicloId: id } } }, preHandler: [authenticate, requireTeacher] },
        listar as any
    );
    fastify.get('/alumno/:studentId', { schema: { params: { type: 'object', properties: { studentId: id } } }, preHandler: [authenticate] }, delAlumno as any);
    fastify.get(
        '/alumno/:studentId/acta',
        {
            schema: { params: { type: 'object', properties: { studentId: id } }, querystring: { type: 'object', properties: { cicloId: id } } },
            preHandler: [authenticate],
        },
        acta as any
    );
    fastify.put(
        '/:id/momentos/:momento',
        {
            preHandler: [authenticate, requireTeacher],
            schema: {
                params: { type: 'object', required: ['id', 'momento'], properties: { id, momento: { type: 'string', pattern: '^[1-9]$' } } },
                body: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['nota'],
                    properties: {
                        nota: { type: 'number', minimum: 0, maximum: 20 },
                        fecha: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
                        observaciones: { type: 'string', maxLength: 300 },
                    },
                },
            },
        },
        ponerMomento as any
    );
    fastify.delete(
        '/:id/momentos/:momento',
        {
            preHandler: [authenticate, requireTeacher],
            schema: { params: { type: 'object', required: ['id', 'momento'], properties: { id, momento: { type: 'string', pattern: '^[1-9]$' } } } },
        },
        borrarMomento as any
    );
    fastify.put(
        '/:id/profesor',
        {
            preHandler: [authenticate, requireAdmin],
            schema: {
                params: { type: 'object', properties: { id } },
                body: { type: 'object', additionalProperties: false, required: ['profesorId'], properties: { profesorId: { type: ['string', 'null'], maxLength: 64 } } },
            },
        },
        cambiarProfesor as any
    );

    // La 1ª y la 2ª opción de cada momento (el «112»).
    fastify.put(
        '/:id/momentos/:momento/opciones/:opcion',
        {
            preHandler: [authenticate, requireTeacher],
            schema: {
                params: momentoYOpcion,
                body: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['asistio'],
                    properties: {
                        nota: { type: ['number', 'null'], minimum: 0, maximum: 20 },
                        asistio: { type: 'boolean' },
                        justificada: { type: 'boolean' },
                        fecha,
                        observaciones: { type: 'string', maxLength: 300 },
                    },
                },
            },
        },
        ponerLaOpcion as any
    );
    fastify.delete('/:id/momentos/:momento/opciones/:opcion', { preHandler: [authenticate, requireTeacher], schema: { params: momentoYOpcion } }, quitarLaOpcion as any);

    // La clase donde se trabaja (la pestaña de la materia) y la sección del alumno (la del guía).
    fastify.get('/clase/:claseId', { schema: { params: { type: 'object', properties: { claseId: id } } }, preHandler: [authenticate, requireTeacher] }, deLaClase as any);
    fastify.get(
        '/seccion/:classroomId',
        { schema: { params: { type: 'object', properties: { classroomId: id } } }, preHandler: [authenticate, requireTeacher] },
        deLaSeccion as any
    );
    fastify.put(
        '/:id/clase',
        {
            preHandler: [authenticate, requireAdmin],
            schema: {
                params: { type: 'object', properties: { id } },
                body: { type: 'object', additionalProperties: false, required: ['claseId'], properties: { claseId: id } },
            },
        },
        cambiarDeClase as any
    );

    // El cronograma de los momentos de un año.
    fastify.get('/cronograma', { schema: { querystring: { type: 'object', properties: { cicloId: id } } }, preHandler: [authenticate, requireTeacher] }, verCronograma as any);
    fastify.put(
        '/cronograma',
        {
            preHandler: [authenticate, requireAdmin],
            schema: {
                querystring: { type: 'object', required: ['cicloId'], properties: { cicloId: id } },
                body: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['momentos'],
                    properties: {
                        momentos: {
                            type: 'array',
                            maxItems: 8,
                            items: {
                                type: 'object',
                                additionalProperties: false,
                                required: ['numero', 'desde1', 'hasta1'],
                                properties: {
                                    numero: { type: 'integer', minimum: 1, maximum: 8 },
                                    desde1: fecha,
                                    hasta1: fecha,
                                    desde2: { type: ['string', 'null'], maxLength: 10 },
                                    hasta2: { type: ['string', 'null'], maxLength: 10 },
                                },
                            },
                        },
                    },
                },
            },
        },
        guardarElCronograma as any
    );

    // El plan de la clase de pendientes, momento a momento, y sus notas.
    fastify.put(
        '/clase/:claseId/plan/:momento',
        {
            preHandler: [authenticate, requireTeacher],
            schema: {
                params: { type: 'object', required: ['claseId', 'momento'], properties: { claseId: id, momento: { type: 'string', pattern: '^[1-9]$' } } },
                body: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['evaluaciones'],
                    properties: {
                        confirmar: { type: 'boolean' },
                        evaluaciones: {
                            type: 'array',
                            maxItems: 10,
                            items: {
                                type: 'object',
                                additionalProperties: false,
                                required: ['nombre', 'peso'],
                                properties: {
                                    id,
                                    nombre: { type: 'string', maxLength: 120 },
                                    peso: { type: 'integer', minimum: 1, maximum: 100 },
                                    instrumento: { type: ['object', 'null'] },
                                    contenidos: { type: ['string', 'null'], maxLength: 2000 },
                                },
                            },
                        },
                    },
                },
            },
        },
        guardarElPlan as any
    );
    fastify.put(
        '/:id/plan/:evaluacionId/opciones/:opcion',
        {
            preHandler: [authenticate, requireTeacher],
            schema: {
                params: { type: 'object', required: ['id', 'evaluacionId', 'opcion'], properties: { id, evaluacionId: id, opcion: { type: 'string', pattern: '^[12]$' } } },
                body: {
                    type: 'object',
                    additionalProperties: false,
                    properties: { nota: { type: ['number', 'null'], minimum: 0, maximum: 20 }, marcas: { type: ['object', 'null'] } },
                },
            },
        },
        ponerLaNotaDelPlan as any
    );

    // Los encuentros (tutorías y evaluaciones) y su asistencia: el acta de presentación.
    const encuentro = {
        type: 'object',
        additionalProperties: false,
        required: ['momento', 'tipo', 'fecha'],
        properties: {
            momento: { type: 'integer', minimum: 1, maximum: 8 },
            tipo: { type: 'string', enum: ['TUTORIA', 'EVALUACION'] },
            opcion: { type: ['integer', 'null'], minimum: 1, maximum: 2 },
            fecha,
            hora: { type: ['string', 'null'], maxLength: 5 },
            aula: { type: ['string', 'null'], maxLength: 60 },
            tema: { type: ['string', 'null'], maxLength: 200 },
        },
    } as const;
    fastify.post(
        '/clase/:claseId/encuentros',
        { preHandler: [authenticate, requireTeacher], schema: { params: { type: 'object', properties: { claseId: id } }, body: encuentro } },
        nuevoEncuentro as any
    );
    fastify.put('/encuentros/:id', { preHandler: [authenticate, requireTeacher], schema: { params: { type: 'object', properties: { id } }, body: encuentro } }, cambiarEncuentro as any);
    fastify.delete('/encuentros/:id', { preHandler: [authenticate, requireTeacher], schema: { params: { type: 'object', properties: { id } } } }, quitarEncuentro as any);
    fastify.put(
        '/encuentros/:id/asistencia',
        {
            preHandler: [authenticate, requireTeacher],
            schema: {
                params: { type: 'object', properties: { id } },
                body: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['asistencias'],
                    properties: {
                        asistencias: {
                            type: 'array',
                            maxItems: 200,
                            items: {
                                type: 'object',
                                additionalProperties: false,
                                required: ['materiaPendienteId', 'estado'],
                                properties: { materiaPendienteId: id, estado: { type: 'string', enum: ['PRESENTE', 'AUSENTE', 'JUSTIFICADO'] } },
                            },
                        },
                    },
                },
            },
        },
        asistenciaDelEncuentro as any
    );
}
