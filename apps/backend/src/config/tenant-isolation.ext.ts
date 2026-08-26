import { Prisma, PrismaClient } from '@prisma/client';

// =====================================================
// PRISMA CLIENT EXTENSION — TENANT ISOLATION SAFETY NET
// =====================================================
//
// IMPORTANTE (decisión de diseño revisada — Phase 3):
// El sistema es DATABASE-PER-TENANT: cada instituto tiene su propia base de
// datos PostgreSQL (getTenantPrisma crea una conexión dedicada por instituto).
// El aislamiento real entre institutos lo da la CONEXIÓN a la BD del tenant,
// no la columna instituteId. Ese campo es OPCIONAL (String?) en todos los
// modelos y NUNCA se llenó en los flujos de creación (las filas nacen con
// NULL), por lo que un filtro por instituteId en la extensión:
//   1. No agrega aislamiento real (la BD ya lo garantiza).
//   2. Rompe los listados: las filas con instituteId NULL quedan invisibles.
//
// DIAGNÓSTICO (tenant_san_miguel, con datos): academic_years 3/0 null,
// classrooms 1/0, activities 1/0, subjects 0/1, user 0/3 → los modelos con
// datos vivos están 100% NULL → la extensión los ocultaba.
//
// DECISIÓN: NO se intercepta NINGÚN modelo de negocio en la extensión.
// La lista TENANT_SCOPED_MODELS queda vacía a propósito.
//
// ¿Queda algún vacío de seguridad? No:
//  - JWT claim instituteId + validateTenant (tenant.middleware) bloquean
//    cross-tenant por contexto (tests/tenant-mismatch en verde).
//  - authenticate/getDb fail-closed si tenantPrisma no está resuelto.
//  - La conexión Prisma apunta SOLO a la BD del instituto autenticado.
//
// Si en el futuro una misma BD alojara más de un instituto, la decisión
// correcta es crear un SCHEMA por tenant (no un filtro por columna opcional),
// o hacer instituteId REQUIRED con backfill + migración. Documentado aquí
// para no re-introducir el filtro por accidente.
//
// MODELOS PLATAFORMA (Institute, SuperAdmin, PlatformConfig, etc.) quedan
// fuera por diseño (globales, se consultan vía platformPrisma).
// =====================================================

const TENANT_SCOPED_MODELS: readonly string[] = [];

type TenantScopedModel = (typeof TENANT_SCOPED_MODELS)[number];

// Exportar para tests e inspección
export { TENANT_SCOPED_MODELS };

// Tipos para el interceptor
interface QueryInterceptorParams {
  model: string;
  operation: string;
  args: any;
}

/**
 * Crea una extensión de Prisma Client que inyecta `instituteId`
 * automáticamente en las queries de modelos tenant-scoped.
 *
 * @param instituteId - El ID del instituto del request actual
 * @returns PrismaClient extension para usar con `$extends`
 */
export function createTenantExt(instituteId: string) {
  // Construir los interceptores por modelo dinámicamente
  const queryExt: Record<string, Record<string, (params: any) => Promise<any>>> = {};

  for (const model of TENANT_SCOPED_MODELS) {
    queryExt[model] = {
      async findMany({ args, query }: any) {
        args.where = injectInstituteFilter(args.where, instituteId);
        return query(args);
      },
      async findFirst({ args, query }: any) {
        args.where = injectInstituteFilter(args.where, instituteId);
        return query(args);
      },
      async findUnique({ args, query }: any) {
        // findUnique usa `where` con campos unique (id, email, etc.)
        // No podemos inyectar instituteId aquí porque Prisma requiere
        // que findUnique use SOLO campos unique.
        // El aislamiento DB-per-tenant es la barrera principal aquí.
        return query(args);
      },
      async update({ args, query }: any) {
        args.where = injectInstituteFilter(args.where, instituteId);
        return query(args);
      },
      async updateMany({ args, query }: any) {
        args.where = injectInstituteFilter(args.where, instituteId);
        return query(args);
      },
      async delete({ args, query }: any) {
        args.where = injectInstituteFilter(args.where, instituteId);
        return query(args);
      },
      async deleteMany({ args, query }: any) {
        args.where = injectInstituteFilter(args.where, instituteId);
        return query(args);
      },
      async count({ args, query }: any) {
        args.where = injectInstituteFilter(args.where, instituteId);
        return query(args);
      },
      async aggregate({ args, query }: any) {
        args.where = injectInstituteFilter(args.where, instituteId);
        return query(args);
      },
      async groupBy({ args, query }: any) {
        args.where = injectInstituteFilter(args.where, instituteId);
        return query(args);
      },
    };
  }

  return Prisma.defineExtension({
    name: 'tenantIsolation',
    query: queryExt as any,
  });
}

/**
 * Inyecta `instituteId` en el `where` si no está ya presente.
 * No sobrescribe si el controller ya lo incluyó manualmente.
 */
function injectInstituteFilter(where: any, instituteId: string): any {
  if (!where) {
    return { instituteId };
  }

  // Si ya tiene instituteId (directo o como objeto), no sobrescribir
  if (where.instituteId !== undefined) {
    return where;
  }

  // Si tiene OR / AND, no podemos inyectar simplemente (podría romper lógica)
  // — dejamos pasar y confiamos en el aislamiento DB-per-tenant
  if (where.OR || where.AND) {
    return where;
  }

  return { ...where, instituteId };
}

/**
 * Aplica la extensión de aislamiento a un PrismaClient del tenant.
 * Se llama desde getTenantPrisma() en database.ts.
 */
export function applyTenantIsolation(prisma: PrismaClient, instituteId: string): PrismaClient {
  const ext = createTenantExt(instituteId);
  return prisma.$extends(ext) as unknown as PrismaClient;
}
