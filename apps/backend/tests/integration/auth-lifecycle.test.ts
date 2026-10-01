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

        // Ambos devuelven el mismo status (401: credenciales inválidas)
        expect(wrongPassword.status).toBe(401);
        expect(unknownEmail.status).toBe(401);

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
            // Un instituto DISTINTO al del token. Se usa la cabecera de id
            // porque no depende de que ese instituto exista en la base de
            // plataforma del entorno de pruebas: el middleware compara el
            // instituto pedido con el del token y corta si no coinciden.
            .set('X-Institute-ID', 'otro-instituto')
            .expect(401);

        expect(crossTenant.body.code).toBe('TENANT_MISMATCH');
    });

    /**
     * LA LLAVE DE VOLVER A ENTRAR SE CAMBIA CADA VEZ
     *
     * Antes la misma llave servía siempre: quien copiara una la tenía durante
     * días. Ahora cada renovación entrega una nueva y jubila la anterior.
     *
     * La vieja no se tira de golpe: sigue valiendo unos segundos porque dos
     * pestañas renuevan a la vez y mandan la misma. Lo que ya no se puede es
     * usarla pasada esa gracia (ver el caso 4b, con el reloj adelantado).
     */
    it('4. renovar entrega una llave nueva, y la vieja aún vale unos segundos', async () => {
        const loginRes = await login(user.email, PASSWORD).expect(200);
        const refreshToken = loginRes.body.tokens.refreshToken;

        const res1 = await refresh(refreshToken).expect(200);
        expect(res1.body).toHaveProperty('accessToken');
        expect(res1.body).toHaveProperty('expiresIn');
        expect(res1.body.refreshToken).toBeTruthy();
        expect(res1.body.refreshToken).not.toBe(refreshToken);

        // El token emitido decodifica al usuario correcto
        const decoded = jwt.decode(res1.body.accessToken) as any;
        expect(decoded.userId).toBe(user.id);

        // La segunda pestaña, que llegó con la llave vieja, no se queda fuera.
        const res2 = await refresh(refreshToken).expect(200);
        expect(res2.body).toHaveProperty('accessToken');

        // Y la nueva, por supuesto, sirve.
        await refresh(res1.body.refreshToken).expect(200);
    });

    it('4b. pasada la gracia, la llave vieja ya no sirve', async () => {
        const loginRes = await login(user.email, PASSWORD).expect(200);
        const vieja = loginRes.body.tokens.refreshToken;

        await refresh(vieja).expect(200);

        // Envejecer la marca de "cambiada" un minuto: la gracia son 30 s.
        await prisma.refreshToken.updateMany({
            where: { userId: user.id, replacedAt: { not: null } },
            data: { replacedAt: new Date(Date.now() - 60_000) },
        });

        await refresh(vieja).expect(401);
    });

    it('4c. dos pestañas que renuevan a la vez: ninguna se queda fuera', async () => {
        const loginRes = await login(user.email, PASSWORD).expect(200);
        const laMisma = loginRes.body.tokens.refreshToken;

        // A la vez, con la MISMA llave: es lo que hacen dos pestañas abiertas.
        const [a, b] = await Promise.all([refresh(laMisma), refresh(laMisma)]);

        expect([a.status, b.status]).toEqual([200, 200]);
        expect(a.body.refreshToken).toBeTruthy();
        expect(b.body.refreshToken).toBeTruthy();
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

        /**
         * Y EL TOKEN DE ESA SESIÓN DEJA DE SERVIR EN EL ACTO
         *
         * Antes no: al cerrar sesión solo se anulaba la llave de volver a
         * entrar, y el token que ya tenía el navegador seguía abriendo puertas
         * hasta que caducaba —quince minutos de una sesión que el usuario creía
         * cerrada—. Ahora se apunta como anulado y el guardia lo rechaza.
         */
        await request(server.server)
            .get('/api/auth/profile')
            .set('Authorization', `Bearer ${d2.body.tokens.accessToken}`)
            .set('X-Institute-Slug', INSTITUTE_SLUG)
            .expect(401);
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
        await login(user.email, PASSWORD).expect(401);
        // La nueva sí
        await login(user.email, NEW_PASSWORD).expect(200);
    });
});
