import { UserRole } from '../utils/prisma-enums';
import { PrismaClient } from '@prisma/client';
import { generateTokenPair, verifyRefreshToken } from '../config/jwt';
import { randomUUID } from 'crypto';
import { comparePassword, hashPassword } from '../utils/bcrypt';
import { RedisSession } from '../config/redis';
import { AppErrors } from '../middleware/error.middleware';
import { SESSION_CONFIG } from '../utils/constants';
import { validatePassword } from '../utils/password-validator'; // ✅ SECURITY: Password policy
import { logger } from '../utils/logger';

// =====================================================
// SESIONES PERSISTENTES ("Recordar sesión")
// =====================================================
// rememberMe=false: expiry = SESSION_CONFIG (7 días fijos, sin sliding).
// rememberMe=true:  sliding expiration — cada vez que se usa el refresh se
// renueva la expiración a SLIDING_SESSION_DAYS desde el ÚLTIMO USO.
// Decisión documentada: SLIDING_SESSION_DAYS = 60 (ventana de inactividad
// máxima de ~60 días; si el dispositivo no se usa en 60 días, expira).
const SLIDING_SESSION_DAYS = 60;

export interface LoginData {
  email: string;
  password: string;
  keepSession?: boolean;
  rememberMe?: boolean;
}

export interface LoginDeviceMeta {
  userAgent?: string;
  ip?: string;
}

export interface LoginResponse {
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: UserRole;
    avatar?: string;
    institute: {
      id: string;
      name: string;
      code: string;
    };
  };
  tokens: {
    accessToken: string;
    refreshToken: string;
    expiresIn: string;
    tokenType: string;
  };
}

export interface RefreshTokenData {
  refreshToken: string;
}

/**
 * Cuánto sigue valiendo la llave vieja después de cambiarla. Suficiente para
 * que dos pestañas que renovaron a la vez terminen las dos; demasiado poco para
 * que le sirva a nadie más.
 */
const GRACIA_DE_ROTACION_MS = 30_000;

class AuthService {
  /**
   * Iniciar sesión
   * SEGURIDAD: tenantDb es requerido — no hay fallback al singleton.
   * instituteContextId es el instituto resuelto por identifyTenant para esta
   * request; garantiza que el claim instituteId del JWT siempre coincida con
   * el tenant real (user.instituteId puede ser null en la tenant DB).
   *
   * rememberMe=true: refresh token en modo SLIDING (60 días desde el último
   * uso). rememberMe=false: 7 días fijos (comportamiento actual).
   */
  async login(loginData: LoginData, tenantDb: PrismaClient, instituteContextId?: string, meta?: LoginDeviceMeta): Promise<LoginResponse> {
    const db = tenantDb;
    const { email, password, keepSession = false, rememberMe = false } = loginData;
    const deviceMeta = meta || {};

    // Buscar usuario por email
    const user = await db.user.findUnique({
      where: { email: email.toLowerCase() },
      include: {
        institute: {
          select: {
            id: true,
            name: true,
            code: true
          }
        }
      }
    });

    if (!user) {
      throw AppErrors.InvalidCredentials();
    }

    if ((user as any).status === 'ARCHIVED') {
      throw AppErrors.UserArchived();
    }

    if (!user.isActive) {
      throw AppErrors.UserInactive();
    }

    // Verificar contraseña
    const isPasswordValid = await comparePassword(password, user.password);
    if (!isPasswordValid) {
      throw AppErrors.InvalidCredentials();
    }

    return this.abrirSesion(user, db, { keepSession, rememberMe }, instituteContextId, deviceMeta);
  }

  /**
   * ABRIR LA SESIÓN DE ALGUIEN QUE YA SE HA IDENTIFICADO
   *
   * Todo lo que va DESPUÉS de comprobar quién es: el par de llaves, la fila de
   * la sesión, la memoria rápida y la respuesta.
   *
   * Está aparte porque hay dos formas de identificarse y las dos terminan
   * exactamente igual: con el correo y la contraseña (`login`) y con la llave
   * que este teléfono guardó tras una entrada con contraseña
   * (`llave-del-telefono.service.ts`). Escribirlo dos veces es garantizar que
   * dentro de un mes una de las dos no invalide la sesión, o no la guarde en
   * la memoria rápida, y nadie se entere.
   *
   * Aquí NO se comprueba ninguna credencial: quien llama ya lo hizo.
   */
  async abrirSesion(
    user: { id: string; email: string; firstName: string; lastName: string; role: string; avatar?: string | null; instituteId?: string | null; institute?: unknown },
    db: PrismaClient,
    opciones: { keepSession?: boolean; rememberMe?: boolean },
    instituteContextId?: string,
    meta?: LoginDeviceMeta
  ): Promise<LoginResponse> {
    const keepSession = opciones.keepSession ?? false;
    const rememberMe = opciones.rememberMe ?? false;
    const deviceMeta = meta || {};

    // Generar ID único y tokens JWT (sin DB aún, evita race condition con token='')
    const tokenRecordId = randomUUID();
    const now = Date.now();
    const expiresAt = new Date(
      now +
      (rememberMe
        ? SLIDING_SESSION_DAYS * 24 * 60 * 60 * 1000 // 60 días desde el último uso (NOTA: al crear, último uso = ahora)
        : (keepSession ? SESSION_CONFIG.PERSISTENT_SESSION_TTL : SESSION_CONFIG.NORMAL_SESSION_TTL) * 1000)
    );

    const tokens = generateTokenPair(
      {
        id: user.id,
        userId: user.id,
        email: user.email,
        role: user.role as UserRole,
        // SEGURIDAD: el claim instituteId debe coincidir con el tenant resuelto.
        // user.instituteId puede ser null en la tenant DB (los institutos viven
        // en la platform DB), por eso usamos el contexto del request como fallback.
        instituteId: user.instituteId ?? instituteContextId ?? null
      },
      tokenRecordId
    );

    // Crear registro en BD directamente con el token real (sin placeholder vacío)
    await db.refreshToken.create({
      data: {
        id: tokenRecordId,
        userId: user.id,
        token: tokens.refreshToken,
        expiresAt,
        userAgent: deviceMeta.userAgent?.slice(0, 300) || null,
        ip: deviceMeta.ip || null,
        rememberMe,
        lastUsedAt: new Date(now),
      }
    });

    // Guardar sesión en Redis
    const sessionTTL = rememberMe
      ? SLIDING_SESSION_DAYS * 24 * 60 * 60 // 60 días
      : (keepSession ? SESSION_CONFIG.PERSISTENT_SESSION_TTL : SESSION_CONFIG.NORMAL_SESSION_TTL);

    const sessionData = {
      userId: user.id,
      email: user.email,
      role: user.role,
      instituteId: user.instituteId,
      keepSession,
      rememberMe,
      loginAt: new Date().toISOString(),
      userAgent: deviceMeta.userAgent || undefined,
      ip: deviceMeta.ip || undefined
    };

    await RedisSession.saveSession(
      tokenRecordId,
      sessionData,
      sessionTTL
    );
    await RedisSession.addUserSession(user.id, tokenRecordId, { userAgent: sessionData.userAgent, ip: sessionData.ip, keepSession, rememberMe });

    // Respuesta
    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role as UserRole,
        avatar: user.avatar ?? undefined,
        institute: (user.institute ?? undefined) as any
      },
      tokens
    };
  }

  /**
   * Renovar token de acceso
   * SEGURIDAD: tenantDb es requerido — no hay fallback al singleton.
   */
  async refreshToken(data: RefreshTokenData, tenantDb: PrismaClient): Promise<{ accessToken: string; refreshToken: string; expiresIn: string }> {
    const { refreshToken } = data;

    // Verificar refresh token
    let payload;
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch (error) {
      throw AppErrors.TokenInvalid();
    }

    // Buscar refresh token en BD del tenant
    const refreshTokenRecord = await tenantDb.refreshToken.findUnique({
      where: {
        id: payload.tokenId,
        token: refreshToken
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            role: true,
            isActive: true,
            instituteId: true
          }
        }
      }
    });

    if (!refreshTokenRecord) {
      throw AppErrors.TokenInvalid();
    }

    if (refreshTokenRecord.expiresAt < new Date()) {
      // Limpiar token expirado
      await this.cleanupExpiredToken(refreshTokenRecord.id, tenantDb);
      throw AppErrors.TokenExpired();
    }

    if (!refreshTokenRecord.user.isActive) {
      throw AppErrors.UserInactive();
    }

    const now = new Date();

    /**
     * LA LLAVE DE VOLVER A ENTRAR SE CAMBIA CADA VEZ
     *
     * Cada renovación entrega una llave nueva y jubila la anterior. Si alguien
     * copió la llave de un dispositivo, deja de servirle en cuanto su dueño la
     * usa una vez —y ahí se nota el robo, porque el ladrón se queda fuera—, en
     * lugar de servirle durante días.
     *
     * PERO NO SE TIRA DE GOLPE, Y ESTO IMPORTA
     *
     * Dos pestañas abiertas renuevan a la vez y mandan LA MISMA llave. Si la
     * primera la borrara, la segunda recibiría "no autorizado" y al liceo le
     * saltaría la pantalla de entrar en mitad del trabajo, sin haber hecho nada
     * mal. Por eso la vieja se marca como cambiada y sigue valiendo unos
     * segundos: el tiempo de que las dos terminen.
     *
     * Pasada esa gracia, la llave vieja no vale: es lo que cierra la puerta a
     * quien la hubiera copiado.
     */
    const laGraciaYaEmpezo = refreshTokenRecord.replacedAt !== null;
    if (laGraciaYaEmpezo) {
      const desdeQueSeCambio = now.getTime() - refreshTokenRecord.replacedAt!.getTime();
      if (desdeQueSeCambio > GRACIA_DE_ROTACION_MS) {
        // Llave jubilada hace rato. Ni se renueva ni se avisa de qué pasó.
        logger.warn('Refresh token reutilizado fuera de la gracia', {
          userId: refreshTokenRecord.userId,
          tokenId: refreshTokenRecord.id,
        });
        throw AppErrors.TokenInvalid();
      }
    }

    // La sesión "recordada" se corre desde el último uso; la normal conserva su
    // fecha de caducidad original.
    const newExpiresAt = refreshTokenRecord.rememberMe
      ? new Date(now.getTime() + SLIDING_SESSION_DAYS * 24 * 60 * 60 * 1000)
      : refreshTokenRecord.expiresAt;

    if (!laGraciaYaEmpezo) {
      await tenantDb.refreshToken.update({
        where: { id: refreshTokenRecord.id },
        data: { replacedAt: now, lastUsedAt: now },
      }).catch(() => undefined);
    }

    const newTokenRecordId = randomUUID();

    // Generar nuevo par de tokens
    const tokens = generateTokenPair(
      {
        id: refreshTokenRecord.user.id,
        userId: refreshTokenRecord.user.id,
        email: refreshTokenRecord.user.email,
        role: refreshTokenRecord.user.role as UserRole,
        instituteId: refreshTokenRecord.user.instituteId
      },
      newTokenRecordId
    );

    // De paso, barrer las llaves ya jubiladas de esta persona: pasada la
    // gracia no valen para nada y si no la tabla crece una fila por renovación.
    await tenantDb.refreshToken.deleteMany({
      where: {
        userId: refreshTokenRecord.userId,
        replacedAt: { lt: new Date(now.getTime() - GRACIA_DE_ROTACION_MS) },
      },
    }).catch(() => undefined);

    // Guardar el nuevo refresh token en la BD del tenant
    await tenantDb.refreshToken.create({
      data: {
        id: newTokenRecordId,
        userId: refreshTokenRecord.user.id,
        token: tokens.refreshToken,
        expiresAt: newExpiresAt,
        userAgent: refreshTokenRecord.userAgent,
        ip: refreshTokenRecord.ip,
        rememberMe: refreshTokenRecord.rememberMe,
        lastUsedAt: now,
      },
    });

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.expiresIn
    };
  }

  /**
   * Cerrar sesión
   * SEGURIDAD: tenantDb es requerido — revoca TODOS los refresh tokens del usuario.
   */
  async logout(userId: string, tenantDb: PrismaClient, refreshToken?: string): Promise<void> {
    if (refreshToken) {
      // Cerrar sesión específica
      try {
        const payload = verifyRefreshToken(refreshToken);
        await this.cleanupExpiredToken(payload.tokenId, tenantDb);
        await RedisSession.removeUserSession(userId, payload.tokenId);
      } catch (error) {
        // Token ya inválido, no hacer nada
      }
    } else {
      // Cerrar todas las sesiones del usuario
      await this.logoutAllSessions(userId, tenantDb);
    }
  }

  /**
   * Cerrar todas las sesiones de un usuario
   * SEGURIDAD: tenantDb es requerido — revoca TODOS los refresh tokens activos.
   */
  async logoutAllSessions(userId: string, tenantDb: PrismaClient): Promise<void> {
    // Eliminar todos los refresh tokens del usuario
    const refreshTokens = await tenantDb.refreshToken.findMany({
      where: { userId },
      select: { id: true }
    });

    // Limpiar de BD
    await tenantDb.refreshToken.deleteMany({
      where: { userId }
    });

    // Limpiar de Redis
    for (const token of refreshTokens) {
      await RedisSession.deleteSession(token.id);
    }

    // Limpiar sesiones de usuario en Redis
    await RedisSession.removeAllUserSessions(userId);
  }

  /**
   * Lista las sesiones/dispositivos activos del usuario (sin exponer el token).
   * SEGURIDAD: solo el propio usuario (tenantDb ya es su tenant; el filtro userId
   * garantiza que nunca se devuelvan sesiones de otro usuario ni otro tenant).
   */
  async getUserSessions(
    userId: string,
    tenantDb: PrismaClient,
    currentMeta?: { userAgent?: string; ip?: string; currentTokenId?: string }
  ): Promise<Array<{
    id: string;
    userAgent: string | null;
    ip: string | null;
    createdAt: Date;
    lastUsedAt: Date;
    rememberMe: boolean;
    isCurrent: boolean;
  }>> {
    const sessions = await tenantDb.refreshToken.findMany({
      // `replacedAt: null` = las llaves vivas. Como la llave se cambia en cada
      // renovación, sin este filtro la lista de "dispositivos conectados" se
      // llenaría de fantasmas: la misma sesión repetida una vez por renovación.
      where: { userId, replacedAt: null },
      select: {
        id: true,
        userAgent: true,
        ip: true,
        createdAt: true,
        lastUsedAt: true,
        rememberMe: true,
      },
      orderBy: { lastUsedAt: 'desc' },
    });

    // Marcar "esta sesión":
    // 1) Si conocemos el currentTokenId exacto (del refresh token actual), coincide 100% por ID
    // 2) Si no, por coincidencia de (userAgent + ip)
    // 3) Si solo hay 1 sesión o ninguna otra coincide, la más reciente (idx === 0)
    return sessions.map((s, idx) => {
      let isCurrent = false;
      if (currentMeta?.currentTokenId) {
        isCurrent = s.id === currentMeta.currentTokenId;
      } else if (
        currentMeta?.userAgent && currentMeta.userAgent === s.userAgent &&
        currentMeta?.ip && currentMeta.ip === s.ip
      ) {
        isCurrent = idx === 0;
      } else if (idx === 0) {
        isCurrent = true;
      }

      return {
        id: s.id,
        userAgent: s.userAgent,
        ip: s.ip,
        createdAt: s.createdAt,
        lastUsedAt: s.lastUsedAt,
        rememberMe: s.rememberMe,
        isCurrent,
      };
    });
  }

  /**
   * Revoca UNA sesión específica del usuario autenticado.
   * SEGURIDAD: si la sesión no pertenece al usuario → 404 (no revela existencia).
   */
  async revokeSession(userId: string, sessionId: string, tenantDb: PrismaClient): Promise<boolean> {
    const session = await tenantDb.refreshToken.findFirst({
      where: { id: sessionId, userId },
      select: { id: true },
    });

    if (!session) return false;

    await tenantDb.refreshToken.delete({ where: { id: session.id } });
    await RedisSession.deleteSession(session.id);
    await RedisSession.removeUserSession(userId, session.id);
    return true;
  }

  /**
   * Revoca todas las sesiones activas del usuario EXCEPTO la actual.
   * Si no se especifica currentSessionId, conserva la más reciente.
   */
  async revokeOtherSessions(
    userId: string,
    currentSessionId: string | undefined,
    tenantDb: PrismaClient
  ): Promise<number> {
    let keepId = currentSessionId;
    if (!keepId) {
      const latest = await tenantDb.refreshToken.findFirst({
        where: { userId },
        orderBy: { lastUsedAt: 'desc' },
        select: { id: true },
      });
      keepId = latest?.id;
    }

    const whereClause: any = { userId };
    if (keepId) {
      whereClause.id = { not: keepId };
    }

    const otherSessions = await tenantDb.refreshToken.findMany({
      where: whereClause,
      select: { id: true },
    });

    if (otherSessions.length === 0) return 0;

    const ids = otherSessions.map(s => s.id);
    await tenantDb.refreshToken.deleteMany({
      where: { id: { in: ids } },
    });

    for (const id of ids) {
      await RedisSession.deleteSession(id);
      await RedisSession.removeUserSession(userId, id);
    }

    return ids.length;
  }

  /**
   * Cambiar contraseña
   * SEGURIDAD: tenantDb es requerido — después de cambiar la contraseña,
   * revoca TODOS los refresh tokens activos (forzar re-login en todos los dispositivos).
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
    tenantDb: PrismaClient,
  ): Promise<void> {
    // Buscar usuario
    const user = await tenantDb.user.findUnique({
      where: { id: userId },
      select: { id: true, password: true, isActive: true }
    });

    if (!user || !user.isActive) {
      throw AppErrors.UserNotFound();
    }

    // Verificar contraseña actual
    const isCurrentPasswordValid = await comparePassword(currentPassword, user.password);
    if (!isCurrentPasswordValid) {
      throw AppErrors.InvalidCredentials();
    }

    // ✅ SECURITY: Validate new password (flexible policy)
    const passwordValidation = validatePassword(newPassword);
    if (!passwordValidation.valid) {
      throw new Error(`Contraseña no cumple con los requisitos: ${passwordValidation.errors.join(', ')}`);
    }

    // Password strength info is validated but NOT logged (security: avoid leaking password metrics)

    // Hash nueva contraseña
    const hashedNewPassword = await hashPassword(newPassword);

    // Actualizar contraseña
    await tenantDb.user.update({
      where: { id: userId },
      data: { password: hashedNewPassword }
    });

    // Cerrar todas las sesiones (forzar re-login)
    await this.logoutAllSessions(userId, tenantDb);
  }

  /**
   * Verificar si un usuario está en línea
   */
  async isUserOnline(userId: string): Promise<boolean> {
    const sessions = await RedisSession.getUserSessions(userId);
    return sessions.length > 0;
  }

  /**
   * Obtener sesiones activas de un usuario
   */
  async getUserActiveSessions(userId: string): Promise<Array<any>> {
    const sessions = await RedisSession.getUserSessions(userId);

    return sessions.map(session => ({
      sessionId: session.sessionId,
      createdAt: session.createdAt,
      keepSession: session.keepSession,
      device: session.userAgent
    }));
  }

  /**
   * Limpiar tokens expirados
   * SEGURIDAD: tenantDb es requerido.
   */
  async cleanupExpiredTokens(tenantDb: PrismaClient): Promise<void> {
    const expiredTokens = await tenantDb.refreshToken.findMany({
      where: {
        expiresAt: {
          lt: new Date()
        }
      },
      select: { id: true }
    });

    // Eliminar de BD
    await tenantDb.refreshToken.deleteMany({
      where: {
        expiresAt: {
          lt: new Date()
        }
      }
    });

    // Eliminar de Redis
    for (const token of expiredTokens) {
      await RedisSession.deleteSession(token.id);
    }
  }

  /**
   * Limpiar un token específico
   */
  private async cleanupExpiredToken(tokenId: string, tenantDb: PrismaClient): Promise<void> {
    await tenantDb.refreshToken.delete({
      where: { id: tokenId }
    }).catch(() => { }); // Ignorar si ya no existe

    await RedisSession.deleteSession(tokenId);
  }

  /**
   * Validar formato de email
   */
  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Resetear contraseña (para futuras implementaciones)
   * SEGURIDAD: tenantDb es requerido.
   */
  async requestPasswordReset(email: string, tenantDb: PrismaClient): Promise<void> {
    const user = await tenantDb.user.findUnique({
      where: { email: email.toLowerCase() },
      select: { id: true, email: true, firstName: true, isActive: true }
    });

    if (!user || !user.isActive) {
      // No revelar si el usuario existe o no por seguridad
      return;
    }

    // TODO: Implementar lógica de reset de contraseña
    // 1. Generar token de reset
    // 2. Guardar en BD con expiración
    // 3. Enviar email
    logger.info(`Password reset requested for user: ${user.email}`);
  }
}

export const authService = new AuthService();
export default authService;
