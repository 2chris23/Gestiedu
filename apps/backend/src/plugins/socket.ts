import { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { Server, Socket } from 'socket.io';
import { verifyAccessToken } from '../config/jwt';
import { getTenantPrisma } from '../config/database';
import { loadUserSession, isTokenRevoked } from '../middleware/auth.middleware';
import { logger } from '../utils/logger';

/**
 * EL AVISO DE QUE ALGO CAMBIÓ — Y NADA MÁS
 *
 * ─── PARA QUÉ EXISTE ESTE CANAL ──────────────────────────────────────────────
 *
 * Cuando alguien guarda una nota, la pantalla de los demás tiene que enterarse
 * sin que nadie recargue. Para eso está este canal: el servidor manda un aviso
 * `datos:cambiaron` que dice "algo se movió, vuelve a pedir lo que tengas
 * abierto". El aviso **no lleva ningún dato del liceo dentro** — solo el nombre
 * del recurso y la hora. Quien lo recibe vuelve a pedir los datos por la API de
 * siempre, con sus guardias de siempre.
 *
 * Eso es todo lo que la aplicación usa de este canal. Se comprobó: en
 * `apps/web/src/providers/TiempoRealProvider.tsx` se escucha `datos:cambiaron` y
 * nada más, y no hay una sola línea en toda la web que le pida nada al socket.
 *
 * ─── LO QUE PASABA ANTES ─────────────────────────────────────────────────────
 *
 * Aquí se atendían además una veintena de peticiones (`activities:create`,
 * `activities:delete`, `grades:subscribe`, `users:get_online`, mensajes
 * privados...) que **no llamaba nadie de la aplicación** — solo podía llamarlas
 * quien se pusiera a ello a propósito. Y no preguntaban nada:
 *
 *   · `activities:create` — un ESTUDIANTE podía poner una actividad en el
 *     liceo. Reproducido: la actividad apareció en la base de datos.
 *   · `activities:delete` — un ESTUDIANTE podía borrar la actividad de un
 *     profesor **con todas sus notas**, y por un camino que no pasa por la
 *     papelera: se destruía de verdad, sin copia. Reproducido.
 *   · `users:get_online` — le devolvía a cualquiera la lista de todo el mundo
 *     conectado con su cédula, su rol y su correo. Y la lista era de **todos
 *     los liceos a la vez**, no del suyo. Reproducido.
 *   · `attendance:subscribe` — cualquiera se apuntaba a la asistencia de la
 *     sección que nombrara, fuera suya o no. Reproducido.
 *   · las actividades creadas se anunciaban con `io.emit`, que es "a todo el
 *     mundo conectado", liceos ajenos incluidos.
 *
 * La API tiene guardia en cada puerta. Esto era otra puerta al mismo edificio,
 * sin guardia. Están en `tests/integration/tiempo-real-no-es-puerta.test.ts`.
 *
 * ─── LO QUE SE HACE AHORA ────────────────────────────────────────────────────
 *
 * El canal solo reparte avisos; no recibe órdenes. Quien quiera cambiar algo
 * del liceo pasa por la API, donde están los guardias. Si mañana hace falta que
 * el socket atienda algo, se añade aquí con su comprobación de rol y de alcance
 * escrita, igual que en las rutas.
 */

interface SocketConSesion extends Socket {
    user?: {
        id: string;
        userId: string;
        email: string;
        role: string;
        instituteId: string | null;
    };
}

interface SocketPluginOptions {
    io: Server;
}

const socketPlugin: FastifyPluginAsync<SocketPluginOptions> = async (fastify, options) => {
    const { io } = options;

    /**
     * QUIÉN ENTRA AL CANAL
     *
     * Se comprueba lo mismo que en la API, y por la misma vía:
     *
     *   1. la credencial está firmada por este servidor (`verifyAccessToken`);
     *   2. declara a qué liceo pertenece — sin eso no hay a qué base mirar y se
     *      cierra la puerta;
     *   3. la persona sigue existiendo y **sigue activa** en ese liceo.
     *
     * El punto 3 no estaba. Una cuenta desactivada conservaba su canal abierto
     * hasta que caducara la credencial: se comprobó, entraba. Ahora se le cierra
     * al intentar conectar, igual que la API le cierra sus peticiones.
     */
    io.use(async (socket: SocketConSesion, next) => {
        try {
            const token =
                socket.handshake.auth?.token ||
                socket.handshake.headers.authorization?.split(' ')[1];

            if (!token) {
                return next(new Error('Authentication error: Token not provided'));
            }

            const credencial = verifyAccessToken(token);

            const instituteId = credencial.instituteId;
            if (!instituteId) {
                return next(new Error('Authentication error: token sin instituto'));
            }

            // Cerrar sesión anula la llave en el acto también aquí, no solo en
            // la API: antes el tiempo real la seguía aceptando sus 15 minutos.
            if (await isTokenRevoked(instituteId, token)) {
                return next(new Error('Authentication error: sesión cerrada'));
            }

            const db = await getTenantPrisma(instituteId);
            const sesion = await loadUserSession(db, instituteId, credencial.userId);

            if (!sesion) {
                return next(new Error('Authentication error: usuario no encontrado'));
            }
            if (!sesion.isActive) {
                return next(new Error('Authentication error: usuario inactivo'));
            }

            socket.user = {
                id: credencial.userId,
                userId: credencial.userId,
                email: sesion.email,
                // El rol lo pone la base de datos, no la credencial: si a alguien
                // le cambian el rol, manda lo que diga el liceo.
                role: sesion.role,
                instituteId,
            };

            /**
             * Las salas son las tres que usa el aviso de cambios. Se arman con lo
             * que dice la credencial comprobada, nunca con lo que pida el cliente.
             *
             * El buzón personal lleva el liceo delante, y eso importa: **el
             * identificador de una persona es su cédula, y la cédula se repite
             * entre liceos**. Con el buzón llamado solo `user:<cédula>`, el aviso
             * dirigido a alguien del Liceo A también le sonaba a quien tuviera esa
             * cédula en el Liceo B. Con el liceo delante son dos buzones
             * distintos. Quien emite tiene que usar el mismo nombre: ver
             * `buzonDe()` en `plugins/avisar-cambios.ts`.
             */
            socket.join(`institute:${instituteId}`);
            socket.join(`role:${sesion.role}:${instituteId}`);
            socket.join(`user:${instituteId}:${credencial.userId}`);

            next();
        } catch (err) {
            logger.error('Socket authentication error', { err });
            next(new Error('Authentication error: Invalid token'));
        }
    });

    io.on('connection', (socket: SocketConSesion) => {
        logger.info('Client connected to socket', {
            userId: socket.user?.id as string,
            instituteId: socket.user?.instituteId as string,
        });

        // A propósito no se registra ningún manejador de peticiones: este canal
        // solo reparte avisos (ver la explicación de arriba).

        socket.on('disconnect', () => {
            logger.info('Client disconnected from socket', {
                userId: socket.user?.id as string,
                instituteId: socket.user?.instituteId as string,
            });
        });
    });

    fastify.decorate('io', io);
};

export default fp(socketPlugin, {
    name: 'socket',
});
