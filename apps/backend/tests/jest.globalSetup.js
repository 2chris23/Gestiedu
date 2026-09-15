/**
 * jest.globalSetup.js
 *
 * Se ejecuta UNA SOLA VEZ antes de todos los test suites.
 * Hace la base de datos de integración reproducible:
 *   1. Carga .env.test (no sobreescribe variables ya definidas, p.ej. CI).
 *   2. Crea la BD del tenant de test y la BD de plataforma si no existen.
 *   3. Aplica el esquema:
 *      - Tenant: prisma migrate deploy (init consolidado).
 *      - Plataforma: prisma db push (no hay migraciones de plataforma).
 *   4. Inyecta DATABASE_URL para que el plugin de Prisma pueda conectarse.
 */
const { execFileSync } = require('child_process');
const path = require('path');
const { Client } = require('pg');
const { config } = require('dotenv');

// Cargar .env.test para desarrollo local (dotenv no sobreescribe variables ya definidas)
config({ path: path.join(__dirname, '..', '.env.test') });

const TENANT_DB_DEFAULT = 'tenant_test-load-5k';

function parseDbUrl(url) {
    const m = url.match(/postgres(?:ql)?:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/([^?]+)/);
    if (!m) throw new Error(`[jest-setup] Invalid postgres URL: ${url}`);
    return { user: m[1], password: m[2], host: m[3], port: parseInt(m[4], 10), db: m[5] };
}

function resolvePrismaCli() {
    const candidates = [
        path.join(__dirname, '..', 'node_modules', 'prisma', 'build', 'index.js'),
        path.join(__dirname, '..', '..', 'node_modules', 'prisma', 'build', 'index.js'),
        path.join(__dirname, '..', '..', '..', 'node_modules', 'prisma', 'build', 'index.js'),
    ];
    for (const c of candidates) {
        if (require('fs').existsSync(c)) return c;
    }
    throw new Error('[jest-setup] prisma CLI not found');
}

async function ensureDatabase(baseUrl) {
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
        const r = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [creds.db]);
        if (r.rows.length === 0) {
            await client.query(`CREATE DATABASE "${creds.db}"`);
            console.log(`[jest-setup] Database created: ${creds.db}`);
        } else {
            console.log(`[jest-setup] Database exists: ${creds.db}`);
        }
    } finally {
        await client.end();
    }
}

function runPrisma(args, env) {
    const cli = resolvePrismaCli();
    try {
        execFileSync(process.execPath, [cli, ...args], {
            env: { ...process.env, ...env },
            stdio: 'pipe',
        });
    } catch (error) {
        const out = (error.stdout || '').toString().trim();
        const err = (error.stderr || '').toString().trim();
        console.error(`[jest-setup] prisma ${args[0]} failed:\n${out || err || error.message}`);
        throw error;
    }
}

/** Borra las bases de ejecuciones anteriores que quedaran a medias. */
async function dropLeftoverTestDatabases(creds) {
    const client = new Client({ ...creds, database: 'postgres' });
    try {
        await client.connect();
        const r = await client.query("SELECT datname FROM pg_database WHERE datname LIKE 't\\_%'");
        for (const row of r.rows) {
            await client.query(`DROP DATABASE IF EXISTS "${row.datname}" WITH (FORCE)`).catch(() => {});
        }
        if (r.rows.length > 0) console.log(`[jest-setup] bases sobrantes borradas: ${r.rows.length}`);
    } catch {
        // No poder limpiar no debe impedir correr las pruebas
    } finally {
        await client.end().catch(() => {});
    }
}

/**
 * La base de un liceo real tiene su propia fila en `institutes`: la crea el
 * aprovisionamiento. La plantilla también, para que cada copia arranque igual y
 * las pruebas no dependan de filas dejadas por otras.
 */
async function seedTemplateInstitute(templateUrl) {
    const creds = parseDbUrl(templateUrl);
    const client = new Client({ ...creds, database: creds.db });
    try {
        await client.connect();
        await client.query(
            `INSERT INTO institutes (id, name, code, slug, email, status, "updatedAt")
             VALUES ($1, $2, $3, $4, $5, 'ACTIVE', NOW())
             ON CONFLICT (id) DO NOTHING`,
            ['institute', 'Test Institute', 'TEST_INST', 'test-institute', 'test@institute.com']
        );
    } finally {
        await client.end().catch(() => {});
    }
}

module.exports = async function globalSetup() {
    const tenantUrl = process.env.DATABASE_URL || process.env.TEST_DATABASE_URL;
    const platformUrl = process.env.PLATFORM_DATABASE_URL;

    if (tenantUrl && tenantUrl !== '(not available)') {
        const creds = parseDbUrl(tenantUrl);
        await ensureDatabase(tenantUrl);
        runPrisma(
            ['migrate', 'deploy', '--schema', path.join(__dirname, '..', 'src', 'prisma', 'schema.prisma')],
            { DATABASE_URL: tenantUrl }
        );
        process.env.DATABASE_URL = tenantUrl;
        console.log(`[jest-setup] DATABASE_URL → ${creds.db}`);
    } else {
        const fallback = `postgresql://postgres:postgres@localhost:5432/${TENANT_DB_DEFAULT}`;
        process.env.DATABASE_URL = fallback;
        console.log(`[jest-setup] DATABASE_URL → localhost/${TENANT_DB_DEFAULT} (fallback)`);
    }

    // Plantilla: una base vacía y migrada de la que cada archivo de pruebas
    // saca su copia. Así ninguna suite puede borrar los datos de otra.
    if (process.env.DATABASE_URL) {
        const creds = parseDbUrl(process.env.DATABASE_URL);
        const templateDb = `${creds.db}_template`.slice(0, 63);
        const templateUrl = `postgresql://${creds.user}:${creds.password}@${creds.host}:${creds.port}/${templateDb}`;

        await dropLeftoverTestDatabases(creds);
        await ensureDatabase(templateUrl);
        runPrisma(
            ['migrate', 'deploy', '--schema', path.join(__dirname, '..', 'src', 'prisma', 'schema.prisma')],
            { DATABASE_URL: templateUrl }
        );
        await seedTemplateInstitute(templateUrl);
        process.env.TEST_TEMPLATE_DATABASE_URL = templateUrl;
        console.log(`[jest-setup] plantilla → ${templateDb}`);
    }

    if (platformUrl) {
        const creds = parseDbUrl(platformUrl);
        await ensureDatabase(platformUrl);
        runPrisma(
            ['db', 'push', '--skip-generate', '--schema', path.join(__dirname, '..', 'src', 'prisma', 'platform-schema.prisma')],
            { PLATFORM_DATABASE_URL: platformUrl }
        );
        console.log(`[jest-setup] PLATFORM_DATABASE_URL → ${creds.db}`);
    }
};