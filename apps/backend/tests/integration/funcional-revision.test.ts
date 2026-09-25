import { FastifyInstance } from 'fastify';
import request = require('supertest');
import { PrismaClient } from '@prisma/client';
import { createId } from '@paralleldrive/cuid2';
import { UserRole } from '../../src/utils/prisma-enums';
import {
    createTestServer,
    createTestPrismaClient,
    cleanTestDatabase,
    createTestUser,
    generateTestToken,
} from '../helpers';
import { platformPrisma } from '../../src/config/database';
import { RedisCache } from '../../src/config/redis';

/**
 * LA REVISIÓN DE UNA MATERIA REPROBADA
 *
 * Al terminar el año, quien reprobó una materia la presenta en revisión, y esa
 * nota es su definitiva. Gestiedu no tenía dónde anotarla: el alumno que
 * aprobaba la revisión seguía saliendo «con materia pendiente» al cerrar.
 *
 *   REV-01  una revisión aprobada saca la materia de las pendientes al cerrar;
 *   REV-02  solo se revisa una materia reprobada, con notas y de su sección, y
 *           la nota va de 0 a 20;
 *   REV-03  guardarla otra vez la corrige (no deja dos) y se redondea como el
 *           MPPE: un 9,5 es un 10;
 *   REV-04  una revisión reprobada deja la materia pendiente, con su nota;
 *   REV-05  la registra solo el admin;
 *   REV-06  con el ciclo cerrado no se toca; borrarla guarda copia y la
 *           materia vuelve a salir pendiente;
 *   REV-07  la boleta enseña la revisión y la da por aprobada.
 */

const SLUG = 'test-institute';
const gId = () => `c${createId()}`;
const dia = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);

describe('La revisión (REV-01…07)', () => {
    let server: FastifyInstance;
    let prisma: PrismaClient;
    let admin: any;
    let profe: any;
    let alumno: any;
    let year: any;
    let mate: any;
    let caste: any;
    let ingles: any;
    let ajena: any;

    const como = (u: any, role: UserRole) => ({
        Authorization: `Bearer ${generateTestToken(u.id, role, 'institute')}`,
        'X-Institute-Slug': SLUG,
    });
    const revisar = (body: any, u = admin, role = UserRole.ADMIN) =>
        request(server.server).put(`/api/academic-years/${year.id}/revisiones`).set(como(u, role)).send(body);
    const sugerencia = async () => {
        const res = await request(server.server).post(`/api/academic-years/${year.id}/close/prepare`).set(como(admin, UserRole.ADMIN)).send({}).expect(200);
        return res.body.suggestions.find((s: any) => s.studentId === alumno.id);
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
        await platformPrisma.institute.update({ where: { id: 'institute' }, data: { academicConfig: { notaMinimaAprobatoria: 10, maxMateriasPendientesParaPromover: 2 } } });

        admin = (await createTestUser(prisma, UserRole.ADMIN)).user;
        profe = (await createTestUser(prisma, UserRole.TEACHER)).user;
        year = await prisma.academicYear.create({
            data: { id: gId(), name: '2026-2027', startDate: dia('2026-09-15'), endDate: dia('2027-07-15'), isActive: true, status: 'ACTIVE', instituteId: 'institute' } as any,
        });
        const lapso = await prisma.period.create({ data: { id: gId(), name: 'Primer Lapso', startDate: dia('2026-09-15'), endDate: dia('2026-12-15'), academicYearId: year.id } });
        const seccion = await prisma.classroom.create({
            data: { id: gId(), name: '2do Año A', slug: `aula-${gId()}`, grade: 2, section: 'A', capacity: 30, academicYearId: year.id, instituteId: 'institute', teacherId: profe.id } as any,
        });
        const materia = (nombre: string) =>
            prisma.subject.create({ data: { id: gId(), name: nombre, code: `${nombre.slice(0, 3).toUpperCase()}-${gId().slice(0, 5)}`, slug: `${nombre.toLowerCase()}-${gId()}`, instituteId: 'institute' } as any });
        mate = await materia('Matemática');
        caste = await materia('Castellano');
        ingles = await materia('Inglés');
        ajena = await materia('Química');
        for (const m of [mate, caste, ingles]) {
            await prisma.classroomSubject.create({ data: { classroomId: seccion.id, subjectId: m.id, teacherId: profe.id } });
        }
        alumno = (await createTestUser(prisma, UserRole.STUDENT, { firstName: 'Luis', lastName: 'Mora' })).user;
        await prisma.studentClassroom.create({ data: { id: gId(), studentId: alumno.id, classroomId: seccion.id, academicYearId: year.id, isActive: true } });

        const nota = async (subjectId: string, score: number) => {
            const act = await prisma.activity.create({
                data: {
                    id: gId(), title: 'Evaluación', description: 'x', type: 'TAREA' as any, scope: 'CLASSROOM' as any,
                    classroomId: seccion.id, subjectId, periodId: lapso.id, createdBy: profe.id, maxGrade: 20, weight: 1,
                    startDate: new Date(), endDate: new Date(), dueDate: new Date(),
                } as any,
            });
            await prisma.grade.create({ data: { id: gId(), score, studentId: alumno.id, activityId: act.id, periodId: lapso.id, subjectId, teacherId: profe.id } });
        };
        await nota(mate.id, 8); // reprobada
        await nota(caste.id, 15); // aprobada
        // Inglés: sin notas.
    }, 180000);

    it('REV-01: una revisión aprobada saca la materia de las pendientes', async () => {
        const antes = await sugerencia();
        expect(antes.suggestedStatus).toBe('PROMOVIDO_CON_PENDIENTES');
        expect(antes.failedSubjects.map((f: any) => f.subjectId)).toEqual([mate.id]);

        await revisar({ studentId: alumno.id, subjectId: mate.id, score: 12, fecha: '2027-07-20' }).expect(200);

        const despues = await sugerencia();
        expect(despues.suggestedStatus).toBe('PROMOVIDO');
        expect(despues.failedSubjects).toEqual([]);
        const deMate = despues.subjectGrades.find((g: any) => g.subjectId === mate.id);
        expect(deMate).toMatchObject({ average: 12, approved: true, revision: 12, definitivaDeLapsos: 8 });
        // El promedio final cuenta la definitiva nueva: (12 + 15) / 2.
        expect(despues.finalAverage).toBe(13.5);
    }, 60000);

    it('REV-02: solo una materia reprobada, con notas y de su sección; nota de 0 a 20', async () => {
        expect((await revisar({ studentId: alumno.id, subjectId: caste.id, score: 18 }).expect(409)).body.code).toBe('NO_REPROBADA');
        expect((await revisar({ studentId: alumno.id, subjectId: ingles.id, score: 18 }).expect(409)).body.code).toBe('SIN_NOTAS');
        expect((await revisar({ studentId: alumno.id, subjectId: ajena.id, score: 18 }).expect(409)).body.code).toBe('MATERIA_AJENA');
        await revisar({ studentId: alumno.id, subjectId: mate.id, score: 25 }).expect(400);
        await revisar({ studentId: alumno.id, subjectId: mate.id, score: -1 }).expect(400);
        await revisar({ studentId: alumno.id, subjectId: mate.id, score: 'doce' }).expect(400);
        await revisar({ studentId: alumno.id, subjectId: mate.id, score: 12, fecha: '20/07/2027' }).expect(400);
        expect(await (prisma as any).notaDeRevision.count()).toBe(0);
    }, 60000);

    it('REV-03: guardarla otra vez la corrige, y un 9,5 es un 10', async () => {
        await revisar({ studentId: alumno.id, subjectId: mate.id, score: 7 }).expect(200);
        const res = await revisar({ studentId: alumno.id, subjectId: mate.id, score: 9.5 }).expect(200);
        expect(res.body.data.score).toBe(10);
        expect(await (prisma as any).notaDeRevision.count()).toBe(1);
        expect((await sugerencia()).suggestedStatus).toBe('PROMOVIDO');
    }, 60000);

    it('REV-04: una revisión reprobada deja la materia pendiente, con su nota', async () => {
        await revisar({ studentId: alumno.id, subjectId: mate.id, score: 6 }).expect(200);
        const s = await sugerencia();
        expect(s.suggestedStatus).toBe('PROMOVIDO_CON_PENDIENTES');
        expect(s.failedSubjects).toEqual([{ subjectId: mate.id, name: 'Matemática', average: 6, revision: 6 }]);
    }, 60000);

    it('REV-05: la registra solo el admin', async () => {
        await revisar({ studentId: alumno.id, subjectId: mate.id, score: 12 }, profe, UserRole.TEACHER).expect(403);
        await revisar({ studentId: alumno.id, subjectId: mate.id, score: 12 }, alumno, UserRole.STUDENT).expect(403);
        await request(server.server).get(`/api/academic-years/${year.id}/revisiones`).set(como(profe, UserRole.TEACHER)).expect(403);
        expect(await (prisma as any).notaDeRevision.count()).toBe(0);
    }, 60000);

    it('REV-06: con el ciclo cerrado no se toca; borrarla guarda copia', async () => {
        const nota = (await revisar({ studentId: alumno.id, subjectId: mate.id, score: 12 }).expect(200)).body.data;
        const lista = (await request(server.server).get(`/api/academic-years/${year.id}/revisiones`).set(como(admin, UserRole.ADMIN)).expect(200)).body.data;
        expect(lista).toHaveLength(1);
        expect(lista[0].subject.name).toBe('Matemática');

        await request(server.server).delete(`/api/academic-years/${year.id}/revisiones/${nota.id}`).set(como(admin, UserRole.ADMIN)).expect(200);
        expect(await (prisma as any).registroBorrado.count({ where: { tabla: 'notaDeRevision', registroId: nota.id } })).toBe(1);
        expect((await sugerencia()).suggestedStatus).toBe('PROMOVIDO_CON_PENDIENTES');

        await prisma.academicYear.update({ where: { id: year.id }, data: { status: 'COMPLETED' as any } });
        expect((await revisar({ studentId: alumno.id, subjectId: mate.id, score: 12 }).expect(409)).body.code).toBe('CICLO_CERRADO');
    }, 60000);

    it('REV-07: la boleta enseña la revisión y la da por aprobada', async () => {
        await revisar({ studentId: alumno.id, subjectId: mate.id, score: 12 }).expect(200);
        const b = (await request(server.server).get(`/api/students/${alumno.id}/boleta`).set(como(admin, UserRole.ADMIN)).expect(200)).body.data;
        const deMate = b.materias.find((m: any) => m.id === mate.id);
        expect(deMate).toMatchObject({ definitiva: 8, revision: 12, aprobada: true });
        const deCaste = b.materias.find((m: any) => m.id === caste.id);
        expect(deCaste.revision).toBeNull();
    }, 60000);
});
