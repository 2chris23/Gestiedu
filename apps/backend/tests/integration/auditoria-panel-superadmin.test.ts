import { FastifyInstance } from 'fastify';
import request = require('supertest');
import { PrismaClient } from '@prisma/client';
import { platformPrisma } from '../../src/config/database';
import { UserRole } from '../../src/utils/prisma-enums';
import {
    createTestServer,
    createTestPrismaClient,
    createTestUser,
    generateTestToken,
    seedSuperAdmin,
    generateSuperAdminTestToken,
} from '../helpers';

/**
 * AUDITORÍA — EL PANEL DE SUPERADMIN Y LA CONFIGURACIÓN DEL LICEO
 *
 * El panel desde el que se opera todo sin tocar código: planes, estadísticas,
 * puertos, migraciones. Y del otro lado, lo que el admin de un liceo cambia de
 * su propia casa: colores, logos, paleta de materias y las reglas académicas.
 *
 * Lo que más importa aquí es la puerta: **ninguna de estas cosas puede tocarse
 * con una sesión normal del liceo**, ni siquiera siendo administrador de uno.
 * Un admin de un liceo no manda sobre la plataforma.
 */

const SLUG = 'test-institute';

describe('Auditoría — panel de superadmin y configuración del liceo', () => {
    let server: FastifyInstance;
    let prisma: PrismaClient;

    let admin: any;
    let profesor: any;
    let alumno: any;
    const tokens: Record<string, string> = {};
    let tokenSuper: string;

    const auth = (token: string) => (req: request.Test) =>
        req.set('Authorization', `Bearer ${token}`).set('X-Institute-Slug', SLUG);
    const como = (quien: string) => (req: request.Test) => auth(tokens[quien])(req);
    const comoSuper = (req: request.Test) => req.set('Authorization', `Bearer ${tokenSuper}`);

    beforeAll(async () => {
        server = await createTestServer();
        prisma = await createTestPrismaClient();

        admin = (await createTestUser(prisma, UserRole.ADMIN)).user;
        profesor = (await createTestUser(prisma, UserRole.TEACHER)).user;
        alumno = (await createTestUser(prisma, UserRole.STUDENT)).user;

        tokens.admin = generateTestToken(admin.id, UserRole.ADMIN, 'institute');
        tokens.profesor = generateTestToken(profesor.id, UserRole.TEACHER, 'institute');
        tokens.alumno = generateTestToken(alumno.id, UserRole.STUDENT, 'institute');

        const superAdmin = await seedSuperAdmin(platformPrisma);
        tokenSuper = generateSuperAdminTestToken(superAdmin.id, superAdmin.email);
    }, 180000);

    afterAll(async () => {
        await prisma.$disconnect();
        await server.close();
    }, 120000);

    describe('la puerta del panel', () => {
        it('SUP-01: sin credenciales de plataforma no se entra al panel', async () => {
            const rutas = [
                '/api/superadmin/institutes',
                '/api/superadmin/institutes/plans',
                '/api/superadmin/institutes/stats',
                '/api/superadmin/institutes/ports/available',
                '/api/superadmin/monitoring/health',
            ];

            for (const ruta of rutas) {
                const sinNada = await request(server.server).get(ruta);
                expect([401, 403]).toContain(sinNada.status);
            }
        }, 60000);

        it('SUP-02: ser administrador de un liceo NO da acceso a la plataforma', async () => {
            for (const quien of ['admin', 'profesor', 'alumno']) {
                const res = await como(quien)(request(server.server).get('/api/superadmin/institutes'));
                expect([401, 403]).toContain(res.status);
                expect(JSON.stringify(res.body)).not.toMatch(/databasePassword|databaseUser/i);
            }
        }, 60000);

        it('SUP-03: entrar al panel con correo y contraseña, y salir', async () => {
            const login = await request(server.server)
                .post('/api/superadmin/auth/login')
                .send({ email: 'superadmin@test.com', password: 'SuperAdmin123!' });

            expect(login.status).toBe(200);
            const token = login.body?.accessToken ?? login.body?.data?.accessToken ?? login.body?.token;
            expect(token).toBeTruthy();

            const yo = await request(server.server)
                .get('/api/superadmin/auth/me')
                .set('Authorization', `Bearer ${token}`);
            expect(yo.status).toBe(200);
            expect(JSON.stringify(yo.body)).toContain('superadmin@test.com');
            expect(JSON.stringify(yo.body)).not.toMatch(/\$2[aby]\$/); // ni rastro del hash

            const salir = await request(server.server)
                .post('/api/superadmin/auth/logout')
                .set('Authorization', `Bearer ${token}`)
                .send({});
            expect([200, 204]).toContain(salir.status);
        }, 60000);

        it('SUP-04: con la contraseña equivocada no se entra, y no se dice por qué', async () => {
            const mala = await request(server.server)
                .post('/api/superadmin/auth/login')
                .send({ email: 'superadmin@test.com', password: 'la-que-no-es' });
            expect([400, 401]).toContain(mala.status);

            const inventado = await request(server.server)
                .post('/api/superadmin/auth/login')
                .send({ email: 'no-existe@test.com', password: 'la-que-no-es' });
            expect([400, 401]).toContain(inventado.status);

            // La respuesta no delata si ese correo existe o no
            expect(mala.status).toBe(inventado.status);
        }, 60000);
    });

    describe('lo que el panel enseña', () => {
        it('SUP-05: los planes y las estadísticas responden', async () => {
            const planes = await comoSuper(request(server.server).get('/api/superadmin/institutes/plans'));
            expect(planes.status).toBe(200);

            const stats = await comoSuper(request(server.server).get('/api/superadmin/institutes/stats'));
            expect(stats.status).toBe(200);
        }, 60000);

        it('SUP-06: pide un puerto libre y comprueba si uno está ocupado', async () => {
            const libre = await comoSuper(request(server.server).get('/api/superadmin/institutes/ports/available'));
            expect(libre.status).toBe(200);

            const comprobar = await comoSuper(
                request(server.server).get('/api/superadmin/institutes/ports/check').query({ port: 5599 })
            );
            expect(comprobar.status).toBe(200);
        }, 60000);

        it('SUP-07: el estado de las migraciones de cada liceo se puede consultar y reintentar', async () => {
            const estado = await comoSuper(request(server.server).get('/api/superadmin/institutes/migrations'));
            expect(estado.status).toBe(200);

            const reintento = await comoSuper(
                request(server.server).post('/api/superadmin/institutes/migrations/run')
            ).send({});
            // Puede fallar por el entorno, pero nunca puede ser un 500 mudo
            expect([200, 207, 400, 409, 503]).toContain(reintento.status);
        }, 120000);

        it('SUP-08: el panel no devuelve nunca las contraseñas de las bases', async () => {
            const lista = await comoSuper(request(server.server).get('/api/superadmin/institutes'));
            expect(lista.status).toBe(200);

            const texto = JSON.stringify(lista.body);
            expect(texto).not.toMatch(/databasePassword/i);
            expect(texto).not.toMatch(/postgresql:\/\//i);
        }, 60000);

        it('SUP-09: el monitoreo responde solo a la plataforma', async () => {
            const salud = await comoSuper(request(server.server).get('/api/superadmin/monitoring/health'));
            expect(salud.status).toBe(200);

            const conSesionDeLiceo = await como('admin')(
                request(server.server).get('/api/superadmin/monitoring/health')
            );
            expect([401, 403]).toContain(conSesionDeLiceo.status);
        }, 60000);
    });

    describe('la casa de cada liceo', () => {
        it('SUP-10: los datos públicos del liceo se ven sin sesión, y solo los públicos', async () => {
            const res = await request(server.server).get(`/api/institutes/public/${SLUG}`);

            expect([200, 404]).toContain(res.status);
            if (res.status === 200) {
                const texto = JSON.stringify(res.body);
                expect(texto).not.toMatch(/databasePassword|databaseUser|databaseHost/i);
            }
        }, 60000);

        it('SUP-11: las reglas académicas las lee cualquiera del liceo, pero solo el admin las cambia', async () => {
            const leer = await como('profesor')(request(server.server).get('/api/institutes/current/academic-config'));
            expect(leer.status).toBe(200);

            const cambioDeProfesor = await como('profesor')(
                request(server.server).put('/api/institutes/current/academic-config')
            ).send({ passingGrade: 5 });
            expect([401, 403]).toContain(cambioDeProfesor.status);

            const cambioDeAlumno = await como('alumno')(
                request(server.server).put('/api/institutes/current/academic-config')
            ).send({ passingGrade: 5 });
            expect([401, 403]).toContain(cambioDeAlumno.status);
        }, 60000);

        it('SUP-12: la paleta de materias: ver, agregar, cambiar y quitar', async () => {
            const inicial = await como('admin')(request(server.server).get('/api/institutes/subject-palette'));
            expect(inicial.status).toBe(200);

            const agregar = await como('admin')(request(server.server).post('/api/institutes/subject-palette')).send({
                color: '#123456',
            });
            expect([200, 201]).toContain(agregar.status);

            const despues = await como('admin')(request(server.server).get('/api/institutes/subject-palette'));
            expect(JSON.stringify(despues.body)).toContain('#123456');

            const colores: string[] = (despues.body?.palette ?? despues.body?.data ?? despues.body ?? []) as any;
            const indice = Array.isArray(colores) ? colores.indexOf('#123456') : 0;

            const cambiar = await como('admin')(
                request(server.server).patch(`/api/institutes/subject-palette/${indice >= 0 ? indice : 0}`)
            ).send({ color: '#654321' });
            expect([200, 204]).toContain(cambiar.status);

            const quitar = await como('admin')(
                request(server.server).delete(`/api/institutes/subject-palette/${indice >= 0 ? indice : 0}`)
            ).send({});
            expect([200, 204]).toContain(quitar.status);
        }, 60000);

        it('SUP-13: un alumno no cambia los colores ni la paleta del liceo', async () => {
            const colores = await como('alumno')(request(server.server).patch('/api/institutes/colors')).send({
                primaryColor: '#000000',
                secondaryColor: '#ffffff',
            });
            expect([401, 403]).toContain(colores.status);

            const paleta = await como('alumno')(request(server.server).post('/api/institutes/subject-palette')).send({
                color: '#abcdef',
            });
            expect([401, 403]).toContain(paleta.status);
        }, 60000);

        it('SUP-14: el admin sí cambia los colores del liceo', async () => {
            const res = await como('admin')(request(server.server).patch('/api/institutes/colors')).send({
                primaryColor: '#1d4ed8',
                secondaryColor: '#f59e0b',
            });
            expect([200, 204]).toContain(res.status);
        }, 60000);
    });
});
