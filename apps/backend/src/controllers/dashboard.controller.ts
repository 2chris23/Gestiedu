/// <reference path="../types/fastify.d.ts" />
import { FastifyRequest, FastifyReply } from 'fastify';
import { DashboardService } from '../services/dashboard.service';
import { ERROR_MESSAGES, SUCCESS_MESSAGES } from '../utils/constants';
import { createError, AppErrors } from '../middleware/error.middleware';
import { RequestUser } from '../types/fastify';
import { RedisCache } from '../config/redis';
import { conLiceo } from '../config/ambito-del-liceo';

const dashboardService = new DashboardService();

// TTL de la caché del dashboard admin (60s). Los datos escolares cambian poco
// y el TTL corto evita que la información aparezca desactualizada por mucho tiempo.
const DASHBOARD_CACHE_TTL = 60;

// Helper para obtener tenantPrisma del request.
// SEGURIDAD: No hay fallback al platform DB. Si tenantPrisma no está resuelto,
// la request debe fallar (fail-closed) para evitar filtrar datos entre institutos.
function getTenantDb(request: FastifyRequest) {
  const db = (request as any).tenantPrisma;
  if (!db) {
    throw AppErrors.Forbidden('No se pudo determinar el instituto. Request abortada por seguridad.');
  }
  return db;
}

export async function getAdminDashboard(request: FastifyRequest, reply: FastifyReply) {
  try {
    const user = request.user as RequestUser;
    if (!user) {
      throw createError(400, ERROR_MESSAGES.TENANT_NOT_FOUND);
    }
    const db = getTenantDb(request);
    const instituteId = (request as any).institute?.id ?? user.instituteId;

    // Caché de respuesta: el dashboard admin es el endpoint más consultado al abrir la app
    if (instituteId) {
      const cacheKey = `dashboard:admin:${instituteId}`;
      const cached = await conLiceo(instituteId, () => RedisCache.get(cacheKey));
      if (cached) {
        return reply.status(200).send({ success: true, message: SUCCESS_MESSAGES.FETCH_SUCCESS, data: cached });
      }
      const dashboard = await dashboardService.getAdminDashboard(db, instituteId);
      await conLiceo(instituteId, () => RedisCache.set(cacheKey, dashboard, DASHBOARD_CACHE_TTL));
      return reply.status(200).send({ success: true, message: SUCCESS_MESSAGES.FETCH_SUCCESS, data: dashboard });
    }

    const dashboard = await dashboardService.getAdminDashboard(db);
    return reply.status(200).send({ success: true, message: SUCCESS_MESSAGES.FETCH_SUCCESS, data: dashboard });
  } catch (error) {
    throw error;
  }
}

export async function getTeacherDashboard(request: FastifyRequest, reply: FastifyReply) {
  try {
    const user = request.user as RequestUser;
    const userId = user?.userId;
    if (!userId) throw createError(400, ERROR_MESSAGES.TENANT_NOT_FOUND);
    const db = getTenantDb(request);
    const dashboard = await dashboardService.getTeacherDashboard(userId, db);
    return reply.status(200).send({ success: true, message: SUCCESS_MESSAGES.FETCH_SUCCESS, data: dashboard });
  } catch (error) {
    throw error;
  }
}

export async function getStudentDashboard(request: FastifyRequest, reply: FastifyReply) {
  try {
    const user = request.user as RequestUser;
    const userId = user?.userId;
    if (!userId) throw createError(400, ERROR_MESSAGES.TENANT_NOT_FOUND);
    const db = getTenantDb(request);
    const instituteId = (request as any).institute?.id ?? user.instituteId;
    const dashboard = await dashboardService.getStudentDashboard(userId, db, instituteId);
    return reply.status(200).send({ success: true, message: SUCCESS_MESSAGES.FETCH_SUCCESS, data: dashboard });
  } catch (error) {
    throw error;
  }
}

export async function getTutorDashboard(request: FastifyRequest, reply: FastifyReply) {
  try {
    const user = request.user as RequestUser;
    const userId = user?.userId;
    if (!userId) throw createError(400, ERROR_MESSAGES.TENANT_NOT_FOUND);
    const db = getTenantDb(request);
    const instituteId = (request as any).institute?.id ?? user.instituteId;
    const dashboard = await dashboardService.getTutorDashboard(userId, db, instituteId);
    return reply.status(200).send({ success: true, message: SUCCESS_MESSAGES.FETCH_SUCCESS, data: dashboard });
  } catch (error) {
    throw error;
  }
}

export async function getSystemStats(request: FastifyRequest, reply: FastifyReply) {
  try {
    const user = request.user as RequestUser;
    if (!user) throw createError(400, ERROR_MESSAGES.TENANT_NOT_FOUND);
    const db = getTenantDb(request);
    const stats = await dashboardService.getSystemStats(db);
    return reply.status(200).send({ success: true, message: SUCCESS_MESSAGES.FETCH_SUCCESS, data: stats });
  } catch (error) {
    throw error;
  }
}

export async function getInstituteStats(request: FastifyRequest, reply: FastifyReply) {
  try {
    const user = request.user as RequestUser;
    if (!user) throw createError(400, ERROR_MESSAGES.TENANT_NOT_FOUND);
    const db = getTenantDb(request);
    const stats = await dashboardService.getInstituteStats(db);
    return reply.status(200).send({ success: true, message: SUCCESS_MESSAGES.FETCH_SUCCESS, data: stats });
  } catch (error) {
    throw error;
  }
}

export async function getRecentActivity(request: FastifyRequest, reply: FastifyReply) {
  try {
    const user = request.user as RequestUser;
    const userId = user?.userId;
    if (!userId) throw createError(400, ERROR_MESSAGES.TENANT_NOT_FOUND);
    const db = getTenantDb(request);
    const activities = await dashboardService.getRecentActivity(userId, db);
    return reply.status(200).send({ success: true, message: SUCCESS_MESSAGES.FETCH_SUCCESS, data: activities });
  } catch (error) {
    throw error;
  }
}

export async function getUpcomingEvents(request: FastifyRequest, reply: FastifyReply) {
  try {
    const user = request.user as RequestUser;
    const userId = user?.userId;
    if (!userId) throw createError(400, ERROR_MESSAGES.TENANT_NOT_FOUND);
    const db = getTenantDb(request);
    const events = await dashboardService.getUpcomingEvents(userId, db);
    return reply.status(200).send({ success: true, message: SUCCESS_MESSAGES.FETCH_SUCCESS, data: events });
  } catch (error) {
    throw error;
  }
}

export async function getPerformanceMetrics(request: FastifyRequest, reply: FastifyReply) {
  try {
    const user = request.user as RequestUser;
    const userId = user?.userId;
    if (!userId) throw createError(400, ERROR_MESSAGES.TENANT_NOT_FOUND);
    const db = getTenantDb(request);
    const metrics = await dashboardService.getPerformanceMetrics(userId, db);
    return reply.status(200).send({ success: true, message: SUCCESS_MESSAGES.FETCH_SUCCESS, data: metrics });
  } catch (error) {
    throw error;
  }
}
