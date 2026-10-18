import { FastifyInstance } from 'fastify';
import request = require('supertest');
import { PrismaClient } from '@prisma/client';
import { createId } from '@paralleldrive/cuid2';
import { UserRole } from '../../src/utils/prisma-enums';
import { createTestServer, createTestPrismaClient, cleanTestDatabase, createTestUser, generateTestToken } from '../helpers';
import { platformPrisma } from '../../src/config/database';
import { RedisCache } from '../../src/config/redis';

/**
 * EN QUÉ SECCIONES SE DA UNA MATERIA (desde Materias)
 *
 *   SECC-MAT-01  «dónde se da»: cada año con sus secciones, cuál la tiene;
 *   SECC-MAT-02  poner por año crea las clases sin profesor, con las horas
 *                de la hora de clase de su turno; poner dos veces no duplica;
 *   SECC-MAT-03  quitar una clase con trabajo (plan, actividades, notas): 409
 *                y no se quita NADA; sin trabajo, a la papelera;
 *   SECC-MAT-04  una sección nueva recibe las materias de su año, sin profesor;
 *   SECC-MAT-05  solo el admin; una sección de otro año, 400.
 */

const SLUG = 'test-institute';
const gId = () => `c${createId()}`;
const dia = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);

describe('Dónde se da una materia (SECC-MAT-01…05)', () => {
    let server: FastifyInstance;
    let prisma: PrismaClient;
    let admin: any, profe: any;
    let year: any, otroAno: any, a: any, b: any, c: any, dos: any, m: any;

    const como = (u: any, role: UserRole) => ({ Authorization: `Bearer ${generateTestToken(u.id, role, 'institute')}`, 'X-Institute-Slug': SLUG });
    const api = () => request(server.server);
    const poner = (body: any, u = admin, rol = UserRole.ADMIN) => api().put(`/api/subjects/${m.id}/secciones`).set(como(u, rol)).send(body);
    const clases = () => prisma.classroomSubject.findMany({ where: { subjectId: m.id }, orderBy: { classroomId: 'asc' } });

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
        await platformPrisma.institute.update({
            where: { id: 'institute' },
            data: {
                academicConfig: {
                    notaMinimaAprobatoria: 10,
                    schedule: { turnos: { MANANA: { inicio: '07:00', fin: '12:15', duracion: 45, recreos: [] }, TARDE: { inicio: '13:00', fin: '17:40', duracion: 40, recreos: [] } } },
                },
            },
        });
        admin = (await createTestUser(prisma, UserRole.ADMIN)).user;
        profe = (await createTestUser(prisma, UserRole.TEACHER)).user;
        year = await prisma.academicYear.create({
            data: { id: gId(), name: '2026-2027', startDate: dia('2026-09-14'), endDate: dia('2027-07-31'), status: 'ACTIVE', isActive: true, instituteId: 'institute' } as any,
        });
        otroAno = await prisma.academicYear.create({
            data: { id: gId(), name: '2025-2026', startDate: dia('2025-09-15'), endDate: dia('2026-07-31'), status: 'COMPLETED', isActive: false, instituteId: 'institute' } as any,
        });
        const seccion = (name: string, grade: number, section: string, shift = 'MANANA', ano = year.id) =>
            prisma.classroom.create({ data: { id: gId(), name, slug: `s-${gId()}`, grade, section, shift, academicYearId: ano, instituteId: 'institute' } as any });
        a = await seccion('1er Año A', 1, 'A');
        b = await seccion('1er Año B', 1, 'B', 'TARDE');
        c = await seccion('1er Año C', 1, 'C');
        dos = await seccion('2do Año A', 2, 'A');
        m = await prisma.subject.create({ data: { id: gId(), name: 'Castellano', code: 'CA-01', slug: `ca-${gId()}`, instituteId: 'institute' } as any });
    });

    it('SECC-MAT-01: cada año con sus secciones y cuál la tiene', async () => {
        await prisma.classroomSubject.create({ data: { classroomId: a.id, subjectId: m.id, teacherId: profe.id, weeklyBlocks: 4, hoursPerWeek: 3 } as any });
        const r = (await api().get(`/api/subjects/${m.id}/secciones`).query({ academicYearId: year.id }).set(como(admin, UserRole.ADMIN)).expect(200)).body.data;
        expect(r.anos.map((x: any) => [x.grado, x.secciones.length])).toEqual([
            [1, 3],
            [2, 1],
        ]);
        const primera = r.anos[0].secciones.find((s: any) => s.id === a.id);
        expect(primera).toMatchObject({ laTiene: true, bloques: 4, turno: 'MANANA' });
        expect(primera.profesor).toBeTruthy();
        expect(r.anos[0].secciones.find((s: any) => s.id === b.id)).toMatchObject({ laTiene: false, bloques: null, profesor: null, turno: 'TARDE' });
    });

    it('SECC-MAT-02: poner por año crea las clases sin profesor, con las horas de su turno', async () => {
        const body = { academicYearId: year.id, poner: [a, b].map((s) => ({ classroomId: s.id, weeklyBlocks: 6 })), quitar: [] };
        expect((await poner(body).expect(200)).body.data).toEqual({ puestas: 2, quitadas: 0 });
        const r = await clases();
        expect(r).toHaveLength(2);
        const de = (id: string) => r.find((x) => x.classroomId === id)!;
        expect(de(a.id)).toMatchObject({ teacherId: null, weeklyBlocks: 6, hoursPerWeek: 4.5 });
        expect(de(b.id)).toMatchObject({ teacherId: null, weeklyBlocks: 6, hoursPerWeek: 4 });
        // Otra vez: no duplica.
        expect((await poner(body).expect(200)).body.data).toEqual({ puestas: 0, quitadas: 0 });
        expect(await clases()).toHaveLength(2);
    });

    it('SECC-MAT-03: con trabajo no se quita; sin trabajo, a la papelera', async () => {
        await poner({ academicYearId: year.id, poner: [a, b, c].map((s) => ({ classroomId: s.id, weeklyBlocks: 4 })), quitar: [] }).expect(200);
        await prisma.evaluationPlanRow.create({ data: { classroomId: a.id, subjectId: m.id, lapso: '1', rowType: 'EVALUATION', weekNumber: 2 } as any });

        const r = await poner({ academicYearId: year.id, poner: [], quitar: [a.id, c.id] });
        expect(r.status).toBe(409);
        expect(r.body.code).toBe('CLASE_CON_TRABAJO');
        expect(r.body.error ?? r.body.message).toContain('1er Año A');
        expect(await clases()).toHaveLength(3); // nada se quitó

        expect((await poner({ academicYearId: year.id, poner: [], quitar: [c.id] }).expect(200)).body.data).toEqual({ puestas: 0, quitadas: 1 });
        expect((await clases()).map((x) => x.classroomId).sort()).toEqual([a.id, b.id].sort());
        const copia = await prisma.registroBorrado.findFirst({ where: { tabla: { in: ['classroom_subjects', 'classroomSubject'] } } as any });
        expect(copia).toBeTruthy();
    });

    it('SECC-MAT-04: una sección nueva recibe las materias de su año, sin profesor', async () => {
        await prisma.classroomSubject.create({ data: { classroomId: a.id, subjectId: m.id, teacherId: profe.id, weeklyBlocks: 5, hoursPerWeek: 3.75 } as any });
        const r = await api()
            .post('/api/classrooms')
            .set(como(admin, UserRole.ADMIN))
            .send({ academicYearId: year.id, grade: 1, section: 'D', shift: 'TARDE' })
            .expect(201);
        const nueva = await prisma.classroomSubject.findMany({ where: { classroomId: r.body.id } });
        expect(nueva).toHaveLength(1);
        expect(nueva[0]).toMatchObject({ subjectId: m.id, teacherId: null, weeklyBlocks: 5, hoursPerWeek: 3.33 });
        // Un año sin secciones hermanas no recibe nada.
        const r2 = await api().post('/api/classrooms').set(como(admin, UserRole.ADMIN)).send({ academicYearId: year.id, grade: 3, section: 'A' }).expect(201);
        expect(await prisma.classroomSubject.count({ where: { classroomId: r2.body.id } })).toBe(0);
    });

    it('SECC-MAT-05: solo el admin; una sección de otro año, 400', async () => {
        await api().get(`/api/subjects/${m.id}/secciones`).query({ academicYearId: year.id }).set(como(profe, UserRole.TEACHER)).expect(403);
        await poner({ academicYearId: year.id, poner: [{ classroomId: a.id, weeklyBlocks: 4 }], quitar: [] }, profe, UserRole.TEACHER).expect(403);
        const vieja = await prisma.classroom.create({
            data: { id: gId(), name: '1er Año A', slug: `v-${gId()}`, grade: 1, section: 'A', academicYearId: otroAno.id, instituteId: 'institute' } as any,
        });
        const r = await poner({ academicYearId: year.id, poner: [{ classroomId: vieja.id, weeklyBlocks: 4 }], quitar: [] });
        expect(r.status).toBe(400);
        expect(r.body.code).toBe('SECCION_DE_OTRO_ANO');
        expect(await clases()).toHaveLength(0);
    });
});
