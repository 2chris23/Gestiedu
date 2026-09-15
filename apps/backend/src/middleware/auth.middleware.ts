import { UserRole } from '../utils/prisma-enums';
import { FastifyRequest, FastifyReply } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { verifyAccessToken, extractTokenFromHeader } from '../config/jwt';
import { hasPermission, Permission, PermissionContext } from '../utils/permissions';
import { ERROR_MESSAGES } from '../utils/constants';
import { RequestUser } from '../types/fastify';
import { RedisCache } from '../config/redis';
import { createHash } from 'crypto';
import { logger } from '../utils/logger';
import { marcarGuardia } from './guardias';
import { conLiceo } from '../config/ambito-del-liceo';

// =====================================================
// Caché de sesión de usuario (Redis)
// Elimina la query a la BD por cada request autenticado.
// La clave incluye el instituto porque el ID de usuario
// es la cédula y puede repetirse entre tenants.
// =====================================================
const AUTH_SESSION_TTL = 60; // segundos

interface CachedUserSession {
  id: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  instituteId: string | null;
}

function getAuthSessionKey(instituteId: string | null | undefined, userId: string): string {
  return `auth:user:${instituteId ?? 'platform'}:${userId}`;
}

/**
 * Invalida la sesión cacheada de un usuario (cambio de rol/estado/contraseña, logout).
 * Debe llamarse desde los controllers que mutan esos campos.
 *
 * EL LICEO VA DICHO, NO SUPUESTO. La memoria rápida guarda cada cosa dentro del
 * apartado de su liceo (`config/ambito-del-liceo.ts`). Esta función se llama
 * también desde fuera de una petición —un guion, una tarea, el alta de otro
 * liceo—, y ahí no hay apartado que suponer: si no se dijera, el borrado no
 * alcanzaría a lo guardado y **una cuenta desactivada seguiría entrando** hasta
 * que caducara sola. Pasó, y lo cazó `auditoria-intrusion`.
 */
export async function invalidateUserSession(
  instituteId: string | null | undefined,
  userId: string
): Promise<void> {
  await conLiceo(instituteId ?? '', () => RedisCache.del(getAuthSessionKey(instituteId, userId)));
}

/**
 * Carga el usuario para autenticación con caché en Redis.
 * Si Redis no está disponible degrada a consulta directa (fallos silenciosos).
 */
export async function loadUserSession(
  db: PrismaClient,
  instituteId: string | null | undefined,
  userId: string
): Promise<CachedUserSession | null> {
  const cacheKey = getAuthSessionKey(instituteId, userId);
  const suLiceo = instituteId ?? '';

  const cached = await conLiceo(suLiceo, () => RedisCache.get<CachedUserSession>(cacheKey));
  if (cached) return cached;

  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      role: true,
      isActive: true,
      instituteId: true,
    },
  });

  if (user) {
    await conLiceo(suLiceo, () => RedisCache.set(cacheKey, user, AUTH_SESSION_TTL));
  }

  return user;
}

/**
 * Middleware avanzado para autenticación con verificación de sesión y base de datos
 */
export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    const authHeader = request.headers.authorization;
    const token = extractTokenFromHeader(authHeader);

    if (!token) {
      return reply.status(401).send({
        error: ERROR_MESSAGES.UNAUTHORIZED,
        message: 'Token de acceso requerido'
      });
    }

    // Verificar y decodificar el token
    const payload = verifyAccessToken(token);

    // SEGURIDAD: Usar tenantPrisma (DB del tenant) para encontrar el usuario.
    // NO hay fallback al server.prisma (platform DB). Si tenantPrisma no está
    // resuelto, la request falla (fail-closed) para evitar consultar el
    // platform DB y filtrar datos entre institutos.
    // Las rutas de superadmin usan su propio middleware (superadmin-auth),
    // no este, por lo que no necesitan el fallback.
    const db = (request as any).tenantPrisma;
    if (!db) {
      return reply.status(401).send({
        error: 'No se pudo determinar el instituto',
        message: 'Token válido pero no se resolvió el instituto. Request abortada por seguridad.',
        code: 'TENANT_NOT_RESOLVED',
      });
    }

    // Verificar que el usuario existe y está activo (con caché de sesión en Redis)
    const user = await loadUserSession(db, (request as any).institute?.id, payload.userId);

    if (!user) {
      return reply.status(401).send({
        error: ERROR_MESSAGES.USER_NOT_FOUND,
        message: 'Usuario no encontrado'
      });
    }

    if (!user.isActive) {
      return reply.status(401).send({
        error: ERROR_MESSAGES.USER_INACTIVE,
        message: 'Usuario inactivo'
      });
    }

    // Determinar tipo de usuario para cache
    const isReadOnly = user.role === UserRole.STUDENT || user.role === UserRole.TUTOR;
    const userType = isReadOnly ? 'READ_ONLY' : 'READ_WRITE';

    // Agregar información del usuario a la request.
    // NOTA: en la tenant DB, user.instituteId puede ser null porque los usuarios
    // no tienen FK hacia institutes (que están en la platform DB).
    // Usamos request.institute?.id (inyectado por identifyTenant) como fallback.
    const resolvedInstituteId =
      user.instituteId ?? (request as any).institute?.id ?? null;

    request.user = {
      id: user.id,
      userId: user.id,
      email: user.email,
      role: user.role,
      instituteId: resolvedInstituteId,
      userType, // 'READ_ONLY' | 'READ_WRITE'
      cacheEnabled: isReadOnly, // Solo cachear usuarios READ_ONLY
    };

  } catch (error) {
    // SEGURIDAD: No loguear el error completo (puede contener el token).
    logger.error('Error en autenticación', {
      error: error instanceof Error ? error.message : 'Unknown',
    });
    return reply.status(401).send({
      error: ERROR_MESSAGES.TOKEN_INVALID,
      message: 'Token inválido o expirado'
    });
  }
}

/**
 * Middleware opcional para autenticación (no falla si no hay token)
 */
export async function optionalAuthenticate(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    const authHeader = request.headers.authorization;
    const token = extractTokenFromHeader(authHeader);

    if (token) {
      const payload = verifyAccessToken(token);
      // SEGURIDAD: No hay fallback al server.prisma. Si tenantPrisma no está
      // resuelto, se omite la autenticación opcional (fail-closed).
      const db = (request as any).tenantPrisma;
      if (!db) return;
      const user = await loadUserSession(db, (request as any).institute?.id, payload.userId);

      if (user && user.isActive) {
        request.user = {
          id: user.id,
          userId: user.id,
          email: user.email,
          role: user.role,
          instituteId: user.instituteId,
        };
      }
    }
  } catch (error) {
    // No hacer nada, es autenticación opcional
    logger.debug('Token opcional inválido', { error: (error as Error).message });
  }
}

/**
 * Middleware para verificar roles específicos
 */
export function requireRoles(...allowedRoles: UserRole[]) {
  return marcarGuardia(async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) {
      return reply.status(401).send({
        error: ERROR_MESSAGES.UNAUTHORIZED,
        message: 'Autenticación requerida'
      });
    }

    if (!allowedRoles.includes(request.user.role)) {
      return reply.status(403).send({
        error: ERROR_MESSAGES.FORBIDDEN,
        message: `Acceso denegado. Roles permitidos: ${allowedRoles.join(', ')}`
      });
    }
  });
}

/**
 * Middleware para verificar permisos específicos
 */
export function requirePermission(
  permission: Permission,
  contextGetter?: (request: FastifyRequest) => PermissionContext
) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) {
      return reply.status(401).send({
        error: ERROR_MESSAGES.UNAUTHORIZED
      });
    }

    const context = contextGetter ? contextGetter(request) : undefined;

    if (!hasPermission(request.user, permission, context)) {
      return reply.status(403).send({
        error: ERROR_MESSAGES.FORBIDDEN,
        message: `Permiso requerido: ${permission}`
      });
    }
  };
}

/**
 * Middleware para verificar acceso al instituto (multi-tenancy)
 */
export async function verifyInstitute(
  request: FastifyRequest,
  reply: FastifyReply
) {
  if (!request.user) {
    return reply.status(401).send({
      error: ERROR_MESSAGES.UNAUTHORIZED
    });
  }

  // Obtener instituteId de parámetros, body o headers
  const tar =
    (request.params as Record<string, string>)?.['instituteId'] ||
    (request.body as Record<string, string>)?.['instituteId'] ||
    request.headers['x-institute-id'];

  if (tar && tar !== request.user.instituteId) {
    return reply.status(403).send({
      error: ERROR_MESSAGES.FORBIDDEN,
      message: 'Acceso denegado al instituto especificado'
    });
  }
}

/**
 * Middleware para verificar que el usuario puede acceder a sus propios datos
 */
export function requireSelfOrAdmin(userIdParam: string = 'userId') {
  return marcarGuardia(async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) {
      return reply.status(401).send({
        error: ERROR_MESSAGES.UNAUTHORIZED
      });
    }

    const targetUserId = (request.params as Record<string, string>)?.[userIdParam];

    // Los administradores pueden acceder a cualquier usuario de su instituto
    if (request.user.role === UserRole.ADMIN) {
      return;
    }

    // Los usuarios Solo pueden acceder a sus propios datos
    if (targetUserId !== request.user.userId) {
      return reply.status(403).send({
        error: ERROR_MESSAGES.FORBIDDEN,
        message: 'Solo puedes acceder a tus propios datos'
      });
    }
  });
}

/**
 * Middleware específico para administradores
 */
export const requireAdmin = requireRoles(UserRole.ADMIN);

/**
 * Middleware específico para profesores (incluye admins)
 */
export async function requireTeacher(
  request: FastifyRequest,
  reply: FastifyReply
) {
  if (!request.user) {
    return reply.status(401).send({
      error: ERROR_MESSAGES.UNAUTHORIZED
    });
  }

  const isAllowed = request.user.role === UserRole.ADMIN || request.user.role === UserRole.TEACHER;

  if (!isAllowed) {
    return reply.status(403).send({
      error: ERROR_MESSAGES.FORBIDDEN,
      message: 'Acceso restringido a profesores y administradores'
    });
  }

  // IMPORTANTE: Retornar explícitamente para que Fastify continúe con el siguiente handler
  return;
}

/**
 * ESTOS VAN ANTES DEL FORMULARIO
 *
 * Preguntar quién eres y qué rol tienes no necesita mirar lo que traes escrito,
 * así que se adelanta a la revisión del formulario. Si no, a un desconocido se
 * le responde "falta el campo email" en vez de "no sé quién eres", y con eso se
 * le va contando cómo está hecho el sistema. Ver `middleware/guardias.ts`.
 *
 * `requireAdmin`, `requireStudent` y `requireTutor` salen de `requireRoles`, que
 * ya marca lo que devuelve; `requireSelfOrAdmin` también.
 *
 * NO se marcan, a propósito, los que necesitan leer el formulario:
 * `verifyInstitute` (busca el instituto en el cuerpo) y `userRateLimit` (cuenta
 * los intentos por correo). Esos se quedan detrás, que es su sitio.
 */
marcarGuardia(authenticate);
marcarGuardia(requireTeacher);

/**
 * Middleware específico para estudiantes
 */
export const requireStudent = requireRoles(UserRole.STUDENT);

/**
 * Middleware específico para tutores
 */
export const requireTutor = requireRoles(UserRole.TUTOR);

/**
 * Middleware para verificar acceso a un aula específica
 */
export function requireClassroomAccess(classroomIdParam: string = 'classroomId') {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) {
      return reply.status(401).send({
        error: ERROR_MESSAGES.UNAUTHORIZED
      });
    }

    const classroomId = (request.params as Record<string, string>)?.[classroomIdParam];

    if (!classroomId) {
      return reply.status(400).send({
        error: 'ID de aula requerido'
      });
    }

    // Los administradores tienen acceso a todas las aulas de su instituto
    if (request.user.role === UserRole.ADMIN) {
      return;
    }

    // Para otros roles, verificar permisos específicos
    // En una implementación real, consultarías la base de datos
    // Por ahora, permitimos el acceso

  };
}

/**
 * Middleware para logging de acciones de usuario
 */
export async function logUserAction(
  request: FastifyRequest,
  reply: FastifyReply
) {
  if (request.user) {
    const action = `${request.method} ${request.url}`;
    console.log(`[${new Date().toISOString()}] Usuario ${request.user.userId} (${request.user.role}): ${action}`);

    // Aquí podrías guardar en base de datos para auditoría
    // await prisma.auditLog.create({ ... });
  }
}

/**
 * Middleware de rate limiting por usuario / intentos de login.
 *
 * - En rutas NO autenticadas (login): limita los intentos por IP + email
 *   para mitigar fuerza bruta sobre cuentas concretas (10 por minuto).
 * - En rutas autenticadas: limita por userId (200 por minuto).
 *
 * Usa RedisCache (que tiene fallback en memoria si Redis no está conectado).
 */
const LOGIN_RATE_MAX = 10;
const LOGIN_RATE_WINDOW_SECONDS = 60;
const USER_RATE_MAX = 200;
const USER_RATE_WINDOW_SECONDS = 60;

/**
 * RENOVAR LA SESIÓN NO ES ADIVINAR UNA CONTRASEÑA
 *
 * Renovar cae por la rama de "no identificado" (todavía no hay credencial
 * corta), así que se contaba con la clave del login: `ip + correo`. Pero al
 * renovar **no se manda ningún correo**, así que la clave quedaba en
 * `ip + vacío`: **todas las renovaciones del liceo entero compartían un solo
 * cupo de diez por minuto**.
 *
 * Y un liceo sale a internet por una sola conexión. Con doscientas personas
 * dentro, diez renovaciones cualesquiera —de quien fuera— dejaban a todos los
 * demás con "demasiados intentos" y, acto seguido, en la pantalla de entrar.
 *
 * Es el mismo fallo que ya se había corregido en el contador general de
 * peticiones (ver `cupoDeLaPeticion` en `server.ts`, "un liceo sale a internet
 * por una sola conexión"), y aquí se había quedado.
 *
 * Ahora cada sesión lleva su propia cuenta: la clave es la huella de la llave
 * larga que presenta. Quien la tenga puede renovar lo suyo sin gastarle el cupo
 * a nadie, y quien intente machacar una llave concreta sigue topándose con un
 * límite.
 *
 * Se comprobó midiendo: doce renovaciones seguidas desde la misma dirección y
 * la undécima ya devolvía 429, con doce personas distintas.
 */
const REFRESH_RATE_MAX = 60;

function claveDeLaPeticion(request: FastifyRequest): { key: string; max: number; windowSeconds: number } {
  if (request.user) {
    return {
      key: `rate_limit:user:${request.user.userId}`,
      max: USER_RATE_MAX,
      windowSeconds: USER_RATE_WINDOW_SECONDS,
    };
  }

  const llaveLarga = (request.body as any)?.refreshToken;
  if (typeof llaveLarga === 'string' && llaveLarga.length > 0) {
    // La huella, no la llave: no hace falta guardarla para contar, y así no
    // acaba escrita en la memoria de nadie.
    const huella = createHash('sha256').update(llaveLarga).digest('hex').slice(0, 32);
    return {
      key: `rate_limit:refresh:${huella}`,
      max: REFRESH_RATE_MAX,
      windowSeconds: LOGIN_RATE_WINDOW_SECONDS,
    };
  }

  return {
    key: `rate_limit:login:${request.ip}:${String((request.body as any)?.email || '').toLowerCase()}`,
    max: LOGIN_RATE_MAX,
    windowSeconds: LOGIN_RATE_WINDOW_SECONDS,
  };
}

export async function userRateLimit(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const { key, max, windowSeconds } = claveDeLaPeticion(request);

  const count = await RedisCache.increment(key);
  if (count === 1) {
    // Primer acceso en la ventana: fija la expiración
    await RedisCache.expire(key, windowSeconds);
  }

  if (count > max) {
    return reply
      .code(429)
      .header('Retry-After', String(windowSeconds))
      .send({
        success: false,
        statusCode: 429,
        error: 'Too Many Requests',
        message: `Demasiados intentos. Inténtalo nuevamente en ${windowSeconds} segundos.`,
      });
  }
}
