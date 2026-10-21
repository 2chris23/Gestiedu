import fs from 'fs';
import { FastifyInstance, FastifyReply } from 'fastify';
import { authenticate, requireAdmin } from '../middleware/auth.middleware';
import { responderErrorClaro } from '../utils/error-claro';
import { auditLog } from '../utils/audit';
import { pedir, elUltimo, elArchivo } from '../services/mis-datos.service';

/**
 * «DESCARGAR TODOS MIS DATOS» (19-oct-2026; `services/mis-datos.service.ts`)
 *
 *   POST /api/mis-datos { contrasena }   empieza a armarlo de fondo (202)
 *   GET  /api/mis-datos                  cómo va el último pedido
 *   GET  /api/mis-datos/:id/archivo      el ZIP (con contraseña), mientras no caduque
 *
 * Solo el admin. Pedir tiene cupo propio: armar es pesado.
 */

const admin = { preHandler: [authenticate, requireAdmin] };
const quienDe = (r: any) => r.user?.userId ?? r.user?.id;
const liceoDe = (r: any) => r.institute?.id ?? r.user?.instituteId ?? '';

export async function misDatosRoutes(fastify: FastifyInstance) {
    fastify.post(
        '/mis-datos',
        {
            ...admin,
            config: { rateLimit: { max: 5, timeWindow: '1 hour' } },
            schema: { body: { type: 'object', required: ['contrasena'], additionalProperties: false, properties: { contrasena: { type: 'string', maxLength: 128 } } } },
        },
        async (request: any, reply: FastifyReply) => {
            try {
                const r = await pedir(request.tenantPrisma, liceoDe(request), quienDe(request), request.body.contrasena);
                await auditLog({ userId: quienDe(request), action: 'read', resource: 'mis-datos', details: 'Pidió descargar todos los datos del liceo' }, request.tenantPrisma).catch(() => undefined);
                return reply.status(202).send({ success: true, data: r });
            } catch (e) {
                return responderErrorClaro(reply, e);
            }
        }
    );

    fastify.get('/mis-datos', admin, async (request: any, reply: FastifyReply) => {
        return reply.send({ success: true, data: await elUltimo(request.tenantPrisma) });
    });

    fastify.get(
        '/mis-datos/:id/archivo',
        { ...admin, schema: { params: { type: 'object', required: ['id'], properties: { id: { type: 'string', maxLength: 64 } } } } },
        async (request: any, reply: FastifyReply) => {
            try {
                const { ruta, bytes } = await elArchivo(request.tenantPrisma, request.params.id);
                await auditLog({ userId: quienDe(request), action: 'read', resource: 'mis-datos', details: 'Bajó todos los datos del liceo' }, request.tenantPrisma).catch(() => undefined);
                const fecha = new Date().toISOString().slice(0, 10);
                return reply
                    .header('Content-Type', 'application/zip')
                    .header('Content-Length', String(bytes))
                    .header('Content-Disposition', `attachment; filename="datos-del-liceo-${fecha}.zip"`)
                    .header('Cache-Control', 'no-store')
                    .send(fs.createReadStream(ruta));
            } catch (e) {
                return responderErrorClaro(reply, e);
            }
        }
    );
}
