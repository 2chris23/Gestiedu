import { UserRole } from '../utils/prisma-enums';
import { Server, Socket } from 'socket.io';
import { config } from './environment';
import { verifyAccessToken, JWTPayload } from './jwt';

// Tipos para Socket.io
export interface AuthenticatedSocket extends Socket {
  user: JWTPayload;
}

export interface SocketError {
  message: string;
  code?: string;
  data?: any;
}

// Configuración de Socket.io (reutilizada por server.ts)
export const socketConfig = {
  cors: {
    origin: config.cors.origin,
    methods: ['GET', 'POST'],
    credentials: true,
  },
  transports: ['websocket' as const, 'polling' as const],
  pingTimeout: 60000,
  pingInterval: 25000,
  upgradeTimeout: 10000,
  maxHttpBufferSize: 1e6, // 1MB
  allowEIO3: true,
};

// Nota: La creación del servidor y el adapter se realiza en server.ts.

// Middleware de autenticación para Socket.io
export function socketAuthMiddleware(socket: Socket, next: (err?: Error) => void) {
  try {
    const token = socket.handshake.auth.token || socket.handshake.headers.authorization;
    
    if (!token) {
      return next(new Error('Token de autenticación requerido'));
    }

    // Extraer token si viene con Bearer
    const cleanToken = token.startsWith('Bearer ') ? token.slice(7) : token;
    
    const payload = verifyAccessToken(cleanToken);
    (socket as AuthenticatedSocket).user = payload;
    
    next();
  } catch (error) {
    next(new Error('Token de autenticación inválido'));
  }
}

// Middleware para unirse a salas basadas en el rol y instituto
export function socketRoomMiddleware(socket: AuthenticatedSocket, next: (err?: Error) => void) {
  try {
    const { user } = socket;
    // Unirse a salas estandarizadas
    socket.join(`institute:${user.instituteId}`);
    socket.join(`role:${user.role}:${user.instituteId}`);
    socket.join(`user:${user.userId}`);
    next();
  } catch (error) {
    next(new Error('Error al configurar salas del socket'));
  }
}

// Utilidades para eventos de Socket.io
export class SocketEvents {
  private io: Server;

  constructor(io: Server) {
    this.io = io;
  }

  // Emitir evento a todo el instituto
  emitToInstitute(instituteId: string, event: string, data: any): void {
    this.io.to(`institute:${instituteId}`).emit(event, data);
  }

  // Emitir evento a roles por instituto
  emitToRole(instituteId: string, role: UserRole, event: string, data: any): void {
    this.io.to(`role:${role}:${instituteId}`).emit(event, data);
  }

  // Emitir evento a un usuario específico
  emitToUser(userId: string, event: string, data: any): void {
    this.io.to(`user:${userId}`).emit(event, data);
  }

  // Emitir evento a usuarios específicos por ID
  emitToUsers(userIds: string[], event: string, data: any): void {
    userIds.forEach(userId => {
      this.io.to(`user:${userId}`).emit(event, data);
    });
  }

  // Emitir evento a un aula específica
  emitToClassroom(classroomId: string, event: string, data: any): void {
    this.io.to(`classroom:${classroomId}`).emit(event, data);
  }

  // Obtener clientes conectados en una sala
  async getClientsInRoom(room: string): Promise<string[]> {
    const sockets = await this.io.in(room).fetchSockets();
    return sockets.map(socket => socket.id);
  }

  // Obtener información de un socket autenticado
  getSocketUser(socketId: string): JWTPayload | null {
    const socket = this.io.sockets.sockets.get(socketId) as AuthenticatedSocket;
    return socket?.user || null;
  }

  // Desconectar a un usuario de todas sus sesiones
  async disconnectUser(userId: string): Promise<void> {
    const sockets = await this.io.fetchSockets();
    
    sockets.forEach(socket => {
      const authSocket = socket as unknown as AuthenticatedSocket;
      if (authSocket.user?.userId === userId) {
        socket.disconnect(true);
      }
    });
  }

  // Emitir notificación
  emitNotification(targetType: 'user' | 'role' | 'institute', targetId: string, notification: any): void {
    const event = 'notification';
    switch (targetType) {
      case 'user':
        this.emitToUser(targetId, event, notification);
        break;
      case 'role':
        const [role, instituteId] = targetId.split(':');
        this.emitToRole(instituteId, role as unknown as UserRole, event, notification);
        break;
      case 'institute':
        this.emitToInstitute(targetId, event, notification);
        break;
    }
  }
}

// Eventos estándar del sistema
export const SOCKET_EVENTS = {
  // Conexión
  CONNECTION: 'connection',
  DISCONNECT: 'disconnect',
  
  // Autenticación
  AUTHENTICATE: 'authenticate',
  AUTHENTICATED: 'authenticated',
  UNAUTHENTICATED: 'unauthenticated',
  
  // Usuarios
  USER_CREATED: 'user:created',
  USER_UPDATED: 'user:updated',
  USER_DELETED: 'user:deleted',
  USER_ONLINE: 'user:online',
  USER_OFFLINE: 'user:offline',
  
  // Actividades
  ACTIVITY_CREATED: 'activity:created',
  ACTIVITY_UPDATED: 'activity:updated',
  ACTIVITY_DELETED: 'activity:deleted',
  
  // Calificaciones
  GRADE_CREATED: 'grade:created',
  GRADE_UPDATED: 'grade:updated',
  GRADE_DELETED: 'grade:deleted',
  
  // Asistencia
  ATTENDANCE_CREATED: 'attendance:created',
  ATTENDANCE_UPDATED: 'attendance:updated',
  
  // Notificaciones
  NOTIFICATION: 'notification',
  NOTIFICATION_READ: 'notification:read',
  
  // Errores
  ERROR: 'error',
  
  // Actualizaciones en tiempo real
  REALTIME_UPDATE: 'realtime:update',
} as const;

export type SocketEventType = typeof SOCKET_EVENTS[keyof typeof SOCKET_EVENTS];

export default socketConfig;
