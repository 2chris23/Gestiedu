import { FastifyInstance } from 'fastify';
import { UserRole } from '@prisma/client';
import { authenticate, requireAdmin, requireRoles, requireTeacher } from '../middleware/auth.middleware';
import {
    abrir,
    aprobar,
    cerrar,
    desbloquearAparato,
    escanear,
    escanearAlumno,
    faro,
    guardarConfiguracion,
    miQr,
    quitar,
    ver,
    verAparato,
    verConfiguracion,
} from '../controllers/asistencia-qr.controller';

/**
 * ASISTENCIA POR QR (`/api/asistencia-qr`). Quién puede qué: ver el
 * controlador. Cada ruta lleva `authenticate` además de su guardia de rol: los
 * guardias se adelantan y sin él responderían 401 hasta al admin.
 */

const id = { type: 'string', minLength: 1, maxLength: 64 } as const;
const ubicacion = {
    type: ['object', 'null'],
    additionalProperties: false,
    properties: {
        lat: { type: 'number' },
        lng: { type: 'number' },
        precision: { type: 'number' },
        falsa: { type: 'boolean' },
    },
} as const;

export async function asistenciaQrRoutes(fastify: FastifyInstance) {
    const soloAlumno = requireRoles(UserRole.STUDENT);

    fastify.get('/configuracion', { preHandler: [authenticate] }, verConfiguracion as any);
    fastify.put(
        '/configuracion',
        {
            schema: {
                body: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                        activa: { type: 'boolean' },
                        radioMetros: { type: 'integer', minimum: 10, maximum: 5000 },
                        fueraDelRadio: { type: 'string', enum: ['confirmar', 'bloquear'] },
                        unTelefonoPorAlumno: { type: 'boolean' },
                        minutosATiempo: { type: 'integer', minimum: 0, maximum: 120 },
                        diasParaCorregir: { type: 'integer', minimum: 0, maximum: 365 },
                    },
                },
            },
            preHandler: [authenticate, requireAdmin],
        },
        guardarConfiguracion as any
    );

    // El profesor
    fastify.post(
        '/pases',
        {
            schema: {
                body: {
                    type: 'object',
                    required: ['classroomId', 'subjectId'],
                    additionalProperties: false,
                    properties: {
                        classroomId: id,
                        subjectId: id,
                        fecha: { type: 'string', minLength: 10, maxLength: 10 },
                        ubicacion,
                    },
                },
            },
            preHandler: [authenticate, requireTeacher],
        },
        abrir as any
    );
    fastify.get(
        '/pases/:id',
        { schema: { params: { type: 'object', required: ['id'], properties: { id } } }, preHandler: [authenticate, requireTeacher] },
        ver as any
    );
    fastify.post(
        '/pases/:id/faro',
        {
            schema: {
                params: { type: 'object', required: ['id'], properties: { id } },
                body: { type: 'object', required: ['ubicacion'], additionalProperties: false, properties: { ubicacion } },
            },
            preHandler: [authenticate, requireTeacher],
        },
        faro as any
    );
    fastify.post(
        '/pases/:id/registros/:registroId/aprobar',
        {
            schema: { params: { type: 'object', required: ['id', 'registroId'], properties: { id, registroId: id } } },
            preHandler: [authenticate, requireTeacher],
        },
        aprobar as any
    );
    fastify.post(
        '/pases/:id/registros/:registroId/quitar',
        {
            schema: { params: { type: 'object', required: ['id', 'registroId'], properties: { id, registroId: id } } },
            preHandler: [authenticate, requireTeacher],
        },
        quitar as any
    );
    fastify.post(
        '/pases/:id/cerrar',
        {
            schema: {
                params: { type: 'object', required: ['id'], properties: { id } },
                body: {
                    type: ['object', 'null'],
                    additionalProperties: false,
                    properties: { presentesAMano: { type: 'array', maxItems: 200, items: id } },
                },
            },
            preHandler: [authenticate, requireTeacher],
        },
        cerrar as any
    );
    fastify.post(
        '/pases/:id/escanear-alumno',
        {
            schema: {
                params: { type: 'object', required: ['id'], properties: { id } },
                body: {
                    type: 'object',
                    required: ['codigo'],
                    additionalProperties: false,
                    properties: { codigo: { type: 'string', minLength: 10, maxLength: 300 } },
                },
            },
            preHandler: [authenticate, requireTeacher],
        },
        escanearAlumno as any
    );

    // El alumno
    fastify.post(
        '/escanear',
        {
            schema: {
                body: {
                    type: 'object',
                    required: ['codigo'],
                    additionalProperties: false,
                    properties: {
                        codigo: { type: 'string', minLength: 10, maxLength: 300 },
                        aparato: {
                            type: ['object', 'null'],
                            additionalProperties: false,
                            properties: {
                                id: { type: 'string', maxLength: 200 },
                                descripcion: { type: 'string', maxLength: 200 },
                            },
                        },
                        ubicacion,
                    },
                },
            },
            preHandler: [authenticate, soloAlumno],
        },
        escanear as any
    );
    fastify.get('/mi-codigo', { preHandler: [authenticate, soloAlumno] }, miQr as any);

    // El teléfono de cada alumno: solo el admin
    fastify.get(
        '/aparato/:studentId',
        { schema: { params: { type: 'object', required: ['studentId'], properties: { studentId: id } } }, preHandler: [authenticate, requireAdmin] },
        verAparato as any
    );
    fastify.delete(
        '/aparato/:studentId',
        { schema: { params: { type: 'object', required: ['studentId'], properties: { studentId: id } } }, preHandler: [authenticate, requireAdmin] },
        desbloquearAparato as any
    );
}

export default asistenciaQrRoutes;
