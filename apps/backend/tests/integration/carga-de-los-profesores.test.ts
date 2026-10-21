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
 *            SU turno (antes: 0,75 h por bloque siempre);
 *   PROF-05  la lista de Profesores: horas, cargo, estado, clases y las que
 *            faltan por asignar (sin las materias «por grupos»);
 *   PROF-06  la ficha: sus clases, por materia, y la sección que guía;
 *   PROF-07  todo es del admin: el profesor y el alumno, 403;
 *   PROF-08  quitar el profesor de una clase: queda sin profesor y sale en «sin asignar».
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

    it('PROF-05: la lista de Profesores y las clases sin profesor', async () => {
        const q = await prisma.subject.create({ data: { id: gId(), name: 'Química', code: 'QU-01', slug: `qu-${gId()}`, instituteId: 'institute' } as any });
        const g = await prisma.subject.create({ data: { id: gId(), name: 'GCRP', code: 'GC-01', slug: `gc-${gId()}`, instituteId: 'institute', evaluacion: 'CUALITATIVA', porGrupos: true } as any });
        await prisma.classroomSubject.create({ data: { classroomId: a.id, subjectId: q.id, weeklyBlocks: 4, hoursPerWeek: 3 } as any });
        await prisma.classroomSubject.create({ data: { classroomId: a.id, subjectId: g.id, weeklyBlocks: 2, hoursPerWeek: 1.5 } as any });
        await api().put(`/api/teachers/${otro.id}/horas-del-cargo`).set(como(admin, UserRole.ADMIN)).send({ horas: 3 }).expect(200);

        const r = (await api().get('/api/profesores').set(como(admin, UserRole.ADMIN)).expect(200)).body.data;
        expect(r.clasesSinProfesor).toBe(1); // Química; el GCRP por grupos no cuenta
        const marta = r.profesores.find((p: any) => p.id === profe.id);
        const luis = r.profesores.find((p: any) => p.id === otro.id);
        expect(marta).toMatchObject({ nombre: 'Marta Rojas', horas: 10, cargo: 40, horasDelCargo: null, estado: 'POR_DEBAJO', clases: 2, secciones: 2, promedio: null });
        expect(luis).toMatchObject({ horas: 3, cargo: 3, horasDelCargo: 3, estado: 'EN_RANGO', clases: 1 });

        const sin = (await api().get('/api/profesores/sin-asignar').set(como(admin, UserRole.ADMIN)).expect(200)).body.data;
        expect(sin).toHaveLength(1);
        expect(sin[0]).toMatchObject({ classroomId: a.id, materia: 'Química', grado: 1, turno: 'MANANA', bloques: 4 });
    });

    it('PROF-06: la ficha de un profesor', async () => {
        await prisma.classroom.update({ where: { id: a.id }, data: { teacherId: profe.id } });
        const f = (await api().get(`/api/profesores/${profe.id}`).set(como(admin, UserRole.ADMIN)).expect(200)).body.data;
        expect(f.profesor).toMatchObject({ id: profe.id, nombre: 'Marta Rojas' });
        expect(f.guiaDe).toEqual([{ id: a.id, nombre: '1º A' }]);
        expect(f).toMatchObject({ horas: 10, bloques: 14, cargo: 40, estado: 'POR_DEBAJO' });
        expect(f.clases.map((c: any) => [c.seccion, c.materia, c.horas])).toEqual([
            ['1º A', 'Matemática', 6],
            ['1º B', 'Matemática', 4],
        ]);
        expect(f.porMateria).toEqual([{ subjectId: m.id, materia: 'Matemática', secciones: 2, horas: 10, promedio: null }]);
        await api().get(`/api/profesores/${admin.id}`).set(como(admin, UserRole.ADMIN)).expect(404);
    });

    it('PROF-07: Profesores es del admin', async () => {
        const alumno = (await createTestUser(prisma, UserRole.STUDENT)).user;
        for (const [u, rol] of [[profe, UserRole.TEACHER], [alumno, UserRole.STUDENT]] as const) {
            await api().get('/api/profesores').set(como(u, rol)).expect(403);
            await api().get('/api/profesores/sin-asignar').set(como(u, rol)).expect(403);
            await api().get(`/api/profesores/${profe.id}`).set(como(u, rol)).expect(403);
        }
    });

    it('PROF-08: quitar el profesor de una clase', async () => {
        await api().patch(`/api/classrooms/${b.id}/subjects/${m.id}/teacher`).set(como(admin, UserRole.ADMIN)).send({ teacherId: null }).expect(200);
        const cs = await prisma.classroomSubject.findUnique({ where: { classroomId_subjectId: { classroomId: b.id, subjectId: m.id } } });
        expect(cs!.teacherId).toBeNull();
        const sin = (await api().get('/api/profesores/sin-asignar').set(como(admin, UserRole.ADMIN)).expect(200)).body.data;
        expect(sin.map((c: any) => c.classroomId)).toEqual([b.id]);
        const f = (await api().get(`/api/profesores/${profe.id}`).set(como(admin, UserRole.ADMIN)).expect(200)).body.data;
        expect(f.horas).toBe(6);
        await api().patch(`/api/classrooms/${a.id}/subjects/${m.id}/teacher`).set(como(profe, UserRole.TEACHER)).send({ teacherId: null }).expect(403);
    });
});
