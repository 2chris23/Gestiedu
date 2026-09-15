import { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/auth.middleware';
import { instituteTimezone, todayInTimezone, timeInTimezone } from '../utils/school-time';

/**
 * LA HORA OFICIAL DEL LICEO
 *
 * La aplicación pregunta aquí qué día y qué hora son, en vez de mirar el reloj
 * del dispositivo: ese se puede cambiar a mano, y una VPN puede mover la zona
 * horaria. Así, un estudiante que ponga su teléfono a otra hora sigue viendo la
 * clase que de verdad toca.
 */
export async function schoolTimeRoutes(fastify: FastifyInstance) {
    fastify.get('/', { preHandler: [authenticate] }, async (request, reply) => {
        const timezone = await instituteTimezone(request.tenantPrisma);
        const ahora = new Date();

        return reply.send({
            // Momento exacto según el servidor
            now: ahora.toISOString(),
            // Día y hora ya traducidos a la zona del liceo
            date: todayInTimezone(timezone, ahora),
            time: timeInTimezone(timezone, ahora),
            timezone,
        });
    });
}

export default schoolTimeRoutes;
