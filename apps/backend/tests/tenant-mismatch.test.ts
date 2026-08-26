import { FastifyInstance } from 'fastify';
import request = require('supertest');
import { PrismaClient } from '@prisma/client';
import { UserRole } from '../src/utils/prisma-enums';
import {
    createTestServer,
    createTestPrismaClient,
    cleanTestDatabase,
    createTestUser,
    createTestUserWithPassword,
    generateTestToken,
} from './helpers';
import {
    parseDbUrl,
    resolveTenantUrl,
    buildDbUrl,
    ensureDatabase,
    runPrismaMigrate,
    runPrismaDbPush,
} from './helpers/tenant-db';

/**
 * TEST DE INTEGRACIÓN — VALIDACIÓN DEL CLAIM instituteId DEL JWT
 *
 * Escenario de intrusión: un usuario auténtico y válido del Instituto B
 * hace una request con el contexto (header/subdominio) del Instituto A.
 * El middleware identifyTenant debe rechazar con 401 TENANT_MISMATCH —
 * nunca 200, nunca datos del Instituto A.
 *
 * Instituto A = 'institute'      (slug 'test-institute')
 * Instituto B = 'institute-b'    (slug 'test-institute-b', DB propia de test)
 */

const TENANT_DB_B = 'tenant_test-load-5k-b';

describe('Tenant mismatch — claim instituteId del JWT', () => {
    let server: FastifyInstance;
    let prismaA: PrismaClient;
    let prismaB: PrismaClient;
    let userBId: string;
    let tokenB: string;

    beforeAll(async () => {
        server = await createTestServer();
        prismaA = await createTestPrismaClient();

        const tenantUrl = resolveTenantUrl();
        const bUrl = buildDbUrl(tenantUrl, TENANT_DB_B);

        // 1. Crear la tenant DB de B y aplicarle el esquema VIGENTE
        // (db push: la migración init fue editada después de aplicarse una vez
        // y migrate deploy no re-aplica por checksum)
        await ensureDatabase(tenantUrl, TENANT_DB_B);
        runPrismaDbPush(bUrl);
        prismaB = new PrismaClient({ datasources: { db: { url: bUrl } } });

        // 2. Sembrar Instituto B en la Platform DB (con su propia DB)
        const creds = parseDbUrl(resolveTenantUrl());
        const { platformPrisma } = await import('../src/config/database');
        await platformPrisma.institute.upsert({
            where: { id: 'institute-b' },
            update: {
                status: 'ACTIVE',
                databaseName: TENANT_DB_B,
                databaseHost: creds.host,
                databasePort: creds.port,
                databaseUser: creds.user,
                databasePassword: creds.password,
            },
            create: {
                id: 'institute-b',
                code: 'TEST_INST_B',
                slug: 'test-institute-b',
                subdomain: 'test-institute-b',
                name: 'Test Institute B',
                email: 'test-b@institute.com',
                environment: 'development',
                status: 'ACTIVE',
                databaseName: TENANT_DB_B,
                databaseHost: creds.host,
                databasePort: creds.port,
                databaseUser: creds.user,
                databasePassword: creds.password,
            },
        });

        // 3. Instituto B + usuario B en la tenant DB de B
        await prismaB.institute.upsert({
            where: { id: 'institute-b' },
            update: {},
            create: {
                id: 'institute-b',
                code: 'TEST_INST_B',
                slug: 'test-institute-b',
                name: 'Test Institute B',
                email: 'test-b@institute.com',
            },
        });
        const { user: userB } = await createTestUser(prismaB, UserRole.STUDENT, {
            instituteId: 'institute-b',
        });
        userBId = userB.id;
        tokenB = generateTestToken(userB.id, UserRole.STUDENT, 'institute-b');
    });

    afterAll(async () => {
        await prismaA.$disconnect();
        await prismaB.$disconnect();
        await server.close();
    });

    beforeEach(async () => {
        await cleanTestDatabase(prismaA);
        await prismaB.user.deleteMany({});
        await prismaB.refreshToken.deleteMany({}).catch(() => {});
        const { user: userB } = await createTestUser(prismaB, UserRole.STUDENT, {
            instituteId: 'institute-b',
        });
        userBId = userB.id;
        tokenB = generateTestToken(userB.id, UserRole.STUDENT, 'institute-b');
    });

    it('rechaza con 401 cuando el X-Institute-Slug pertenece al Instituto A', async () => {
        const res = await request(server.server)
            .get(`/api/students/${userBId}/dashboard`)
            .set('Authorization', `Bearer ${tokenB}`)
            .set('X-Institute-Slug', 'test-institute') // Instituto A
            .expect(401);

        expect(res.body.code).toBe('TENANT_MISMATCH');
    });

    it('rechaza con 401 cuando el X-Institute-ID pertenece al Instituto A', async () => {
        const res = await request(server.server)
            .get(`/api/students/${userBId}/dashboard`)
            .set('Authorization', `Bearer ${tokenB}`)
            .set('X-Institute-ID', 'institute') // Instituto A
            .expect(401);

        expect(res.body.code).toBe('TENANT_MISMATCH');
    });

    it('rechaza con 401 cuando el subdominio pertenece al Instituto A', async () => {
        const originalBaseDomain = process.env.BASE_DOMAIN;
        try {
            process.env.BASE_DOMAIN = 'localhost';
            const res = await request(server.server)
                .get(`/api/students/${userBId}/dashboard`)
                .set('Authorization', `Bearer ${tokenB}`)
                .set('Host', 'test-institute.localhost') // subdominio del Instituto A
                .expect(401);

            expect(res.body.code).toBe('TENANT_MISMATCH');
        } finally {
            if (originalBaseDomain === undefined) delete process.env.BASE_DOMAIN;
            else process.env.BASE_DOMAIN = originalBaseDomain;
        }
    });

    it('permite el acceso cuando el contexto coincide con el Instituto B (control positivo)', async () => {
        const res = await request(server.server)
            .get(`/api/students/${userBId}/dashboard`)
            .set('Authorization', `Bearer ${tokenB}`)
            .set('X-Institute-Slug', 'test-institute-b') // Instituto B
            .expect(200);

        expect(res.body).toHaveProperty('student');
    });

    it('permite el acceso sin contexto explícito (el JWT resuelve al Instituto B)', async () => {
        const res = await request(server.server)
            .get(`/api/students/${userBId}/dashboard`)
            .set('Authorization', `Bearer ${tokenB}`)
            .expect(200);

        expect(res.body).toHaveProperty('student');
    });

    it('GET /api/auth/sessions con el contexto del Instituto A → 401 TENANT_MISMATCH', async () => {
        const res = await request(server.server)
            .get('/api/auth/sessions')
            .set('Authorization', `Bearer ${tokenB}`)
            .set('X-Institute-Slug', 'test-institute') // Instituto A
            .expect(401);

        expect(res.body.code).toBe('TENANT_MISMATCH');
    });

    it('GET /api/auth/sessions en el Instituto B devuelve SOLO sesiones de B (nunca las de A)', async () => {
        // En el Instituto A existe un usuario con sesiones REALES recién creadas
        const userA = await createTestUserWithPassword(prismaA, UserRole.STUDENT, 'Pass1234!');
        const userALogin = await request(server.server)
            .post('/api/auth/login')
            .set('X-Institute-Slug', 'test-institute')
            .send({ email: userA.user.email, password: 'Pass1234!' })
            .expect(200);
        expect(userALogin.body.tokens.accessToken).toBeTruthy();

        // El control positivo: con el contexto del Instituto A, su lista SÍ ve esa sesión
        const resA = await request(server.server)
            .get('/api/auth/sessions')
            .set('Authorization', `Bearer ${userALogin.body.tokens.accessToken}`)
            .set('X-Institute-Slug', 'test-institute')
            .expect(200);
        expect(resA.body.sessions.length).toBeGreaterThanOrEqual(1);

        // Con el token de B y el contexto de B, NO se ven las sesiones de A
        // (cada tenant tiene su propia DB: el listado de B es vacío de A)
        const res = await request(server.server)
            .get('/api/auth/sessions')
            .set('Authorization', `Bearer ${tokenB}`)
            .set('X-Institute-Slug', 'test-institute-b')
            .expect(200);

        const sessions: any[] = res.body.sessions || [];
        const userAIds = new Set(sessions.map(s => (s as any).user_agent ?? null));
        expect(sessions.length).toBe(0); // B no tiene sesiones; ninguna de A se filtra
    });
});
