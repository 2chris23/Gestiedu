import { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { Server, Socket } from 'socket.io';
import { verifyAccessToken } from '../config/jwt';
import { logger } from '../utils/logger';
import { registerActivitiesHandlers } from '../socket/handlers/activities.handler';
import { registerAttendanceHandlers } from '../socket/handlers/attendance.handler';
import { registerGradesHandlers } from '../socket/handlers/grades.handler';
import { registerUserHandlers } from '../socket/handlers/users.handler';


// Interfaz para el usuario autenticado en el socket
interface AuthenticatedSocket extends Socket {
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

  // Middleware de autenticación para Socket.io
  io.use(async (socket: AuthenticatedSocket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.split(' ')[1];

      if (!token) {
        return next(new Error('Authentication error: Token not provided'));
      }

      // Verificar el token JWT
      const decoded = await verifyAccessToken(token);
      socket.user = decoded;

      // Unir al usuario a salas estándar
      socket.join(`institute:${decoded.instituteId}`);
      socket.join(`role:${decoded.role}:${decoded.instituteId}`);
      socket.join(`user:${decoded.id}`);

      next();
    } catch (err) {
      logger.error('Socket authentication error', { err });
      next(new Error('Authentication error: Invalid token'));
    }
  });

  // Manejar conexiones de socket
  io.on('connection', (socket: AuthenticatedSocket) => {
    logger.info('Client connected to socket', {
      userId: socket.user?.id as string,
      instituteId: socket.user?.instituteId as string,
    });

    // Registrar manejadores de eventos
    registerActivitiesHandlers(io, socket);
    registerAttendanceHandlers(io, socket);
    registerGradesHandlers(io, socket);
    registerUserHandlers(io, socket);

    // Manejar desconexión
    socket.on('disconnect', () => {
      logger.info('Client disconnected from socket', {
        userId: socket.user?.id as string,
        instituteId: socket.user?.instituteId as string,
      });
    });
  });

  // Agregar la instancia de Socket.io al contexto de Fastify
  fastify.decorate('io', io);
};

export default fp(socketPlugin, {
  name: 'socket',
});
