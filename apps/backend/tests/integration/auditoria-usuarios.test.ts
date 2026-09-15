import { FastifyInstance } from 'fastify';
import request = require('supertest');
import { PrismaClient } from '@prisma/client';
import { UserRole } from '../../src/utils/prisma-enums';
import { createTestServer, createTestPrismaClient, createTestUser, generateTestToken } from '../helpers';

/**
 * AUDITORÍA — CICLO DE VIDA DE LOS USUARIOS (los 4 roles)
 *
 * Crear, ver, editar, desactivar, archivar y borrar: administrador, profesor,
 * estudiante y representante. No basta con que el servidor responda 200: se
 * comprueba que lo guardado es lo que se pidió, que el borrado deja de aparecer
 * y que nadie sin permiso puede hacerlo.
 */

const SLUG = 'test-institute';

describe('Auditoría — usuarios: crear, editar, archivar y borrar', () => {
    let server: FastifyInstance;
    let prisma: PrismaClient;
    let adminToken: string;
    let teacherToken: string;
    const creados: string[] = [];

    const auth = (token: string) => (req: request.Test) =>
        req.set('Authorization', `Bearer ${token}`).set('X-Institute-Slug', SLUG);
    const comoAdmin = (req: request.Test) => auth(adminToken)(req);

    /** Cédula única: el id del usuario es su cédula (7 a 12 caracteres). */
    let contador = 0;
    const ci = () => `V${String(Date.now()).slice(-8)}${String(contador++).padStart(2, '0')}`;

    const nuevoUsuario = (role: UserRole, extra: Record<string, unknown> = {}) => ({
        id: ci(),
        email: `aud-${Date.now()}-${Math.floor(Math.random() * 10000)}@test.com`,
        password: 'ClaveSegura123!',
        firstName: 'Ana',
        lastName: 'Pérez',
        role,
        ...extra,
    });

    beforeAll(async () => {
        server = await createTestServer();
        prisma = await createTestPrismaClient();

        const admin = await createTestUser(prisma, UserRole.ADMIN);
        adminToken = generateTestToken(admin.user.id, UserRole.ADMIN, 'institute');
        const teacher = await createTestUser(prisma, UserRole.TEACHER);
        teacherToken = generateTestToken(teacher.user.id, UserRole.TEACHER, 'institute');
    }, 120000);

    afterAll(async () => {
        await prisma.user.deleteMany({ where: { id: { in: creados } } }).catch(() => {});
        await prisma.$disconnect();
        await server.close();
    }, 120000);

    describe.each([
        ['administrador', UserRole.ADMIN],
        ['profesor', UserRole.TEACHER],
        ['estudiante', UserRole.STUDENT],
        ['representante', UserRole.TUTOR],
    ])('%s', (nombreRol, role) => {
        let id: string;

        it('se crea y queda guardado tal cual se pidió', async () => {
            const datos = nuevoUsuario(role as UserRole);
            const res = await comoAdmin(request(server.server).post('/api/users')).send(datos);

            expect(res.status).toBe(201);
            id = res.body.user?.id ?? res.body.id ?? datos.id;
            creados.push(id);

            const enBD = await prisma.user.findUnique({ where: { id } });
            expect(enBD).not.toBeNull();
            expect(enBD!.email).toBe(datos.email);
            expect(enBD!.firstName).toBe(datos.firstName);
            expect(enBD!.role).toBe(role);
            expect(enBD!.isActive).toBe(true);
            // La contraseña nunca se guarda tal cual
            expect(enBD!.password).not.toBe(datos.password);
            // Ni se devuelve en la respuesta
            expect(JSON.stringify(res.body)).not.toContain(datos.password);
        }, 60000);

        it('aparece en el listado y en su ficha', async () => {
            const lista = await comoAdmin(request(server.server).get('/api/users').query({ limit: 100 }));
            expect(lista.status).toBe(200);
            expect((lista.body.users as any[]).some((u) => u.id === id)).toBe(true);

            const ficha = await comoAdmin(request(server.server).get(`/api/users/${id}`));
            expect(ficha.status).toBe(200);
            expect(ficha.body.user?.id ?? ficha.body.id).toBe(id);
        }, 60000);

        it('se edita y el cambio se guarda', async () => {
            const res = await comoAdmin(request(server.server).put(`/api/users/${id}`)).send({
                firstName: 'Carolina',
                lastName: 'Rodríguez',
            });
            expect(res.status).toBe(200);

            const enBD = await prisma.user.findUnique({ where: { id } });
            expect(enBD!.firstName).toBe('Carolina');
            expect(enBD!.lastName).toBe('Rodríguez');
        }, 60000);

        it('se desactiva y se vuelve a activar', async () => {
            const off = await comoAdmin(request(server.server).patch(`/api/users/${id}/status`)).send({
                isActive: false,
            });
            expect(off.status).toBe(200);
            expect((await prisma.user.findUnique({ where: { id } }))!.isActive).toBe(false);

            const on = await comoAdmin(request(server.server).patch(`/api/users/${id}/status`)).send({
                isActive: true,
            });
            expect(on.status).toBe(200);
            expect((await prisma.user.findUnique({ where: { id } }))!.isActive).toBe(true);
        }, 60000);

        it('se archiva y se desarchiva sin perder sus datos', async () => {
            const arch = await comoAdmin(request(server.server).post(`/api/users/${id}/archive`)).send({});
            expect(arch.status).toBe(200);

            const archivado = await prisma.user.findUnique({ where: { id } });
            expect((archivado as any).status).toBe('ARCHIVED');
            // Archivar no borra: el usuario sigue ahí
            expect(archivado!.firstName).toBe('Carolina');

            const desarch = await comoAdmin(request(server.server).post(`/api/users/${id}/unarchive`)).send({});
            expect(desarch.status).toBe(200);
            expect((await prisma.user.findUnique({ where: { id } }) as any).status).not.toBe('ARCHIVED');
        }, 60000);

        it('un profesor no puede crear ni borrar usuarios', async () => {
            const crear = await auth(teacherToken)(request(server.server).post('/api/users')).send(
                nuevoUsuario(role as UserRole)
            );
            expect([401, 403]).toContain(crear.status);

            const borrar = await auth(teacherToken)(request(server.server).delete(`/api/users/${id}`));
            expect([401, 403]).toContain(borrar.status);
            // Y sigue existiendo
            expect(await prisma.user.findUnique({ where: { id } })).not.toBeNull();
        }, 60000);

        it('se borra y desaparece de verdad', async () => {
            const res = await comoAdmin(request(server.server).delete(`/api/users/${id}`));
            expect(res.status).toBe(200);

            expect(await prisma.user.findUnique({ where: { id } })).toBeNull();

            const ficha = await comoAdmin(request(server.server).get(`/api/users/${id}`));
            expect(ficha.status).toBe(404);
        }, 60000);
    });

    describe('validaciones al crear', () => {
        it('rechaza un correo repetido sin filtrar detalles internos', async () => {
            const datos = nuevoUsuario(UserRole.STUDENT);
            const primero = await comoAdmin(request(server.server).post('/api/users')).send(datos);
            expect(primero.status).toBe(201);
            creados.push(primero.body.user?.id ?? datos.id);

            const repetido = await comoAdmin(request(server.server).post('/api/users')).send({
                ...datos,
                id: ci(),
            });

            expect([400, 409]).toContain(repetido.status);
            const cuerpo = JSON.stringify(repetido.body);
            expect(cuerpo).not.toMatch(/prisma|P2002|stack|node_modules/i);
        }, 60000);

        it('rechaza un correo inválido y un rol inexistente', async () => {
            const malCorreo = await comoAdmin(request(server.server).post('/api/users')).send({
                ...nuevoUsuario(UserRole.STUDENT),
                email: 'esto-no-es-un-correo',
            });
            expect(malCorreo.status).toBe(400);

            const malRol = await comoAdmin(request(server.server).post('/api/users')).send({
                ...nuevoUsuario(UserRole.STUDENT),
                role: 'DIRECTOR_GENERAL',
            });
            expect(malRol.status).toBe(400);
        }, 60000);

        it('sin token no se puede listar ni crear', async () => {
            expect((await request(server.server).get('/api/users').set('X-Institute-Slug', SLUG)).status).toBe(401);
            expect(
                (await request(server.server).post('/api/users').set('X-Institute-Slug', SLUG).send(nuevoUsuario(UserRole.STUDENT)))
                    .status
            ).toBe(401);
        }, 60000);
    });
});
