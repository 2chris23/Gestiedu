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
 * ASIGNAR REPRESENTANTES
 *
 * Hasta ahora la tabla que dice qué representante ve a qué alumno solo se
 * llenaba con los datos de prueba: en un liceo real no había forma de asignar a
 * nadie, y un representante recién creado entraba y no veía a ningún alumno.
 *
 * Lo que se comprueba:
 *   · que asignar hace que el representante vea al alumno, y quitar, que deje de verlo;
 *   · que solo el administrador asigna y quita;
 *   · que no se cuelan roles cambiados, duplicados ni cuentas archivadas;
 *   · que quitar pasa por la papelera.
 */

const SLUG = 'test-institute';

describe('Asignar representantes a un alumno', () => {
    let server: FastifyInstance;
    let prisma: PrismaClient;

    let admin: any;
    let profe: any;
    let ana: any;
    let luis: any;
    let madre: any;
    let otroTutor: any;
    const tk: Record<string, string> = {};

    const auth = (token: string) => (req: request.Test) =>
        req.set('Authorization', `Bearer ${token}`).set('X-Institute-Slug', SLUG);

    const asignar = (token: string, studentId: string, tutorId: string, relationship = 'Madre') =>
        auth(token)(
            request(server.server).post(`/api/users/${studentId}/tutors`).send({ tutorId, relationship })
        );

    const quitar = (token: string, studentId: string, tutorId: string) =>
        auth(token)(request(server.server).delete(`/api/users/${studentId}/tutors/${tutorId}`));

    const verAsistenciaDe = (token: string, studentId: string) =>
        auth(token)(request(server.server).get(`/api/attendance/student/${studentId}`));

    beforeAll(async () => {
        server = await createTestServer();
        prisma = await createTestPrismaClient();

        admin = (await createTestUser(prisma, UserRole.ADMIN)).user;
        profe = (await createTestUser(prisma, UserRole.TEACHER)).user;
        ana = (await createTestUser(prisma, UserRole.STUDENT)).user;
        luis = (await createTestUser(prisma, UserRole.STUDENT)).user;
        madre = (await createTestUser(prisma, UserRole.TUTOR)).user;
        otroTutor = (await createTestUser(prisma, UserRole.TUTOR)).user;

        tk.admin = generateTestToken(admin.id, UserRole.ADMIN, 'institute');
        tk.profe = generateTestToken(profe.id, UserRole.TEACHER, 'institute');
        tk.ana = generateTestToken(ana.id, UserRole.STUDENT, 'institute');
        tk.madre = generateTestToken(madre.id, UserRole.TUTOR, 'institute');
    }, 60000);

    afterAll(async () => {
        await prisma?.$disconnect();
        await server?.close();
    });

    it('REPR-01: sin asignar, la madre NO ve a Ana', async () => {
        const res = await verAsistenciaDe(tk.madre, ana.id);
        expect([401, 403]).toContain(res.status);
    }, 60000);

    it('REPR-02: el admin la asigna y desde ese momento la ve', async () => {
        const res = await asignar(tk.admin, ana.id, madre.id, 'Madre');
        expect(res.status).toBe(201);
        expect(res.body.tutor.tutor.id).toBe(madre.id);
        expect(res.body.tutor.relationship).toBe('Madre');

        const ver = await verAsistenciaDe(tk.madre, ana.id);
        expect(ver.status).toBe(200);
    }, 60000);

    it('REPR-03: el admin ve la lista de representantes de Ana', async () => {
        const res = await auth(tk.admin)(request(server.server).get(`/api/users/${ana.id}/tutors`));
        expect(res.status).toBe(200);
        expect(res.body.tutors.map((t: any) => t.tutor.id)).toEqual([madre.id]);
        // Nunca sale la contraseña del representante.
        expect(JSON.stringify(res.body)).not.toMatch(/password/i);
    }, 60000);

    it('REPR-04: asignarla dos veces responde 409, no duplica', async () => {
        const res = await asignar(tk.admin, ana.id, madre.id);
        expect(res.status).toBe(409);
        expect(await prisma.studentTutor.count({ where: { studentId: ana.id } })).toBe(1);
    }, 60000);

    it('REPR-05: nadie más que el admin puede asignar ni quitar', async () => {
        for (const token of [tk.profe, tk.ana, tk.madre]) {
            const a = await asignar(token, luis.id, madre.id);
            expect([401, 403]).toContain(a.status);
            const q = await quitar(token, ana.id, madre.id);
            expect([401, 403]).toContain(q.status);
            const l = await auth(token)(request(server.server).get(`/api/users/${ana.id}/tutors`));
            expect([401, 403]).toContain(l.status);
        }
        // La madre sigue asignada a Ana y no se coló con Luis.
        expect(await prisma.studentTutor.count({ where: { tutorId: madre.id } })).toBe(1);
    }, 60000);

    it('REPR-06: no se aceptan roles cambiados', async () => {
        // Un profesor como representante.
        expect((await asignar(tk.admin, luis.id, profe.id)).status).toBe(404);
        // Un alumno como representante de otro.
        expect((await asignar(tk.admin, luis.id, ana.id)).status).toBe(404);
        // Un representante en el lugar del alumno.
        expect((await asignar(tk.admin, madre.id, otroTutor.id)).status).toBe(404);
        // Alguien que no existe.
        expect((await asignar(tk.admin, luis.id, 'no-existe-123')).status).toBe(404);
        expect(await prisma.studentTutor.count({ where: { studentId: luis.id } })).toBe(0);
    }, 60000);

    it('REPR-07: el parentesco no puede venir vacío ni traer HTML', async () => {
        expect((await asignar(tk.admin, luis.id, otroTutor.id, '')).status).toBe(400);
        const res = await asignar(tk.admin, luis.id, otroTutor.id, '<img src=x onerror=alert(1)>Tío');
        expect(res.status).toBe(201);
        expect(res.body.tutor.relationship).not.toMatch(/[<>]/);
        await quitar(tk.admin, luis.id, otroTutor.id);
    }, 60000);

    it('REPR-08: no se asigna a una cuenta archivada', async () => {
        await prisma.user.update({ where: { id: otroTutor.id }, data: { status: 'ARCHIVED' as any } });
        const res = await asignar(tk.admin, luis.id, otroTutor.id);
        expect(res.status).toBe(409);
        await prisma.user.update({ where: { id: otroTutor.id }, data: { status: 'ACTIVE' as any } });
    }, 60000);

    it('REPR-09: al quitarla deja de ver a Ana, y el vínculo queda en la papelera', async () => {
        // Primero la ve (y queda guardada en memoria rápida esa respuesta).
        expect((await verAsistenciaDe(tk.madre, ana.id)).status).toBe(200);

        const res = await quitar(tk.admin, ana.id, madre.id);
        expect(res.status).toBe(200);

        const ver = await verAsistenciaDe(tk.madre, ana.id);
        expect([401, 403]).toContain(ver.status);

        const copia = await prisma.registroBorrado.findFirst({
            where: { tabla: 'studentTutor' },
            orderBy: { createdAt: 'desc' } as any,
        });
        expect((copia as any)?.contenido?.tutorId).toBe(madre.id);
    }, 60000);

    it('REPR-10: quitar lo que no está asignado responde 404', async () => {
        expect((await quitar(tk.admin, ana.id, madre.id)).status).toBe(404);
    }, 60000);
});
