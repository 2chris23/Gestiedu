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