import { FastifyInstance } from 'fastify';
import request = require('supertest');
import { PrismaClient } from '@prisma/client';
import { UserRole } from '../../src/utils/prisma-enums';
import { platformPrisma } from '../../src/config/database';
import {
    INSTITUTE_SUPERADMIN_SELECT,
    INSTITUTE_TENANT_SELECT,
} from '../../src/utils/institute-fields';
import {
    createTestServer,
    createTestPrismaClient,
    createTestUser,
    generateTestToken,
    seedSuperAdmin,
    generateSuperAdminTestToken,
} from '../helpers';
import { parseDbUrl } from '../helpers/tenant-db';

/**
 * FUGA DE CREDENCIALES DE BD EN RESPUESTAS HTTP
 *
 * El modelo `Institute` guarda en la misma fila las credenciales de conexión al
 * tenant (`databaseHost` / `databasePort` / `databaseUser` / `databasePassword`).
 * Varios endpoints respondían con la fila completa —`reply.send(institute)`,
 * `{ ...updatedInstitute }`, `data: config`— y entregaban la contraseña de la
 * base de datos en texto plano al cliente.
 *
 * Estos tests fijan el contrato: NINGÚN endpoint que devuelva un instituto
 * incluye credenciales de conexión, y los campos legítimos siguen viajando.
 *
 * Los institutos de prueba se siembran con credenciales REALES (no null); si
 * fueran null el test pasaría por vacío y no probaría nada.
 */

const SUFFIX = Date.now();
const SUB = `credleak-${SUFFIX}`;
const SUPER_EMAIL = `sa-cred-${SUFFIX}@test.com`;

/** Valores centinela: si aparecen en un body, la fuga sigue viva. */
const SECRET_HOST = `db-secreto-${SUFFIX}.interno`;
const SECRET_USER = `usuario_secreto_${SUFFIX}`;
const SECRET_PASSWORD = `ClaveSuperSecreta-${SUFFIX}`;
const SECRET_PORT = 65432;

const CREDENTIAL_KEYS = ['databaseHost', 'databasePort', 'databaseUser', 'databasePassword'];

/** Nombres de las claves que aparecen en el JSON, para un fallo legible. */
function leakedKeys(raw: string, keys: string[]): string[] {
    return keys.filter((k) => raw.includes(`"${k}"`));
}

/**
 * Comprueba el body REAL: ni las claves ni los valores centinela, a cualquier
 * profundidad del JSON.
 */
function assertNoCredentials(body: unknown) {
    const raw = JSON.stringify(body ?? {});

    expect(leakedKeys(raw, CREDENTIAL_KEYS)).toEqual([]);
    expect(raw).not.toContain(SECRET_HOST);
    expect(raw).not.toContain(SECRET_USER);
    expect(raw).not.toContain(SECRET_PASSWORD);
}

function show(label: string, status: number, body: unknown) {
    // Evidencia real del body, no solo el status code.
    console.log(`\n[EVIDENCIA] ${label}\n  status: ${status}\n  body: ${JSON.stringify(body)}`);
}

describe('Fuga de credenciales de BD — endpoints de SuperAdmin', () => {
    let server: FastifyInstance;
    let superAdminToken: string;
    let instituteId: string;

    beforeAll(async () => {
        server = await createTestServer();
        const sa = await seedSuperAdmin(platformPrisma, SUPER_EMAIL, 'SuperAdmin123!');
        superAdminToken = generateSuperAdminTestToken(sa.id, SUPER_EMAIL);

        // Instituto "aprovisionado": credenciales reales, no null.
        const inst = await platformPrisma.institute.create({
            data: {
                name: `Cred Leak ${SUFFIX}`,
                code: `CRED-${SUFFIX}`,
                slug: SUB,
                subdomain: SUB,
                email: `cred-${SUFFIX}@leaktest.com`,
                environment: 'development',
                status: 'ACTIVE',
                databaseName: `tenant_credleak_${SUFFIX}`,
                databaseHost: SECRET_HOST,
                databasePort: SECRET_PORT,
                databaseUser: SECRET_USER,
                databasePassword: SECRET_PASSWORD,
            },
        });
        instituteId = inst.id;
    }, 120000);

    afterAll(async () => {
        await platformPrisma.institute
            .deleteMany({ where: { subdomain: SUB } })
            .catch(() => { /* ya no existe */ });
        await platformPrisma.superAdmin
            .deleteMany({ where: { email: SUPER_EMAIL } })
            .catch(() => { /* ya no existe */ });
        await server.close();
    }, 120000);

    it('la fila SÍ tiene credenciales reales en BD (el test no pasa por vacío)', async () => {
        const row = await platformPrisma.institute.findUnique({
            where: { id: instituteId },
            select: {
                databaseHost: true,
                databaseUser: true,
                databasePassword: true,
                databasePort: true,
            },
        });
        expect(row?.databaseHost).toBe(SECRET_HOST);
        expect(row?.databaseUser).toBe(SECRET_USER);
        expect(row?.databasePassword).toBe(SECRET_PASSWORD);
        expect(row?.databasePort).toBe(SECRET_PORT);
    }, 60000);

    it('GET /api/superadmin/institutes (list) no expone credenciales', async () => {
        const res = await request(server.server)
            .get(`/api/superadmin/institutes?search=CRED-${SUFFIX}`)
            .set('Authorization', `Bearer ${superAdminToken}`);

        show('GET /api/superadmin/institutes', res.status, res.body);
        expect(res.status).toBe(200);
        assertNoCredentials(res.body);

        const found = res.body.institutes.find((i: any) => i.id === instituteId);
        expect(found).toBeDefined();
        expect(found.name).toBe(`Cred Leak ${SUFFIX}`);
        expect(found.status).toBe('ACTIVE');
    }, 60000);

    it('GET /api/superadmin/institutes/:id no expone credenciales pero sí los datos del panel', async () => {
        const res = await request(server.server)
            .get(`/api/superadmin/institutes/${instituteId}`)
            .set('Authorization', `Bearer ${superAdminToken}`);

        show('GET /api/superadmin/institutes/:id', res.status, res.body);
        expect(res.status).toBe(200);
        assertNoCredentials(res.body);

        // No pasarse de restrictivo: el panel de SuperAdmin usa todo esto.
        expect(res.body.name).toBe(`Cred Leak ${SUFFIX}`);
        expect(res.body.code).toBe(`CRED-${SUFFIX}`);
        expect(res.body.email).toBe(`cred-${SUFFIX}@leaktest.com`);
        expect(res.body.subdomain).toBe(SUB);
        expect(res.body.status).toBe('ACTIVE');
        expect(res.body.plan).toBe('BASIC');
        expect(res.body.maxStudents).toBe(2000);
        // `databaseName` se conserva: el panel lo muestra y por sí solo no
        // permite conectarse a nada sin host, usuario ni contraseña.
        expect(res.body.databaseName).toBe(`tenant_credleak_${SUFFIX}`);
        expect(res.body._count).toBeDefined();
    }, 60000);

    it('PATCH /api/superadmin/institutes/:id no expone credenciales y sí devuelve lo actualizado', async () => {
        const res = await request(server.server)
            .patch(`/api/superadmin/institutes/${instituteId}`)
            .set('Authorization', `Bearer ${superAdminToken}`)
            .send({ name: `Cred Leak renombrado ${SUFFIX}`, status: 'SUSPENDED' });

        show('PATCH /api/superadmin/institutes/:id', res.status, res.body);
        expect(res.status).toBe(200);
        assertNoCredentials(res.body);

        expect(res.body.name).toBe(`Cred Leak renombrado ${SUFFIX}`);
        expect(res.body.status).toBe('SUSPENDED');
        expect(res.body.subdomain).toBe(SUB);
    }, 60000);

    it('PUT /api/superadmin/institutes/:id/plan no expone credenciales', async () => {
        const res = await request(server.server)
            .put(`/api/superadmin/institutes/${instituteId}/plan`)
            .set('Authorization', `Bearer ${superAdminToken}`)
            .send({ plan: 'PREMIUM' });

        show('PUT /api/superadmin/institutes/:id/plan', res.status, res.body);
        expect(res.status).toBe(200);
        assertNoCredentials(res.body);
        expect(res.body.institute.plan).toBe('PREMIUM');
    }, 60000);

    it('el select que usan POST (create) y reprovision no devuelve credenciales', async () => {
        // El 201 de `create` responde `{ ...updatedInstitute }` y `reprovision`
        // responde `updated`; ambos salen de un update con ESTE select. Aquí se
        // ejerce contra la fila que sí tiene credenciales, sin depender de que
        // el provisioning real funcione en este entorno.
        const projected = await platformPrisma.institute.findUnique({
            where: { id: instituteId },
            select: INSTITUTE_SUPERADMIN_SELECT,
        });

        show('select de create / reprovision', 200, projected);
        assertNoCredentials(projected);
        expect(projected?.name).toBe(`Cred Leak renombrado ${SUFFIX}`);
        expect(projected?.databaseName).toBe(`tenant_credleak_${SUFFIX}`);
    }, 60000);
});

describe('Fuga de credenciales de BD — endpoints del tenant (/api/institutes)', () => {
    let server: FastifyInstance;
    let tenantPrisma: PrismaClient;
    let adminToken: string;
    let studentToken: string;
    /** Credenciales originales del instituto de test, para restaurarlas. */
    let original: Record<string, unknown> | null = null;

    beforeAll(async () => {
        server = await createTestServer();
        tenantPrisma = await createTestPrismaClient();

        const admin = await createTestUser(tenantPrisma, UserRole.ADMIN);
        adminToken = generateTestToken(admin.user.id, UserRole.ADMIN, 'institute');
        const student = await createTestUser(tenantPrisma, UserRole.STUDENT);
        studentToken = generateTestToken(student.user.id, UserRole.STUDENT, 'institute');

        // También se guarda `name` porque el test del PUT lo modifica; si no se
        // restaura, el instituto de test queda renombrado para las demás suites.
        original = await platformPrisma.institute.findUnique({
            where: { id: 'institute' },
            select: {
                name: true,
                databaseName: true,
                databaseHost: true,
                databasePort: true,
                databaseUser: true,
                databasePassword: true,
            },
        });

        // El instituto de test se apunta a la MISMA base que ya usan los tests,
        // con credenciales reales y no nulas: así el middleware sigue conectando
        // y a la vez hay algo real que filtrar.
        const url = parseDbUrl(process.env.DATABASE_URL as string);
        await platformPrisma.institute.update({
            where: { id: 'institute' },
            data: {
                databaseName: url.db,
                databaseHost: url.host,
                databasePort: url.port,
                databaseUser: url.user,
                databasePassword: url.password,
            },
        });
    }, 120000);

    afterAll(async () => {
        if (original) {
            await platformPrisma.institute
                .update({ where: { id: 'institute' }, data: original })
                .catch(() => { /* el instituto ya no existe */ });
        }
        await tenantPrisma.$disconnect();
        await server.close();
    }, 120000);

    /** Aquí los centinelas son las credenciales reales de la BD de test. */
    function assertNoRealCredentials(body: unknown) {
        const raw = JSON.stringify(body ?? {});
        expect(leakedKeys(raw, [...CREDENTIAL_KEYS, 'databaseName'])).toEqual([]);

        const url = parseDbUrl(process.env.DATABASE_URL as string);
        expect(raw).not.toContain(url.password);
        expect(raw).not.toContain(url.user);
    }

    it('GET /api/institutes/current/info (basta con estar autenticado) no expone credenciales', async () => {
        // El caso más grave: este endpoint solo pide `authenticate`, así que un
        // STUDENT recibía la contraseña de la BD de su propio liceo.
        const res = await request(server.server)
            .get('/api/institutes/current/info')
            .set('Authorization', `Bearer ${studentToken}`);

        show('GET /api/institutes/current/info (token de STUDENT)', res.status, res.body);
        expect(res.status).toBe(200);
        assertNoRealCredentials(res.body);

        expect(res.body.success).toBe(true);
        expect(res.body.data.id).toBe('institute');
        expect(res.body.data.name).toBeTruthy();
    }, 60000);

    it('GET /api/institutes/current/config/full no expone credenciales', async () => {
        const res = await request(server.server)
            .get('/api/institutes/current/config/full')
            .set('Authorization', `Bearer ${adminToken}`);

        show('GET /api/institutes/current/config/full', res.status, res.body);
        expect(res.status).toBe(200);
        assertNoRealCredentials(res.body);
        expect(res.body.data.slug).toBeTruthy();
    }, 60000);

    it('GET /api/institutes/:id/config no expone credenciales', async () => {
        // La ruta exige un CUID en `:id` (`validateCUID`), pero el handler
        // resuelve el instituto por `request.user.instituteId` e IGNORA el
        // parámetro — así que devuelve el instituto del admin autenticado.
        // Se manda un CUID sintáctico solo para pasar el validador.
        const res = await request(server.server)
            .get('/api/institutes/cxxxxxxxxxxxxxxxxxxxxxxxx/config')
            .set('Authorization', `Bearer ${adminToken}`);

        show('GET /api/institutes/:id/config', res.status, res.body);
        expect(res.status).toBe(200);
        assertNoRealCredentials(res.body);
        expect(res.body.data.id).toBe('institute');
    }, 60000);

    it('PUT /api/institutes/current/config no expone credenciales y sí aplica el cambio', async () => {
        const nuevoNombre = `Test Institute ${SUFFIX}`;
        const res = await request(server.server)
            .put('/api/institutes/current/config')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ name: nuevoNombre });

        show('PUT /api/institutes/current/config', res.status, res.body);
        expect(res.status).toBe(200);
        assertNoRealCredentials(res.body);
        expect(res.body.data.name).toBe(nuevoNombre);
    }, 60000);

    it('el select del tenant no incluye ningún campo de conexión', () => {
        for (const key of [...CREDENTIAL_KEYS, 'databaseName', 'adminId', 'notes']) {
            expect(INSTITUTE_TENANT_SELECT).not.toHaveProperty(key);
        }
        // Y sí lo que la app necesita para branding y límites de plan.
        for (const key of ['name', 'slug', 'logo', 'primaryColor', 'plan', 'maxStudents', 'academicConfig']) {
            expect(INSTITUTE_TENANT_SELECT).toHaveProperty(key);
        }
    });
});
