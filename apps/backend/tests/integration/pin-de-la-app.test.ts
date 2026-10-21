import { FastifyInstance } from 'fastify';
import request = require('supertest');
import { PrismaClient } from '@prisma/client';
import { UserRole } from '../../src/utils/prisma-enums';
import { createTestServer, createTestPrismaClient, createTestUser, generateTestToken } from '../helpers';
import { taparDatos } from '../../src/utils/datos-en-registros';

/**
 * EL PIN DE LA APP (teléfonos sin bloqueo de pantalla)
 *
 * Decidido por Cristian: lo crea la persona UNA vez; después solo un admin
 * lo cambia o lo resetea. Lo que no puede pasar:
 *
 *   PIN-01  se crea una vez; la segunda, 409 (cambiarlo es del admin);
 *   PIN-02  se comprueba bien y mal; nunca se devuelve el PIN ni su resumen;
 *   PIN-03  a los 10 fallos queda trabado (423), aunque luego acierte;
 *   PIN-04  el admin lo cambia y lo resetea: sube la versión y se suelta;
 *   PIN-05  profesor, alumno y representante no tocan (ni miran) el de otro (403);
 *   PIN-06  nadie cambia el suyo por la ruta del admin, ni sin sesión;
 *   PIN-07  ni el perfil ni la ficha sacan el resumen, y los registros
 *           tapan el PIN.
 */

const SLUG = 'test-institute';
const RESUMEN = /\$2[aby]\$/;

describe('El PIN de la app', () => {
    let server: FastifyInstance;
    let prisma: PrismaClient;
    const tok: Record<string, string> = {};
    const id: Record<string, string> = {};

    const cab = (t: string) => ({ Authorization: `Bearer ${t}`, 'X-Institute-Slug': SLUG });

    beforeAll(async () => {
        server = await createTestServer();
        prisma = await createTestPrismaClient();
        const roles: Array<[string, UserRole]> = [
            ['admin', UserRole.ADMIN],
            ['profe', UserRole.TEACHER],
            ['alumno', UserRole.STUDENT],
            ['tutor', UserRole.TUTOR],
        ];
        for (const [nombre, rol] of roles) {
            const { user } = await createTestUser(prisma, rol, { email: `pin-${nombre}@test.com`, firstName: 'Con', lastName: nombre });
            id[nombre] = user.id;
            tok[nombre] = generateTestToken(user.id, rol, user.instituteId as string);
        }
    });

    afterAll(async () => {
        await prisma.$disconnect();
        await server.close();
    });

    const crear = (quien: string, pin: string) => request(server.server).post('/api/auth/pin').set(cab(tok[quien])).send({ pin });
    const comprobar = (quien: string, pin: string) =>
        request(server.server).post('/api/auth/pin/comprobar').set(cab(tok[quien])).send({ pin });
    const estado = (quien: string) => request(server.server).get('/api/auth/pin').set(cab(tok[quien]));

    it('PIN-01: se crea una vez; la segunda vez, 409', async () => {
        expect((await estado('profe')).body).toMatchObject({ tienePin: false });
        expect((await crear('profe', '12a4')).status).toBe(400);
        const r = await crear('profe', '1234');
        expect(r.status).toBe(201);
        expect(r.body).toMatchObject({ tienePin: true });
        const otra = await crear('profe', '9999');
        expect(otra.status).toBe(409);
        expect(otra.body.code).toBe('YA_TIENE_PIN');
    });

    it('PIN-02: acierta y falla; nunca devuelve el PIN ni su resumen', async () => {
        const bien = await comprobar('profe', '1234');
        expect(bien.status).toBe(200);
        expect(bien.body.ok).toBe(true);
        const mal = await comprobar('profe', '0000');
        expect(mal.body.ok).toBe(false);
        const texto = JSON.stringify([bien.body, mal.body, (await estado('profe')).body]);
        expect(texto).not.toMatch(/1234/);
        expect(texto).not.toMatch(RESUMEN);
        // En la base, el resumen (bcrypt), no el PIN.
        const fila = (await prisma.user.findUnique({ where: { id: id.profe } })) as any;
        expect(fila.pinDeLaApp).toMatch(RESUMEN);
    });

    it('PIN-03: a los 10 fallos queda trabado (423), aunque luego acierte', async () => {
        await crear('alumno', '4321');
        for (let i = 0; i < 10; i++) await comprobar('alumno', '0000');
        const r = await comprobar('alumno', '4321');
        expect(r.status).toBe(423);
        expect(r.body.code).toBe('PIN_TRABADO');
    });

    it('PIN-04: el admin lo resetea y lo cambia; sube la versión y se suelta', async () => {
        const antes = (await estado('alumno')).body.version;
        const reset = await request(server.server).delete(`/api/users/${id.alumno}/pin`).set(cab(tok.admin));
        expect(reset.status).toBe(200);
        expect(reset.body).toMatchObject({ tienePin: false, trabado: false });
        expect(reset.body.version).toBe(antes + 1);
        // Lo que ve el admin en la ficha.
        const visto = await request(server.server).get(`/api/users/${id.alumno}/pin`).set(cab(tok.admin));
        expect(visto.status).toBe(200);
        expect(visto.body).toMatchObject({ tienePin: false, trabado: false });
        // Ya puede crear uno nuevo.
        expect((await crear('alumno', '5555')).status).toBe(201);

        const cambio = await request(server.server).put(`/api/users/${id.alumno}/pin`).set(cab(tok.admin)).send({ pin: '7777' });
        expect(cambio.status).toBe(200);
        expect((await comprobar('alumno', '7777')).body.ok).toBe(true);
        expect((await comprobar('alumno', '5555')).body.ok).toBe(false);
        // Queda anotado (sin el PIN) y se le avisa.
        const rastro = await prisma.auditLog.findMany({ where: { entityId: id.alumno, action: { contains: 'PIN_DE_LA_APP' } } });
        expect(rastro.length).toBe(2);
        expect(JSON.stringify(rastro)).not.toMatch(/7777/);
        const avisos = await prisma.notification.count({ where: { recipientId: id.alumno } });
        expect(avisos).toBeGreaterThanOrEqual(2);
    });

    it('PIN-05: profesor, alumno y representante no tocan el de otro', async () => {
        for (const quien of ['profe', 'alumno', 'tutor']) {
            const a = await request(server.server).delete(`/api/users/${id.admin}/pin`).set(cab(tok[quien]));
            const b = await request(server.server).put(`/api/users/${id.profe}/pin`).set(cab(tok[quien])).send({ pin: '1111' });
            const c = await request(server.server).get(`/api/users/${id.profe}/pin`).set(cab(tok[quien]));
            expect([a.status, b.status, c.status]).toEqual([403, 403, 403]);
        }
        expect((await comprobar('profe', '1234')).body.ok).toBe(true);
    });

    it('PIN-06: nadie cambia el suyo por la ruta del admin, ni sin sesión', async () => {
        const r = await request(server.server).put(`/api/users/${id.profe}/pin`).set(cab(tok.profe)).send({ pin: '2222' });
        expect(r.status).toBe(403);
        const sinSesion = await request(server.server).post('/api/auth/pin').set({ 'X-Institute-Slug': SLUG }).send({ pin: '1234' });
        expect(sinSesion.status).toBe(401);
    });

    it('PIN-07: el perfil y la ficha no sacan el resumen; los registros tapan el PIN', async () => {
        const perfil = await request(server.server).get('/api/auth/profile').set(cab(tok.profe));
        const ficha = await request(server.server).get(`/api/users/${id.profe}`).set(cab(tok.admin));
        const lista = await request(server.server).get('/api/users?limit=50').set(cab(tok.admin));
        for (const r of [perfil, ficha, lista]) {
            expect(r.status).toBe(200);
            expect(JSON.stringify(r.body)).not.toMatch(/pinDeLaApp/);
            expect(JSON.stringify(r.body)).not.toMatch(RESUMEN);
        }
        expect(taparDatos({ pin: '1234', pinDeLaApp: 'x' })).toEqual({ pin: '[oculto]', pinDeLaApp: '[oculto]' });
    });
});
