import Redis, { RedisOptions } from 'ioredis';
import { config } from './environment';

// Configuración de Redis
const redisConfig: RedisOptions = {
  host: config.redis.host,
  port: config.redis.port,
  password: config.redis.password,
  lazyConnect: true,
  keepAlive: 30000,
  connectTimeout: 1000,
  commandTimeout: 5000,
  // Configuración específica para desarrollo/producción
  ...(config.isProduction ? {
    // Configuración de producción
    enableReadyCheck: true,
    maxRetriesPerRequest: 5,
  } : {
    // Configuración de desarrollo
    maxRetriesPerRequest: 3,
    showFriendlyErrorStack: true,
  }),
  retryStrategy: (times) => {
    // Si falla más de 5 veces, deja de intentar reconectar para no spammear la consola
    // pero idealmente deberíamos mantener el servidor vivo.
    // Retornar null detiene la reconexión automática.
    // Retornar número espera esos ms antes de reintentar.
    const maxRetries = 5;
    if (times > maxRetries) {
      console.warn('Redis reconnection stopped after too many attempts. Running without Redis.');
      return null;
    }
    return Math.min(times * 100, 3000);
  },
};

// Cliente Redis principal
export const redis = config.redis.url
  ? new Redis(config.redis.url, { lazyConnect: true })
  : new Redis(redisConfig);

// Cliente Redis para suscripciones (pub/sub)
export const redisSub = config.redis.url
  ? new Redis(config.redis.url, { lazyConnect: true })
  : new Redis(redisConfig);

// Cliente Redis para publicaciones (pub/sub)
export const redisPub = config.redis.url
  ? new Redis(config.redis.url, { lazyConnect: true })
  : new Redis(redisConfig);

// Eventos de conexión
// Eventos de conexión
redis.on('connect', () => {
  console.log('✅ Redis connected successfully');
});

redis.on('error', (error) => {
  // console.error('❌ Redis connection error:', error); // Silent or less verbose
});

redisSub.on('error', (err) => {
  // Silent error for sub client
});

redisPub.on('error', (err) => {
  // Silent error for pub client
});

redis.on('reconnecting', () => {
  console.log('🔄 Redis reconnecting...');
});

// Función para conectar a Redis
export async function connectRedis(): Promise<boolean> {
  // En tests, Redis no está disponible — retornar false para no usar el adapter
  if (process.env.NODE_ENV === 'test') {
    console.log('⚠️  Skipping Redis connection in test environment');
    return false;
  }
  try {
    await redis.connect();
    await redisSub.connect();
    await redisPub.connect();
    console.log('✅ All Redis clients connected successfully');
    return true;
  } catch (error) {
    console.error('❌ Redis connection failed:', error);
    throw error;
  }
}

// Función para desconectar de Redis
export async function disconnectRedis(): Promise<void> {
  try {
    await redis.disconnect();
    await redisSub.disconnect();
    await redisPub.disconnect();
    console.log('✅ All Redis clients disconnected successfully');
  } catch (error) {
    console.error('❌ Redis disconnection failed:', error);
  }
}

// Función para verificar el estado de Redis
export async function checkRedisHealth(): Promise<boolean> {
  try {
    const result = await redis.ping();
    return result === 'PONG';
  } catch (error) {
    console.error('Redis health check failed:', error);
    return false;
  }
}

// Utilidades para caché
export class RedisCache {
  private static keyPrefix = 'gestion-escolar:';

  // Fallback en memoria cuando Redis no está disponible (dev sin Redis o durante
  // reconexiones). Evita que las cachés degraden silenciosamente a consultas directas.
  // Nota: es local al proceso — en despliegues multi-instancia Redis sigue siendo el backend real.
  private static memoryStore = new Map<string, { value: any; expiresAt: number }>();

  // Generar clave con prefijo
  private static getKey(key: string): string {
    return `${this.keyPrefix}${key}`;
  }

  private static isRedisReady(): boolean {
    return redis.status === 'ready';
  }

  private static pruneMemory(): void {
    if (this.memoryStore.size < 1000) return;
    const now = Date.now();
    for (const [key, entry] of this.memoryStore) {
      if (entry.expiresAt !== 0 && entry.expiresAt < now) {
        this.memoryStore.delete(key);
      }
    }
  }

  private static memoryGet(key: string): any {
    const entry = this.memoryStore.get(key);
    if (!entry) return null;
    if (entry.expiresAt !== 0 && entry.expiresAt < Date.now()) {
      this.memoryStore.delete(key);
      return null;
    }
    return entry.value;
  }

  private static memorySet(key: string, value: any, ttlSeconds?: number): void {
    this.pruneMemory();
    this.memoryStore.set(key, {
      value,
      expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : 0,
    });
  }

  // Establecer valor en caché
  static async set(key: string, value: any, ttlSeconds?: number): Promise<void> {
    const redisKey = this.getKey(key);
    try {
      if (this.isRedisReady()) {
        const serializedValue = JSON.stringify(value);
        if (ttlSeconds) {
          await redis.setex(redisKey, ttlSeconds, serializedValue);
        } else {
          await redis.set(redisKey, serializedValue);
        }
      } else {
        this.memorySet(redisKey, value, ttlSeconds);
      }
    } catch {
      this.memorySet(redisKey, value, ttlSeconds);
    }
  }

  // Obtener valor del caché
  static async get<T>(key: string): Promise<T | null> {
    const redisKey = this.getKey(key);
    try {
      if (this.isRedisReady()) {
        const value = await redis.get(redisKey);
        if (!value) return null;
        return JSON.parse(value) as T;
      }
      return this.memoryGet(redisKey) as T | null;
    } catch {
      return this.memoryGet(redisKey) as T | null;
    }
  }

  // Eliminar valor del caché
  static async del(key: string): Promise<void> {
    const redisKey = this.getKey(key);
    try {
      if (this.isRedisReady()) {
        await redis.del(redisKey);
      }
    } catch { /* noop */ }
    this.memoryStore.delete(redisKey);
  }

  // Verificar si existe una clave
  static async exists(key: string): Promise<boolean> {
    const redisKey = this.getKey(key);
    try {
      if (this.isRedisReady()) {
        const result = await redis.exists(redisKey);
        return result === 1;
      }
    } catch { /* noop */ }
    return this.memoryGet(redisKey) !== null;
  }

  // Establecer tiempo de expiración
  static async expire(key: string, ttlSeconds: number): Promise<void> {
    const redisKey = this.getKey(key);
    try {
      if (this.isRedisReady()) {
        await redis.expire(redisKey, ttlSeconds);
      }
    } catch { /* noop */ }
    const entry = this.memoryStore.get(redisKey);
    if (entry) {
      entry.expiresAt = ttlSeconds ? Date.now() + ttlSeconds * 1000 : 0;
    }
  }

  // Obtener tiempo de vida restante
  static async ttl(key: string): Promise<number> {
    const redisKey = this.getKey(key);
    try {
      if (this.isRedisReady()) {
        return await redis.ttl(redisKey);
      }
    } catch { /* noop */ }
    const entry = this.memoryStore.get(redisKey);
    if (!entry || entry.expiresAt === 0) return -1;
    const remaining = Math.ceil((entry.expiresAt - Date.now()) / 1000);
    return remaining > 0 ? remaining : -1;
  }

  // Limpiar caché por patrón (usa SCAN para evitar bloquear Redis)
  static async clearPattern(pattern: string): Promise<void> {
    const redisPattern = this.getKey(pattern);
    try {
      if (this.isRedisReady()) {
        let cursor = '0';
        const keysToDelete: string[] = [];
        do {
          const [nextCursor, results] = await redis.scan(cursor, 'MATCH', redisPattern, 'COUNT', 1000);
          cursor = nextCursor;
          if (results && results.length) keysToDelete.push(...results);
        } while (cursor !== '0');
        if (keysToDelete.length > 0) {
          await redis.del(...keysToDelete);
        }
      }
    } catch { /* noop */ }
    const matcher = this.matchPattern(redisPattern);
    for (const key of Array.from(this.memoryStore.keys())) {
      if (matcher(key)) this.memoryStore.delete(key);
    }
  }

  private static matchPattern(pattern: string): (key: string) => boolean {
    // Convierte un glob de Redis (*) a RegExp, sin comillas de MySQL
    const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
    const re = new RegExp(`^${escaped}$`);
    return (key: string) => re.test(key);
  }

  // Incrementar contador
  static async increment(key: string, by: number = 1): Promise<number> {
    const redisKey = this.getKey(key);
    try {
      if (this.isRedisReady()) {
        return await redis.incrby(redisKey, by);
      }
    } catch { /* noop */ }
    const existing = this.memoryStore.get(redisKey);
    const current = (this.memoryGet(redisKey) as number) || 0;
    const next = current + by;
    // Preservar la expiración existente (no resetea la ventana de rate limit)
    const ttl = existing && existing.expiresAt !== 0 && existing.expiresAt > Date.now()
      ? Math.max(1, Math.ceil((existing.expiresAt - Date.now()) / 1000))
      : undefined;
    this.memorySet(redisKey, next, ttl);
    return next;
  }

  // Decrementar contador
  static async decrement(key: string, by: number = 1): Promise<number> {
    const redisKey = this.getKey(key);
    try {
      if (this.isRedisReady()) {
        return await redis.decrby(redisKey, by);
      }
    } catch { /* noop */ }
    const existing = this.memoryStore.get(redisKey);
    const current = (this.memoryGet(redisKey) as number) || 0;
    const next = current - by;
    // Preservar la expiración existente
    const ttl = existing && existing.expiresAt !== 0 && existing.expiresAt > Date.now()
      ? Math.max(1, Math.ceil((existing.expiresAt - Date.now()) / 1000))
      : undefined;
    this.memorySet(redisKey, next, ttl);
    return next;
  }
}

// Utilidades para sesiones
// Utilidades para sesiones
export class RedisSession {
  private static sessionPrefix = 'session:';
  private static userSessionPrefix = 'user-sessions:';

  // Guardar sesión
  static async saveSession(sessionId: string, sessionData: any, ttlSeconds: number): Promise<void> {
    await RedisCache.set(`${this.sessionPrefix}${sessionId}`, sessionData, ttlSeconds);
  }

  // Obtener sesión
  static async getSession<T>(sessionId: string): Promise<T | null> {
    return await RedisCache.get<T>(`${this.sessionPrefix}${sessionId}`);
  }

  // Eliminar sesión
  static async deleteSession(sessionId: string): Promise<void> {
    await RedisCache.del(`${this.sessionPrefix}${sessionId}`);
  }

  // Guardar sesiones de usuario (para múltiples dispositivos)
  static async addUserSession(userId: string, sessionId: string, deviceInfo?: any): Promise<void> {
    try {
      if (redis.status !== 'ready') return;
      const userSessionsKey = `${this.userSessionPrefix}${userId}`;
      const sessionInfo = {
        sessionId,
        createdAt: new Date().toISOString(),
        ...deviceInfo,
      };

      await redis.hset(userSessionsKey, sessionId, JSON.stringify(sessionInfo));
    } catch (error) { }
  }

  // Obtener sesiones de usuario
  static async getUserSessions(userId: string): Promise<Array<any>> {
    try {
      if (redis.status !== 'ready') return [];
      const userSessionsKey = `${this.userSessionPrefix}${userId}`;
      const sessions = await redis.hgetall(userSessionsKey);

      return Object.values(sessions).map(session => JSON.parse(session));
    } catch (error) {
      return [];
    }
  }

  // Eliminar sesión de usuario
  static async removeUserSession(userId: string, sessionId: string): Promise<void> {
    try {
      if (redis.status === 'ready') {
        const userSessionsKey = `${this.userSessionPrefix}${userId}`;
        await redis.hdel(userSessionsKey, sessionId);
      }
    } catch (error) { }
    await this.deleteSession(sessionId);
  }

  // Eliminar todas las sesiones de un usuario
  static async removeAllUserSessions(userId: string): Promise<void> {
    try {
      const sessions = await this.getUserSessions(userId);

      for (const session of sessions) {
        await this.deleteSession(session.sessionId);
      }

      await RedisCache.del(`${this.userSessionPrefix}${userId}`);
    } catch (error) { }
  }
}

export default redis;
