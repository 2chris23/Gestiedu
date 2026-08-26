import { execFileSync } from 'child_process';
import path from 'path';
import { Client } from 'pg';
import { PrismaClient } from '@prisma/client';

/**
 * HELPERS DE INFRAESTRUCTURA MULTI-TENANT PARA TESTS
 *
 * Extraídos de tests/tenant-mismatch.test.ts para reutilizarlos en los
 * tests de integración por flujo. Proporcionan:
 *  - parseDbUrl: parsear URLs de PostgreSQL
 *  - resolveTenantUrl: URL del tenant de test principal
 *  - ensureDatabase / dropDatabase: crear/eliminar BD de tenant
 *  - runPrismaMigrate: aplicar esquema (migrate deploy) a una tenant DB
 *  - seedInstituteInPlatform / seedInstituteInTenant: registrar un instituto
 */

export function parseDbUrl(url: string): { user: string; password: string; host: string; port: number; db: string } {
    const m = url.match(/postgres(?:ql)?:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/([^?]+)/);
    if (!m) throw new Error(`Invalid postgres URL: ${url}`);
    return { user: m[1], password: m[2], host: m[3], port: parseInt(m[4], 10), db: m[5] };
}

export function resolveTenantUrl(): string {
    return (
        process.env.TEST_DATABASE_URL ||
        process.env.DATABASE_URL ||
        'postgresql://postgres:postgres@localhost:5432/tenant_test-load-5k'
    );
}

export function resolvePlatformUrl(): string {
    return (
        process.env.PLATFORM_DATABASE_URL ||
        'postgresql://postgres:postgres@localhost:5432/gestion_escolar_platform'
    );
}

export function buildDbUrl(baseUrl: string, dbName: string): string {
    const creds = parseDbUrl(baseUrl);
    return `postgresql://${creds.user}:${creds.password}@${creds.host}:${creds.port}/${dbName}`;
}

export async function ensureDatabase(baseUrl: string, dbName: string): Promise<void> {
    const creds = parseDbUrl(baseUrl);
    const client = new Client({
        user: creds.user,
        password: creds.password,
        host: creds.host,
        port: creds.port,
        database: 'postgres',
    });
    try {
        await client.connect();
        const r = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
        if (r.rows.length === 0) {
            await client.query(`CREATE DATABASE "${dbName}"`);
        }
    } finally {
        await client.end();
    }
}

export async function dropDatabaseIfExists(baseUrl: string, dbName: string): Promise<void> {
    const creds = parseDbUrl(baseUrl);
    const client = new Client({
        user: creds.user,
        password: creds.password,
        host: creds.host,
        port: creds.port,
        database: 'postgres',
    });
    try {
        await client.connect();
        const r = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
        if (r.rows.length > 0) {
            await client.query(
                `SELECT pg_terminate_backend(pg_stat_activity.pid) FROM pg_stat_activity WHERE pg_stat_activity.datname = $1 AND pid <> pg_backend_pid()`,
                [dbName]
            );
            await client.query(`DROP DATABASE "${dbName}"`);
        }
    } finally {
        await client.end();
    }
}

export function runPrismaMigrate(bUrl: string): void {
    const candidates = [
        path.join(__dirname, '..', '..', 'node_modules', 'prisma', 'build', 'index.js'),
        path.join(__dirname, '..', '..', '..', 'node_modules', 'prisma', 'build', 'index.js'),
        path.join(__dirname, '..', '..', '..', '..', 'node_modules', 'prisma', 'build', 'index.js'),
    ];
    const cli = candidates.find(c => require('fs').existsSync(c));
    if (!cli) throw new Error('[tenant-db] prisma CLI not found');
    execFileSync(process.execPath, [
        cli, 'migrate', 'deploy',
        '--schema', path.join(__dirname, '..', '..', 'src', 'prisma', 'schema.prisma'),
    ], {
        env: { ...process.env, DATABASE_URL: bUrl },
        stdio: 'pipe',
    });
}

/**
 * Sincroniza el esquema de una tenant DB de test con el schema.prisma ACTUAL.
 * `migrate deploy` no re-aplica la migración init cuando se editó después de
 * haberse aplicado (checksum): para DBs de test históricas se usa `db push`,
 * que alinea columnas/tablas con el esquema vigente (p. ej. RefreshToken con
 * userAgent/ip/lastUsedAt/rememberMe).
 */
export function runPrismaDbPush(bUrl: string, acceptDataLoss = true): void {
    const candidates = [
        path.join(__dirname, '..', '..', 'node_modules', 'prisma', 'build', 'index.js'),
        path.join(__dirname, '..', '..', '..', 'node_modules', 'prisma', 'build', 'index.js'),
        path.join(__dirname, '..', '..', '..', '..', 'node_modules', 'prisma', 'build', 'index.js'),
    ];
    const cli = candidates.find(c => require('fs').existsSync(c));
    if (!cli) throw new Error('[tenant-db] prisma CLI not found');
    execFileSync(process.execPath, [
        cli, 'db', 'push', '--skip-generate',
        ...(acceptDataLoss ? ['--accept-data-loss'] : []),
        '--schema', path.join(__dirname, '..', '..', 'src', 'prisma', 'schema.prisma'),
    ], {
        env: { ...process.env, DATABASE_URL: bUrl },
        stdio: 'pipe',
    });
}

export interface InstituteDbInfo {
    databaseName: string;
    databaseHost: string;
    databasePort: number;
    databaseUser: string;
    databasePassword: string;
}

/**
 * Registra un instituto en la Platform DB con las credenciales de su tenant DB.
 */
export async function seedInstituteInPlatform(
    platformPrisma: any,
    institute: {
        id: string;
        code: string;
        slug: string;
        subdomain: string;
        name: string;
        email: string;
        status?: string;
    },
    dbInfo: InstituteDbInfo
): Promise<void> {
    await platformPrisma.institute.upsert({
        where: { id: institute.id },
        update: {
            status: institute.status || 'ACTIVE',
            ...dbInfo,
        },
        create: {
            id: institute.id,
            code: institute.code,
            slug: institute.slug,
            subdomain: institute.subdomain,
            name: institute.name,
            email: institute.email,
            environment: 'development',
            status: institute.status || 'ACTIVE',
            ...dbInfo,
        },
    });
}

/**
 * Registra el instituto en su propia tenant DB (para satisfacer FKs de user.instituteId).
 */
export async function seedInstituteInTenant(
    prisma: PrismaClient,
    institute: { id: string; code: string; slug: string; name: string; email: string }
): Promise<void> {
    await prisma.institute.upsert({
        where: { id: institute.id },
        update: {},
        create: {
            id: institute.id,
            code: institute.code,
            slug: institute.slug,
            name: institute.name,
            email: institute.email,
        },
    });
}
