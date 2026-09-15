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
 * PROBAR CONTRASEÑAS UNA DETRÁS DE OTRA
 *
 * El sistema exige contraseñas de 8 caracteres y las guarda cifradas con bcrypt
 * a 12 vueltas, que es lo correcto. Pero eso protege la contraseña **si alguien
 * se lleva la base de datos**. No protege de lo otro: alguien probando
 * contraseñas contra la pantalla de entrar, una detrás de otra, hasta acertar.
 *
 * Contra eso hay un único guardia: el contador de peticiones por IP. Y tiene un
 * agujero conocido: **cuenta por IP, no por cuenta**. Quien tenga varias
 * direcciones —cualquiera con un móvil y el wifi, o con una red de equipos—
 * multiplica sus intentos por el número de direcciones que tenga, contra la
 * misma cuenta, sin que nada lleve la cuenta de eso.
 *
 * Aquí se mide primero **cuánto aguanta de verdad**, y luego se comprueba el
 * guardia que se puso: una cuenta que falla muchas veces seguidas se cierra un
 * rato, venga el intento de donde venga.
 */

const SLUG = 'test-institute';

describe('Probar contraseñas una detrás de otra', () => {
    let server: FastifyInstance;
    let prisma: PrismaClient;
    let victima: any;

    const CLAVE_BUENA = 'LaBuenaDeVerdad2026';

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
        victima = (await createTestUserWithPassword(prisma, UserRole.TEACHER, CLAVE_BUENA)).user;
    }, 120000);

    const intentar = (clave: string, desde?: string) => {
        const r = request(server.server)
            .post('/api/auth/login')
            .set('X-Institute-Slug', SLUG);
        // Simula venir de otra dirección: es lo que hace quien reparte los
        // intentos entre varios equipos.
        if (desde) r.set('X-Forwarded-For', desde);
        return r.send({ email: victima.email, password: clave });
    };

    it('BRUTO-01: la cuenta se cierra un rato tras varios intentos fallidos', async () => {
        let cerrada = 0;
        let respuestas: number[] = [];

        // Se prueban 15 contraseñas, cada una desde una dirección distinta, que
        // es justo lo que esquiva el contador por IP.
        for (let i = 0; i < 15; i++) {
            const res = await intentar(`inventada-${i}`, `203.0.113.${i + 1}`);
            respuestas.push(res.status);
            if (res.status === 429) cerrada++;
        }

        // Algo tiene que frenar. Si las 15 pasan todas como "contraseña
        // incorrecta", no hay nada parando a quien tenga direcciones de sobra.
        expect(cerrada).toBeGreaterThan(0);
    });

    it('BRUTO-02: una vez cerrada, NI SIQUIERA la contraseña buena entra', async () => {
        // Esto es lo que hace que el guardia sirva: si la buena entrara, bastaría
        // con seguir probando hasta dar con ella.
        for (let i = 0; i < 15; i++) {
            await intentar(`inventada-${i}`, `198.51.100.${i + 1}`);
        }

        const conLaBuena = await intentar(CLAVE_BUENA, '198.51.100.200');
        expect(conLaBuena.status).toBe(429);
    });

    it('BRUTO-03: el aviso no dice si la cuenta existe', async () => {
        // Un mensaje distinto para una cuenta que existe y otra que no le
        // regala al atacante la mitad del trabajo: saber a quién atacar.
        for (let i = 0; i < 15; i++) {
            await intentar(`inventada-${i}`, `192.0.2.${i + 1}`);
        }

        const existente = await intentar('otra-mas', '192.0.2.150');

        const inventada = await request(server.server)
            .post('/api/auth/login')
            .set('X-Institute-Slug', SLUG)
            .set('X-Forwarded-For', '192.0.2.151')
            .send({ email: 'no-existe-nadie@testing.edu.ve', password: 'lo-que-sea' });

        // Ni el mensaje ni el código pueden delatar cuál de las dos existe.
        expect(JSON.stringify(existente.body)).not.toMatch(/no existe|not found|desconocid/i);
        expect(JSON.stringify(inventada.body)).not.toMatch(/no existe|not found|desconocid/i);
    });

    it('BRUTO-04: acertar la contraseña borra la cuenta de fallos', async () => {
        // Quien se equivocó dos veces y luego acertó no puede quedarse con esos
        // dos fallos colgados para siempre.
        await intentar('me-equivoque', '203.0.113.90');
        await intentar('otra-vez', '203.0.113.91');

        const bien = await intentar(CLAVE_BUENA, '203.0.113.92');
        expect(bien.status).toBe(200);

        // Y después de acertar, vuelve a tener todos sus intentos.
        const despues = await intentar('fallo-nuevo', '203.0.113.93');
        expect(despues.status).not.toBe(429);
    });

    it('BRUTO-05: cerrar una cuenta no cierra las de los demás', async () => {
        // Si cerrar una cuenta cerrara el liceo entero, el guardia sería el
        // ataque: bastaría con fallar contra un alumno para dejar a todos fuera.
        const otro = (await createTestUserWithPassword(prisma, UserRole.STUDENT, CLAVE_BUENA)).user;

        for (let i = 0; i < 15; i++) {
            await intentar(`inventada-${i}`, `203.0.113.${100 + i}`);
        }

        const elOtroEntra = await request(server.server)
            .post('/api/auth/login')
            .set('X-Institute-Slug', SLUG)
            .set('X-Forwarded-For', '203.0.113.200')
            .send({ email: otro.email, password: CLAVE_BUENA });

        expect(elOtroEntra.status).toBe(200);
    });
});
