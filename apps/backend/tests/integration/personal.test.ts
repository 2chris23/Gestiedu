import { FastifyInstance } from 'fastify';
import request = require('supertest');
import { PrismaClient } from '@prisma/client';
import { createId } from '@paralleldrive/cuid2';
import { UserRole } from '../../src/utils/prisma-enums';
import { createTestServer, createTestPrismaClient, cleanTestDatabase, createTestUser, generateTestToken } from '../helpers';
import { platformPrisma } from '../../src/config/database';
import { RedisCache } from '../../src/config/redis';

/**
 * EL PERSONAL: CARGA HORARIA Y CONSTANCIA DE TRABAJO
 *
 *   PERS-01  la carga horaria: las horas de la materia; sin ellas, las de sus
 *            bloques con la duración del turno; sin nada, «sin horas» (no 3);
 *   PERS-02  el rango recomendado es del liceo; el profesor ve la suya, no la
 *            de otro;
 *   PERS-03  la constancia de trabajo: cargo, ingreso y carga; solo del
 *            personal; solo el admin.
 */

const SLUG = 'test-institute';
const gId = () => `c${createId()}`;
const dia = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);

describe('El personal (PERS-01…03)', () => {
    let server: FastifyInstance;
    let prisma: PrismaClient;
    let admin: any, profe: any, otro: any, alumno: any;

    const como = (u: any, role: UserRole) => ({ Authorization: `Bearer ${generateTestToken(u.id, role, 'institute')}`, 'X-Institute-Slug': SLUG });
    const api = () => request(server.server);

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
        profe = (await createTestUser(prisma, UserRole.TEACHER, { firstName: 'Marta', lastName: 'Rojas', joinDate: dia('2019-09-16'), specialization: 'Matemática' })).user;
        otro = (await createTestUser(prisma, UserRole.TEACHER)).user;
        alumno = (await createTestUser(prisma, UserRole.STUDENT)).user;
        const year = await prisma.academicYear.create({
            data: { id: gId(), name: '2026-2027', startDate: dia('2026-09-14'), endDate: dia('2027-07-31'), status: 'ACTIVE', isActive: true, instituteId: 'institute' } as any,
        });
        const a = await prisma.classroom.create({ data: { id: gId(), name: '1º A', slug: `a-${gId()}`, grade: 1, section: 'A', academicYearId: year.id, instituteId: 'institute' } as any });
        const b = await prisma.classroom.create({ data: { id: gId(), name: '1º B', slug: `b-${gId()}`, grade: 1, section: 'B', academicYearId: year.id, instituteId: 'institute', shift: 'TARDE' } as any });
        const m = await prisma.subject.create({ data: { id: gId(), name: 'Matemática', code: 'MA-01', slug: `ma-${gId()}`, instituteId: 'institute' } as any });
        const f = await prisma.subject.create({ data: { id: gId(), name: 'Física', code: 'FI-01', slug: `fi-${gId()}`, instituteId: 'institute' } as any });
        await prisma.classroomSubject.create({ data: { classroomId: a.id, subjectId: m.id, teacherId: profe.id, hoursPerWeek: 6, weeklyBlocks: 8 } as any });
        await prisma.classroomSubject.create({ data: { classroomId: b.id, subjectId: m.id, teacherId: profe.id, hoursPerWeek: 0, weeklyBlocks: 4 } as any });
        await prisma.classroomSubject.create({ data: { classroomId: a.id, subjectId: f.id, teacherId: profe.id, hoursPerWeek: 0, weeklyBlocks: 0 } as any });
    });

    it('PERS-01: horas de la materia, de sus bloques, o «sin horas»', async () => {
        const r = (await api().get(`/api/teachers/${profe.id}/carga-horaria`).set(como(admin, UserRole.ADMIN)).expect(200)).body.data;
        const por = Object.fromEntries(r.filas.map((f: any) => [`${f.seccion}|${f.materia}`, f.horas]));
        expect(por['1º A|Matemática']).toBe(6);
        expect(por['1º B|Matemática']).toBe(3); // 4 bloques × 45 min
        expect(por['1º A|Física']).toBeNull();
        expect(r.total).toBe(9);
        expect(r.sinHoras).toBe(1);
        expect(r.estado).toBe('POR_DEBAJO');
    });

    it('PERS-02: el rango es del liceo; cada profesor ve la suya', async () => {
        await api().put('/api/institutes/current/carga-horaria').set(como(admin, UserRole.ADMIN)).send({ minimo: 8, maximo: 12 }).expect(200);
        const r = (await api().get(`/api/teachers/${profe.id}/carga-horaria`).set(como(profe, UserRole.TEACHER)).expect(200)).body.data;
        expect(r.reglas).toEqual({ minimo: 8, maximo: 12 });
        expect(r.estado).toBe('EN_RANGO');
        await api().get(`/api/teachers/${profe.id}/carga-horaria`).set(como(otro, UserRole.TEACHER)).expect(403);
        await api().put('/api/institutes/current/carga-horaria').set(como(profe, UserRole.TEACHER)).send({ minimo: 1, maximo: 2 }).expect(403);
        const mal = await api().put('/api/institutes/current/carga-horaria').set(como(admin, UserRole.ADMIN)).send({ minimo: 40, maximo: 30 });
        expect(mal.status).toBe(400);
    });

    it('PERS-03: la constancia de trabajo', async () => {
        const c = (await api().get(`/api/users/${profe.id}/constancia-de-trabajo`).set(como(admin, UserRole.ADMIN)).expect(200)).body.data;
        expect(c.titulo).toBe('Constancia de trabajo');
        expect(c.parrafos[0]).toContain(
            `el (la) ciudadano(a) Marta Rojas, titular de la cédula de identidad ${profe.id}, presta sus servicios en esta institución desde el 16 de septiembre de 2019 como docente de Matemática, con una carga horaria de 9 horas semanales.`
        );
        const deAdmin = (await api().get(`/api/users/${admin.id}/constancia-de-trabajo`).set(como(admin, UserRole.ADMIN)).expect(200)).body.data;
        expect(deAdmin.parrafos[0]).toContain('como personal administrativo.');
        expect((await api().get(`/api/users/${alumno.id}/constancia-de-trabajo`).set(como(admin, UserRole.ADMIN))).status).toBe(404);
        await api().get(`/api/users/${profe.id}/constancia-de-trabajo`).set(como(profe, UserRole.TEACHER)).expect(403);
    });
});
