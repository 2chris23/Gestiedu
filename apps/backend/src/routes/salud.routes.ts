import { FastifyInstance, FastifyRequest } from 'fastify';
import { superAdminAuthMiddleware } from '../middleware/superadmin-auth.middleware';
import { agrupador } from '../utils/errores-agrupados';
import { lasRutas, losLiceos, losErrores, marcarError, elPronostico } from '../services/salud-de-rutas.service';
import { lasVueltasDelRobot } from '../jobs/robot-de-salud.job';

/**
 * LA SALUD DEL SISTEMA (salud, 18-oct-2026)
 *
 *   POST /api/errores                      — la pantalla manda un fallo suyo (cualquiera, con o sin sesión)
 *   GET  /api/superadmin/salud/rutas       — cada botón: veces, p50/p95/p99, errores
 *   GET  /api/superadmin/salud/liceos      — cada liceo con su semáforo
 *   GET  /api/superadmin/salud/errores     — los errores agrupados
 *   PATCH /api/superadmin/salud/errores/:huella  — visto / resuelto
 *   GET  /api/superadmin/salud/pronostico  — el tiempo de respuesta con miles de miles
 *   GET  /api/superadmin/salud/robot       — lo que mide el robot en el liceo de muestra
 */

const horasDe = (r: FastifyRequest) => Math.min(24 * 7, Math.max(0.25, Number((r.query as any)?.horas) || 1));

export async function saludRoutes(fastify: FastifyInstance) {
    // Lo manda el teléfono o el navegador al romperse algo en la pantalla
    // (`lib/reportar-fallo.ts`). Sin sesión también: el login también falla.
    // Con cupo propio, para que un bucle de errores no ahogue nada.
    fastify.post(
        '/api/errores',
        {
            config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
            schema: {
                body: {
                    type: 'object',
                    properties: {
                        tipo: { type: 'string', maxLength: 80 },
                        mensaje: { type: 'string', maxLength: 1000 },
                        pila: { type: 'string', maxLength: 8000 },
                        pantalla: { type: 'string', maxLength: 300 },
                        version: { type: 'string', maxLength: 40 },
                    },
                },
            },
        } as any,
        async (request, reply) => {
            const b = (request.body ?? {}) as { tipo?: string; mensaje?: string; pila?: string; pantalla?: string; version?: string };
            const huella = agrupador.apuntar({
                origen: 'pantalla',
                tipo: b.tipo || 'Error',
                mensaje: b.mensaje || '',
                pila: b.pila ?? null,
                // La pantalla sin ids: «/dashboard/academico/:id/:id».
                ruta: b.pantalla ? b.pantalla.split('?')[0].replace(/\/[0-9a-z-]{16,}/gi, '/:id').replace(/\/[VEJ]?-?\d{5,}/gi, '/:id') : null,
                liceo: (request as any).institute?.id ?? null,
                version: b.version ?? null,
            });
            return reply.status(202).send({ huella });
        }
    );

    fastify.register(
        async (sa) => {
            sa.addHook('preHandler', superAdminAuthMiddleware as any);
            sa.get('/rutas', async (r) => ({ horas: horasDe(r), rutas: await lasRutas(horasDe(r)) }));
            sa.get('/liceos', async (r) => ({ horas: horasDe(r), liceos: await losLiceos(horasDe(r)) }));
            sa.get('/errores', async () => ({ errores: await losErrores(200) }));
            sa.patch('/errores/:huella', async (r, reply) => {
                const { huella } = r.params as { huella: string };
                const estado = (r.body as any)?.estado;
                if (!['abierto', 'visto', 'resuelto'].includes(estado)) return reply.status(400).send({ error: 'Estado no válido', code: 'ESTADO_INVALIDO' });
                await marcarError(huella, estado);
                return { ok: true };
            });
            sa.get('/pronostico', async (r) => elPronostico(Math.max(1, horasDe(r))));
            sa.get('/robot', async () => lasVueltasDelRobot());
        },
        { prefix: '/api/superadmin/salud' }
    );
}
