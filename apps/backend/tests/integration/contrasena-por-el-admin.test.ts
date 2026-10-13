import { FastifyInstance } from 'fastify';
import request = require('supertest');
import { PrismaClient } from '@prisma/client';
import { UserRole } from '../../src/utils/prisma-enums';
import { createTestServer, createTestPrismaClient, createTestUser, createTestUserWithPassword, generateTestToken } from '../helpers';

/**
 * EL ADMIN LE PONE UNA CONTRASEÑA NUEVA A QUIEN LA PERDIÓ (octubre 2026)
 *
 * Cristian: «cambiarle la contraseña a los usuarios por si alguien la
 * pierde, pero solo el admin».
 *
 *   CONTRA-01  el admin la cambia: con la nueva se entra, con la vieja no;
 *   CONTRA-02  sus sesiones abiertas se cierran y la huella de sus teléfonos
 *              deja de valer (si alguien se la sacó, sale en el acto);
 *   CONTRA-03  profesor, alumno y representante no pueden (403), ni sin sesión;
 *   CONTRA-04  el admin no se cambia la suya por aquí (sin la actual): «Mi cuenta»;
 *   CONTRA-05  una contraseña corta no vale; queda en el registro sin la
 *              contraseña, y a esa persona le llega un aviso.
 *   CONTRA-06  editar el usuario con un campo «password» ya no finge que la
 *              cambió: se rechaza y se dice dónde se cambia.
 */

const SLUG = 'test-institute';

describe('El admin cambia la contraseña de alguien', () => {
    let server: FastifyInstance;
    let prisma: PrismaClient;
    let admin: { id: string; token: string };
    const tok: Record<string, string> = {};
    let alumno: { id: string; email: string };

    const cab = (t: string) => ({ Authorization: `Bearer ${t}`, 'X-Institute-Slug': SLUG });
    const entrar = (email: string, password: string) =>
        request(server.server).post('/api/auth/login').set('X-Institute-Slug', SLUG).send({ email, password });
    const cambiar = (quien: string | null, usuarioId: string, contrasena: string) => {
        const r = request(server.server).put(`/api/users/${usuarioId}/contrasena`).set('X-Institute-Slug', SLUG);
        if (quien) r.set('Authorization', `Bearer ${quien}`);
        return r.send({ contrasena });
    };

    beforeAll(async () => {
        server = await createTestServer();
        prisma = await createTestPrismaClient();
        const a = await createTestUser(prisma, UserRole.ADMIN, { email: 'contra-admin@test.com', firstName: 'Ada', lastName: 'Admin' });
        admin = { id: a.user.id, token: generateTestToken(a.user.id, UserRole.ADMIN, a.user.instituteId as string) };
        for (const [nombre, rol] of [
            ['profe', UserRole.TEACHER],
            ['tutor', UserRole.TUTOR],
        ] as Array<[string, UserRole]>) {
            const { user } = await createTestUser(prisma, rol, { email: `contra-${nombre}@test.com`, firstName: 'Con', lastName: nombre });
            tok[nombre] = generateTestToken(user.id, rol, user.instituteId as string);
        }
        const al = await createTestUserWithPassword(prisma, UserRole.STUDENT, 'Vieja12345', {
            email: 'contra-alumno@test.com',
            firstName: 'Ana',
            lastName: 'Alumna',
        });
        alumno = { id: al.user.id, email: 'contra-alumno@test.com' };
        tok.alumno = generateTestToken(al.user.id, UserRole.STUDENT, al.user.instituteId as string);
    });

    afterAll(async () => {
        await prisma.$disconnect();
        await server.close();
    });

    it('CONTRA-01: con la nueva se entra, con la vieja no', async () => {
        expect((await entrar(alumno.email, 'Vieja12345')).status).toBe(200);
        const r = await cambiar(admin.token, alumno.id, 'Nueva12345');
        expect(r.status).toBe(200);
        expect(r.body).toEqual({ sesionesCerradas: true });
        expect((await entrar(alumno.email, 'Nueva12345')).status).toBe(200);
        expect((await entrar(alumno.email, 'Vieja12345')).status).toBe(401);
    });

    it('CONTRA-02: sus sesiones y la huella de sus teléfonos dejan de valer', async () => {
        await entrar(alumno.email, 'Nueva12345');
        await prisma.deviceKey.create({
            data: { userId: alumno.id, tokenHash: 'resumen-de-prueba', expiresAt: new Date(Date.now() + 86_400_000) } as any,
        });
        expect(await prisma.refreshToken.count({ where: { userId: alumno.id } })).toBeGreaterThan(0);

        expect((await cambiar(admin.token, alumno.id, 'Otra123456')).status).toBe(200);
        expect(await prisma.refreshToken.count({ where: { userId: alumno.id } })).toBe(0);
        expect(await prisma.deviceKey.count({ where: { userId: alumno.id, revokedAt: null } })).toBe(0);
    });

    it('CONTRA-03: profesor, alumno y representante no pueden; sin sesión, tampoco', async () => {
        for (const quien of ['profe', 'alumno', 'tutor']) {
            expect([quien, (await cambiar(tok[quien], alumno.id, 'Robada12345')).status]).toEqual([quien, 403]);
        }
        expect((await cambiar(null, alumno.id, 'Robada12345')).status).toBe(401);
        expect((await entrar(alumno.email, 'Robada12345')).status).toBe(401);
    });

    it('CONTRA-04: el admin no se cambia la suya por aquí', async () => {
        const r = await cambiar(admin.token, admin.id, 'MiNueva12345');
        expect(r.status).toBe(400);
        expect(r.body.code).toBe('USA_MI_CUENTA');
    });

    it('CONTRA-05: corta no vale; queda en el registro sin la contraseña y se avisa', async () => {
        const corta = await cambiar(admin.token, alumno.id, '123');
        expect(corta.status).toBe(400);
        expect(corta.body.code).toBe('CONTRASENA_DEBIL');
        expect((await cambiar(admin.token, 'no-existe-este-id', 'Valida12345')).status).toBe(404);

        expect((await cambiar(admin.token, alumno.id, 'Final123456')).status).toBe(200);
        const registros = await prisma.auditLog.findMany({ where: { action: 'CAMBIAR_CONTRASENA_POR_EL_ADMIN', entityId: alumno.id } });
        expect(registros.length).toBeGreaterThan(0);
        expect(JSON.stringify(registros)).not.toMatch(/Final123456|Otra123456|Nueva12345/);
        const avisos = await prisma.notification.findMany({ where: { recipientId: alumno.id } });
        expect(avisos.some((a: any) => /contraseña/i.test(`${a.title} ${a.message}`))).toBe(true);
    });

    it('CONTRA-06: editar el usuario con «password» ya no finge que la cambió', async () => {
        const r = await request(server.server)
            .put(`/api/users/${alumno.id}`)
            .set(cab(admin.token))
            .send({ firstName: 'Ana', password: 'PorElFormulario1' });
        expect(r.status).toBe(400);
        expect(r.body.code).toBe('CONTRASENA_EN_OTRO_SITIO');
        expect((await entrar(alumno.email, 'PorElFormulario1')).status).toBe(401);
    });
});
