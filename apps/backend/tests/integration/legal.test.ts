import fs from 'fs';
import path from 'path';
import { FastifyInstance } from 'fastify';
import request = require('supertest');
import { PrismaClient } from '@prisma/client';
import { UserRole } from '../../src/utils/prisma-enums';
import { createTestServer, createTestPrismaClient, createTestUser, generateTestToken } from '../helpers';
import { VERSION_LEGAL } from '../../src/routes/legal.routes';

/**
 * ACEPTAR LOS TÉRMINOS Y LA PRIVACIDAD (19-oct-2026; `routes/legal.routes.ts`)
 *
 *   LEGAL-01 la versión del servidor es la misma que la de los textos de la web
 *   LEGAL-02 sin aceptar, lo dice; una versión vieja no se acepta; la vigente sí,
 *            una vez (aceptar dos veces no repite) y con la fecha, la dirección y el aparato
 *   LEGAL-03 cada uno acepta por sí: lo de uno no vale para otro; sin sesión, 401
 */

const SLUG = 'test-institute';

describe('Aceptar lo legal', () => {
    let server: FastifyInstance;
    let prisma: PrismaClient;
    const tk: Record<string, string> = {};
    let ana: any;
    const api = (t: string) => (r: request.Test) => r.set('Authorization', `Bearer ${t}`).set('X-Institute-Slug', SLUG);

    beforeAll(async () => {
        server = await createTestServer();
        prisma = await createTestPrismaClient();
        ana = (await createTestUser(prisma, UserRole.STUDENT)).user;
        const profe = (await createTestUser(prisma, UserRole.TEACHER)).user;
        tk.ana = generateTestToken(ana.id, UserRole.STUDENT, 'institute');
        tk.profe = generateTestToken(profe.id, UserRole.TEACHER, 'institute');
    }, 120000);

    afterAll(async () => {
        await prisma?.$disconnect();
        await server?.close();
    });

    it('LEGAL-01: la versión del servidor es la de los textos de la web', () => {
        const web = fs.readFileSync(path.resolve(__dirname, '../../../web/src/lib/legal/documentos.ts'), 'utf8');
        expect(web).toContain(`export const VERSION_LEGAL = '${VERSION_LEGAL}';`);
    });

    it('LEGAL-02: sin aceptar lo dice; la versión vieja no; la vigente una vez, con su prueba', async () => {
        const mia = () => api(tk.ana)(request(server.server).get('/api/legal/mi-aceptacion'));
        expect((await mia()).body.data).toEqual({ version: VERSION_LEGAL, aceptada: false, aceptadaEn: null });

        const vieja = await api(tk.ana)(request(server.server).post('/api/legal/aceptar')).send({ version: '2020-01-01' });
        expect([vieja.status, vieja.body.code]).toEqual([400, 'VERSION_VIEJA']);

        const si = await api(tk.ana)(request(server.server).post('/api/legal/aceptar')).set('User-Agent', 'Telefono de prueba').send({ version: VERSION_LEGAL });
        expect(si.status).toBe(200);
        await api(tk.ana)(request(server.server).post('/api/legal/aceptar')).send({ version: VERSION_LEGAL }).expect(200);
        const filas = await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM aceptaciones_legales WHERE "usuarioId" = $1`, ana.id);
        expect(filas).toHaveLength(1);
        expect(filas[0]).toMatchObject({ version: VERSION_LEGAL, aparato: 'Telefono de prueba' });
        expect(filas[0].direccion).toBeTruthy();

        const ahora = (await mia()).body.data;
        expect(ahora.aceptada).toBe(true);
        expect(Math.abs(new Date(ahora.aceptadaEn).getTime() - Date.now())).toBeLessThan(5 * 60_000);
    });

    it('LEGAL-03: lo de uno no vale para otro; sin sesión, 401', async () => {
        expect((await api(tk.profe)(request(server.server).get('/api/legal/mi-aceptacion'))).body.data.aceptada).toBe(false);
        expect((await request(server.server).get('/api/legal/mi-aceptacion').set('X-Institute-Slug', SLUG)).status).toBe(401);
        expect((await request(server.server).post('/api/legal/aceptar').set('X-Institute-Slug', SLUG).send({ version: VERSION_LEGAL })).status).toBe(401);
    });
});
