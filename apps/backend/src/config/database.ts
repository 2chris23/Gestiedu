import { PrismaClient } from '@prisma/client';
import { PrismaClient as PlatformPrismaClient } from '../generated/platform-client';
import { applyTenantIsolation } from './tenant-isolation.ext';
import { buildTenantDatabaseUrl, cabenLasConexiones, pgBouncer } from './tenant-db-url';

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

const tenantConnections = new Map<string, TenantConnection>();

/**
 * Los que se están abriendo ahora mismo. Veinte peticiones a la vez de un liceo
 * sin abrir esperan a UNA apertura, en vez de abrir veinte clientes (medido:
 * abría 20 y se quedaba con uno; los otros 19 seguían conectados para siempre).
 */
const abriendo = new Map<string, Promise<PrismaClient>>();

/**
 * CUÁNTOS LICEOS ABIERTOS A LA VEZ
 *
 * Eran 50 fijos. Con 200 liceos en marcha, cada petición de uno que no estaba
 * en la lista abría el suyo y cerraba otro, y el usuario esperaba las dos
 * cosas. Sin PgBouncer el tope lo pone PostgreSQL (la cuenta la hace
 * `cabenLasConexiones` al arrancar), así que se queda en 50; con PgBouncer las
 * conexiones de los clientes no son conexiones reales, y caben 250.
 * `CLIENTES_DE_LICEO` manda si se pone.
 */
function clientesDeLiceo(): number {
  const pedido = Number(process.env.CLIENTES_DE_LICEO);
  if (Number.isInteger(pedido) && pedido > 0) return pedido;
  return pgBouncer() ? 250 : 50;
}

/**
 * Cuántos clientes de liceo se guardan a la vez. Lo usa el aviso de arranque
 * para hacer la cuenta con PostgreSQL: ver `cabenLasConexiones`. Se calcula al
 * usarse, no al cargar el archivo: a esa hora las variables del `.env` pueden
 * no estar leídas todavía.
 */
export const clientesDeLiceoGuardados = clientesDeLiceo;
const CONNECTION_TTL = 30 * 60 * 1000; // 30 minutos
/** Un cliente usado hace menos de esto no se cierra aunque sobre: está trabajando. */
const EN_USO_MS = 60 * 1000;

/**
 * CUÁNTAS CONSULTAS HA HECHO EL SERVIDOR A LAS BASES DE LOS LICEOS
 *
 * Solo cuenta con `CONTAR_CONSULTAS=1` (las pruebas lo encienden). Sirve para
 * lo que más se repite aquí: una pantalla que pregunta lo mismo una vez por
 * alumno o por materia. Lo que importa no es el número, sino que NO crezca con
 * el número de alumnos o de materias.
 */
let consultasContadas = 0;
export function consultasALaBase(): number {
  return consultasContadas;
}

/** Cuántos clientes de liceo hay abiertos ahora mismo (para las pruebas y el panel). */
export function clientesDeLiceoAbiertos(): number {
  return tenantConnections.size;
}

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

  // 1.5. ¿Ya lo está abriendo otra petición? Entonces se espera a esa.
  const enCurso = abriendo.get(instituteId);
  if (enCurso) return enCurso;

  const apertura = abrirClienteDeLiceo(instituteId).finally(() => abriendo.delete(instituteId));
  abriendo.set(instituteId, apertura);
  return apertura;
}

async function abrirClienteDeLiceo(instituteId: string): Promise<PrismaClient> {
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
    log: [
      ...(process.env.LOG_TENANT_QUERIES === '1'
        ? (['query', 'error', 'warn'] as const)
        : process.env.NODE_ENV === 'development'
          ? (['error', 'warn'] as const)
          : (['error'] as const)),
      // Para contarlas desde las pruebas (ver `consultasALaBase`).
      ...(process.env.CONTAR_CONSULTAS === '1' ? [{ emit: 'event' as const, level: 'query' as const }] : []),
    ],
  });
  if (process.env.CONTAR_CONSULTAS === '1') {
    (rawPrisma as any).$on('query', () => {
      consultasContadas++;
    });
  }

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

  // 6. Limpiar conexiones antiguas si excedemos el límite. SIN esperar: cerrar
  // el cliente de otro liceo no es asunto de quien acaba de llegar.
  if (tenantConnections.size > clientesDeLiceo()) {
    void cleanupOldConnections().catch((error) =>
      console.warn('No se pudieron cerrar clientes de liceo viejos:', error instanceof Error ? error.message : error)
    );
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

  // Ordenar por antigüedad y eliminar las más antiguas si aún excedemos el límite.
  // Pero nunca uno que se usó en el último minuto: cerrarle el cliente a un
  // liceo con gente dentro hacía fallar sus consultas a medias. Si todos están
  // trabajando, el tope se pasa un rato; es mejor que tirar peticiones.
  if (toRemove.length === 0 && tenantConnections.size > clientesDeLiceo()) {
    const sorted = Array.from(tenantConnections.entries())
      .sort((a, b) => a[1].lastUsed.getTime() - b[1].lastUsed.getTime());

    const excess = tenantConnections.size - clientesDeLiceo();
    for (let i = 0; i < excess && i < sorted.length; i++) {
      if (now.getTime() - sorted[i][1].lastUsed.getTime() < EN_USO_MS) break;
      toRemove.push(sorted[i][0]);
    }
  }

  // Se sacan de la lista en el acto y se desconectan en segundo plano.
  const cerrar: Promise<void>[] = [];
  for (const instituteId of toRemove) {
    const connection = tenantConnections.get(instituteId);
    if (connection) {
      tenantConnections.delete(instituteId);
      cerrar.push(connection.prisma.$disconnect().catch(() => undefined));
      console.log(`Cleaned up tenant connection: ${instituteId}`);
    }
  }
  await Promise.all(cerrar);
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
      clientesDeLiceo()
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
