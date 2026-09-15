import { FastifyInstance } from 'fastify';
import request = require('supertest');
import { PrismaClient } from '@prisma/client';
import { UserRole } from '../../src/utils/prisma-enums';
import {
    createTestServer,
    createTestPrismaClient,
    createTestUser,
    generateTestToken,
} from '../helpers';

/**
 * LA CONTRASEÑA NO SE REGALA
 *
 * Se encontró probando, y era real: al crear un usuario, si no se mandaba
 * contraseña, el sistema le ponía una fija **escrita en el código fuente**:
 *
 *     bcrypt.hash(userData.password || 'temporal123', 10)
 *
 * Todas las cuentas creadas así compartían la misma contraseña. Se reprodujo:
 * crear un alumno sin contraseña y entrar con `temporal123` devolvía 200.
 *
 * Y era alcanzable de verdad: la pantalla de crear usuario borra ese campo
 * cuando va vacío, con un comentario que decía *"aunque el validador debería
 * atraparlo"*. Un guardia que "debería" no es un guardia — por eso ahora se
 * exige en el servidor, que es el único sitio que un atacante no controla.
 */

const SLUG = 'test-institute';

describe('La contraseña no se regala', () => {
    let server: FastifyInstance;
    let prisma: PrismaClient;
    let admin: any;
    let tokenAdmin: string;

    /** Cédulas cortas y únicas: el sistema las limita a 12 caracteres. */
    let contador = 0;
    const nuevaCedula = () => `V-7${String(Date.now()).slice(-6)}${contador++}`;

    const comoAdmin = (req: request.Test) =>
        req.set('Authorization', `Bearer ${tokenAdmin}`).set('X-Institute-Slug', SLUG);

    beforeAll(async () => {
        server = await createTestServer();
        prisma = await createTestPrismaClient();
        admin = (await createTestUser(prisma, UserRole.ADMIN)).user;
        tokenAdmin = generateTestToken(admin.id, UserRole.ADMIN, 'institute');
    }, 120000);

    afterAll(async () => {
        await prisma.$disconnect();
        await server.close();
    });

    const crear = (extra: Record<string, unknown>) => {
        const cedula = nuevaCedula();
        return comoAdmin(
            request(server.server)
                .post('/api/users')
                .send({
                    id: cedula,
                    email: `prueba.${cedula.toLowerCase()}@testing.edu.ve`,
                    firstName: 'Prueba',
                    lastName: 'Contrasena',
                    role: 'STUDENT',
                    ...extra,
                })
        );
    };

    it('CLAVE-01: no se puede crear un usuario SIN contraseña', async () => {
        const res = await crear({});

        expect(res.status).toBe(400);
        expect(res.body.code).toBe('CONTRASENA_REQUERIDA');
        // El mensaje tiene que decir qué falta, no "error interno".
        expect(String(res.body.message)).toMatch(/contraseña/i);
    });

    it('CLAVE-02: la contraseña fija del código fuente ya no abre nada', async () => {
        // Se intenta crear una cuenta sin contraseña y entrar con la que antes
        // se ponía sola. Ni se crea, ni se entra.
        const cedula = nuevaCedula();
        const correo = `fuga.${cedula.toLowerCase()}@testing.edu.ve`;

        await comoAdmin(
            request(server.server).post('/api/users').send({
                id: cedula,
                email: correo,
                firstName: 'Sin',
                lastName: 'Clave',
                role: 'STUDENT',
            })
        );

        const intento = await request(server.server)
            .post('/api/auth/login')
            .set('X-Institute-Slug', SLUG)
            .send({ email: correo, password: 'temporal123' });

        expect(intento.status).toBeGreaterThanOrEqual(400);
    });

    it('CLAVE-03: una contraseña demasiado corta se rechaza con un motivo claro', async () => {
        const res = await crear({ password: '123' });

        expect(res.status).toBe(400);
        // Puede rechazarla el esquema de la ruta o la comprobación del
        // controlador — da igual cuál, mientras se rechace y se diga por qué.
        const explicacion = JSON.stringify(res.body);
        expect(explicacion).toMatch(/8/);
        expect(explicacion).toMatch(/ontraseña/);
    });

    it('CLAVE-04: con una contraseña en regla, la cuenta se crea y sirve', async () => {
        const cedula = nuevaCedula();
        const correo = `buena.${cedula.toLowerCase()}@testing.edu.ve`;
        const clave = 'EstaSiSirve2026';

        const creado = await comoAdmin(
            request(server.server).post('/api/users').send({
                id: cedula,
                email: correo,
                firstName: 'Con',
                lastName: 'Clave',
                role: 'STUDENT',
                password: clave,
            })
        );
        expect(creado.status).toBe(201);

        const entrada = await request(server.server)
            .post('/api/auth/login')
            .set('X-Institute-Slug', SLUG)
            .send({ email: correo, password: clave });

        expect(entrada.status).toBe(200);
    });

    it('CLAVE-05: la contraseña nunca viaja de vuelta en la respuesta', async () => {
        const cedula = nuevaCedula();
        const res = await comoAdmin(
            request(server.server).post('/api/users').send({
                id: cedula,
                email: `silencio.${cedula.toLowerCase()}@testing.edu.ve`,
                firstName: 'Sin',
                lastName: 'Eco',
                role: 'STUDENT',
                password: 'UnaClaveLarga2026',
            })
        );

        const comoTexto = JSON.stringify(res.body);
        expect(comoTexto).not.toContain('UnaClaveLarga2026');
        // Ni la contraseña cifrada: eso permitiría probarla sin límite aparte.
        expect(comoTexto).not.toMatch(/\$2[aby]\$/);
    });

    it('CLAVE-06: se guarda cifrada, nunca tal cual', async () => {
        const cedula = nuevaCedula();
        const clave = 'OtraClaveLarga2026';

        await comoAdmin(
            request(server.server).post('/api/users').send({
                id: cedula,
                email: `cifrada.${cedula.toLowerCase()}@testing.edu.ve`,
                firstName: 'Bien',
                lastName: 'Guardada',
                role: 'STUDENT',
                password: clave,
            })
        );

        const guardado = await prisma.user.findUnique({ where: { id: cedula } });

        expect(guardado?.password).toBeTruthy();
        expect(guardado?.password).not.toBe(clave);
        // bcrypt con 12 vueltas: el prefijo lo dice.
        expect(guardado?.password).toMatch(/^\$2[aby]\$12\$/);
    });
});
