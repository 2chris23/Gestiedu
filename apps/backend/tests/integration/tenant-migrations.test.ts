import { FastifyInstance } from 'fastify';
import request = require('supertest');
import { platformPrisma, disconnectAll } from '../../src/config/database';
import { buildTenantDatabaseUrl, maskDatabaseUrl } from '../../src/config/tenant-db-url';
import { listLocalMigrations, getTenantMigrationStatus } from '../../src/services/tenant-migrations.service';
import { createTestServer, seedSuperAdmin, generateSuperAdminTestToken } from '../helpers';

/**
 * CONEXIONES Y MIGRACIONES DE LOS LICEOS
 *
 * Con una base de datos por liceo hay dos cosas que hay que resolver para
 * escalar: que cada liceo no abra conexiones sin límite, y que un cambio de
 * esquema llegue a TODAS las bases sin entrar a la consola.
 */

const CREDENTIALS = {
    databaseUser: 'usuario',
    databasePassword: 'clave con espacios/y+símbolos',
    databaseHost: 'postgres.interno',
    databasePort: 5432,
    databaseName: 'tenant_liceo_x',
};

describe('Conexiones de los liceos', () => {
    const original = { ...process.env };

    afterEach(() => {
        process.env.PGBOUNCER_HOST = original.PGBOUNCER_HOST;
        process.env.PGBOUNCER_PORT = original.PGBOUNCER_PORT;
        process.env.TENANT_CONNECTION_LIMIT = original.TENANT_CONNECTION_LIMIT;
    });

    it('la conexión normal limita las conexiones por liceo', () => {
        delete process.env.PGBOUNCER_HOST;
        process.env.TENANT_CONNECTION_LIMIT = '3';

        const url = buildTenantDatabaseUrl(CREDENTIALS, 'runtime');

        // Sin este límite, 50 liceos activos superan el máximo de PostgreSQL
        expect(url).toContain('connection_limit=3');
        expect(url).toContain('postgres.interno:5432');
        expect(url).not.toContain('pgbouncer=true');
    });

    it('con PgBouncer configurado, la conexión pasa por él', () => {
        process.env.PGBOUNCER_HOST = 'pgbouncer';
        process.env.PGBOUNCER_PORT = '6432';

        const url = buildTenantDatabaseUrl(CREDENTIALS, 'runtime');

        expect(url).toContain('pgbouncer:6432');
        // Modo transacción: Prisma no puede usar sentencias preparadas
        expect(url).toContain('pgbouncer=true');
    });

    it('las migraciones van directas a PostgreSQL aunque haya PgBouncer', () => {
        process.env.PGBOUNCER_HOST = 'pgbouncer';

        const url = buildTenantDatabaseUrl(CREDENTIALS, 'direct');

        // Prisma Migrate necesita bloqueos que el modo transacción no mantiene
        expect(url).toContain('postgres.interno:5432');
        expect(url).not.toContain('pgbouncer');
        expect(url).not.toContain('connection_limit');
    });

    it('la contraseña se codifica y no se filtra en los registros', () => {
        const url = buildTenantDatabaseUrl(CREDENTIALS, 'direct');

        expect(url).not.toContain('clave con espacios');
        expect(url).toContain(encodeURIComponent(CREDENTIALS.databasePassword));
        expect(maskDatabaseUrl(url)).toBe('postgresql://usuario:***@postgres.interno:5432/tenant_liceo_x?schema=public');
    });

    it('sin credenciales no se inventa una conexión', () => {
        expect(() => buildTenantDatabaseUrl({ ...CREDENTIALS, databaseName: null })).toThrow();
    });
});

describe('Estado de las migraciones de cada liceo', () => {
    let server: FastifyInstance;
    let superAdminToken: string;
    const email = `sa-mig-${Date.now()}@test.com`;

    beforeAll(async () => {
        server = await createTestServer();
        const sa = await seedSuperAdmin(platformPrisma as any, email);
        superAdminToken = generateSuperAdminTestToken(sa.id, email);
    }, 120000);

    afterAll(async () => {
        await platformPrisma.superAdmin.deleteMany({ where: { email } }).catch(() => {});
        await disconnectAll();
        await server.close();
    }, 120000);

    it('las migraciones del código se leen del disco', () => {
        const migrations = listLocalMigrations();
        expect(migrations.length).toBeGreaterThan(0);
        // Prisma las nombra con la fecha delante, así que el orden es cronológico
        expect(migrations).toEqual([...migrations].sort());
    });

    it('un liceo sin base aprovisionada se informa, no rompe el listado', async () => {
        const status = await getTenantMigrationStatus({
            id: 'sin-base',
            slug: 'sin-base',
            name: 'Liceo sin base',
            databaseName: null,
            databaseHost: null,
            databasePort: null,
            databaseUser: null,
            databasePassword: null,
        });

        expect(status.error).toContain('aprovisionada');
        expect(status.upToDate).toBe(false);
    });

    it('el panel de superadmin dice qué liceos están al día y cuáles no', async () => {
        const res = await request(server.server)
            .get('/api/superadmin/institutes/migrations')
            .set('Authorization', `Bearer ${superAdminToken}`);

        expect(res.status).toBe(200);
        expect(res.body.localMigrations.length).toBeGreaterThan(0);
        expect(res.body.total).toBe(res.body.upToDate + res.body.behind);
        for (const t of res.body.tenants) {
            expect(t).toHaveProperty('slug');
            expect(t).toHaveProperty('pending');
            expect(t).toHaveProperty('upToDate');
        }
    }, 60000);

    it('sin token de superadmin no se puede consultar', async () => {
        const res = await request(server.server).get('/api/superadmin/institutes/migrations');
        expect(res.status).toBe(401);
    });
});
