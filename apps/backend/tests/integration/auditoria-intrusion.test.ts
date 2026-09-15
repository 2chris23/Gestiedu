import { FastifyInstance } from 'fastify';
import request = require('supertest');
import { PrismaClient } from '@prisma/client';
import * as jwt from 'jsonwebtoken';
import { UserRole } from '../../src/utils/prisma-enums';
import jwt from 'jsonwebtoken';
import {
    createTestServer,
    createTestPrismaClient,
    createTestUser,
    createTestUserWithPassword,
    generateTestToken,
} from '../helpers';

/**
 * AUDITORÍA — INTENTOS DE ENTRAR SIN CREDENCIALES
 *
 * Sin correo y contraseña no se entra, y no hay nada que tocar en el navegador
 * (consola, herramientas de desarrollador, almacenamiento local) que abra la
 * puerta: quien manda es el servidor, y lo único que acepta es un token que él
 * mismo firmó.
 *
 * Cada prueba imita un intento real:
 *   - fabricar un token a mano,
 *   - cambiarle el rol a uno válido,
 *   - firmarlo con otra clave,
 *   - decirle al servidor "soy admin" por una cabecera,
 *   - reutilizar el token de otro,
 *   - seguir usando el token después de que le desactiven la cuenta.
 */

const SLUG = 'test-institute';
const PASSWORD = 'ClaveDePrueba123!';

describe('Auditoría — intentos de entrar sin credenciales', () => {
    let server: FastifyInstance;
    let prisma: PrismaClient;
    let estudiante: any;
    let tokenEstudiante: string;
    let admin: any;

    const conCabeceras = (req: request.Test, extra: Record<string, string> = {}) => {
        req.set('X-Institute-Slug', SLUG);
        for (const [k, v] of Object.entries(extra)) req.set(k, v);
        return req;
    };

    /** Una acción que solo un administrador puede hacer. */
    const accionDeAdmin = (token?: string, extra: Record<string, string> = {}) => {
        const req = request(server.server).get('/api/users').query({ limit: 5 });
        if (token) req.set('Authorization', `Bearer ${token}`);
        return conCabeceras(req, extra);
    };

    beforeAll(async () => {
        server = await createTestServer();
        prisma = await createTestPrismaClient();

        const e = await createTestUserWithPassword(prisma, UserRole.STUDENT, PASSWORD);
        estudiante = e.user;
        tokenEstudiante = generateTestToken(estudiante.id, UserRole.STUDENT, 'institute');

        admin = (await createTestUser(prisma, UserRole.ADMIN)).user;
    }, 180000);

    afterAll(async () => {
        await prisma.$disconnect();
        await server.close();
    }, 120000);

    describe('sin token no se pasa', () => {
        it.each([
            ['/api/users', 'la lista de usuarios'],
            ['/api/students', 'la lista de estudiantes'],
            ['/api/grades', 'las notas'],
            ['/api/dashboard/admin', 'el panel del liceo'],
            ['/api/classrooms', 'las secciones'],
        ])('%s (%s) responde 401', async (ruta) => {
            const res = await conCabeceras(request(server.server).get(ruta));
            expect(res.status).toBe(401);
            // Y no se escapa nada en el cuerpo
            expect(JSON.stringify(res.body)).not.toMatch(/@|cédula|password/i);
        }, 60000);
    });

    describe('un token fabricado no sirve', () => {
        it('inventado a mano (sin firma válida) → 401', async () => {
            const falso = jwt.sign(
                { userId: admin.id, role: 'ADMIN', instituteId: 'institute' },
                'clave-que-el-atacante-se-inventa',
                { expiresIn: '1h' }
            );
            expect((await accionDeAdmin(falso)).status).toBe(401);
        }, 60000);

        it('sin firma, con algoritmo "none" → 401', async () => {
            const cabecera = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
            const cuerpo = Buffer.from(
                JSON.stringify({ userId: admin.id, role: 'ADMIN', instituteId: 'institute' })
            ).toString('base64url');
            expect((await accionDeAdmin(`${cabecera}.${cuerpo}.`)).status).toBe(401);
        }, 60000);

        it('el token real de un estudiante con el rol cambiado a ADMIN → 401', async () => {
            // Lo que haría alguien desde la consola del navegador: coger su token,
            // cambiar "STUDENT" por "ADMIN" y volver a montarlo.
            const [cab, cuerpo, firma] = tokenEstudiante.split('.');
            const datos = JSON.parse(Buffer.from(cuerpo, 'base64url').toString());
            datos.role = 'ADMIN';
            const cuerpoTrucado = Buffer.from(JSON.stringify(datos)).toString('base64url');

            const res = await accionDeAdmin(`${cab}.${cuerpoTrucado}.${firma}`);
            expect(res.status).toBe(401);
        }, 60000);

        it('un token caducado → 401', async () => {
            const caducado = jwt.sign(
                { userId: estudiante.id, role: 'STUDENT', instituteId: 'institute' },
                process.env.JWT_SECRET as string,
                { expiresIn: -60 }
            );
            const res = await conCabeceras(
                request(server.server).get('/api/dashboard/student').set('Authorization', `Bearer ${caducado}`)
            );
            expect(res.status).toBe(401);
        }, 60000);

        it('basura en la cabecera → 401, no un error del servidor', async () => {
            for (const basura of ['Bearer', 'Bearer null', 'Bearer a.b.c', 'Basic YWRtaW46YWRtaW4=']) {
                const res = await conCabeceras(
                    request(server.server).get('/api/users').set('Authorization', basura)
                );
                expect(res.status).toBe(401);
            }
        }, 60000);
    });

    describe('decir "soy admin" no convierte a nadie en admin', () => {
        it('cabeceras inventadas de rol o de usuario se ignoran', async () => {
            const res = await accionDeAdmin(tokenEstudiante, {
                'X-Role': 'ADMIN',
                'X-User-Role': 'ADMIN',
                'X-User-Id': admin.id,
                'X-Admin': 'true',
            });
            expect([401, 403]).toContain(res.status);
        }, 60000);

        it('pedir datos de otro usuario cambiando el id de la URL no funciona', async () => {
            const res = await conCabeceras(
                request(server.server)
                    .get(`/api/students/${admin.id}/dashboard`)
                    .set('Authorization', `Bearer ${tokenEstudiante}`)
            );
            expect([401, 403]).toContain(res.status);
        }, 60000);

        it('el rol lo decide el servidor, no lo que venga en el cuerpo', async () => {
            // Intento de crear un usuario administrador mandando role: ADMIN
            const res = await conCabeceras(
                request(server.server)
                    .post('/api/users')
                    .set('Authorization', `Bearer ${tokenEstudiante}`)
                    .send({
                        id: 'V88888888',
                        email: `intruso-${Date.now()}@test.com`,
                        password: 'Clave12345!',
                        firstName: 'Intruso',
                        lastName: 'Falso',
                        role: 'ADMIN',
                    })
            );
            expect([401, 403]).toContain(res.status);
        }, 60000);
    });

    /**
     * LA COPIA GUARDADA NO ES UNA PUERTA TRASERA
     *
     * Esto se encontró probando, y era real: el sistema guarda copias de las
     * respuestas para ir rápido, y ese trozo de código miraba el token **sin
     * comprobar la firma**. Corría antes de la autenticación, así que bastaba
     * con inventarse un token:
     *
     *     jwt.sign({ userId: 'cédula-de-la-víctima', role: 'STUDENT' }, 'lo-que-sea')
     *
     * y devolvía el panel completo de esa persona. Sin contraseña, sin conocer
     * la clave del sistema. Y como el identificador de cada quien ES su cédula,
     * no había que adivinar nada difícil.
     *
     * Estas pruebas son la garantía de que no vuelve. Si alguna se cae, hay una
     * puerta abierta.
     */
    describe('la copia guardada no deja entrar a nadie', () => {
        it('un token inventado NO recibe los datos de otro, ni aunque estén en caché', async () => {
            const victima = await createTestUser(prisma, UserRole.STUDENT);
            const bueno = generateTestToken(victima.user.id, UserRole.STUDENT, 'institute');

            // La víctima entra: sus datos quedan guardados para ir rápido.
            const legitimo = await conCabeceras(
                request(server.server).get('/api/dashboard/student').set('Authorization', `Bearer ${bueno}`)
            );
            expect(legitimo.status).toBe(200);

            // El atacante NO conoce la clave del sistema: firma con otra cualquiera.
            const inventado = jwt.sign(
                {
                    id: victima.user.id,
                    userId: victima.user.id,
                    email: victima.user.email,
                    role: 'STUDENT',
                    instituteId: 'institute',
                },
                'clave-que-el-atacante-se-invento',
                { expiresIn: '1h' }
            );

            const intento = await conCabeceras(
                request(server.server).get('/api/dashboard/student').set('Authorization', `Bearer ${inventado}`)
            );

            expect(intento.status).toBe(401);
            expect(JSON.stringify(intento.body)).not.toContain(victima.user.email);
        }, 60000);

        it('un token sin firma tampoco abre nada', async () => {
            const victima = await createTestUser(prisma, UserRole.STUDENT);
            const bueno = generateTestToken(victima.user.id, UserRole.STUDENT, 'institute');
            await conCabeceras(
                request(server.server).get('/api/dashboard/student').set('Authorization', `Bearer ${bueno}`)
            );

            // Algoritmo "none": el truco clásico contra quien no comprueba la firma.
            const sinFirma = jwt.sign(
                { id: victima.user.id, userId: victima.user.id, role: 'STUDENT', instituteId: 'institute' },
                '',
                { algorithm: 'none' } as any
            );

            const intento = await conCabeceras(
                request(server.server).get('/api/dashboard/student').set('Authorization', `Bearer ${sinFirma}`)
            );
            expect(intento.status).toBe(401);
        }, 60000);
    });

    describe('la sesión deja de valer cuando debe', () => {
        it('si desactivan la cuenta, su token deja de servir', async () => {
            const victima = await createTestUser(prisma, UserRole.TEACHER);
            const token = generateTestToken(victima.user.id, UserRole.TEACHER, 'institute');

            const antes = await conCabeceras(
                request(server.server).get('/api/dashboard/teacher').set('Authorization', `Bearer ${token}`)
            );
            expect(antes.status).toBe(200);

            await prisma.user.update({ where: { id: victima.user.id }, data: { isActive: false } });
            // La sesión se guarda en caché unos segundos; se invalida al desactivar
            const { invalidateUserSession } = await import('../../src/middleware/auth.middleware');
            await invalidateUserSession('institute', victima.user.id);

            const despues = await conCabeceras(
                request(server.server).get('/api/dashboard/teacher').set('Authorization', `Bearer ${token}`)
            );
            expect(despues.status).toBe(401);
        }, 60000);

        it('el token de un usuario borrado no sirve', async () => {
            const efimero = await createTestUser(prisma, UserRole.STUDENT);
            const token = generateTestToken(efimero.user.id, UserRole.STUDENT, 'institute');
            await prisma.user.delete({ where: { id: efimero.user.id } });
            const { invalidateUserSession } = await import('../../src/middleware/auth.middleware');
            await invalidateUserSession('institute', efimero.user.id);

            const res = await conCabeceras(
                request(server.server).get('/api/dashboard/student').set('Authorization', `Bearer ${token}`)
            );
            expect(res.status).toBe(401);
        }, 60000);
    });

    describe('el inicio de sesión no regala información', () => {
        it('no dice si el correo existe o no', async () => {
            const malaClave = await conCabeceras(
                request(server.server).post('/api/auth/login').send({ email: estudiante.email, password: 'NoEsLaClave1!' })
            );
            const noExiste = await conCabeceras(
                request(server.server)
                    .post('/api/auth/login')
                    .send({ email: `fantasma-${Date.now()}@test.com`, password: 'NoEsLaClave1!' })
            );

            expect(malaClave.status).toBe(noExiste.status);
            expect(malaClave.body.error).toBe(noExiste.body.error);
        }, 60000);

        it('al entrar bien, la respuesta no trae la contraseña', async () => {
            const res = await conCabeceras(
                request(server.server).post('/api/auth/login').send({ email: estudiante.email, password: PASSWORD })
            );
            expect(res.status).toBe(200);

            const cuerpo = JSON.stringify(res.body);
            expect(cuerpo).not.toContain(PASSWORD);
            expect(cuerpo).not.toMatch(/\$2[aby]\$/); // ningún hash bcrypt
            expect(res.body.user?.password).toBeUndefined();
        }, 60000);

        it('los errores no enseñan las tripas del sistema', async () => {
            const res = await conCabeceras(
                request(server.server).get('/api/students/%00%27').set('Authorization', `Bearer ${tokenEstudiante}`)
            );
            const cuerpo = JSON.stringify(res.body);
            expect(cuerpo).not.toMatch(/prisma|postgres|node_modules|at .*\.ts:|stack/i);
        }, 60000);
    });
});
