import { PrismaClient } from '@prisma/client';
import { PrismaClient as PlatformPrismaClient } from '../generated/platform-client';
import { applyTenantIsolation } from './tenant-isolation.ext';
import { buildTenantDatabaseUrl, cabenLasConexiones } from './tenant-db-url';

// =====================================================
// PLATFORM DATABASE (Metadata única)
// =====================================================

export const platformPrisma = new PlatformPrismaClient({
  datasources: {
    db: {
      url: process.env.PLATFORM_DATABASE_URL,
    },
  },
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
});

// =====================================================
// LEGACY: Singleton prisma (lazy) — apunta a DATABASE_URL (DB principal)
//
// ⚠️ SEGURIDAD: Este singleton NO debe usarse para datos de tenant.
// Todo dato de instituto debe consultarse vía request.tenantPrisma
// (o getTenantPrisma(instituteId)). Usar este singleton para datos
// de tenant filtra información entre institutos.
//
// Usos legítimos restantes (ninguno toca datos de tenant):
//   - plugins/prisma.ts (decora fastify.prisma para el health check del server)
//   - services/alert.service.ts y controllers/monitoring.controller.ts
//     (systemAlert/queryMetric: modelos GLOBALES de monitoreo que viven en
//     la DB principal, no en las tenant DBs)
//   - jobs/metrics-collector.job.ts (mismo caso)
//   - tests (mockeado)
//
// Lazy init: se crea la primera vez que se accede, permitiendo que
// Jest setupFiles inyecte DATABASE_URL.
// =====================================================
let _prisma: PrismaClient | null = null;
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    if (!_prisma) {
      _prisma = new PrismaClient({
        log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
      });
    }
    const val = (_prisma as any)[prop];
    return typeof val === 'function' ? val.bind(_prisma) : val;
  },
});

/** Resetea el singleton de Prisma (solo para tests) */
export function resetPrismaForTests(): void {
  if (_prisma) {
    _prisma.$disconnect().catch(() => { }); // ignorar errores al desconectar
    _prisma = null;
  }
}

// =====================================================
// TENANT DATABASES (Cache de conexiones)
// =====================================================

interface TenantConnection {
  prisma: PrismaClient;
  lastUsed: Date;
  instituteId: string;
}

// Cache de conexiones de tenants (máximo 50 conexiones activas)
const tenantConnections = new Map<string, TenantConnection>();
const MAX_CONNECTIONS = 50;

/**
 * Cuántos clientes de liceo se guardan a la vez. Lo usa el aviso de arranque
 * para hacer la cuenta con PostgreSQL: ver `cabenLasConexiones`.
 */
export const CLIENTES_DE_LICEO_GUARDADOS = MAX_CONNECTIONS;
const CONNECTION_TTL = 30 * 60 * 1000; // 30 minutos

/**
 * Obtener o crear conexión Prisma para un tenant específico
 */
export async function getTenantPrisma(instituteId: string): Promise<PrismaClient> {
  // 1. Verificar si ya existe en cache
  const cached = tenantConnections.get(instituteId);
  if (cached) {
    cached.lastUsed = new Date();
    return cached.prisma;
  }

  // 2. Obtener credenciales del tenant desde platform DB
  const institute = await platformPrisma.institute.findUnique({
    where: { id: instituteId },
    select: {
      id: true,
      databaseName: true,
      databaseHost: true,
      databasePort: true,
      databaseUser: true,
      databasePassword: true,
      status: true,
    },
  });

  if (!institute) {
    throw new Error(`Institute not found: ${instituteId}`);
  }

  if (institute.status !== 'ACTIVE') {
    throw new Error(`Institute is not active: ${instituteId} (status: ${institute.status})`);
  }

  if (!institute.databaseName || !institute.databaseHost || !institute.databaseUser || !institute.databasePassword) {
    throw new Error(`Institute database not provisioned: ${instituteId}`);
  }

  // 3. Crear nueva conexión Prisma para el tenant
  // Con un cliente por liceo, sin límite de conexiones se agota PostgreSQL:
  // ver src/config/tenant-db-url.ts
  const databaseUrl = buildTenantDatabaseUrl(institute, 'runtime');

  const rawPrisma = new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
    /**
     * PODER CONTAR LAS CONSULTAS DE UNA PETICIÓN
     *
     * El cliente de cada liceo no escribía las consultas que hace, así que no
     * había forma de saber cuántas cuesta abrir una pantalla. Y esa cuenta es
     * justo lo que destapa el problema que más se repite aquí: preguntar lo
     * mismo una vez por alumno.
     *
     * Se vio con el guardado de notas: parecían "361 ms, algo lento". Contadas,
     * eran **300 consultas para guardar 29 notas**, y quedó en 28 ms.
     *
     * Con `LOG_TENANT_QUERIES=1` se encienden. Apagado por defecto: encendido
     * llena el registro y hace más lento justo lo que se quiere medir.
     *
     *   LOG_TENANT_QUERIES=1 npm run dev
     */
    log:
      process.env.LOG_TENANT_QUERIES === '1'
        ? ['query', 'error', 'warn']
        : process.env.NODE_ENV === 'development'
          ? ['error', 'warn']
          : ['error'],
  });

  // 3.5. Aplicar extensión de aislamiento (safety net que inyecta instituteId automáticamente)
  // SEGURIDAD: Esta extensión es una red de seguridad adicional. Se aplica al cliente
  // Prisma del tenant para inyectar instituteId automáticamente en queries de
  // modelos tenant-scoped. Si la extensión causa problemas, el aislamiento
  // principal (database-per-tenant) sigue vigente.
  let tenantPrisma: PrismaClient;
  try {
    tenantPrisma = applyTenantIsolation(rawPrisma, instituteId);
  } catch (extError) {
    // Si la extensión falla (ej: entorno de tests sin cliente generado),
    // usar el cliente sin extensión. El aislamiento DB-per-tenant sigue vigente.
    console.warn('Tenant isolation extension failed, using raw client', {
      instituteId,
      error: extError instanceof Error ? extError.message : 'Unknown',
    });
    tenantPrisma = rawPrisma;
  }

  // 4. Verificar conexión
  try {
    await tenantPrisma.$connect();
  } catch (error) {
    console.error(`Failed to connect to tenant database: ${instituteId}`, error);
    throw new Error(`Failed to connect to tenant database: ${instituteId}`);
  }

  // 5. Agregar a cache
  tenantConnections.set(instituteId, {
    prisma: tenantPrisma,
    lastUsed: new Date(),
    instituteId,
  });

  // 6. Limpiar conexiones antiguas si excedemos el límite
  if (tenantConnections.size > MAX_CONNECTIONS) {
    await cleanupOldConnections();
  }

  return tenantPrisma;
}

/**
 * Limpiar conexiones antiguas del cache
 */
async function cleanupOldConnections(): Promise<void> {
  const now = new Date();
  const toRemove: string[] = [];

  for (const [instituteId, connection] of tenantConnections.entries()) {
    const age = now.getTime() - connection.lastUsed.getTime();
    if (age > CONNECTION_TTL) {
      toRemove.push(instituteId);
    }
  }

  // Ordenar por antigüedad y eliminar las más antiguas si aún excedemos el límite
  if (toRemove.length === 0 && tenantConnections.size > MAX_CONNECTIONS) {
    const sorted = Array.from(tenantConnections.entries())
      .sort((a, b) => a[1].lastUsed.getTime() - b[1].lastUsed.getTime());

    const excess = tenantConnections.size - MAX_CONNECTIONS;
    for (let i = 0; i < excess; i++) {
      toRemove.push(sorted[i][0]);
    }
  }

  // Desconectar y eliminar
  for (const instituteId of toRemove) {
    const connection = tenantConnections.get(instituteId);
    if (connection) {
      await connection.prisma.$disconnect();
      tenantConnections.delete(instituteId);
      console.log(`Cleaned up tenant connection: ${instituteId}`);
    }
  }
}

/**
 * AVISAR AL ARRANCAR SI LAS CONEXIONES NO DAN
 *
 * Se le pregunta a PostgreSQL cuántas plazas tiene y se hace la cuenta con lo
 * configurado. No corta el arranque a propósito: un servidor que no levanta es
 * peor que uno apretado. Pero queda dicho, con el número, antes de que alguien
 * lo descubra un lunes a primera hora.
 */
export async function avisarSiNoCabenLasConexiones(): Promise<void> {
  try {
    const [max] = await platformPrisma.$queryRawUnsafe<any[]>('SHOW max_connections');
    const [res] = await platformPrisma.$queryRawUnsafe<any[]>('SHOW superuser_reserved_connections');

    const cuenta = cabenLasConexiones(
      Number(max?.max_connections) || 100,
      Number(res?.superuser_reserved_connections) || 0,
      CLIENTES_DE_LICEO_GUARDADOS
    );

    if (cuenta.cabe) console.log(cuenta.mensaje);
    else console.warn(cuenta.mensaje);
  } catch (error) {
    // Si no se puede preguntar, no se inventa un veredicto.
    console.warn('No se pudo comprobar el máximo de conexiones de PostgreSQL:',
      error instanceof Error ? error.message : String(error));
  }
}

/**
 * Cerrar todas las conexiones (para shutdown graceful)
 */
export async function disconnectAll(): Promise<void> {
  console.log('Disconnecting all database connections...');

  // Desconectar platform DB
  await platformPrisma.$disconnect();

  // Desconectar todos los tenants
  const disconnectPromises = Array.from(tenantConnections.values()).map(
    (connection) => connection.prisma.$disconnect()
  );
  await Promise.all(disconnectPromises);

  tenantConnections.clear();
  console.log('All database connections closed');
}

/**
 * Invalidar cache de un tenant específico (útil después de actualizaciones)
 */
export async function invalidateTenantCache(instituteId: string): Promise<void> {
  const connection = tenantConnections.get(instituteId);
  if (connection) {
    await connection.prisma.$disconnect();
    tenantConnections.delete(instituteId);
    console.log(`Invalidated tenant cache: ${instituteId}`);
  }
}

// =====================================================
// HEALTH CHECK
// =====================================================

/**
 * Verificar salud de las conexiones
 */
export async function healthCheck(): Promise<{
  platform: boolean;
  tenants: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let platformHealthy = false;

  // Check platform DB
  try {
    await platformPrisma.$queryRaw`SELECT 1`;
    platformHealthy = true;
  } catch (error) {
    errors.push(`Platform DB unhealthy: ${error}`);
  }

  return {
    platform: platformHealthy,
    tenants: tenantConnections.size,
    errors,
  };
}

// =====================================================
// BACKWARD COMPATIBILITY (deprecated)
// =====================================================

// @deprecated - Use disconnectAll() instead
export async function disconnectDatabase(): Promise<void> {
  await disconnectAll();
}

// @deprecated - Use healthCheck() instead
export async function checkDatabaseHealth(): Promise<boolean> {
  const health = await healthCheck();
  return health.platform;
}

// =====================================================
// GRACEFUL SHUTDOWN
// =====================================================

process.on('SIGINT', async () => {
  await disconnectAll();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await disconnectAll();
  process.exit(0);
});

export default { platformPrisma, getTenantPrisma, disconnectAll, healthCheck };
