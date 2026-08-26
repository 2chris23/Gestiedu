import { FastifyInstance } from 'fastify';
import request = require('supertest');
import { PrismaClient } from '@prisma/client';
import { UserRole } from '../../src/utils/prisma-enums';
import { platformPrisma, disconnectAll } from '../../src/config/database';
import {
    createTestServer,
    createTestPrismaClient,
    cleanTestDatabase,
    createTestUser,
    generateTestToken,
    seedSuperAdmin,
    generateSuperAdminTestToken,
} from '../helpers';
import {
    resolvePlatformUrl,
    resolveTenantUrl,
    dropDatabaseIfExists,
} from '../helpers/tenant-db';

/**
 * FLUJO 5 — CREACIÓN DE INSTITUTO (APROVISIONAMIENTO SAAS)
 *
 * Crea un instituto real vía SuperAdmin → provisioning de su tenant DB →
 * verifica aislamiento y rechazo de slug duplicado.
 */

const SUBDOMAIN = `provtest${Date.now()}`;
const SUPER_EMAIL = `sa-${Date.now()}@test.com`;

function buildTenantUrl(dbName: string): string {
    const platformUrl = resolvePlatformUrl();
    const creds = platformUrl.match(/postgresql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\//);
    if (!creds) throw new Error('Invalid PLATFORM_DATABASE_URL');
    return `postgresql://${creds[1]}:${creds[2]}@${creds[3]}:${creds[4]}/${dbName}`;
}

describe('Flujo 5 — Aprovisionamiento de instituto', () => {
    let server: FastifyInstance;
    let prisma: PrismaClient;
    let superAdminToken: string;
    let newInstituteId: string | null = null;
    let provisionedDbName: string | null = null;

    beforeAll(async () => {
        server = await createTestServer();
        prisma = await createTestPrismaClient();

        // Sembrar SuperAdmin en platform DB y generar token
        const sa = await seedSuperAdmin(platformPrisma, SUPER_EMAIL, 'SuperAdmin123!');
        superAdminToken = generateSuperAdminTestToken(sa.id, SUPER_EMAIL);
    }, 120000);

    afterAll(async () => {
        await prisma.$disconnect();
        // Cerrar conexiones de tenant antes de dropear la DB provisional
        await disconnectAll();
        if (provisionedDbName) {
            await dropDatabaseIfExists(resolvePlatformUrl(), provisionedDbName);
        }
        // Limpiar los institutos provisionales de la platform DB para no dejar
        // filas huérfanas que rompan el cron de sync al arrancar el server.
        await platformPrisma.institute.deleteMany({
            where: { subdomain: SUBDOMAIN },
        }).catch(() => { /* ignorar si ya no existe */ });
        await server.close();
    }, 120000);

    it('1. crea un instituto nuevo desde SuperAdmin (provisioning completo)', async () => {
        const res = await request(server.server)
            .post('/api/superadmin/institutes')
            .set('Authorization', `Bearer ${superAdminToken}`)
            .send({
                name: 'Instituto Provisional',
                code: `CODE-${Date.now()}`,
                email: `admin-${Date.now()}@provtest.com`,
                subdomain: SUBDOMAIN,
                plan: 'BASIC',
                adminCI: `V-${Date.now()}`,
                adminName: 'Admin Provisional',
                adminEmail: `admin-${Date.now()}@provtest.com`,
                adminPassword: 'AdminPass123!',
            })
            .expect(201);

        expect(res.body.status).toBe('ACTIVE');
        expect(res.body.subdomain).toBe(SUBDOMAIN);
        // Documentado: el nombre de la DB deriva del SLUG (generateSlug(name)),
        // no del subdomain. Capturamos el real de la respuesta.
        expect(res.body.databaseName).toBeTruthy();
        newInstituteId = res.body.id;
        provisionedDbName = res.body.databaseName;
    }, 120000);

    it('2. la tenant DB se aprovisionó con esquema y usuario admin', async () => {
        expect(provisionedDbName).toBeTruthy();

        const tenantClient = new PrismaClient({
            datasources: { db: { url: buildTenantUrl(provisionedDbName!) } },
        });
        try {
            const usersCount = await tenantClient.user.count();
            expect(usersCount).toBeGreaterThanOrEqual(1); // admin sembrado por provisioning
        } finally {
            await tenantClient.$disconnect();
        }
    }, 120000);

    it('3. el instituto nuevo queda aislado: usuarios de otro instituto no pueden acceder', async () => {
        // Usuario del instituto A (test) con token válido
        const userA = await createTestUser(prisma, UserRole.ADMIN);
        const tokenA = generateTestToken(userA.user.id, UserRole.ADMIN, 'institute');

        // Con el contexto (slug) del instituto nuevo → 401 TENANT_MISMATCH
        const res = await request(server.server)
            .get('/api/users')
            .set('Authorization', `Bearer ${tokenA}`)
            .set('X-Institute-Slug', SUBDOMAIN)
            .expect(401);

        expect(res.body.code).toBe('TENANT_MISMATCH');
    });

    it('4. slug/subdominio duplicado se rechaza sin crear duplicado', async () => {
        const before = await platformPrisma.institute.count({
            where: { subdomain: SUBDOMAIN },
        });
        expect(before).toBe(1);

        const res = await request(server.server)
            .post('/api/superadmin/institutes')
            .set('Authorization', `Bearer ${superAdminToken}`)
            .send({
                name: 'Instituto Duplicado',
                code: `CODE-DUP-${Date.now()}`,
                email: `dup-${Date.now()}@provtest.com`,
                subdomain: SUBDOMAIN, // ya existe
                plan: 'BASIC',
                adminCI: `V-DUP-${Date.now()}`,
                adminName: 'Admin Dup',
                adminEmail: `dup-${Date.now()}@provtest.com`,
                adminPassword: 'AdminPass123!',
            })
            .expect(400);

        expect(res.body.error).toContain('subdomain');

        const after = await platformPrisma.institute.count({
            where: { subdomain: SUBDOMAIN },
        });
        expect(after).toBe(1); // no se creó duplicado
    });

    it('5. el nuevo admin puede loguearse en su tenant recién provisionado', async () => {
        expect(provisionedDbName).toBeTruthy();

        const tenantClient = new PrismaClient({
            datasources: { db: { url: buildTenantUrl(provisionedDbName!) } },
        });
        let adminEmail = '';
        try {
            const admin = await tenantClient.user.findFirst({
                where: { role: 'ADMIN' },
                select: { email: true },
            });
            adminEmail = admin?.email || '';
        } finally {
            await tenantClient.$disconnect();
        }

        expect(adminEmail).toBeTruthy();
        const login = await request(server.server)
            .post('/api/auth/login')
            .set('X-Institute-Slug', SUBDOMAIN)
            .send({ email: adminEmail, password: 'AdminPass123!' })
            .expect(200);

        expect(login.body.tokens).toHaveProperty('accessToken');
    }, 120000);
});
