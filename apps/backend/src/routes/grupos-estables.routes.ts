import { FastifyInstance } from 'fastify';
import { authenticate, requireAdmin, requireStudent, requireTeacher } from '../middleware/auth.middleware';
import {
    asignar,
    borrarGrupo,
    cambiarGrupo,
    decidir,
    nuevoGrupo,
    pedir,
    retirar,
    verElGrupo,
    verGruposDeLaMateria,
    verLosMios,
    verMisGrupos,
    verSinGrupo,
} from '../controllers/grupos-estables.controller';

/**
 * LOS GRUPOS ESTABLES (`/api/grupos-estables`).
 *
 * Cada ruta lleva `authenticate` y su guardia en el `preHandler` (los
 * guardias se adelantan a `onRequest`: sin `authenticate`, responderían 401
 * hasta al admin). Que el grupo sea TUYO lo decide el servicio.
 */
const id = { type: 'string', minLength: 1, maxLength: 64 } as const;
const conGrupo = { type: 'object', required: ['grupoId'], properties: { grupoId: id } } as const;
const conMateria = { type: 'object', required: ['subjectId'], properties: { subjectId: id } } as const;
const conAno = { type: 'object', required: ['academicYearId'], properties: { academicYearId: id } } as const;
const conSolicitud = { type: 'object', required: ['solicitudId'], properties: { solicitudId: id } } as const;

const datosDelGrupo = {
    nombre: { type: 'string', minLength: 1, maxLength: 80 },
    descripcion: { type: ['string', 'null'], maxLength: 500 },
    area: { type: ['string', 'null'], maxLength: 40 },
    profesorId: { type: ['string', 'null'], maxLength: 64 },
    cupo: { type: 'integer', minimum: 1, maximum: 500 },
    turno: { type: ['string', 'null'], maxLength: 20 },
    activo: { type: 'boolean' },
} as const;

export async function gruposEstablesRoutes(fastify: FastifyInstance) {
    const admin = [authenticate, requireAdmin];
    const alumno = [authenticate, requireStudent];
    const personal = [authenticate, requireTeacher];

    // El alumno
    fastify.get('/para-mi', { preHandler: alumno }, verLosMios as any);
    fastify.post('/:grupoId/solicitudes', { schema: { params: conGrupo }, preHandler: alumno }, pedir as any);
    fastify.post('/solicitudes/:solicitudId/retirar', { schema: { params: conSolicitud }, preHandler: alumno }, retirar as any);

    // El profesor del grupo (y el admin)
    fastify.get('/mios', { preHandler: personal }, verMisGrupos as any);
    fastify.get('/:grupoId', { schema: { params: conGrupo }, preHandler: personal }, verElGrupo as any);
    fastify.post(
        '/solicitudes/:solicitudId/decidir',
        {
            schema: {
                params: conSolicitud,
                body: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['decision'],
                    properties: { decision: { type: 'string', enum: ['ACEPTAR', 'RECHAZAR'] }, motivo: { type: ['string', 'null'], maxLength: 300 } },
                },
            },
            preHandler: personal,
        },
        decidir as any
    );

    // El admin
    fastify.get('/materia/:subjectId', { schema: { params: conMateria, querystring: conAno }, preHandler: admin }, verGruposDeLaMateria as any);
    fastify.get('/materia/:subjectId/sin-grupo', { schema: { params: conMateria, querystring: conAno }, preHandler: admin }, verSinGrupo as any);
    fastify.post(
        '/materia/:subjectId',
        {
            schema: {
                params: conMateria,
                querystring: conAno,
                body: { type: 'object', additionalProperties: false, required: ['nombre', 'cupo'], properties: datosDelGrupo },
            },
            preHandler: admin,
        },
        nuevoGrupo as any
    );
    fastify.put(
        '/:grupoId',
        { schema: { params: conGrupo, body: { type: 'object', additionalProperties: false, properties: datosDelGrupo } }, preHandler: admin },
        cambiarGrupo as any
    );
    fastify.delete('/:grupoId', { schema: { params: conGrupo }, preHandler: admin }, borrarGrupo as any);
    fastify.post(
        '/:grupoId/asignar',
        {
            schema: { params: conGrupo, body: { type: 'object', additionalProperties: false, required: ['studentId'], properties: { studentId: id } } },
            preHandler: admin,
        },
        asignar as any
    );
}
