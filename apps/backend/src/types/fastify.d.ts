import { PrismaClient } from '@prisma/client';
import { PrismaClient as PlatformPrismaClient } from '../generated/platform-client';
import { UserRole } from '@prisma/client';
import { Server } from 'socket.io';
import Redis from 'ioredis';

// Interfaz para el usuario autenticado en requests
export interface RequestUser {
  id: string;
  userId: string; // Alias para id (compatibilidad)
  email: string;
  role: UserRole;
  instituteId: string | null;
  userType?: 'READ_ONLY' | 'READ_WRITE'; // Para sistema de cache
  cacheEnabled?: boolean; // Si el usuario puede usar cache
}

// Interfaz para la información del instituto
export interface RequestInstitute {
  id: string;
  name: string;
  code: string;
  logo?: string;
  primaryColor?: string;
  secondaryColor?: string;
  email?: string;
  phone?: string;
  address?: string;
  status?: string;
  plan?: string;
  slug?: string;
  databaseName?: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: RequestUser;
    institute?: RequestInstitute;
    tenantPrisma: PrismaClient;
    sessionId?: string;
  }

  interface FastifyInstance {
    prisma: PrismaClient;
    platformPrisma: PlatformPrismaClient;
    io: Server;
    redis: Redis;
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    authorize: (roles: UserRole[]) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    user: RequestUser;
  }
}
