import { FastifyInstance } from 'fastify';
import { authenticate, requireAdmin } from '../middleware/auth.middleware';
import { retiro, hojaDeNotas, archivo, revisar, importarAlumno, verNotasTraidas, quitarTraida } from '../controllers/traslado.controller';

/**
 * EL TRASLADO Y EL RETIRO (`/api/...`), todo del admin:
 *   POST   /students/:id/retiro                 retirarlo (fecha y motivo)
 *   GET    /students/:id/notas-parciales        la hoja para imprimir
 *   GET    /students/:id/traslado               el archivo firmado (.gestiedu)
 *   POST   /traslados/revisar                   ver un archivo antes de importarlo
 *   POST   /traslados/importar                  crear al alumno que llega
 *   GET    /students/:id/notas-traidas          los lapsos traídos de otro liceo
 *   DELETE /students/:id/notas-traidas/:notaId  quitar uno
 */
const id = { type: 'string', minLength: 1, maxLength: 64 } as const;
const soloAdmin = [authenticate, requireAdmin];
const archivoDeTraslado = {
    type: 'object',
    required: ['formato', 'datos', 'firma'],
    properties: { formato: { type: 'string' }, datos: { type: 'object' }, firma: { type: 'string', maxLength: 200 } },
} as const;

export async function trasladoRoutes(fastify: FastifyInstance) {
    fastify.post(
        '/students/:id/retiro',
        {
            preHandler: soloAdmin,
            schema: {
                params: { type: 'object', properties: { id } },
                body: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['fecha', 'motivo'],
                    properties: {
                        fecha: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
                        motivo: { type: 'string', enum: ['TRASLADO', 'OTRO'] },
                        detalle: { type: 'string', maxLength: 160 },
                    },
                },
            },
        },
        retiro as any
    );
    fastify.get('/students/:id/notas-parciales', { schema: { params: { type: 'object', properties: { id } } }, preHandler: soloAdmin }, hojaDeNotas as any);
    fastify.get('/students/:id/traslado', { schema: { params: { type: 'object', properties: { id } } }, preHandler: soloAdmin }, archivo as any);
    fastify.post(
        '/traslados/revisar',
        {
            preHandler: soloAdmin,
            bodyLimit: 1024 * 1024,
            schema: { body: { type: 'object', required: ['archivo'], properties: { archivo: archivoDeTraslado, classroomId: { type: 'string', maxLength: 64 } } } },
        },
        revisar as any
    );
    fastify.post(
        '/traslados/importar',
        {
            preHandler: soloAdmin,
            bodyLimit: 1024 * 1024,
            schema: {
                body: {
                    type: 'object',
                    required: ['archivo', 'classroomId', 'password'],
                    properties: {
                        archivo: archivoDeTraslado,
                        classroomId: { type: 'string', maxLength: 64 },
                        password: { type: 'string', maxLength: 128 },
                        email: { type: 'string', maxLength: 160 },
                        emparejamiento: { type: 'object' },
                    },
                },
            },
        },
        importarAlumno as any
    );
    fastify.get('/students/:id/notas-traidas', { schema: { params: { type: 'object', properties: { id } } }, preHandler: soloAdmin }, verNotasTraidas as any);
    fastify.delete(
        '/students/:id/notas-traidas/:notaId',
        { schema: { params: { type: 'object', properties: { id, notaId: id } } }, preHandler: soloAdmin },
        quitarTraida as any
    );
}
