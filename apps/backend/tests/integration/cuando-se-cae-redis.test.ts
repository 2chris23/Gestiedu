import { FastifyInstance } from 'fastify';
import request = require('supertest');
import { PrismaClient } from '@prisma/client';
import { UserRole } from '../../src/utils/prisma-enums';
import {
    createTestServer,
    createTestPrismaClient,
    cleanTestDatabase,
    createTestUser,
    createTestUserWithPassword,
    generateTestToken,
} from '../helpers';
import { redis, RedisCache } from '../../src/config/redis';

/**
 * CUANDO SE CAE REDIS
 *
 * Redis guarda las copias de las pantallas, la cuenta de intentos fallidos y el
 * reparto de avisos entre servidores. Se cae: se reinicia por una actualización,
 * se llena, o la red se corta un minuto. Pasa.
 *
 * Lo que NO puede pasar cuando se cae:
 *
 *   1. que el liceo entero deje de funcionar;
 *   2. **que algo se abra**. Un guardia que solo funciona con Redis es un
 *      guardia que se apaga cuando a alguien le interesa apagarlo.
 *
 * ─── POR QUÉ NO BASTA CON "PROBAR SIN REDIS" ─────────────────────────────────
 *
 * Que no haya Redis levantado es el caso fácil: el código ve que no hay y tira
 * de memoria. El caso peligroso es el otro: **Redis contesta que está listo y
 * luego falla en cada orden**. Ahí el código entra por el camino de Redis y
 * revienta dentro. Eso es lo que se simula aquí.
 */

const SLUG = 'test-institute';

describe('Cuando se cae Redis', () => {
    let server: FastifyInstance;
    let prisma: PrismaClient;

    let admin: any;
    let alumno: any;
    let otroAlumno: any;
    let tokenAdmin: string;
    let tokenAlumno: string;

    const CLAVE = 'LaBuenaDeVerdad2026';

    const auth = (token: string) => ({
        Authorization: `Bearer ${token}`,
        'X-Institute-Slug': SLUG,
    });

    /**
     * Pone a Redis en el peor estado posible: dice que está listo y falla en
     * todo. Devuelve la función que lo deja como estaba.
     */
    function redisQueDiceQueSiPeroNo() {
        const estadoAnterior = Object.getOwnPropertyDescriptor(redis, 'status');
        Object.defineProperty(redis, 'status', { value: 'ready', configurable: true });

        const ORDENES = ['get', 'set', 'setex', 'del', 'scan', 'incrby', 'expire', 'ttl', 'ping', 'keys', 'mget'];
        const anteriores = new Map<string, { propia: boolean; valor: any }>();

        for (const orden of ORDENES) {
            anteriores.set(orden, {
                propia: Object.prototype.hasOwnProperty.call(redis, orden),
                valor: (redis as any)[orden],
            });
            (redis as any)[orden] = () => Promise.reject(new Error('Redis se cayó'));
        }

        return () => {
            for (const [orden, antes] of anteriores) {
                if (antes.propia) (redis as any)[orden] = antes.valor;
                else delete (redis as any)[orden];
            }
            if (estadoAnterior) Object.defineProperty(redis, 'status', estadoAnterior);
            else delete (redis as any).status;
        };
    }

    let devolverRedis: (() => void) | null = null;

    beforeAll(async () => {
        server = await createTestServer();
        prisma = await createTestPrismaClient();
    }, 120000);

    afterAll(async () => {
        devolverRedis?.();
        await prisma.$disconnect();
        await server.close();
    });

    beforeEach(async () => {
        devolverRedis?.();
        devolverRedis = null;

        await cleanTestDatabase(prisma);
        admin = (await createTestUser(prisma, UserRole.ADMIN)).user;
        alumno = (await createTestUserWithPassword(prisma, UserRole.STUDENT, CLAVE)).user;
        otroAlumno = (await createTestUser(prisma, UserRole.STUDENT)).user;

        tokenAdmin = generateTestToken(admin.id, UserRole.ADMIN, 'institute');
        tokenAlumno = generateTestToken(alumno.id, UserRole.STUDENT, 'institute');
    }, 120000);

    afterEach(() => {
        devolverRedis?.();
        devolverRedis = null;
    });

    // ═════════════════════════════════════════════════════════════════════════
    // 1. EL LICEO SIGUE FUNCIONANDO
    // ═════════════════════════════════════════════════════════════════════════

    it('CAIDA-01: se puede entrar aunque Redis esté fallando en todo', async () => {
        devolverRedis = redisQueDiceQueSiPeroNo();

        const res = await request(server.server)
            .post('/api/auth/login')
            .set('X-Institute-Slug', SLUG)
            .send({ email: alumno.email, password: CLAVE });

        expect(res.status).toBe(200);
        // Y con credencial de verdad, no un 200 vacío: entrar sin poder hacer
        // nada después sería igual de inútil que no entrar.
        expect(res.body.tokens?.accessToken).toBeTruthy();
        expect(res.body.user?.id).toBe(alumno.id);
    });

    it('CAIDA-02: las pantallas siguen respondiendo, sin errores internos', async () => {
        devolverRedis = redisQueDiceQueSiPeroNo();

        // El panel del alumno es el que más copias guardadas usa.
        const panel = await request(server.server)
            .get('/api/dashboard/student')
            .set(auth(tokenAlumno));

        expect(panel.status).toBeLessThan(500);
    });

    // ═════════════════════════════════════════════════════════════════════════
    // 2. Y SOBRE TODO: NADA SE ABRE
    // ═════════════════════════════════════════════════════════════════════════

    it('CAIDA-03: un alumno sigue sin poder ver a otro alumno', async () => {
        devolverRedis = redisQueDiceQueSiPeroNo();

        const res = await request(server.server)
            .get(`/api/students/${otroAlumno.id}`)
            .set(auth(tokenAlumno));

        expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it('CAIDA-04: un alumno sigue sin poder crear usuarios', async () => {
        devolverRedis = redisQueDiceQueSiPeroNo();

        const res = await request(server.server)
            .post('/api/users')
            .set(auth(tokenAlumno))
            .send({
                id: 'V-99999999',
                email: 'colado@testing.edu.ve',
                firstName: 'Cola',
                lastName: 'Do',
                role: 'ADMIN',
                password: 'UnaClaveLarga2026',
            });

        expect(res.status).toBeGreaterThanOrEqual(400);

        // Y que no haya entrado por la puerta de atrás.
        const colado = await prisma.user.findUnique({ where: { id: 'V-99999999' } });
        expect(colado).toBeNull();
    });

    it('CAIDA-05: una credencial inventada sigue sin abrir nada', async () => {
        devolverRedis = redisQueDiceQueSiPeroNo();

        const res = await request(server.server)
            .get('/api/dashboard/admin')
            .set({
                Authorization: 'Bearer esto.no.es.un.token',
                'X-Institute-Slug': SLUG,
            });

        expect(res.status).toBe(401);
    });

    it('CAIDA-06: el cierre por probar contraseñas SIGUE funcionando sin Redis', async () => {
        // Este es el que más importa de todos. Si el contador de intentos
        // viviera solo en Redis, bastaría con tumbar Redis para poder probar
        // contraseñas sin límite: el guardia se apagaría justo cuando hace
        // falta. Por eso la cuenta cae a memoria.
        devolverRedis = redisQueDiceQueSiPeroNo();

        let frenados = 0;
        for (let i = 0; i < 15; i++) {
            const res = await request(server.server)
                .post('/api/auth/login')
                .set('X-Institute-Slug', SLUG)
                .set('X-Forwarded-For', `203.0.113.${i + 1}`)
                .send({ email: alumno.email, password: `inventada-${i}` });
            if (res.status === 429) frenados++;
        }

        expect(frenados).toBeGreaterThan(0);
    });

    // ═════════════════════════════════════════════════════════════════════════
    // 3. LO QUE SE GUARDA EN MEMORIA SE COMPORTA IGUAL
    // ═════════════════════════════════════════════════════════════════════════

    it('CAIDA-07: guardar y leer una copia funciona con Redis caído', async () => {
        devolverRedis = redisQueDiceQueSiPeroNo();

        await RedisCache.set('prueba:caida', { hola: 'mundo' }, 60);
        const leido = await RedisCache.get<any>('prueba:caida');

        expect(leido).toEqual({ hola: 'mundo' });
    });

    it('CAIDA-08: borrar por patrón sigue borrando lo que toca', async () => {
        devolverRedis = redisQueDiceQueSiPeroNo();

        await RedisCache.set('cache:liceo:/x:ana:', 1, 60);
        await RedisCache.set('cache:liceo:/x:luis:', 1, 60);

        await RedisCache.clearPatterns(['cache:liceo:*:ana:*']);

        expect(await RedisCache.get('cache:liceo:/x:ana:')).toBeNull();
        expect(await RedisCache.get('cache:liceo:/x:luis:')).not.toBeNull();
    });

    // ═════════════════════════════════════════════════════════════════════════
    // 4. CUANDO VUELVE
    // ═════════════════════════════════════════════════════════════════════════

    it('CAIDA-09: cuando Redis vuelve, el sistema sigue funcionando', async () => {
        devolverRedis = redisQueDiceQueSiPeroNo();

        await request(server.server)
            .get('/api/dashboard/student')
            .set(auth(tokenAlumno));

        devolverRedis();
        devolverRedis = null;

        const despues = await request(server.server)
            .get('/api/dashboard/student')
            .set(auth(tokenAlumno));

        expect(despues.status).toBeLessThan(500);
    });
});
