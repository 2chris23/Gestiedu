import { FastifyInstance } from 'fastify';
import request = require('supertest');
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import { UserRole } from '../../src/utils/prisma-enums';
import {
    createTestServer,
    createTestPrismaClient,
    cleanTestDatabase,
    createTestUserWithPassword,
} from '../helpers';

/**
 * FLUJO 1 — CICLO DE VIDA DE AUTENTICACIÓN
 *
 * Cubre: login válido, credenciales erróneas sin revelar existencia de email,
 * refresh (sin rotación), refresh inválido, logout multi-dispositivo,
 * logoutAllSessions y cambio de contraseña revocando todas las sesiones.
 *
 * COMPORTAMIENTO DOCUMENTADO:
 * - Login con credenciales inválidas devuelve 400 INVALID_CREDENTIALS (no 401),
 *   pero el mensaje es idéntico para email inexistente y contraseña incorrecta.
 * - El refresh token NO rota: se puede reutilizar hasta su expiración.
 * - El access token NO se revoca en logout/change-password (JWT stateless):
 *   sigue siendo válido hasta su expiración. Solo se revocan los refresh tokens.
 */

const INSTITUTE_SLUG = 'test-institute';
const PASSWORD = 'Password123!';
const NEW_PASSWORD = 'NuevaPass123!';

describe('Flujo 1 — Ciclo de vida de autenticación', () => {
    let server: FastifyInstance;
    let prisma: PrismaClient;
    let user: { id: string; email: string };

    const login = (email: string, password: string) =>
        request(server.server)
            .post('/api/auth/login')
            .set('X-Institute-Slug', INSTITUTE_SLUG)
            .send({ email, password });

    const refresh = (refreshToken: string) =>
        request(server.server)
            .post('/api/auth/refresh-token')
            .set('X-Institute-Slug', INSTITUTE_SLUG)
            .send({ refreshToken });

    beforeAll(async () => {
        server = await createTestServer();
        prisma = await createTestPrismaClient();
    });

    afterAll(async () => {
        await prisma.$disconnect();
        await server.close();
    });

    beforeEach(async () => {
        await cleanTestDatabase(prisma);
        const created = await createTestUserWithPassword(prisma, UserRole.STUDENT, PASSWORD);
        user = { id: created.user.id, email: created.user.email };
    });

    it('1. login válido devuelve access+refresh y el access decodifica con el instituteId correcto', async () => {
        const res = await login(user.email, PASSWORD).expect(200);

        expect(res.body.tokens).toHaveProperty('accessToken');
        expect(res.body.tokens).toHaveProperty('refreshToken');
        expect(res.body.user.email).toBe(user.email);

        const decoded = jwt.decode(res.body.tokens.accessToken) as any;
        expect(decoded.userId).toBe(user.id);
        expect(decoded.instituteId).toBe('institute'); // instituto resuelto del tenant de test
    });

    it('2. contraseña incorrecta y email inexistente devuelven el MISMO error (no revela existencia)', async () => {
        const wrongPassword = await login(user.email, 'WrongPassword123!');
        const unknownEmail = await login(`noexiste-${Date.now()}@test.com`, PASSWORD);

        // Ambos devuelven el mismo status
        expect(wrongPassword.status).toBe(400);
        expect(unknownEmail.status).toBe(400);

        // Mismo código y mensaje — no filtra si el email existe
        expect(wrongPassword.body.code).toBe(unknownEmail.body.code);
        expect(wrongPassword.body.error).toBe(unknownEmail.body.error);
    });

    it('3. login de usuario del tenant en contexto de otro instituto → 401 (referencia Fase 1)', async () => {
        // Cubierto exhaustivamente en tests/tenant-mismatch.test.ts.
        // Aquí solo verificamos el caso básico de mismatch por slug.
        const res = await request(server.server)
            .post('/api/auth/login')
            .set('X-Institute-Slug', INSTITUTE_SLUG)
            .send({ email: user.email, password: PASSWORD })
            .expect(200);

        const token = res.body.tokens.accessToken;
        const crossTenant = await request(server.server)
            .get('/api/auth/profile')
            .set('Authorization', `Bearer ${token}`)
            .set('X-Institute-Slug', 'instituto-educativo-demo')
            .expect(401);

        expect(crossTenant.body.code).toBe('TENANT_MISMATCH');
    });

    it('4. refresh válido genera nuevo access; el refresh NO rota (reutilizable)', async () => {
        const loginRes = await login(user.email, PASSWORD).expect(200);
        const refreshToken = loginRes.body.tokens.refreshToken;

        const res1 = await refresh(refreshToken).expect(200);
        expect(res1.body).toHaveProperty('accessToken');
        expect(res1.body).toHaveProperty('expiresIn');

        // El token emitido decodifica al usuario correcto
        const decoded = jwt.decode(res1.body.accessToken) as any;
        expect(decoded.userId).toBe(user.id);
        // Nota: dos tokens firmados en el mismo segundo con el mismo payload son
        // idénticos (iat en segundos) — no comparamos por diferencia.

        // Documentado: no hay rotación — el mismo refresh token sigue funcionando
        const res2 = await refresh(refreshToken).expect(200);
        expect(res2.body).toHaveProperty('accessToken');
    });

    it('5. refresh con token basura → 401', async () => {
        await refresh('token-invalido-que-no-existe').expect(401);
    });

    it('6. logout de un dispositivo NO invalida las demás sesiones; logoutAll sí', async () => {
        const d1 = await login(user.email, PASSWORD).expect(200);
        const d2 = await login(user.email, PASSWORD).expect(200);

        // Cerrar sesión del dispositivo 1 (con su refresh token)
        await request(server.server)
            .post('/api/auth/logout')
            .set('Authorization', `Bearer ${d1.body.tokens.accessToken}`)
            .set('X-Institute-Slug', INSTITUTE_SLUG)
            .send({ refreshToken: d1.body.tokens.refreshToken })
            .expect(200);

        // Dispositivo 1: refresh revocado
        await refresh(d1.body.tokens.refreshToken).expect(401);
        // Dispositivo 2: sigue vivo
        await refresh(d2.body.tokens.refreshToken).expect(200);

        // Logout sin refreshToken → cierra TODAS las sesiones
        await request(server.server)
            .post('/api/auth/logout')
            .set('Authorization', `Bearer ${d2.body.tokens.accessToken}`)
            .set('X-Institute-Slug', INSTITUTE_SLUG)
            .send({})
            .expect(200);

        await refresh(d2.body.tokens.refreshToken).expect(401);

        // Documentado: el access token NO se revoca (JWT stateless)
        const profile = await request(server.server)
            .get('/api/auth/profile')
            .set('Authorization', `Bearer ${d2.body.tokens.accessToken}`)
            .set('X-Institute-Slug', INSTITUTE_SLUG)
            .expect(200);
        expect(profile.body.user.id).toBe(user.id);
    });

    it('7. cambio de contraseña revoca TODAS las sesiones activas (2+ dispositivos)', async () => {
        const d1 = await login(user.email, PASSWORD).expect(200);
        const d2 = await login(user.email, PASSWORD).expect(200);

        await request(server.server)
            .post('/api/auth/change-password')
            .set('Authorization', `Bearer ${d1.body.tokens.accessToken}`)
            .set('X-Institute-Slug', INSTITUTE_SLUG)
            .send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD })
            .expect(200);

        // Ambos refresh tokens quedan invalidados
        await refresh(d1.body.tokens.refreshToken).expect(401);
        await refresh(d2.body.tokens.refreshToken).expect(401);

        // La contraseña vieja ya no funciona
        await login(user.email, PASSWORD).expect(400);
        // La nueva sí
        await login(user.email, NEW_PASSWORD).expect(200);
    });
});
