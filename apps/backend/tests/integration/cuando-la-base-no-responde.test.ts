import { FastifyInstance } from 'fastify';
import request = require('supertest');
import { PrismaClient } from '@prisma/client';
import { UserRole } from '../../src/utils/prisma-enums';
import {
    createTestServer,
    createTestPrismaClient,
    cleanTestDatabase,
    createTestUser,
    generateTestToken,
} from '../helpers';
import { platformPrisma } from '../../src/config/database';

/**
 * CUANDO LA BASE DE UN LICEO NO RESPONDE
 *
 * Cada liceo tiene su propia base de datos. Una puede caerse sola: se reinicia
 * el servidor, se llena el disco, alguien corta la red, o el proveedor tiene un
 * mal rato. Pasa.
 *
 * Lo que NO puede pasar cuando se cae:
 *
 *   1. **que el sistema entero se venga abajo**. Los demás liceos están en otras
 *      bases y no tienen la culpa de nada;
 *   2. **que se quede colgado**. Una petición que no vuelve nunca es peor que un
 *      error: deja la pantalla girando y al profesor esperando;
 *   3. **que al fallar cuente de más**. Los mensajes de error son el sitio por
 *      donde se escapan las credenciales de la base, porque nadie los mira con
 *      el cuidado con que mira una respuesta normal.
 *
 * ─── CÓMO SE PRUEBA ──────────────────────────────────────────────────────────
 *
 * Se da de alta un liceo cuya base **no existe** y se le pide algo. No hace
 * falta tirar nada: el efecto es el mismo que el de una base caída, y no toca a
 * los demás.
 */

const SLUG_ROTO = 'liceo-con-la-base-caida';
const ID_ROTO = 'instituto-roto';

describe('Cuando la base de un liceo no responde', () => {
    let server: FastifyInstance;
    let prisma: PrismaClient;
    let admin: any;
    let tokenDelRoto: string;

    beforeAll(async () => {
        server = await createTestServer();
        prisma = await createTestPrismaClient();

        // Un liceo cuya base no existe: mismo efecto que una base caída.
        await platformPrisma.institute.upsert({
            where: { id: ID_ROTO },
            update: {
                status: 'ACTIVE' as any,
                databaseName: 'base_que_no_existe_de_ninguna_manera',
                databaseHost: 'localhost',
                databasePort: 5432,
                databaseUser: 'postgres',
                databasePassword: 'la-contrasena-secreta-del-liceo',
            },
            create: {
                id: ID_ROTO,
                code: 'ROTO',
                slug: SLUG_ROTO,
                subdomain: SLUG_ROTO,
                name: 'Liceo con la base caída',
                email: 'roto@testing.edu.ve',
                status: 'ACTIVE' as any,
                databaseName: 'base_que_no_existe_de_ninguna_manera',
                databaseHost: 'localhost',
                databasePort: 5432,
                databaseUser: 'postgres',
                databasePassword: 'la-contrasena-secreta-del-liceo',
            } as any,
        });

        admin = (await createTestUser(prisma, UserRole.ADMIN)).user;
        tokenDelRoto = generateTestToken(admin.id, UserRole.ADMIN, ID_ROTO);
    }, 180000);

    afterAll(async () => {
        await platformPrisma.institute.delete({ where: { id: ID_ROTO } }).catch(() => undefined);
        await prisma.$disconnect();
        await server.close();
    });

    const pedirAlRoto = () =>
        request(server.server)
            .get('/api/dashboard/admin')
            .set('Authorization', `Bearer ${tokenDelRoto}`)
            .set('X-Institute-Slug', SLUG_ROTO);

    it('CAIDA-BD-01: responde con un error, no se queda colgado', async () => {
        const empezo = Date.now();
        const res = await pedirAlRoto();
        const tardo = Date.now() - empezo;

        // Lo importante es que VUELVA. Una petición que no vuelve deja la
        // pantalla girando para siempre.
        expect(res.status).toBeGreaterThanOrEqual(400);
        expect(tardo).toBeLessThan(30000);
    }, 60000);

    it('CAIDA-BD-02: NO cuenta la contraseña de la base en el error', async () => {
        // Los mensajes de error son por donde se escapan las credenciales: nadie
        // los mira con el cuidado con que mira una respuesta normal.
        const res = await pedirAlRoto();

        const texto = JSON.stringify(res.body) + res.text;
        expect(texto).not.toContain('la-contrasena-secreta-del-liceo');
        expect(texto).not.toMatch(/postgresql:\/\//i);
        expect(texto).not.toMatch(/base_que_no_existe/);
        expect(texto).not.toMatch(/databasePassword/i);
    }, 60000);

    it('CAIDA-BD-03: tampoco cuenta por dónde va el programa por dentro', async () => {
        // Un rastro de la pila de llamadas le dice a quien mira qué librerías se
        // usan y por dónde entrar a buscar un fallo conocido.
        const res = await pedirAlRoto();

        const texto = JSON.stringify(res.body) + res.text;
        expect(texto).not.toMatch(/node_modules/);
        expect(texto).not.toMatch(/at Object\./);
        expect(texto).not.toMatch(/\.ts:\d+:\d+/);
    }, 60000);

    it('CAIDA-BD-04: el liceo de al lado sigue funcionando', async () => {
        // Esto es lo que más importa de todo: una base caída es el problema de
        // UN liceo. Los demás están en otras bases y no tienen la culpa.
        await pedirAlRoto();

        const tokenBueno = generateTestToken(admin.id, UserRole.ADMIN, 'institute');
        const res = await request(server.server)
            .get('/api/dashboard/admin')
            .set('Authorization', `Bearer ${tokenBueno}`)
            .set('X-Institute-Slug', 'test-institute');

        expect(res.status).toBe(200);
    }, 60000);

    it('CAIDA-BD-05: insistir no tumba el servidor', async () => {
        // Una pantalla que reintenta sola puede llamar muchas veces seguidas
        // contra una base caída. Eso no puede dejar al servidor sin responder a
        // los demás.
        await Promise.all(Array.from({ length: 10 }, () => pedirAlRoto().catch(() => undefined)));

        const tokenBueno = generateTestToken(admin.id, UserRole.ADMIN, 'institute');
        const res = await request(server.server)
            .get('/api/dashboard/admin')
            .set('Authorization', `Bearer ${tokenBueno}`)
            .set('X-Institute-Slug', 'test-institute');

        expect(res.status).toBe(200);
    }, 120000);
});
