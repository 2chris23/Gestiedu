// Middleware de autenticación socket

import { Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { logger } from '../../utils/logger';
import { JwtPayload, AuthenticatedSocket } from '../../types';

/**
 * Middleware de autenticación para sockets
 * Verifica el token JWT y añade la información del usuario al socket
 */
export function authSocketMiddleware() {
  return async (socket: AuthenticatedSocket, next: (err?: Error) => void) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.replace('Bearer ', '');
      
      if (!token) {
        logger.warn('Socket connection attempted without token', { socketId: socket.id });
        return next(new Error('Token de autenticación requerido'));
      }

      // Verificar el token JWT
      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as JwtPayload;
      
      if (!decoded.userId || !decoded.email || !decoded.role) {
        logger.warn('Invalid token payload', { socketId: socket.id, decoded });
        return next(new Error('Token inválido'));
      }

      // Añadir información del usuario al socket
      socket.user = {
        userId: decoded.userId,
        email: decoded.email,
        role: decoded.role,
      };

      logger.info(
        'Socket authenticated successfully',
        { 
          socketId: socket.id, 
          userId: decoded.userId, 
          email: decoded.email, 
          role: decoded.role 
        }
      );

      next();
    } catch (error) {
      logger.error('Socket authentication failed', { error, socketId: socket.id });
      
      if (error instanceof jwt.JsonWebTokenError) {
        return next(new Error('Token inválido'));
      }
      
      if (error instanceof jwt.TokenExpiredError) {
        return next(new Error('Token expirado'));
      }
      
      next(new Error('Error de autenticación'));
    }
  };
}

/**
 * Middleware para verificar roles específicos
 */
export function requireRole(allowedRoles: string[]) {
  return (socket: AuthenticatedSocket, next: (err?: Error) => void) => {
    if (!socket.user) {
      return next(new Error('Usuario no autenticado'));
    }

    if (!allowedRoles.includes(socket.user.role)) {
      logger.warn(
        'Socket access denied due to insufficient permissions',
        { 
          userId: socket.user.userId, 
          userRole: socket.user.role, 
          allowedRoles 
        }
      );
      return next(new Error('Permisos insuficientes'));
    }

    next();
  };
}
