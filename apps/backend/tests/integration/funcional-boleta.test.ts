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
 * LA BOLETA DEL ALUMNO
 *
 * En un liceo venezolano, al terminar cada lapso se entrega la boleta: la nota
 * de cada materia en cada lapso (un entero, con el redondeo del MPPE), las
 * inasistencias y, al final, la definitiva. Gestiedu calculaba todo eso pero
 * no lo juntaba en ningún sitio: la secretaría no tenía qué imprimir.
 *
 *   BOL-01  la boleta trae las notas de cada lapso, la definitiva y las
 *           inasistencias, con el redondeo del liceo;
 *   BOL-02  la ven el admin, el propio alumno, su representante y su
 *           profesor guía; nadie más;
 *   BOL-03  con el liceo sin redondeo, salen los decimales;
 *   BOL-04  una materia sin notas sale vacía, no en 0.
 */

const SLUG = 'test-institute';
const gId = () => `c${createId()}`;
const dia = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);

describe('La boleta (BOL-01…04)', () => {
    let server: FastifyInstance;
    let prisma: PrismaClient;
    let admin: any;
    let guia: any;
    let otroProfe: any;
    let alumno: any;
    let otroAlumno: any;
    let tutor: any;
    let seccion: any;
    let mate: any;
    let caste: any;
    let ingles: any;
    let lapso1: any;
    let lapso2: any;

    const como = (u: any, role: UserRole) => ({
        Authorization: `Bearer ${generateTestToken(u.id, role, 'institute')}`,
        'X-Institute-Slug': SLUG,
    });
    const boleta = (u: any, role: UserRole) =>
        request(server.server).get(`/api/students/${alumno.id}/boleta`).set(como(u, role));

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
        guia = (await createTestUser(prisma, UserRole.TEACHER)).user;
        otroProfe = (await createTestUser(prisma, UserRole.TEACHER)).user;
        const year = await prisma.academicYear.create({
            data: { id: gId(), name: '2026-2027', startDate: dia('2026-09-15'), endDate: dia('2027-07-15'), isActive: true, status: 'ACTIVE', instituteId: 'institute' } as any,
        });
        lapso1 = await prisma.period.create({ data: { id: gId(), name: 'Primer Lapso', startDate: dia('2026-09-15'), endDate: dia('2026-12-15'), academicYearId: year.id } });
        lapso2 = await prisma.period.create({ data: { id: gId(), name: 'Segundo Lapso', startDate: dia('2027-01-07'), endDate: dia('2027-03-31'), academicYearId: year.id } });
        seccion = await prisma.classroom.create({
            data: { id: gId(), name: '1er Año A', slug: `aula-${gId()}`, grade: 1, section: 'A', capacity: 30, academicYearId: year.id, instituteId: 'institute', teacherId: guia.id } as any,
        });
        const materia = (nombre: string) =>
            prisma.subject.create({ data: { id: gId(), name: nombre, code: `${nombre.slice(0, 3).toUpperCase()}-${gId().slice(0, 5)}`, slug: `${nombre.toLowerCase()}-${gId()}`, instituteId: 'institute' } as any });
        mate = await materia('Matemática');
        caste = await materia('Castellano');
        ingles = await materia('Inglés');
        for (const m of [mate, caste, ingles]) {
            await prisma.classroomSubject.create({ data: { classroomId: seccion.id, subjectId: m.id, teacherId: otroProfe.id } });
        }
        alumno = (await createTestUser(prisma, UserRole.STUDENT, { firstName: 'Lucía', lastName: 'Pérez' })).user;
        otroAlumno = (await createTestUser(prisma, UserRole.STUDENT)).user;
        for (const a of [alumno, otroAlumno]) {
            await prisma.studentClassroom.create({ data: { id: gId(), studentId: a.id, classroomId: seccion.id, academicYearId: year.id, isActive: true } });
        }
        tutor = (await createTestUser(prisma, UserRole.TUTOR)).user;
        await prisma.studentTutor.create({ data: { studentId: alumno.id, tutorId: tutor.id, relationship: 'Madre' } });

        const nota = async (subjectId: string, periodId: string, score: number) => {
            const act = await prisma.activity.create({
                data: {
                    id: gId(), title: 'Evaluación', description: 'x', type: 'TAREA' as any, scope: 'CLASSROOM' as any,
                    classroomId: seccion.id, subjectId, periodId, createdBy: otroProfe.id, maxGrade: 20, weight: 1,
                    startDate: new Date(), endDate: new Date(), dueDate: new Date(),
                } as any,
            });
            await prisma.grade.create({ data: { id: gId(), score, studentId: alumno.id, activityId: act.id, periodId, subjectId, teacherId: otroProfe.id } });
        };
        // Matemática: 9,5 y 14 → 10 y 14 → definitiva 12.
        await nota(mate.id, lapso1.id, 9.5);
        await nota(mate.id, lapso2.id, 14);
        // Castellano: 16,4 en el primero y nada en el segundo → 16 → definitiva 16.
        await nota(caste.id, lapso1.id, 16.4);
        // Inglés: sin notas.

        // Inasistencias: en el primer lapso, dos sin justificar y una justificada.
        await prisma.dailyAttendance.createMany({
            data: [
                { studentId: alumno.id, classroomId: seccion.id, date: dia('2026-10-01'), status: 'ABSENT' as any, teacherId: otroProfe.id },
                { studentId: alumno.id, classroomId: seccion.id, date: dia('2026-10-02'), status: 'ABSENT' as any, teacherId: otroProfe.id },
                { studentId: alumno.id, classroomId: seccion.id, date: dia('2026-10-03'), status: 'EXCUSED' as any, teacherId: otroProfe.id },
                { studentId: alumno.id, classroomId: seccion.id, date: dia('2026-10-04'), status: 'PRESENT' as any, teacherId: otroProfe.id },
                { studentId: alumno.id, classroomId: seccion.id, date: dia('2027-02-01'), status: 'LATE' as any, teacherId: otroProfe.id },
            ],
        });
    }, 180000);

    it('BOL-01: notas por lapso, definitiva e inasistencias, con el redondeo del MPPE', async () => {
        const res = await boleta(admin, UserRole.ADMIN).expect(200);
        const b = res.body.data;
        expect(b.alumno.nombres).toBe('Lucía');
        expect(b.seccion.grado).toBe(1);
        expect(b.seccion.seccion).toBe('A');
        expect(b.lapsos.map((l: any) => l.id)).toEqual([lapso1.id, lapso2.id]);
        expect(b.reglas.redondeo).toBe('MPPE');

        const deMate = b.materias.find((m: any) => m.id === mate.id);
        expect(deMate.notas).toEqual({ [lapso1.id]: 10, [lapso2.id]: 14 });
        expect(deMate.definitiva).toBe(12);
        expect(deMate.aprobada).toBe(true);

        const deCaste = b.materias.find((m: any) => m.id === caste.id);
        expect(deCaste.notas).toEqual({ [lapso1.id]: 16, [lapso2.id]: null });
        expect(deCaste.definitiva).toBe(16);

        expect(b.inasistencias[lapso1.id]).toEqual({ injustificadas: 2, justificadas: 1, tardanzas: 0 });
        expect(b.inasistencias[lapso2.id]).toEqual({ injustificadas: 0, justificadas: 0, tardanzas: 1 });

        // Promedio del lapso 1: (10 + 16) / 2 = 13; definitivo: (12 + 16) / 2 = 14.
        expect(b.promedios[lapso1.id]).toBe(13);
        expect(b.promedios.definitivo).toBe(14);
    }, 60000);

    it('BOL-02: la ven el admin, el alumno, su representante y su guía; nadie más', async () => {
        await boleta(admin, UserRole.ADMIN).expect(200);
        await boleta(alumno, UserRole.STUDENT).expect(200);
        await boleta(tutor, UserRole.TUTOR).expect(200);
        await boleta(guia, UserRole.TEACHER).expect(200);
        await boleta(otroAlumno, UserRole.STUDENT).expect(403);
        // Da clase en la sección, pero no es su guía: los promedios son del guía.
        await boleta(otroProfe, UserRole.TEACHER).expect(403);
        const { user: otroTutor } = await createTestUser(prisma, UserRole.TUTOR);
        await boleta(otroTutor, UserRole.TUTOR).expect(403);
    }, 60000);

    it('BOL-03: con el liceo sin redondeo, salen los decimales', async () => {
        await platformPrisma.institute.update({
            where: { id: 'institute' },
            data: { academicConfig: { notaMinimaAprobatoria: 10, redondeoDeDefinitivas: 'NINGUNO' } },
        });
        const b = (await boleta(admin, UserRole.ADMIN).expect(200)).body.data;
        const deMate = b.materias.find((m: any) => m.id === mate.id);
        expect(deMate.notas[lapso1.id]).toBe(9.5);
        expect(deMate.definitiva).toBe(11.75);
    }, 60000);

    it('BOL-04: una materia sin notas sale vacía, no en 0, y no cuenta en el promedio', async () => {
        const b = (await boleta(admin, UserRole.ADMIN).expect(200)).body.data;
        const deIngles = b.materias.find((m: any) => m.id === ingles.id);
        expect(deIngles.notas).toEqual({ [lapso1.id]: null, [lapso2.id]: null });
        expect(deIngles.definitiva).toBeNull();
        expect(deIngles.aprobada).toBeNull();
    }, 60000);
});
