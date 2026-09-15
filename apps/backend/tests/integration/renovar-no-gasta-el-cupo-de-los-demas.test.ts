import { FastifyInstance } from 'fastify';
import request = require('supertest');
import { PrismaClient } from '@prisma/client';
import { UserRole } from '../../src/utils/prisma-enums';
import {
    createTestServer,
    createTestPrismaClient,
    cleanTestDatabase,
    createTestUserWithPassword,
} from '../helpers';

/**
 * RENOVAR LA SESIÓN NO LE GASTA EL CUPO A LOS DEMÁS
 *
 * Un liceo sale a internet por **una sola conexión**: las doscientas personas
 * que hay dentro comparten la misma dirección de cara al servidor.
 *
 * El contador de intentos armaba su clave con `dirección + correo`. Está bien
 * para la pantalla de entrar. Pero al **renovar la sesión** no se manda ningún
 * correo, así que la clave quedaba en `dirección + vacío`: **todas las
 * renovaciones del liceo entero en un solo cupo de diez por minuto**.
 *
 * Lo que eso significa un lunes a las siete: diez personas abren el sistema, y
 * la undécima —y todas las siguientes— reciben "demasiados intentos" y acaban
 * en la pantalla de entrar. Sin que nadie haya hecho nada mal.
 *
 * Se midió antes de tocarlo: doce renovaciones seguidas desde la misma
 * dirección, y la undécima ya devolvía 429.
 *
 * Es el mismo fallo que ya se había corregido en el contador general de
 * peticiones —"un liceo sale a internet por una sola conexión"— y que aquí se
 * había quedado.
 */

const SLUG = 'test-institute';
const CLAVE = 'LaBuenaDeVerdad2026';

describe('Renovar la sesión no le gasta el cupo a los demás', () => {
    let server: FastifyInstance;
    let prisma: PrismaClient;

    beforeAll(async () => {
        server = await createTestServer();
        prisma = await createTestPrismaClient();
    }, 120000);

    afterAll(async () => {
        await prisma.$disconnect();
        await server.close();
    });

    beforeEach(async () => {
        await cleanTestDatabase(prisma);
    }, 120000);

    /** Entra de verdad y devuelve su llave larga. */
    const entrar = async (correo: string) => {
        const res = await request(server.server)
            .post('/api/auth/login')
            .set('X-Institute-Slug', SLUG)
            .send({ email: correo, password: CLAVE });
        expect(res.status).toBe(200);
        return res.body.tokens.refreshToken as string;
    };

    /**
     * Cada llamada se manda desde una dirección distinta.
     *
     * No es un capricho: por delante de esto hay OTRO contador, el general, que
     * cuenta por dirección (100 por minuto en pruebas). Si todas salieran de la
     * misma dirección, a las cien se pondría a devolver 429 y no se sabría cuál
     * de los dos contadores frenó. Cambiando la dirección, el único que puede
     * frenar es el que se está midiendo.
     */
    let numeroDeIp = 0;
    const renovar = (llaveLarga: string) =>
        request(server.server)
            .post('/api/auth/refresh-token')
            .set('X-Institute-Slug', SLUG)
            .set('X-Forwarded-For', `198.51.100.${(numeroDeIp++ % 250) + 1}`)
            .send({ refreshToken: llaveLarga });

    it('CUPO-01: doce personas del mismo liceo renuevan sin estorbarse', async () => {
        // Todas desde la misma dirección, que es como sale un liceo a internet.
        const llaves: string[] = [];
        for (let i = 0; i < 12; i++) {
            const { user } = await createTestUserWithPassword(prisma, UserRole.TEACHER, CLAVE);
            llaves.push(await entrar(user.email));
        }

        const respuestas: number[] = [];
        for (const llave of llaves) {
            const res = await renovar(llave);
            respuestas.push(res.status);
        }

        // Ninguna puede quedarse fuera por culpa de las otras once.
        expect(respuestas.filter((c) => c === 429)).toHaveLength(0);
        expect(respuestas.every((c) => c === 200)).toBe(true);
    }, 180000);

    it('CUPO-02: machacar UNA llave concreta sí se frena', async () => {
        // El límite tiene que seguir existiendo: lo que cambió es a quién se le
        // cuenta, no que se deje de contar.
        const { user } = await createTestUserWithPassword(prisma, UserRole.TEACHER, CLAVE);
        const llave = await entrar(user.email);

        let frenadas = 0;
        for (let i = 0; i < 80; i++) {
            const res = await renovar(llave);
            if (res.status === 429) frenadas++;
        }

        expect(frenadas).toBeGreaterThan(0);
    }, 180000);

    it('CUPO-03: frenar una sesión no frena a las demás', async () => {
        const uno = await createTestUserWithPassword(prisma, UserRole.TEACHER, CLAVE);
        const otro = await createTestUserWithPassword(prisma, UserRole.STUDENT, CLAVE);

        const llaveDeUno = await entrar(uno.user.email);
        const llaveDeOtro = await entrar(otro.user.email);

        // Se machaca la de uno hasta que se frene.
        for (let i = 0; i < 80; i++) await renovar(llaveDeUno);

        // La del otro tiene que seguir entrando.
        const res = await renovar(llaveDeOtro);
        expect(res.status).toBe(200);
    }, 180000);

    it('CUPO-04: la pantalla de entrar sigue contando por cuenta y dirección', async () => {
        // Lo del login no cambió: ahí sí hay correo, y ahí el límite es estrecho
        // a propósito porque es donde se prueban contraseñas.
        const { user } = await createTestUserWithPassword(prisma, UserRole.TEACHER, CLAVE);

        let frenados = 0;
        for (let i = 0; i < 15; i++) {
            const res = await request(server.server)
                .post('/api/auth/login')
                .set('X-Institute-Slug', SLUG)
                .send({ email: user.email, password: 'no-es-esta' });
            if (res.status === 429) frenados++;
        }

        expect(frenados).toBeGreaterThan(0);
    }, 180000);
});
