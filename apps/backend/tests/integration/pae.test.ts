import { FastifyInstance } from 'fastify';
import request = require('supertest');
import { PrismaClient } from '@prisma/client';
import { UserRole } from '../../src/utils/prisma-enums';
import { createTestServer, createTestPrismaClient, cleanTestDatabase, createTestUser, generateTestToken } from '../helpers';
import { RedisCache } from '../../src/config/redis';

/**
 * EL COMEDOR (PAE)
 *
 *   PAE-01  apagado (lo normal), todo responde 403 PAE_APAGADO menos la configuración;
 *   PAE-02  un registro por día y comida: volver a anotar lo corrige, no lo duplica;
 *           el resumen del mes cuenta días, raciones y diferencia;
 *   PAE-03  más servidas que recibidas: se guarda, pero se avisa; una comida que el
 *           liceo no da, o un día que no ha llegado, no;
 *   PAE-04  solo el admin: el profesor no lo ve ni lo anota; borrar deja copia.
 */

const SLUG = 'test-institute';

describe('El comedor (PAE-01…04)', () => {
    let server: FastifyInstance;
    let prisma: PrismaClient;
    let admin: any, profe: any;

    const como = (u: any, role: UserRole) => ({ Authorization: `Bearer ${generateTestToken(u.id, role, 'institute')}`, 'X-Institute-Slug': SLUG });
    const api = () => request(server.server);
    const encender = (comidas = ['DESAYUNO', 'ALMUERZO']) =>
        api().put('/api/pae/config').set(como(admin, UserRole.ADMIN)).send({ enabled: true, comidas }).expect(200);

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
        // `cleanTestDatabase` no conoce las tablas del comedor.
        await prisma.paeRegistro.deleteMany();
        await prisma.paeConfig.deleteMany();
        await prisma.registroBorrado.deleteMany({ where: { tabla: 'paeRegistro' } });
        await RedisCache.clearPattern('*').catch(() => undefined);
        admin = (await createTestUser(prisma, UserRole.ADMIN)).user;
        profe = (await createTestUser(prisma, UserRole.TEACHER)).user;
    });

    it('PAE-01: apagado, nada responde (salvo la configuración)', async () => {
        const c = (await api().get('/api/pae/config').set(como(admin, UserRole.ADMIN)).expect(200)).body.data;
        expect(c).toEqual({ enabled: false, comidas: ['DESAYUNO', 'ALMUERZO'] });
        const r = await api().get('/api/pae/registros?mes=2026-09').set(como(admin, UserRole.ADMIN)).expect(403);
        expect(r.body.code).toBe('PAE_APAGADO');
        await api()
            .put('/api/pae/registros/2026-09-21/ALMUERZO')
            .set(como(admin, UserRole.ADMIN))
            .send({ recibidas: 300, servidas: 290 })
            .expect(403);
    });

    it('PAE-02: un registro por día y comida, y el resumen del mes', async () => {
        await encender();
        const anotar = (fecha: string, comida: string, recibidas: number, servidas: number) =>
            api().put(`/api/pae/registros/${fecha}/${comida}`).set(como(admin, UserRole.ADMIN)).send({ recibidas, servidas, menu: 'Arroz con pollo' }).expect(200);
        await anotar('2026-09-21', 'ALMUERZO', 300, 280);
        await anotar('2026-09-21', 'ALMUERZO', 300, 290); // corrige, no duplica
        await anotar('2026-09-21', 'DESAYUNO', 250, 250);
        await anotar('2026-09-22', 'ALMUERZO', 310, 300);
        await anotar('2026-08-31', 'ALMUERZO', 100, 100); // otro mes
        expect(await prisma.paeRegistro.count()).toBe(4);
        const m = (await api().get('/api/pae/registros?mes=2026-09').set(como(admin, UserRole.ADMIN)).expect(200)).body.data;
        expect(m.registros).toHaveLength(3);
        expect(m.resumen).toMatchObject({ diasServidos: 2, recibidas: 860, servidas: 840, diferencia: 20 });
        expect(m.resumen.porComida).toEqual([
            { comida: 'DESAYUNO', dias: 1, recibidas: 250, servidas: 250, diferencia: 0 },
            { comida: 'ALMUERZO', dias: 2, recibidas: 610, servidas: 590, diferencia: 20 },
        ]);
    });

    it('PAE-03: más servidas que recibidas se guarda y se avisa; lo que no cuadra, no', async () => {
        await encender();
        const r = (
            await api().put('/api/pae/registros/2026-09-21/ALMUERZO').set(como(admin, UserRole.ADMIN)).send({ recibidas: 100, servidas: 105 }).expect(200)
        ).body.data;
        expect(r.aviso).toMatch(/5 raciones más/);
        const merienda = await api().put('/api/pae/registros/2026-09-21/MERIENDA').set(como(admin, UserRole.ADMIN)).send({ recibidas: 1, servidas: 1 }).expect(400);
        expect(merienda.body.error).toMatch(/no da merienda/);
        const futuro = await api().put('/api/pae/registros/2099-01-05/ALMUERZO').set(como(admin, UserRole.ADMIN)).send({ recibidas: 1, servidas: 1 }).expect(400);
        expect(futuro.body.code).toBe('FUTURE_DATE');
        await api().put('/api/pae/registros/2026-09-21/ALMUERZO').set(como(admin, UserRole.ADMIN)).send({ recibidas: -1, servidas: 1 }).expect(400);
    });

    it('PAE-04: solo el admin; borrar deja copia en la papelera', async () => {
        await encender();
        await api().get('/api/pae/config').set(como(profe, UserRole.TEACHER)).expect(403);
        await api().put('/api/pae/config').set(como(profe, UserRole.TEACHER)).send({ enabled: false, comidas: ['ALMUERZO'] }).expect(403);
        await api().put('/api/pae/registros/2026-09-21/ALMUERZO').set(como(profe, UserRole.TEACHER)).send({ recibidas: 1, servidas: 1 }).expect(403);
        await api().put('/api/pae/registros/2026-09-21/ALMUERZO').set(como(admin, UserRole.ADMIN)).send({ recibidas: 10, servidas: 9 }).expect(200);
        await api().delete('/api/pae/registros/2026-09-21/ALMUERZO').set(como(admin, UserRole.ADMIN)).expect(200);
        expect(await prisma.paeRegistro.count()).toBe(0);
        const copia = await prisma.registroBorrado.findFirst({ where: { tabla: 'paeRegistro' } });
        expect(copia).toBeTruthy();
    });
});
