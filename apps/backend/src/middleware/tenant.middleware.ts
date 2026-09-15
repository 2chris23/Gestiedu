import { FastifyRequest, FastifyReply } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { RedisCache } from '../config/redis';
import { platformPrisma, getTenantPrisma } from '../config/database';
import { verifyAccessToken, extractTokenFromHeader } from '../config/jwt';
import { logger } from '../utils/logger';

/**
 * TENANT RESOLVER MIDDLEWARE - Database Per Tenant
 *
 * Resuelve el instituto para cada request multi-tenant.
 *
 * Estrategia de resolución (en orden de prioridad):
 * 1. JWT verificado → payload.instituteId (fuente de verdad para usuarios autenticados)
 * 2. X-Institute-Slug header (frontend / login). Si ambos existen y NO coinciden → 403 TENANT_MISMATCH
 * 3. X-Institute-ID header (API clients)
 * 4. Subdomain (e.g., instituto-demo.tuapp.com)
 * 5. Custom domain (e.g., gestion.miinstituto.edu)
 *
 * Una vez resuelto:
 * - Inyecta `request.institute` con los datos del instituto
 * - Inyecta `request.tenantPrisma` con la conexión Prisma del tenant
 * - Cachea en Redis con TTL de 5 minutos
 */

const TENANT_CACHE_TTL = 300; // 5 minutos
const CACHE_PREFIX = 'tenant:';

export interface TenantInfo {
  id: string;
  name: string;
  code: string;
  slug: string;
  subdomain: string;
  customDomain?: string;
  environment: string;
  status: string;
}



/**
 * Middleware principal: Identifica el tenant y lo inyecta en request.institute y request.tenantPrisma
 */
export async function identifyTenant(
  request: FastifyRequest,
  reply: FastifyReply
) {
    try {
        // ============================================================
        // RESOLUCIÓN DE CADA FUENTE DE TENANT (independiente)
        // ============================================================

        // 1. Desde JWT verificado (fuente de verdad para usuarios autenticados).
        // NOTA: este hook corre en onRequest, antes que el middleware de auth,
        // así que request.user aún no existe — hay que verificar el token aquí.
        // Los tokens de SuperAdmin usan otro secreto: fallan la verificación y se ignoran.
        let jwtInstituteId: string | null = null;
        const token = extractTokenFromHeader(request.headers.authorization);
        if (token) {
            try {
                const payload = verifyAccessToken(token);
                jwtInstituteId = payload.instituteId ?? null;
            } catch {
                // Token inválido/expirado: el middleware de auth responderá 401.
                // Aquí simplemente no resolvemos el tenant vía JWT.
            }
        }

        // 2. Desde header X-Institute-Slug (contexto del frontend / login)
        let slug: string | null = null;
        let slugInstituteId: string | null = null;
        const slugHeader = request.headers['x-institute-slug'];
        if (typeof slugHeader === 'string' && slugHeader.length > 0) {
            slug = slugHeader;
            slugInstituteId = await resolveBySlug(slug);
        }

        // 3. Desde header X-Institute-ID (API clients - legacy)
        let headerInstituteId: string | null = null;
        const headerValue = request.headers['x-institute-id'];
        if (typeof headerValue === 'string' && headerValue.length > 0) {
            headerInstituteId = headerValue;
        }

        // 4. Desde subdomain (hostname parsing)
        let subdomainInstituteId: string | null = null;
        const host = request.hostname;
        const baseDomain = process.env.BASE_DOMAIN || 'localhost';
        if (host && host !== baseDomain && host.endsWith(`.${baseDomain}`)) {
            const subdomain = host.replace(`.${baseDomain}`, '');
            if (subdomain && subdomain !== 'www' && subdomain !== 'api' && subdomain !== 'superadmin') {
                slug = slug ?? subdomain;
                subdomainInstituteId = await resolveBySlug(subdomain);
            }
        }

        // 5. Desde custom domain
        let domainInstituteId: string | null = null;
        if (host && host !== 'localhost' && !host.includes(baseDomain)) {
            domainInstituteId = await resolveByCustomDomain(host);
        }

        // ============================================================
        // SEGURIDAD — VALIDACIÓN CROSS-TENANT DEL CLAIM instituteId
        // ============================================================
        // Si el JWT declara un instituto (claim instituteId), TODOS los demás
        // canales de resolución (slug header, id header, subdominio, dominio)
        // deben coincidir con ese claim. Si alguno resuelve a un instituto
        // distinto, la request se rechaza con 401: un usuario del Instituto B
        // no puede operar bajo el contexto del Instituto A.
        if (jwtInstituteId) {
            // Si la petición NOMBRA un instituto (slug, id, subdominio o dominio),
            // tiene que ser el del token. Se rechaza también cuando ese nombre no
            // resuelve a nada: pedir un liceo que no es el tuyo se corta aunque ese
            // liceo no exista, y así tampoco se puede ir probando nombres para ver
            // cuáles existen.
            const pidioOtroInstituto =
                (slug !== null && slugInstituteId !== jwtInstituteId) ||
                (headerInstituteId !== null && headerInstituteId !== jwtInstituteId) ||
                (subdomainInstituteId !== null && subdomainInstituteId !== jwtInstituteId) ||
                (domainInstituteId !== null && domainInstituteId !== jwtInstituteId);

            const conflictingSource = pidioOtroInstituto
                ? slugInstituteId ?? headerInstituteId ?? subdomainInstituteId ?? domainInstituteId ?? slug
                : null;

            if (conflictingSource) {
                logger.warn('Tenant mismatch: JWT instituteId no coincide con el instituto resuelto', {
                    jwtInstituteId,
                    conflictingSource,
                    slug,
                    host,
                    path: request.url,
                });
                return reply.status(401).send({
                    error: 'El instituto solicitado no coincide con las credenciales del usuario',
                    code: 'TENANT_MISMATCH',
                });
            }
        }

        // Prioridad: JWT > slug header > id header > subdomain > custom domain
        const instituteId =
            jwtInstituteId ?? slugInstituteId ?? headerInstituteId ?? subdomainInstituteId ?? domainInstituteId;

        // Si encontramos un instituteId, cargar datos del instituto e inyectar tenantPrisma
        if (instituteId) {
            const institute = await getTenantById(instituteId);
            if (institute) {
                if (institute.status !== 'ACTIVE') {
                    return reply.status(403).send({
                        error: 'Instituto no activo',
                        code: 'INSTITUTE_INACTIVE',
                        status: institute.status,
                    });
                }
                request.institute = institute;

                // Inyectar conexión Prisma del tenant
                try {
                    request.tenantPrisma = await getTenantPrisma(instituteId);
                } catch (error) {
                    logger.error('Failed to get tenant Prisma connection', {
                        instituteId,
                        error: error instanceof Error ? error.message : 'Unknown',
                    });
                    return reply.status(500).send({
                        error: 'Error al conectar con la base de datos del instituto',
                        code: 'TENANT_DB_CONNECTION_FAILED',
                    });
                }
            }
        }
    } catch (error) {
        logger.error('Error in tenant resolution', {
            error: error instanceof Error ? error.message : 'Unknown',
        });
        // SEGURIDAD: Fallar cerrado (fail-closed). Si la resolución del tenant falla,
        // NO continuar con request.institute = undefined, porque eso permite que
        // queries caigan al platform DB y filtren datos entre institutos.
        // Las rutas públicas (login, health) no necesitan tenant, pero las rutas
        // autenticadas sí. El middleware `authenticate` ahora valida que tenantPrisma
        // exista para rutas no públicas.
    }
}

/**
 * Middleware para rutas que REQUIEREN un tenant resuelto
 */
export function requireTenantAccess() {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.institute) {
      return reply.status(400).send({
        error: 'No se pudo identificar el instituto',
        code: 'TENANT_NOT_FOUND',
      });
    }

    if (request.institute.status !== 'ACTIVE') {
      return reply.status(403).send({
        error: 'Instituto no activo',
        code: 'INSTITUTE_INACTIVE',
        status: request.institute.status,
      });
    }
  };
}

/**
 * Helper: Obtiene datos del tenant por ID (con cache)
 */
async function getTenantById(instituteId: string): Promise<TenantInfo | null> {
  const cacheKey = `${CACHE_PREFIX}id:${instituteId}`;

  // Intentar cache
  const cached = await RedisCache.get<TenantInfo>(cacheKey);
  if (cached) return cached;

  // Query Platform DB
  const institute = await platformPrisma.institute.findUnique({
    where: { id: instituteId },
    select: {
      id: true,
      name: true,
      code: true,
      slug: true,
      subdomain: true,
      customDomain: true,
      environment: true,
      status: true,
    },
  });

  if (!institute) return null;

  const tenantInfo: TenantInfo = {
    id: institute.id,
    name: institute.name,
    code: institute.code,
    slug: institute.slug,
    subdomain: institute.subdomain,
    customDomain: institute.customDomain || undefined,
    environment: institute.environment,
    status: institute.status,
  };

  // Guardar en cache
  await RedisCache.set(cacheKey, tenantInfo, TENANT_CACHE_TTL);

  return tenantInfo;
}

/**
 * Helper: Resuelve instituto por slug (subdomain)
 */
async function resolveBySlug(slug: string): Promise<string | null> {
  const cacheKey = `${CACHE_PREFIX}slug:${slug}`;

  const cached = await RedisCache.get<string>(cacheKey);
  if (cached) return cached;

  const institute = await platformPrisma.institute.findFirst({
    where: {
      OR: [
        { slug },
        { subdomain: slug }
      ]
    },
    select: { id: true },
  });

  if (!institute) return null;

  await RedisCache.set(cacheKey, institute.id, TENANT_CACHE_TTL);
  return institute.id;
}

/**
 * Helper: Resuelve instituto por custom domain
 */
async function resolveByCustomDomain(domain: string): Promise<string | null> {
  const cacheKey = `${CACHE_PREFIX}domain:${domain}`;

  const cached = await RedisCache.get<string>(cacheKey);
  if (cached) return cached;

  const institute = await platformPrisma.institute.findFirst({
    where: { customDomain: domain },
    select: { id: true },
  });

  if (!institute) return null;

  await RedisCache.set(cacheKey, institute.id, TENANT_CACHE_TTL);
  return institute.id;
}

/**
 * Obtiene el ID del tenant desde el request (para uso en controllers)
 */
export function getTenantId(request: FastifyRequest): string | null {
  return request.institute?.id || (request as any).user?.instituteId || null;
}

/**
 * Verifica acceso a un tenant específico
 */
export function canAccessTenant(request: FastifyRequest, targetInstituteId: string): boolean {
  const userInstituteId = (request as any).user?.instituteId;
  return userInstituteId === targetInstituteId;
}

/**
 * Log de acceso al tenant
 */
export async function logTenantAccess(
  request: FastifyRequest,
  _reply: FastifyReply
) {
  if (request.institute) {
    logger.debug('Tenant access', {
      instituteId: request.institute.id,
      instituteName: request.institute.name,
      path: request.url,
    });
  }
}

/**
 * Obtiene configuración del tenant
 */
export async function getTenantConfig(instituteId: string): Promise<any> {
  const cacheKey = `${CACHE_PREFIX}config:${instituteId}`;

  const cached = await RedisCache.get<any>(cacheKey);
  if (cached) return cached;

  const institute = await platformPrisma.institute.findUnique({
    where: { id: instituteId },
    select: {
      primaryColor: true,
      secondaryColor: true,
      logo: true,
      favicon: true,
      subjectPalette: true,
      timezone: true,
    },
  });

  if (institute) {
    await RedisCache.set(cacheKey, institute, TENANT_CACHE_TTL);
  }

  return institute || {};
}

/**
 * Limpia cache de un tenant específico
 */
export async function clearTenantCache(instituteId: string): Promise<void> {
  await RedisCache.clearPattern(`${CACHE_PREFIX}*${instituteId}*`);
  logger.info('Tenant cache cleared', { instituteId });
}
