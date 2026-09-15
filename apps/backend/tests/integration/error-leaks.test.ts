import Fastify, { FastifyInstance } from 'fastify';
import request = require('supertest');
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { platformPrisma } from '../../src/config/database';
import { errorHandler } from '../../src/middleware/error.middleware';
import {
    createTestServer,
    seedSuperAdmin,
    generateSuperAdminTestToken,
} from '../helpers';

/**
 * Fuga de detalles internos en respuestas de error
 * (superadmin-institutes.controller.ts + monitoring.controller.ts)
 *
 * Estos dos controllers atrapaban sus propios errores y respondían
 * `500 { error: error.message }`, saltándose el handler central de
 * `error.middleware.ts`. Efectos: (a) un duplicado de Prisma (P2002) salía
 * como 500 en vez del 409 controlado, y (b) el mensaje interno del error
 * (que incluye rutas absolutas del servidor y líneas del código fuente)
 * llegaba al cliente.
 *
 * Causa raíz adicional: el handler central clasificaba con `instanceof`, pero
 * la Platform DB usa un cliente generado aparte (`src/generated/platform-client`)
 * con su propio runtime, así que NINGÚN error de plataforma se reconocía como
 * error de Prisma y todos caían en el 500 genérico.
 *
 * Estos tests fijan el contrato: los errores suben al handler central y
 * NINGUNA respuesta de error expone stack trace ni rutas del servidor.
 */

const SUFFIX = Date.now();
const SUB_A = `leaktest-a-${SUFFIX}`;
const SUB_B = `leaktest-b-${SUFFIX}`;
const SUPER_EMAIL = `sa-leak-${SUFFIX}@test.com`;

/** Patrones que jamás deben aparecer en un body de error. */
function assertNoInternalLeak(body: unknown) {
    const raw = JSON.stringify(body ?? {});

    // Stack trace: "at Function.name (C:\...\file.ts:12:34)" o "    at async ..."
    expect(raw).not.toMatch(/\bat\s+[\w$.<>\[\]]+\s*\(/);
    // Rutas absolutas del servidor (Windows y POSIX) y estructura interna del repo
    expect(raw).not.toMatch(/[A-Za-z]:\\\\/);
    expect(raw).not.toMatch(/\/(home|Users|var|usr)\//);
    expect(raw).not.toMatch(/node_modules/);
    expect(raw).not.toMatch(/apps[\\/]backend/);
    // Detalle crudo del motor de Prisma
    expect(raw).not.toMatch(/Invalid `prisma\./);
    expect(raw).not.toMatch(/PrismaClient(KnownRequest|Validation|Initialization)Error/);
}

function show(label: string, status: number, body: unknown) {
    // Evidencia real del body, no solo el status code.
    console.log(`\n[EVIDENCIA] ${label}\n  status: ${status}\n  body: ${JSON.stringify(body)}`);
}

describe('Fuga de errores internos hacia el cliente', () => {
    let server: FastifyInstance;
    let superAdminToken: string;
    let instituteBId: string;

    beforeAll(async () => {
        server = await createTestServer();

        const sa = await seedSuperAdmin(platformPrisma, SUPER_EMAIL, 'SuperAdmin123!');
        superAdminToken = generateSuperAdminTestToken(sa.id, SUPER_EMAIL);

        // Dos institutos en Platform DB. No se aprovisionan tenant DBs: solo se
        // necesitan las filas para provocar la violación de restricción única.
        await platformPrisma.institute.create({
            data: {
                name: `Leak Test A ${SUFFIX}`,
                code: `LEAK-A-${SUFFIX}`,
                slug: SUB_A,
                subdomain: SUB_A,
                email: `a-${SUFFIX}@leaktest.com`,
                environment: 'development',
                status: 'PENDING',
            },
        });
        const b = await platformPrisma.institute.create({
            data: {
                name: `Leak Test B ${SUFFIX}`,
                code: `LEAK-B-${SUFFIX}`,
                slug: SUB_B,
                subdomain: SUB_B,
                email: `b-${SUFFIX}@leaktest.com`,
                environment: 'development',
                status: 'PENDING',
            },
        });
        instituteBId = b.id;
    }, 120000);

    afterAll(async () => {
        await platformPrisma.institute.deleteMany({
            where: { subdomain: { in: [SUB_A, SUB_B] } },
        }).catch(() => { /* ya no existe */ });
        await platformPrisma.superAdmin.deleteMany({
            where: { email: SUPER_EMAIL },
        }).catch(() => { /* ya no existe */ });
        await server.close();
    }, 120000);

    it('TEST 1a — POST institutos con subdomain ya existente: 400 controlado sin fuga', async () => {
        const res = await request(server.server)
            .post('/api/superadmin/institutes')
            .set('Authorization', `Bearer ${superAdminToken}`)
            .send({
                name: `Duplicado ${SUFFIX}`,
                code: `LEAK-DUP-${SUFFIX}`,
                email: `dup-${SUFFIX}@leaktest.com`,
                subdomain: SUB_A, // ya existe
                plan: 'BASIC',
                adminCI: `V-${SUFFIX}`,
                adminName: 'Admin Dup',
                adminEmail: `dup-${SUFFIX}@leaktest.com`,
                adminPassword: 'AdminPass123!',
            });

        show('1a POST /api/superadmin/institutes (subdomain duplicado)', res.status, res.body);

        // Lo atrapa la pre-verificación del controller, antes de tocar Prisma.
        expect(res.status).toBe(400);
        expect(res.body.error).toContain('subdomain');
        assertNoInternalLeak(res.body);
    }, 60000);

    it('TEST 1b — PATCH con una clave no permitida: 400 de validación, sin fuga', async () => {
        // Antes, `update` pasaba el body directo a Prisma y esto provocaba un
        // P2002 (que salía como 500 con la ruta del servidor en el body).
        // Ahora el esquema estricto lo corta antes de tocar la base de datos.
        const res = await request(server.server)
            .patch(`/api/superadmin/institutes/${instituteBId}`)
            .set('Authorization', `Bearer ${superAdminToken}`)
            .send({ subdomain: SUB_A });

        show('1b PATCH /api/superadmin/institutes/:id (clave no permitida)', res.status, res.body);

        expect(res.status).toBe(400);
        expect(res.body.code).toBe('VALIDATION_ERROR');
        assertNoInternalLeak(res.body);

        // El valor no se tocó
        const stillB = await platformPrisma.institute.findUnique({
            where: { id: instituteBId },
            select: { subdomain: true },
        });
        expect(stillB?.subdomain).toBe(SUB_B);
    }, 60000);

    it('TEST 1b-bis — un P2002 REAL de la Platform DB se traduce a 409 controlado', async () => {
        // La ruta HTTP hacia este error quedó cerrada por la validación estricta
        // del test anterior, así que el P2002 se provoca contra la Platform DB
        // real y se hace pasar ESE MISMO objeto de error por el handler central,
        // montado igual que en `server.ts`.
        let realError: any = null;
        try {
            await platformPrisma.institute.update({
                where: { id: instituteBId },
                data: { subdomain: SUB_A },
            });
        } catch (e) {
            realError = e;
        }
        expect(realError).not.toBeNull();
        expect(realError.name).toBe('PrismaClientKnownRequestError');
        expect(realError.code).toBe('P2002');

        // REGRESIÓN CUBIERTA: la Platform DB usa un cliente generado aparte con su
        // propio runtime, así que sus errores NO son instancias de las clases de
        // `@prisma/client/runtime/library`. Clasificar con `instanceof` mandaba
        // todos estos errores al 500 genérico.
        expect(realError instanceof PrismaClientKnownRequestError).toBe(false);

        const app = Fastify();
        app.setErrorHandler(errorHandler as any);
        app.get('/boom', async () => { throw realError; });
        await app.ready();
        try {
            const res = await request(app.server).get('/boom');

            show('1b-bis P2002 real de la Platform DB por el handler central', res.status, res.body);

            expect(res.status).toBe(409);
            expect(res.body.code).toBe('DUPLICATE_ENTRY');
            expect(res.body.field).toEqual(['subdomain']);
            assertNoInternalLeak(res.body);
        } finally {
            await app.close();
        }
    }, 60000);

    it('TEST 1c — GET instituto inexistente: 404 controlado sin fuga', async () => {
        const res = await request(server.server)
            .get('/api/superadmin/institutes/no-existe-este-id')
            .set('Authorization', `Bearer ${superAdminToken}`);

        show('1c GET /api/superadmin/institutes/:id (inexistente)', res.status, res.body);

        expect(res.status).toBe(404);
        assertNoInternalLeak(res.body);
    }, 60000);

    it('TEST 2 — monitoring: resolver una alerta con ID inexistente da error controlado, no 500 con error.message crudo', async () => {
        const res = await request(server.server)
            .patch('/api/superadmin/monitoring/alerts/id-que-no-existe/resolve')
            .set('Authorization', `Bearer ${superAdminToken}`)
            .send();

        show('2 PATCH /api/superadmin/monitoring/alerts/:id/resolve (ID inválido)', res.status, res.body);

        // P2025 (registro no encontrado) → 404 del handler central
        expect(res.status).toBe(404);
        expect(res.body.code).toBe('RECORD_NOT_FOUND');
        assertNoInternalLeak(res.body);
    }, 60000);

    it('TEST 3 — email opcional: guardar un instituto con email vacío da 200 y lo persiste como NULL', async () => {
        // Réplica exacta de lo que manda el formulario de SuperAdmin: los cuatro
        // campos del bloque "Información General", con '' en los vacíos
        // (apps/web/src/app/superadmin/institutes/[id]/page.tsx → JSON.stringify(formData)).
        const res = await request(server.server)
            .patch(`/api/superadmin/institutes/${instituteBId}`)
            .set('Authorization', `Bearer ${superAdminToken}`)
            .send({ name: `Leak Test B ${SUFFIX}`, email: '', phone: '', address: '' });

        show('3 PATCH con email vacío (lo que envía el formulario)', res.status, res.body);

        expect(res.status).toBe(200);
        assertNoInternalLeak(res.body);

        const saved = await platformPrisma.institute.findUnique({
            where: { id: instituteBId },
            select: { email: true },
        });
        expect(saved?.email).toBeNull();
    }, 60000);

    it('TEST 3b — email opcional: un email con formato inválido se sigue rechazando', async () => {
        const res = await request(server.server)
            .patch(`/api/superadmin/institutes/${instituteBId}`)
            .set('Authorization', `Bearer ${superAdminToken}`)
            .send({ email: 'no-es-un-email' });

        show('3b PATCH con email mal formado', res.status, res.body);

        expect(res.status).toBe(400);
        expect(res.body.code).toBe('VALIDATION_ERROR');
        expect(JSON.stringify(res.body)).toContain('Email inválido');
        assertNoInternalLeak(res.body);
    }, 60000);

    it('TEST 3c — email opcional: omitir la clave NO borra el email existente', async () => {
        // Regresión: si `.optional()` se aplicara antes del transform, una clave
        // ausente llegaría a Prisma como `email: null` y borraría el dato.
        await platformPrisma.institute.update({
            where: { id: instituteBId },
            data: { email: `restaurado-${SUFFIX}@leaktest.com` },
        });

        const res = await request(server.server)
            .patch(`/api/superadmin/institutes/${instituteBId}`)
            .set('Authorization', `Bearer ${superAdminToken}`)
            .send({ phone: '0212-5551234' });

        show('3c PATCH sin la clave email', res.status, res.body);

        expect(res.status).toBe(200);
        const saved = await platformPrisma.institute.findUnique({
            where: { id: instituteBId },
            select: { email: true, phone: true },
        });
        expect(saved?.email).toBe(`restaurado-${SUFFIX}@leaktest.com`);
        expect(saved?.phone).toBe('0212-5551234');
    }, 60000);

    it('TEST 2b — monitoring exige SuperAdmin: sin token no se llega al controller', async () => {
        const res = await request(server.server)
            .patch('/api/superadmin/monitoring/alerts/id-que-no-existe/resolve')
            .send();

        show('2b PATCH /api/superadmin/monitoring/... (sin token)', res.status, res.body);

        expect(res.status).toBe(401);
        assertNoInternalLeak(res.body);
    }, 60000);
});
