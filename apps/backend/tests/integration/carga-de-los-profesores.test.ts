import { FastifyInstance } from 'fastify';
import request = require('supertest');
import { PrismaClient } from '@prisma/client';
import { createId } from '@paralleldrive/cuid2';
import { UserRole } from '../../src/utils/prisma-enums';
import { createTestServer, createTestPrismaClient, cleanTestDatabase, createTestUser, generateTestToken } from '../helpers';
import { platformPrisma } from '../../src/config/database';
import { RedisCache } from '../../src/config/redis';
import { cargaDeLosProfesores, cargaHoraria } from '../../src/services/personal.service';

/**
 * LA CARGA DE LOS PROFESORES: UNA SOLA CUENTA Y LAS HORAS DE SU CARGO
 *
 *   PROF-01  la cuenta en bloque da lo mismo que la de uno en uno, y el año
 *            pasado no cuenta;
 *   PROF-02  las horas del cargo cambian el estado (completo, le faltan, se
 *            pasa); sin ellas, el rango del liceo; solo el admin las pone;
 *   PROF-03  la lista de usuarios dice las mismas horas (antes: 45 min fijos
 *            y los años pasados sumados);
 *   PROF-04  poner bloques a una clase da sus horas con la hora de clase de
 *            SU turno (antes: 0,75 h por bloque siempre).
 */

const SLUG = 'test-institute';
const gId = () => `c${createId()}`;
const dia = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);
const HORARIO = {
    turnos: {
        MANANA: { inicio: '07:00', fin: '12:15', duracion: 45, recreos: [] },
        TARDE: { inicio: '13:00', fin: '17:40', duracion: 40, recreos: [] },
    },
};

describe('La carga de los profesores (PROF-01…04)', () => {
    let server: FastifyInstance;
    let prisma: PrismaClient;
    let admin: any, profe: any, otro: any;
    let a: any, b: any, m: any;

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
        await platformPrisma.institute.update({ where: { id: 'institute' }, data: { academicConfig: { notaMinimaAprobatoria: 10, schedule: HORARIO } } });
        admin = (await createTestUser(prisma, UserRole.ADMIN)).user;
        profe = (await createTestUser(prisma, UserRole.TEACHER, { firstName: 'Marta', lastName: 'Rojas' })).user;
        otro = (await createTestUser(prisma, UserRole.TEACHER, { firstName: 'Luis', lastName: 'Paz' })).user;
        const year = await prisma.academicYear.create({
            data: { id: gId(), name: '2026-2027', startDate: dia('2026-09-14'), endDate: dia('2027-07-31'), status: 'ACTIVE', isActive: true, instituteId: 'institute' } as any,
        });
        const viejo = await prisma.academicYear.create({
            data: { id: gId(), name: '2025-2026', startDate: dia('2025-09-15'), endDate: dia('2026-07-31'), status: 'COMPLETED', isActive: false, instituteId: 'institute' } as any,
        });
        a = await prisma.classroom.create({ data: { id: gId(), name: '1º A', slug: `a-${gId()}`, grade: 1, section: 'A', academicYearId: year.id, instituteId: 'institute' } as any });
        b = await prisma.classroom.create({ data: { id: gId(), name: '1º B', slug: `b-${gId()}`, grade: 1, section: 'B', academicYearId: year.id, instituteId: 'institute', shift: 'TARDE' } as any });
        const v = await prisma.classroom.create({ data: { id: gId(), name: '1º A', slug: `v-${gId()}`, grade: 1, section: 'A', academicYearId: viejo.id, instituteId: 'institute' } as any });
        m = await prisma.subject.create({ data: { id: gId(), name: 'Matemática', code: 'MA-01', slug: `ma-${gId()}`, instituteId: 'institute' } as any });
        const f = await prisma.subject.create({ data: { id: gId(), name: 'Física', code: 'FI-01', slug: `fi-${gId()}`, instituteId: 'institute' } as any });
        await prisma.classroomSubject.create({ data: { classroomId: a.id, subjectId: m.id, teacherId: profe.id, hoursPerWeek: 6, weeklyBlocks: 8 } as any });
        // La tarde: 6 bloques de 40 min = 4 h.
        await prisma.classroomSubject.create({ data: { classroomId: b.id, subjectId: m.id, teacherId: profe.id, hoursPerWeek: 0, weeklyBlocks: 6 } as any });
        await prisma.classroomSubject.create({ data: { classroomId: a.id, subjectId: f.id, teacherId: otro.id, hoursPerWeek: 3, weeklyBlocks: 4 } as any });
        // El año pasado no cuenta.
        await prisma.classroomSubject.create({ data: { classroomId: v.id, subjectId: m.id, teacherId: profe.id, hoursPerWeek: 30, weeklyBlocks: 40 } as any });
    });

    it('PROF-01: en bloque da lo mismo que uno a uno, sin el año pasado', async () => {
        const todos = await cargaDeLosProfesores(prisma, 'institute');
        expect(todos.get(profe.id)!.total).toBe(10);
        expect(todos.get(otro.id)!.total).toBe(3);
        for (const id of [profe.id, otro.id]) {
            const uno = await cargaHoraria(prisma, 'institute', id, '2026-10-18');
            expect(uno.total).toBe(todos.get(id)!.total);
            expect(uno.filas.length).toBe(todos.get(id)!.filas.length);
        }
    });

    it('PROF-02: las horas de su cargo cambian el estado; solo el admin las pone', async () => {
        const carga = async () => (await api().get(`/api/teachers/${profe.id}/carga-horaria`).set(como(admin, UserRole.ADMIN)).expect(200)).body.data;
        let r = await carga();
        expect(r).toMatchObject({ total: 10, horasDelCargo: null, cargo: 40, estado: 'POR_DEBAJO' });

        await api().put(`/api/teachers/${profe.id}/horas-del-cargo`).set(como(admin, UserRole.ADMIN)).send({ horas: 10 }).expect(200);
        r = await carga();
        expect(r).toMatchObject({ horasDelCargo: 10, cargo: 10, estado: 'EN_RANGO' });

        await api().put(`/api/teachers/${profe.id}/horas-del-cargo`).set(como(admin, UserRole.ADMIN)).send({ horas: 8 }).expect(200);
        expect((await carga()).estado).toBe('SOBRECARGA');

        await api().put(`/api/teachers/${profe.id}/horas-del-cargo`).set(como(admin, UserRole.ADMIN)).send({ horas: 12 }).expect(200);
        expect((await carga()).estado).toBe('POR_DEBAJO');

        await api().put(`/api/teachers/${profe.id}/horas-del-cargo`).set(como(admin, UserRole.ADMIN)).send({ horas: null }).expect(200);
        expect(await carga()).toMatchObject({ horasDelCargo: null, cargo: 40 });

        await api().put(`/api/teachers/${profe.id}/horas-del-cargo`).set(como(admin, UserRole.ADMIN)).send({ horas: 0 }).expect(400);
        await api().put(`/api/teachers/${profe.id}/horas-del-cargo`).set(como(profe, UserRole.TEACHER)).send({ horas: 20 }).expect(403);
        await api().put(`/api/teachers/${admin.id}/horas-del-cargo`).set(como(admin, UserRole.ADMIN)).send({ horas: 20 }).expect(404);
    });

    it('PROF-03: la lista de usuarios dice las mismas horas', async () => {
        await api().put(`/api/teachers/${profe.id}/horas-del-cargo`).set(como(admin, UserRole.ADMIN)).send({ horas: 36 }).expect(200);
        const r = (await api().get('/api/users').query({ role: 'TEACHER', limit: 50 }).set(como(admin, UserRole.ADMIN)).expect(200)).body;
        const marta = r.users.find((u: any) => u.id === profe.id);
        expect(marta.totalWeeklyHours).toBe(10);
        expect(marta.totalWeeklyBlocks).toBe(14);
        expect(marta.cargaHoraria).toEqual({ total: 10, cargo: 36, horasDelCargo: 36, estado: 'POR_DEBAJO' });
    });

    it('PROF-04: los bloques dan las horas de la hora de clase de su turno', async () => {
        await api()
            .patch(`/api/classrooms/${b.id}/subjects/${m.id}`)
            .set(como(admin, UserRole.ADMIN))
            .send({ weeklyBlocks: 3 })
            .expect(200);
        const tarde = await prisma.classroomSubject.findUnique({ where: { classroomId_subjectId: { classroomId: b.id, subjectId: m.id } } });
        expect(tarde!.hoursPerWeek).toBe(2); // 3 × 40 min

        await api()
            .patch(`/api/classrooms/${a.id}/subjects/${m.id}`)
            .set(como(admin, UserRole.ADMIN))
            .send({ weeklyBlocks: 3 })
            .expect(200);
        const manana = await prisma.classroomSubject.findUnique({ where: { classroomId_subjectId: { classroomId: a.id, subjectId: m.id } } });
        expect(manana!.hoursPerWeek).toBe(2.25); // 3 × 45 min
    });
});
