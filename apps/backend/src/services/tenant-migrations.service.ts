/**
 * MIGRACIONES DE TODOS LOS LICEOS
 *
 * Cada liceo tiene su propia base de datos, así que cada cambio de esquema hay
 * que aplicarlo en todas. Antes esto se hacía con `prisma db push
 * --accept-data-loss`, que fuerza el esquema y puede borrar columnas con datos.
 * Aquí se usa `prisma migrate deploy`, que aplica solo las migraciones que
 * faltan y deja constancia en la tabla `_prisma_migrations` de cada liceo.
 *
 * Se ejecuta al publicar una versión (script `migrate-all-tenants`) y también
 * desde el panel de superadmin, para ver qué liceo se quedó atrás y reintentarlo
 * sin tocar la consola.
 */
import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs';
import { Client } from 'pg';
import { platformPrisma } from '../config/database';
import { buildTenantDatabaseUrl, maskDatabaseUrl, TenantDbCredentials } from '../config/tenant-db-url';
import { logger } from '../utils/logger';

const execAsync = promisify(exec);

const SCHEMA_PATH = path.join(__dirname, '../prisma/schema.prisma');
const MIGRATIONS_DIR = path.join(__dirname, '../prisma/migrations');

export interface TenantMigrationStatus {
    instituteId: string;
    slug: string;
    name: string;
    databaseName: string | null;
    /** Migraciones aplicadas con éxito en la base de ese liceo. */
    applied: number;
    /** Migraciones del código que todavía no están aplicadas allí. */
    pending: string[];
    /** Migraciones que quedaron a medias (Prisma las marca como fallidas). */
    failed: string[];
    lastApplied: string | null;
    upToDate: boolean;
    error?: string;
}

export interface TenantMigrationResult {
    instituteId: string;
    slug: string;
    ok: boolean;
    /** Se aplicó en el segundo intento. */
    retried: boolean;
    message: string;
}

/** Migraciones que existen en el código, en orden. */
export function listLocalMigrations(): string[] {
    if (!fs.existsSync(MIGRATIONS_DIR)) return [];
    return fs
        .readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
        .sort();
}

interface InstituteRow extends TenantDbCredentials {
    id: string;
    slug: string;
    name: string;
}

async function activeInstitutes(): Promise<InstituteRow[]> {
    return (await platformPrisma.institute.findMany({
        where: { status: 'ACTIVE' },
        select: {
            id: true,
            slug: true,
            name: true,
            databaseName: true,
            databaseHost: true,
            databasePort: true,
            databaseUser: true,
            databasePassword: true,
        },
        orderBy: { slug: 'asc' },
    })) as InstituteRow[];
}

/** Estado de las migraciones de un liceo, leído de su tabla `_prisma_migrations`. */
export async function getTenantMigrationStatus(institute: InstituteRow): Promise<TenantMigrationStatus> {
    const local = listLocalMigrations();
    const base: TenantMigrationStatus = {
        instituteId: institute.id,
        slug: institute.slug,
        name: institute.name,
        databaseName: institute.databaseName,
        applied: 0,
        pending: local,
        failed: [],
        lastApplied: null,
        upToDate: false,
    };

    if (!institute.databaseName) {
        return { ...base, error: 'El liceo no tiene base de datos aprovisionada' };
    }

    const client = new Client({ connectionString: buildTenantDatabaseUrl(institute, 'direct') });
    try {
        await client.connect();
        const { rows } = await client.query<{
            migration_name: string;
            finished_at: Date | null;
            rolled_back_at: Date | null;
        }>(
            `SELECT migration_name, finished_at, rolled_back_at
               FROM _prisma_migrations
              ORDER BY started_at ASC`
        );

        const applied = rows.filter((r) => r.finished_at && !r.rolled_back_at).map((r) => r.migration_name);
        const failed = rows.filter((r) => !r.finished_at && !r.rolled_back_at).map((r) => r.migration_name);
        const pending = local.filter((m) => !applied.includes(m));

        return {
            ...base,
            applied: applied.length,
            pending,
            failed,
            lastApplied: applied.length > 0 ? applied[applied.length - 1] : null,
            upToDate: pending.length === 0 && failed.length === 0,
        };
    } catch (error: any) {
        // La tabla no existe si la base nunca se migró (por ejemplo, creada con db push)
        const message = error?.message ?? 'Error desconocido';
        return { ...base, error: /_prisma_migrations/.test(message) ? 'Base sin historial de migraciones' : message };
    } finally {
        await client.end().catch(() => {});
    }
}

export async function getAllTenantMigrationStatus(): Promise<{
    localMigrations: string[];
    tenants: TenantMigrationStatus[];
}> {
    const institutes = await activeInstitutes();
    const tenants = await Promise.all(institutes.map((i) => getTenantMigrationStatus(i)));
    return { localMigrations: listLocalMigrations(), tenants };
}

async function runDeploy(institute: InstituteRow): Promise<string> {
    // Conexión directa: Prisma Migrate necesita bloqueos que PgBouncer no mantiene.
    const url = buildTenantDatabaseUrl(institute, 'direct');
    const { stdout } = await execAsync(`npx prisma migrate deploy --schema="${SCHEMA_PATH}"`, {
        env: { ...process.env, DATABASE_URL: url },
        maxBuffer: 10 * 1024 * 1024,
    });
    return stdout.trim();
}

/** Aplica las migraciones pendientes a un liceo. Reintenta una vez si falla. */
export async function migrateTenant(institute: InstituteRow): Promise<TenantMigrationResult> {
    const attempt = async (): Promise<string> => runDeploy(institute);

    try {
        const out = await attempt();
        return { instituteId: institute.id, slug: institute.slug, ok: true, retried: false, message: out };
    } catch (firstError: any) {
        logger.warn('Migración fallida, reintentando', {
            slug: institute.slug,
            error: firstError?.message,
        });
        try {
            const out = await attempt();
            return { instituteId: institute.id, slug: institute.slug, ok: true, retried: true, message: out };
        } catch (error: any) {
            const message = maskDatabaseUrl(error?.stderr || error?.message || 'Error desconocido');
            logger.error('Migración fallida tras reintentar', { slug: institute.slug, error: message });
            return { instituteId: institute.id, slug: institute.slug, ok: false, retried: true, message };
        }
    }
}

export async function migrateTenantById(instituteId: string): Promise<TenantMigrationResult> {
    const institute = (await platformPrisma.institute.findUnique({
        where: { id: instituteId },
        select: {
            id: true,
            slug: true,
            name: true,
            databaseName: true,
            databaseHost: true,
            databasePort: true,
            databaseUser: true,
            databasePassword: true,
        },
    })) as InstituteRow | null;

    if (!institute) throw new Error(`Liceo no encontrado: ${instituteId}`);
    if (!institute.databaseName) throw new Error(`El liceo ${institute.slug} no tiene base de datos aprovisionada`);
    return migrateTenant(institute);
}

export interface MigrateAllReport {
    total: number;
    migrated: number;
    failed: TenantMigrationResult[];
    results: TenantMigrationResult[];
    durationMs: number;
}

/**
 * Migra todos los liceos activos. De uno en uno por defecto: cada `migrate
 * deploy` abre su propia conexión y lanzarlos todos a la vez satura PostgreSQL,
 * que es justo el problema que estamos evitando.
 */
export async function migrateAllTenants(options: { concurrency?: number } = {}): Promise<MigrateAllReport> {
    const started = Date.now();
    const institutes = await activeInstitutes();
    const concurrency = Math.max(1, options.concurrency ?? 1);
    const results: TenantMigrationResult[] = [];

    for (let i = 0; i < institutes.length; i += concurrency) {
        const batch = institutes.slice(i, i + concurrency);
        results.push(...(await Promise.all(batch.map((institute) => migrateTenant(institute)))));
    }

    const failed = results.filter((r) => !r.ok);
    return {
        total: institutes.length,
        migrated: results.length - failed.length,
        failed,
        results,
        durationMs: Date.now() - started,
    };
}
