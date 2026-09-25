import { FastifyInstance } from 'fastify';
import request = require('supertest');
import { PrismaClient } from '@prisma/client';
import { UserRole } from '../../src/utils/prisma-enums';
import { hashPassword } from '../../src/utils/bcrypt';
import { createTestServer, createTestPrismaClient, createTestUser } from '../helpers';

/**
 * EL LOGIN NO DICE QUIÉN EXISTE (OWASP ASVS V2.2 / API2:2023)
 *
 * Con una lista de correos (los de un liceo se adivinan: nombre.apellido@…)
 * la pantalla de entrar no puede servir para saber cuáles son de verdad:
 *
 *   ENUM-01  Una cuenta DESACTIVADA o ARCHIVADA, con la contraseña MAL,
 *            respondía «tu cuenta está desactivada / archivada» sin haber
 *            mirado la contraseña: bastaba el correo para saber que esa
 *            persona estuvo en el liceo y ya no está (un alumno retirado,
 *            un profesor dado de baja). Ahora, sin la contraseña buena,
 *            responde igual que un correo que no existe.
 *   ENUM-02  Un correo que no existe respondía al instante; uno que existe
 *            tardaba lo que tarda bcrypt. El reloj decía cuáles existen.
 */
const SLUG = 'test-institute';
const CLAVE = 'LaClaveBuena-2026';

let n = 0;
const desdeOtraConexion = (req: any) => {
    n += 1;
    return req.set('X-Forwarded-For', `10.77.${(n >> 8) & 255}.${n & 255}`);
};

describe('El login no dice quién existe', () => {
    let server: FastifyInstance;
    let prisma: PrismaClient;
    const entrar = (email: string, password: string) =>
        desdeOtraConexion(request(server.server).post('/api/auth/login').set('X-Institute-Slug', SLUG)).send({ email, password });

    beforeAll(async () => {
        server = await createTestServer();
        prisma = await createTestPrismaClient();
    }, 120000);

    afterAll(async () => {
        await prisma.$disconnect();
        await server.close();
    });

    it('ENUM-01: desactivada o archivada, con la contraseña mal, responde como un correo que no existe', async () => {
        const hash = await hashPassword(CLAVE);
        const desactivada = (await createTestUser(prisma, UserRole.STUDENT, { password: hash, isActive: false })).user;
        const archivada = (await createTestUser(prisma, UserRole.TEACHER, { password: hash, status: 'ARCHIVED' } as any)).user;

        const fantasma = await entrar(`nadie-${Date.now()}@test.com`, 'NoEsLaClave-1');
        expect(fantasma.status).toBe(401);

        for (const u of [desactivada, archivada]) {
            const mal = await entrar(u.email, 'NoEsLaClave-1');
            expect({ status: mal.status, code: mal.body.code }).toEqual({ status: fantasma.status, code: fantasma.body.code });
        }

        // Con la contraseña buena sí se le dice qué pasa: es su dueño.
        expect((await entrar(desactivada.email, CLAVE)).body.code).toBe('USER_INACTIVE');
        expect((await entrar(archivada.email, CLAVE)).body.code).toBe('USER_ARCHIVED');
    }, 60000);

    it('ENUM-02: un correo que no existe tarda lo mismo que uno que existe con la contraseña mal', async () => {
        const existe = (await createTestUser(prisma, UserRole.STUDENT, { password: await hashPassword(CLAVE) })).user;
        const mediana = (xs: number[]) => xs.sort((a, b) => a - b)[Math.floor(xs.length / 2)];
        const medir = async (email: string) => {
            const t: number[] = [];
            for (let i = 0; i < 5; i++) {
                const t0 = process.hrtime.bigint();
                const res = await entrar(email, `NoEsLaClave-${i}`);
                t.push(Number(process.hrtime.bigint() - t0) / 1e6);
                expect(res.status).toBe(401);
            }
            return mediana(t);
        };
        await medir(`calentar-${Date.now()}@test.com`);
        const conCuenta = await medir(existe.email);
        const sinCuenta = await medir(`nadie-${Date.now()}@test.com`);
        // bcrypt es el grueso del tiempo con cuenta; sin cuenta tiene que pagarlo igual.
        expect(sinCuenta).toBeGreaterThan(conCuenta * 0.6);
    }, 60000);
});
