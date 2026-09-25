import { FastifyInstance } from 'fastify';
import request = require('supertest');
import { PrismaClient } from '@prisma/client';
import { UserRole } from '../../src/utils/prisma-enums';
import { createTestServer, createTestPrismaClient, createTestUser, generateTestToken } from '../helpers';

/**
 * LA LLAVE QUE GUARDA UN TELÉFONO PARA VOLVER A ENTRAR
 *
 * La huella del teléfono no entra al sistema: abre el cajón donde ese teléfono
 * guardó una llave, y esa llave es la que se canjea por una sesión. Aquí se
 * comprueba lo único que importa de verdad, que es lo que NO puede pasar:
 *
 *   LLAVE-01  la llave solo se crea con sesión — no es una puerta nueva;
 *   LLAVE-02  una llave buena abre, y devuelve otra;
 *   LLAVE-03  **la usada ya no vale**: una copia robada muere en el primer uso;
 *   LLAVE-04  una llave inventada no abre, y no dice por qué;
 *   LLAVE-05  la llave de una cuenta apagada no abre;
 *   LLAVE-06  al anularla, deja de abrir;
 *   LLAVE-07  en la base no se guarda la llave, solo su resumen.
 */

const SLUG = 'test-institute';

describe('La llave del teléfono', () => {
    let server: FastifyInstance;
    let prisma: PrismaClient;
    let persona: any;
    let token: string;

    const cab = (t: string) => ({ Authorization: `Bearer ${t}`, 'X-Institute-Slug': SLUG });

    beforeAll(async () => {
        server = await createTestServer();
        prisma = await createTestPrismaClient();

        const creada = await createTestUser(prisma, UserRole.TEACHER, {
            email: 'huella@test.com',
            firstName: 'Con',
            lastName: 'Huella',
        });
        persona = creada.user;
        token = generateTestToken(persona.id, persona.role as UserRole, persona.instituteId as string);
    });

    afterAll(async () => {
        await prisma.$disconnect();
        await server.close();
    });

    /** Pide una llave nueva para este teléfono. */
    const pedirLlave = async (t = token) =>
        request(server.server).post('/api/auth/llave-del-telefono').set(cab(t)).send({});

    /** La canjea por una sesión. Sin sesión, como el login. */
    const entrarCon = async (llave: string) =>
        request(server.server)
            .post('/api/auth/entrar-con-el-telefono')
            .set({ 'X-Institute-Slug': SLUG })
            .send({ llave });

    it('LLAVE-01: sin sesión no se puede pedir una llave', async () => {
        const r = await request(server.server)
            .post('/api/auth/llave-del-telefono')
            .set({ 'X-Institute-Slug': SLUG })
            .send({});

        expect(r.status).toBe(401);
    });

    it('LLAVE-02: una llave buena abre sesión y devuelve otra', async () => {
        const creada = await pedirLlave();
        expect(creada.status).toBe(201);
        expect(typeof creada.body.llave).toBe('string');
        expect(creada.body.llave.length).toBeGreaterThan(30);

        const entrada = await entrarCon(creada.body.llave);
        expect(entrada.status).toBe(200);
        expect(entrada.body.user?.id).toBe(persona.id);
        expect(entrada.body.tokens?.accessToken).toBeTruthy();
        expect(entrada.body.tokens?.refreshToken).toBeTruthy();

        // Y sale una llave nueva: la de antes ya se gastó.
        expect(typeof entrada.body.llave).toBe('string');
        expect(entrada.body.llave).not.toBe(creada.body.llave);
    });

    it('LLAVE-03: la llave usada NO vuelve a valer', async () => {
        const creada = await pedirLlave();
        const primera = await entrarCon(creada.body.llave);
        expect(primera.status).toBe(200);

        // Esto es lo que protege de una copia: usarla otra vez no abre nada.
        const segunda = await entrarCon(creada.body.llave);
        expect(segunda.status).toBe(400);
        expect(segunda.body.code).toBe('INVALID_CREDENTIALS');

        // Y la que salió de la primera entrada sí vale.
        const tercera = await entrarCon(primera.body.llave);
        expect(tercera.status).toBe(200);
    });

    it('LLAVE-04: una llave inventada no abre, y no dice por qué', async () => {
        const r = await entrarCon('esto-no-es-una-llave-de-verdad-pero-mide-bastante');
        expect(r.status).toBe(400);
        expect(r.body.code).toBe('INVALID_CREDENTIALS');
        // Ni «no existe», ni «caducó», ni «anulada»: lo mismo siempre.
        expect(JSON.stringify(r.body)).not.toMatch(/caduc|anul|no existe/i);
    });

    it('LLAVE-05: la llave de una cuenta apagada no abre', async () => {
        const { user: apagable } = await createTestUser(prisma, UserRole.STUDENT, {
            email: 'apagada@test.com',
            firstName: 'Cuenta',
            lastName: 'Apagada',
        });
        const suyo = generateTestToken(apagable.id, apagable.role as UserRole, apagable.instituteId as string);
        const creada = await pedirLlave(suyo);
        expect(creada.status).toBe(201);

        await prisma.user.update({ where: { id: apagable.id }, data: { isActive: false } });

        const r = await entrarCon(creada.body.llave);
        expect(r.status).toBe(400);
    });

    it('LLAVE-06: al anularla, deja de abrir', async () => {
        const creada = await pedirLlave();

        const anulada = await request(server.server)
            .post('/api/auth/anular-llave-del-telefono')
            .set(cab(token))
            .send({ llave: creada.body.llave });
        expect(anulada.status).toBe(200);
        expect(anulada.body.anuladas).toBeGreaterThanOrEqual(1);

        const r = await entrarCon(creada.body.llave);
        expect(r.status).toBe(400);
    });

    it('LLAVE-07: en la base no está la llave, solo su resumen', async () => {
        const creada = await pedirLlave();
        const llave: string = creada.body.llave;

        const filas: Array<{ tokenHash: string }> = await prisma.$queryRawUnsafe(
            'SELECT "tokenHash" FROM device_keys WHERE "userId" = $1',
            persona.id
        );

        expect(filas.length).toBeGreaterThan(0);
        // Ni una fila contiene la llave tal cual: quien se lleve la base no se
        // lleva ninguna llave.
        for (const fila of filas) {
            expect(fila.tokenHash).not.toBe(llave);
            expect(fila.tokenHash).toMatch(/^[0-9a-f]{64}$/);
        }
    });
});
