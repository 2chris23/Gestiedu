import { FastifyInstance } from 'fastify';
import request = require('supertest');
import { PrismaClient } from '@prisma/client';
import { createId } from '@paralleldrive/cuid2';
import { UserRole } from '../../src/utils/prisma-enums';
import { createTestServer, createTestPrismaClient, cleanTestDatabase, createTestUser, generateTestToken } from '../helpers';
import { platformPrisma } from '../../src/config/database';
import { RedisCache } from '../../src/config/redis';

/**
 * LOS GRADUANDOS Y SU TÍTULO DE BACHILLER
 *
 *   TIT-01  antes de cerrar: los de 5to, «por cerrar», sin poder anotar título;
 *           cerrado: los egresados y los pendientes; los que repiten, no;
 *   TIT-02  el título: mención (la del liceo por defecto), serial único en el
 *           liceo, fecha; solo a quien egresó;
 *   TIT-03  la constancia de título en trámite: solo del egresado, con su
 *           mención; solo el admin.
 */

const SLUG = 'test-institute';
const gId = () => `c${createId()}`;
const dia = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);

describe('Los graduandos (TIT-01…03)', () => {
    let server: FastifyInstance;
    let prisma: PrismaClient;
    let admin: any, profe: any, year: any, quinto: any, ana: any, beto: any, carla: any;

    const como = (u: any, role: UserRole) => ({ Authorization: `Bearer ${generateTestToken(u.id, role, 'institute')}`, 'X-Institute-Slug': SLUG });
    const api = () => request(server.server);
    const comoAdmin = () => como(admin, UserRole.ADMIN);
    const titulo = (s: any, body: any) => api().put(`/api/academic-years/${year.id}/graduandos/${s.id}/titulo`).set(comoAdmin()).send(body);
    const cerrar = async () => {
        await prisma.academicYear.update({ where: { id: year.id }, data: { status: 'COMPLETED' } });
        const exp = (s: any, egreso: string | null, finalResult: string) =>
            prisma.academicRecord.create({ data: { studentId: s.id, academicYearId: year.id, sectionSnapshot: '5º A', finalAverage: 15, status: 'COMPLETED', finalResult, egreso } });
        await exp(ana, 'EGRESADO', 'PROMOVIDO');
        await exp(beto, 'PENDIENTE', 'PROMOVIDO_CON_PENDIENTES');
        await exp(carla, null, 'NO_PROMOVIDO');
    };

    beforeAll(async () => {
        server = await createTestServer();
        prisma = await createTestPrismaClient();
    }, 120000);

    afterAll(async () => {
        await platformPrisma.institute.update({ where: { id: 'institute' }, data: { academicConfig: {} } }).catch(() => undefined);
        await prisma.$disconnect();
        await server.close();
    });

    beforeEach(async () => {
        await cleanTestDatabase(prisma);
        await RedisCache.clearPattern('*').catch(() => undefined);
        await platformPrisma.institute.update({ where: { id: 'institute' }, data: { academicConfig: { notaMinimaAprobatoria: 10 } } });
        admin = (await createTestUser(prisma, UserRole.ADMIN)).user;
        profe = (await createTestUser(prisma, UserRole.TEACHER)).user;
        year = await prisma.academicYear.create({
            data: { id: gId(), name: '2025-2026', startDate: dia('2025-09-15'), endDate: dia('2026-07-31'), status: 'ACTIVE', isActive: true, instituteId: 'institute' } as any,
        });
        quinto = await prisma.classroom.create({ data: { id: gId(), name: '5º A', slug: `q-${gId()}`, grade: 5, section: 'A', academicYearId: year.id, instituteId: 'institute' } as any });
        const cuarto = await prisma.classroom.create({ data: { id: gId(), name: '4º A', slug: `c-${gId()}`, grade: 4, section: 'A', academicYearId: year.id, instituteId: 'institute' } as any });
        ana = (await createTestUser(prisma, UserRole.STUDENT, { firstName: 'Ana', lastName: 'Arias' })).user;
        beto = (await createTestUser(prisma, UserRole.STUDENT, { firstName: 'Beto', lastName: 'Bello' })).user;
        carla = (await createTestUser(prisma, UserRole.STUDENT, { firstName: 'Carla', lastName: 'Cruz' })).user;
        const dario = (await createTestUser(prisma, UserRole.STUDENT, { firstName: 'Darío', lastName: 'Díaz' })).user;
        for (const s of [ana, beto, carla]) await prisma.studentClassroom.create({ data: { studentId: s.id, classroomId: quinto.id, academicYearId: year.id } });
        await prisma.studentClassroom.create({ data: { studentId: dario.id, classroomId: cuarto.id, academicYearId: year.id } });
    });

    it('TIT-01: por cerrar, los de 5to; cerrado, egresados y pendientes', async () => {
        const antes = (await api().get(`/api/academic-years/${year.id}/graduandos`).set(comoAdmin()).expect(200)).body.data;
        expect(antes.ciclo.cerrado).toBe(false);
        expect(antes.graduandos.map((g: any) => [g.alumno.nombre, g.estado])).toEqual([
            ['Ana Arias', 'POR_CERRAR'],
            ['Beto Bello', 'POR_CERRAR'],
            ['Carla Cruz', 'POR_CERRAR'],
        ]);
        expect((await titulo(ana, { serial: 'A-001' })).status).toBe(409);

        await cerrar();
        const despues = (await api().get(`/api/academic-years/${year.name}/graduandos`).set(comoAdmin()).expect(200)).body.data;
        expect(despues.graduandos.map((g: any) => [g.alumno.nombre, g.estado])).toEqual([
            ['Ana Arias', 'EGRESADO'],
            ['Beto Bello', 'PENDIENTE'],
        ]);
        expect(despues.mencion).toBe('Bachiller en Ciencias y Tecnología');
    });

    it('TIT-02: el título, con serial único y solo a quien egresó', async () => {
        await cerrar();
        const t = await titulo(ana, { serial: 'ab-000123', fechaDeExpedicion: '2026-08-15' }).expect(200);
        expect(t.body.data).toEqual({ mencion: 'Bachiller en Ciencias y Tecnología', serial: 'AB-000123', fechaDeExpedicion: '2026-08-15' });
        // Corregir no duplica.
        await titulo(ana, { serial: 'AB-000123', mencion: 'Bachiller en Ciencias' }).expect(200);
        expect(await prisma.titulo.count()).toBe(1);
        // Al pendiente, no.
        const pendiente = await titulo(beto, { serial: 'AB-000124' });
        expect(pendiente.status).toBe(409);
        expect(pendiente.body.code).toBe('NO_EGRESADO');
        // Un serial que ya es de otro, no (con otro egresado).
        const eva = (await createTestUser(prisma, UserRole.STUDENT, { firstName: 'Eva', lastName: 'Ely' })).user;
        await prisma.studentClassroom.create({ data: { studentId: eva.id, classroomId: quinto.id, academicYearId: year.id } });
        await prisma.academicRecord.create({ data: { studentId: eva.id, academicYearId: year.id, sectionSnapshot: '5º A', finalAverage: 16, status: 'COMPLETED', finalResult: 'PROMOVIDO', egreso: 'EGRESADO' } });
        const repetido = await titulo(eva, { serial: 'AB-000123' });
        expect(repetido.status).toBe(409);
        expect(repetido.body.code).toBe('SERIAL_REPETIDO');
        await api().put(`/api/academic-years/${year.id}/graduandos/${ana.id}/titulo`).set(como(profe, UserRole.TEACHER)).send({ serial: 'X-1' }).expect(403);
    });

    it('TIT-03: la constancia de título en trámite, con su mención', async () => {
        const antes = await api().get(`/api/students/${ana.id}/constancia?tipo=TITULO_EN_TRAMITE`).set(comoAdmin());
        expect(antes.status).toBe(409);
        expect(antes.body.code).toBe('NO_EGRESADO');
        await cerrar();
        await titulo(ana, { mencion: 'Bachiller en Ciencias' }).expect(200);
        const c = await api().get(`/api/students/${ana.id}/constancia?tipo=TITULO_EN_TRAMITE`).set(comoAdmin()).expect(200);
        expect(c.body.data.titulo).toBe('Constancia de título en trámite');
        expect(c.body.data.parrafos[0]).toContain('egresando en el año escolar 2025-2026, y que su título de Bachiller en Ciencias se encuentra en trámite');
        await api().get(`/api/students/${ana.id}/constancia?tipo=TITULO_EN_TRAMITE`).set(como(ana, UserRole.STUDENT)).expect(403);
    });
});
