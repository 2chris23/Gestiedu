import { FastifyInstance } from 'fastify';
import request = require('supertest');
import { PrismaClient } from '@prisma/client';
import { UserRole } from '../../src/utils/prisma-enums';
import {
    createTestServer,
    createTestPrismaClient,
    cleanTestDatabase,
    createTestUserWithPassword,
    generateTestToken,
} from '../helpers';

/**
 * TESTS — SESIONES PERSISTENTES ("Recordar sesión")
 *
 * Cobertura (obligatoria):
 * 1. rememberMe=true: el refresh renueva su expiración en cada uso (sliding).
 * 2. rememberMe=false: comportamiento idéntico al actual (7 días fijos, sin sliding).
 * 3. GET /api/auth/sessions solo devuelve sesiones del usuario autenticado.
 * 4. DELETE /api/auth/sessions/:id revoca una específica; otras siguen; la de otro
 *    usuario no se puede borrar (404).
 * 5. Sesión rememberMe inactiva más allá del máximo → expira (fecha mockeada).
 */

const INSTITUTE_SLUG = 'test-institute';
const PASSWORD = 'Password123!';
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const SLIDING_DAYS_MS = 60 * 24 * 60 * 60 * 1000;

/**
 * Controla el reloj de la app (new Date() y Date.now()) SIN usar fake timers
 * (fake timers congelan ioredis/Redis y supertest => timeouts).
 * IMPORTANTE: auth.service usa `new Date()` (no Date.now) en refreshToken, por
 * eso se reemplaza global.Date completo y se restaura en finally.
 */
let frozenTimeMs: number | null = null;

function patchSystemTime(frozen: number): () => void {
    frozenTimeMs = frozen;
    const RealDate = global.Date as DateConstructor;
    const spy = jest.spyOn(global, 'Date').mockImplementation(function (this: any, ...args: any[]) {
        if (args.length === 0) return new RealDate(frozenTimeMs!);
        // @ts-ignore constructor con argumentos
        return new RealDate(...args);
    });
    (global as any).Date.now = () => frozenTimeMs!;
    return () => {
        (global as any).Date.now = RealDate.now.bind(RealDate);
        spy.mockRestore();
        frozenTimeMs = null;
    };
}

function setFrozenTime(ms: number): void {
    frozenTimeMs = ms;
}

describe('Flujo — Sesiones persistentes (Recordar sesión)', () => {
    let server: FastifyInstance;
    let prisma: PrismaClient;
    let user: { id: string; email: string };

    const login = (email: string, password: string, rememberMe?: boolean) =>
        request(server.server)
            .post('/api/auth/login')
            .set('X-Institute-Slug', INSTITUTE_SLUG)
            .set('User-Agent', 'jest-supertest-agent')
            .send({ email, password, rememberMe });

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

    it('1. rememberMe=true: cada uso del refresh renueva la expiración (sliding)', async () => {
        // ------------------------------------------------------------------
        // NOTA de metodología: auth.service refreshToken usa `new Date()`
        // (no Date.now) para validación/renovación y jsonwebtoken usa Date.now
        // para `exp` → se parchea global.Date (ver patchSystemTime).
        // Renovaciones a +3d y +5d, ambas dentro de la ventana de 7d del JWT.
        // ------------------------------------------------------------------
        const baseTime = Date.now();
        const restore = patchSystemTime(baseTime);
        try {
            const loginRes = await login(user.email, PASSWORD, true).expect(200);
            const refreshToken = loginRes.body.tokens.refreshToken;

            const rec0 = await prisma.refreshToken.findFirst({ where: { userId: user.id } });
            expect(rec0).toBeTruthy();
            expect(rec0!.rememberMe).toBe(true);
            expect(rec0!.userAgent).toBeTruthy(); // capturamos userAgent del request
            const initialExpiry = rec0!.expiresAt.getTime();
            const initialLast = rec0!.lastUsedAt.getTime();

            /**
             * Ojo: la llave se CAMBIA en cada renovación (ver auth.service), así
             * que aquí se sigue la llave nueva, que es lo que hace el navegador.
             * Lo que se comprueba es que la sesión "recordada" se corre desde el
             * último uso, no desde que se entró.
             */
            // Primera renovación a +3d (dentro de la ventana JWT de 7d)
            setFrozenTime(baseTime + 3 * 24 * 60 * 60 * 1000);
            const res = await refresh(refreshToken).expect(200);
            expect(res.body.accessToken).toBeTruthy();
            expect(res.body.refreshToken).toBeTruthy();

            const rec1 = await prisma.refreshToken.findFirst({
                where: { userId: user.id, replacedAt: null },
            });
            expect(rec1!.expiresAt.getTime()).toBeGreaterThan(initialExpiry); // se corrió
            expect(rec1!.lastUsedAt.getTime()).toBeGreaterThan(initialLast);

            // Segunda renovación a +5d: la expiración vuelve a correrse desde el último uso
            const fakeNow2 = baseTime + 5 * 24 * 60 * 60 * 1000;
            setFrozenTime(fakeNow2);
            await refresh(res.body.refreshToken).expect(200);
            const rec2 = await prisma.refreshToken.findFirst({
                where: { userId: user.id, replacedAt: null },
            });
            expect(rec2!.expiresAt.getTime()).toBeGreaterThan(rec1!.expiresAt.getTime());
            expect(rec2!.expiresAt.getTime()).toBe(fakeNow2 + SLIDING_DAYS_MS); // +60d desde el último uso
            expect(rec2!.lastUsedAt.getTime()).toBe(fakeNow2);
        } finally {
            restore();
        }
    });

    it('2. rememberMe=false: expiración FIJA de 7 días, sin sliding', async () => {
        // La sesión normal (sin recordar) usa SESSION_CONFIG.NORMAL_SESSION_TTL
        // = 7 días (alineado con JWT_REFRESH_EXPIRES_IN '7d'). El refresh NO se
        // corre con cada uso; a los +3 días sigue funcionando (200) pero con
        // expiry original; después de 7 días sin uso, expira.
        const baseTime = Date.now();
        const restore = patchSystemTime(baseTime);
        try {
            const loginRes = await login(user.email, PASSWORD, false).expect(200);
            const refreshToken = loginRes.body.tokens.refreshToken;

            const rec0 = await prisma.refreshToken.findFirst({ where: { userId: user.id } });
            expect(rec0!.rememberMe).toBe(false);
            const initialExpiry = rec0!.expiresAt.getTime();
            expect(initialExpiry - baseTime).toBeCloseTo(SEVEN_DAYS_MS, -3);

            // +3 días: el refresh funciona (dentro de la ventana de 7 días)...
            const fakeNow = baseTime + 3 * 24 * 60 * 60 * 1000;
            setFrozenTime(fakeNow);
            await refresh(refreshToken).expect(200);

            // ...y NO se corrió la expiración (fija original, sin sliding)
            const rec1 = await prisma.refreshToken.findFirst({ where: { userId: user.id } });
            expect(rec1!.expiresAt.getTime()).toBeCloseTo(initialExpiry, -3);
            expect(rec1!.expiresAt.getTime()).toBeLessThan(fakeNow + SEVEN_DAYS_MS);

            // +8 días: ya venció → 401 (el JWT de refresh también expiró a los 7d)
            setFrozenTime(baseTime + 8 * 24 * 60 * 60 * 1000);
            await refresh(refreshToken).expect(401);
        } finally {
            restore();
        }
    });

    it('3. GET /api/auth/sessions solo devuelve sesiones del usuario autenticado', async () => {
        // Otro usuario con sus propias sesiones
        const other = await createTestUserWithPassword(prisma, UserRole.STUDENT, PASSWORD);
        await login(other.user.email, PASSWORD, true).expect(200);
        await login(other.user.email, PASSWORD, true).expect(200);

        // Usuario autenticado con 2 sesiones
        await login(user.email, PASSWORD, true).expect(200);
        const mine = await login(user.email, PASSWORD, true).expect(200);
        const accessToken = mine.body.tokens.accessToken;

        const res = await request(server.server)
            .get('/api/auth/sessions')
            .set('Authorization', `Bearer ${accessToken}`)
            .set('X-Institute-Slug', INSTITUTE_SLUG)
            .expect(200);

        const sessions = res.body.sessions || [];
        // Solo las del usuario autenticado (2, ninguna del otro usuario)
        expect(sessions.length).toBe(2);
        sessions.forEach((s: any) => {
            expect(s.id).toBeTruthy();
            expect(s.token).toBeUndefined(); // nunca se expone el token
            expect(s.userAgent).toBeDefined();
            expect(s.rememberMe).toBe(true);
        });
    });

    it('4. DELETE /api/auth/sessions/:id revoca una específica; otras siguen; la de otro usuario es 404', async () => {
        const s1 = await login(user.email, PASSWORD, false).expect(200);
        const s2 = await login(user.email, PASSWORD, false).expect(200);
        const accessToken = s1.body.tokens.accessToken;

        // IDs reales de cada sesión (evitamos depender del orden del listado)
        const recS1 = await prisma.refreshToken.findFirst({
            where: { token: s1.body.tokens.refreshToken },
            select: { id: true },
        });
        const recS2 = await prisma.refreshToken.findFirst({
            where: { token: s2.body.tokens.refreshToken },
            select: { id: true },
        });
        expect(recS1).toBeTruthy();
        expect(recS2).toBeTruthy();

        const sessionsList = await request(server.server)
            .get('/api/auth/sessions')
            .set('Authorization', `Bearer ${accessToken}`)
            .set('X-Institute-Slug', INSTITUTE_SLUG)
            .expect(200);
        expect(sessionsList.body.sessions.length).toBe(2);

        // Revocar la sesión del login s1
        await request(server.server)
            .delete(`/api/auth/sessions/${recS1!.id}`)
            .set('Authorization', `Bearer ${accessToken}`)
            .set('X-Institute-Slug', INSTITUTE_SLUG)
            .expect(200);

        // La sesión revocada ya no sirve para refrescar
        await refresh(s1.body.tokens.refreshToken).expect(401);

        // La otra sigue viva
        await refresh(s2.body.tokens.refreshToken).expect(200);
        // Solo las vivas: la llave se cambia en cada renovación y la anterior
        // se queda unos segundos marcada como cambiada (ver auth.service).
        expect(await prisma.refreshToken.count({ where: { userId: user.id, replacedAt: null } })).toBe(1);

        // Intentar borrar una sesión de OTRO usuario → 404 y no la revoca
        const other = await createTestUserWithPassword(prisma, UserRole.STUDENT, PASSWORD);
        const otherLogin = await login(other.user.email, PASSWORD, false).expect(200);
        const otherSession = await prisma.refreshToken.findFirst({
            where: { userId: other.user.id },
            select: { id: true },
        });

        await request(server.server)
            .delete(`/api/auth/sessions/${otherSession!.id}`)
            .set('Authorization', `Bearer ${accessToken}`)
            .set('X-Institute-Slug', INSTITUTE_SLUG)
            .expect(404);

        // La sesión del otro usuario sigue viva
        const stillAlive = await request(server.server)
            .post('/api/auth/refresh-token')
            .set('X-Institute-Slug', INSTITUTE_SLUG)
            .send({ refreshToken: otherLogin.body.tokens.refreshToken })
            .expect(200);
        expect(stillAlive.body.accessToken).toBeTruthy();
    });

    it('5. sesión rememberMe inactiva más allá del máximo → expira igual (401)', async () => {
        const loginRes = await login(user.email, PASSWORD, true).expect(200);
        const refreshToken = loginRes.body.tokens.refreshToken;

        // Simular que el dispositivo quedó inactivo: la expiración está en el pasado
        const rec = await prisma.refreshToken.findFirst({ where: { userId: user.id } });
        await prisma.refreshToken.update({
            where: { id: rec!.id },
            data: { expiresAt: new Date(Date.now() - 1000) }, // ya venció
        });

        await refresh(refreshToken).expect(401);
    });
});
