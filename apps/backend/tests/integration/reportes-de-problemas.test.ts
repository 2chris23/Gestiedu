import { FastifyInstance } from 'fastify';
import request = require('supertest');
import { PrismaClient } from '@prisma/client';
import { UserRole } from '../../src/utils/prisma-enums';
import { createTestServer, createTestPrismaClient, createTestUser, generateTestToken } from '../helpers';

/**
 * «REPORTAR UN PROBLEMA» (`routes/reportes-de-problemas.routes.ts`)
 *
 *   REPORTE-01 cualquiera con sesión lo manda (alumno, profesor, representante), y al admin le llega un aviso
 *   REPORTE-02 el admin ve todos; cada uno, solo los suyos
 *   REPORTE-03 solo el admin cambia el estado y responde; al responder, le llega al autor
 *   REPORTE-04 sin sesión, 401; un texto vacío, 400
 */

const SLUG = 'test-institute';

describe('Reportar un problema', () => {
    let server: FastifyInstance;
    let prisma: PrismaClient;
    const tok: Record<string, string> = {};
    const id: Record<string, string> = {};
    const cab = (q: string) => ({ Authorization: `Bearer ${tok[q]}`, 'X-Institute-Slug': SLUG });

    beforeAll(async () => {
        server = await createTestServer();
        prisma = await createTestPrismaClient();
        for (const [nombre, rol] of [
            ['admin', UserRole.ADMIN],
            ['profe', UserRole.TEACHER],
            ['alumno', UserRole.STUDENT],
            ['otro', UserRole.STUDENT],
        ] as Array<[string, UserRole]>) {
            const { user } = await createTestUser(prisma, rol, { email: `rep-${nombre}@test.com` });
            id[nombre] = user.id;
            tok[nombre] = generateTestToken(user.id, rol, user.instituteId as string);
        }
    }, 180000);

    afterAll(async () => {
        await prisma.$disconnect();
        await server.close();
    }, 120000);

    let elDelAlumno = '';

    it('REPORTE-01: cualquiera lo manda y al admin le llega el aviso', async () => {
        const r = await request(server.server)
            .post('/api/reportes-de-problemas')
            .set(cab('alumno'))
            .send({ texto: 'No me abre la boleta', pantalla: '/dashboard/boleta/mia?x=1', version: '1.15', huellas: ['abc123'] });
        expect(r.status).toBe(201);
        elDelAlumno = r.body.id;
        expect((await request(server.server).post('/api/reportes-de-problemas').set(cab('profe')).send({ texto: 'El horario sale vacío' })).status).toBe(201);
        // El aviso sale sin esperar a la respuesta: se le da un momento.
        await new Promise((h) => setTimeout(h, 300));
        const avisos = await prisma.notification.findMany({ where: { recipientId: id.admin, title: 'Reportaron un problema' } });
        expect(avisos.length).toBeGreaterThanOrEqual(2);
    });

    it('REPORTE-02: el admin ve todos; cada uno, los suyos', async () => {
        const a = await request(server.server).get('/api/reportes-de-problemas').set(cab('admin'));
        expect(a.status).toBe(200);
        expect(a.body.total).toBeGreaterThanOrEqual(2);
        const delAlumno = a.body.reportes.find((x: any) => x.id === elDelAlumno);
        expect(delAlumno.pantalla).toBe('/dashboard/boleta/mia');
        expect(delAlumno.huellas).toEqual(['abc123']);
        const al = await request(server.server).get('/api/reportes-de-problemas').set(cab('alumno'));
        expect(al.body.reportes.every((x: any) => x.autorId === id.alumno)).toBe(true);
        const otro = await request(server.server).get('/api/reportes-de-problemas').set(cab('otro'));
        expect(otro.body.total).toBe(0);
    });

    it('REPORTE-03: solo el admin responde, y al autor le llega', async () => {
        const noPuede = await request(server.server).patch(`/api/reportes-de-problemas/${elDelAlumno}`).set(cab('profe')).send({ estado: 'resuelto' });
        expect(noPuede.status).toBe(403);
        const r = await request(server.server)
            .patch(`/api/reportes-de-problemas/${elDelAlumno}`)
            .set(cab('admin'))
            .send({ estado: 'resuelto', respuesta: 'Ya está arreglado, vuelve a intentarlo' });
        expect(r.status).toBe(200);
        await new Promise((h) => setTimeout(h, 300));
        const aviso = await prisma.notification.findFirst({ where: { recipientId: id.alumno, title: { contains: 'Te respondieron' } } });
        expect(aviso).toBeTruthy();
        const suyo = await request(server.server).get('/api/reportes-de-problemas').set(cab('alumno'));
        expect(suyo.body.reportes[0].estado).toBe('resuelto');
        expect(suyo.body.reportes[0].respuesta).toContain('arreglado');
    });

    it('REPORTE-04: sin sesión 401; texto vacío 400', async () => {
        expect((await request(server.server).post('/api/reportes-de-problemas').send({ texto: 'hola' })).status).toBe(401);
        expect((await request(server.server).post('/api/reportes-de-problemas').set(cab('alumno')).send({ texto: '' })).status).toBe(400);
    });
});
