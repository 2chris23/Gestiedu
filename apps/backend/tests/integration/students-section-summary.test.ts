import { FastifyInstance } from 'fastify';
import request = require('supertest');
import { PrismaClient } from '@prisma/client';
import { createId } from '@paralleldrive/cuid2';
import { UserRole } from '../../src/utils/prisma-enums';
import {
    createTestServer,
    createTestPrismaClient,
    cleanTestDatabase,
    createTestUserWithPassword,
    createTestAcademicYear,
    createTestClassroom,
    createTestSubject,
} from '../helpers';

/** Genera un ID compatible con los schemas zod `.cuid()` (regex /^c[^\s-]{8,}$/). */
function gId(): string {
    const id = createId();
    return id.startsWith('c') ? id : `c${id}`;
}

/**
 * FLUJO BUG 2 — RESUMEN DE SECCIÓN DEBE REFLEJAR NOTAS DE CLASE EN VIVO Y ASISTENCIA
 *
 * BUG REAL CORREGIDO:
 *  - getStudents (students.controller) calculaba el "Promedio" SOLO con AVG(score)
 *    sobre la tabla grades. Las notas de Clase en Vivo viven en
 *    ClassActivity.scores (JSON, a menudo sin planRowId — actividades ad-hoc),
 *    por lo que el listado mostraba "Sin calificar" pese a tener notas reales.
 *  - La asistencia se calculaba en la misma query con LEFT JOIN a grades, lo que
 *    adulteraba el COUNT en estudiantes sin notas; ahora se calcula con query
 *    dedicada.
 *  - DECISIÓN: calcular SIEMPRE on-demand (sin campo cacheado) con la función
 *    unificada de la Fase 2.5 (lapso-average ↔ calculateWeightedSubjectAverage
 *    ↔ fallback que incluye ClassActivity.scores ad-hoc).
 *  - Además, la vista del frontend mostraba valores hardcodeados
 *    ("Sin calificar" / "0%") en vez de los datos del endpoint.
 */

const INSTITUTE_SLUG = 'test-institute';
const DATE = '2024-06-03';

describe('Bug 2 — Resumen de sección (Promedio/Asistencia) con Clase en Vivo', () => {
    let server: FastifyInstance;
    let prisma: PrismaClient;

    let year: any;
    let period: any;
    let classroom: any;
    let subject: any;
    let teacher: { user: any; token: string };
    let student1: any;
    let student2: any;

    const login = (email: string, password: string) =>
        request(server.server)
            .post('/api/auth/login')
            .set('X-Institute-Slug', INSTITUTE_SLUG)
            .send({ email, password });

    beforeAll(async () => {
        server = await createTestServer();
        prisma = await createTestPrismaClient();
    });

    afterAll(async () => {
        await prisma.$disconnect();
        await server.close();
    });

    beforeEach(async () => {
        await cleanTestDatabase(prisma);

        await prisma.institute.upsert({
            where: { id: 'institute' },
            update: {},
            create: {
                id: 'institute',
                code: 'TEST_INST',
                slug: 'test-institute',
                name: 'Test Institute',
                email: 'test@institute.com',
            },
        });

        year = await createTestAcademicYear(prisma, 'institute');
        period = await prisma.period.create({
            data: {
                id: gId(),
                name: 'Primer Lapso',
                startDate: new Date('2024-01-01'),
                endDate: new Date('2024-04-30'),
                isActive: true,
                academicYearId: year.id,
            },
        });
        classroom = await createTestClassroom(prisma, year.id, 'institute');
        subject = await createTestSubject(prisma, 'institute');

        const t = await createTestUserWithPassword(prisma, UserRole.TEACHER, 'TeacherPass123!');
        await prisma.classroomSubject.create({
            data: { classroomId: classroom.id, subjectId: subject.id, teacherId: t.user.id },
        });

        const s1 = await createTestUserWithPassword(prisma, UserRole.STUDENT, 'StudentPass123!');
        const s2 = await createTestUserWithPassword(prisma, UserRole.STUDENT, 'StudentPass123!');

        for (const stu of [s1, s2]) {
            await prisma.studentClassroom.create({
                data: {
                    studentId: stu.user.id,
                    classroomId: classroom.id,
                    academicYearId: year.id,
                    isActive: true,
                },
            });
            await prisma.user.update({
                where: { id: stu.user.id },
                data: { classroomId: classroom.id },
            });
        }
        student1 = s1.user;
        student2 = s2.user;

        const tLogin = await login(t.user.email, 'TeacherPass123!').expect(200);
        teacher = { user: t.user, token: tLogin.body.tokens.accessToken };
    });

    const auth = (token: string, slug = INSTITUTE_SLUG) => ({
        Authorization: `Bearer ${token}`,
        'X-Institute-Slug': slug,
    });

    it('1. nota ad-hoc de Clase en Vivo (ClassActivity.scores sin planRowId) se refleja en el Promedio de la sección', async () => {
        // Calificación EN CLASE EN VIVO — sin plan de evaluación y sin tabla grades:
        // la nota vive SOLO en ClassActivity.scores (caso real maria lopez).
        await prisma.classActivity.create({
            data: {
                classroomId: classroom.id,
                subjectId: subject.id,
                title: 'Examen Parcial de Sumas',
                type: 'EVALUACION',
                target: 'CURRENT',
                planRowId: null,
                maxScore: 20,
                scores: { [student1.id]: 17, [student2.id]: 12 },
            },
        });

        const res = await request(server.server)
            .get('/api/students')
            .query({ classroomId: classroom.id, isActive: 'true' })
            .set(auth(teacher.token))
            .expect(200);

        const students = res.body.students as any[];
        const s1 = students.find((s: any) => s.id === student1.id);
        const s2 = students.find((s: any) => s.id === student2.id);

        expect(s1).toBeDefined();
        expect(s2).toBeDefined();
        // Sin plan de evaluación: fallback simple — score 17/20 → promedio 17.0
        expect(Number(s1.average)).toBeCloseTo(17, 1);
        expect(Number(s2.average)).toBeCloseTo(12, 1);
    });

    it('2. asistencia PRESENT se refleja al 100% y ABSENT al 0% en el resumen', async () => {
        await request(server.server)
            .post('/api/attendance')
            .set(auth(teacher.token))
            .send({
                studentId: student1.id,
                classroomId: classroom.id,
                date: DATE,
                status: 'PRESENT',
                subjectId: subject.id,
            })
            .expect(201);
        await request(server.server)
            .post('/api/attendance')
            .set(auth(teacher.token))
            .send({
                studentId: student2.id,
                classroomId: classroom.id,
                date: DATE,
                status: 'ABSENT',
                subjectId: subject.id,
            })
            .expect(201);

        const res = await request(server.server)
            .get('/api/students')
            .query({ classroomId: classroom.id, isActive: 'true' })
            .set(auth(teacher.token))
            .expect(200);

        const students = res.body.students as any[];
        const s1 = students.find((s: any) => s.id === student1.id);
        const s2 = students.find((s: any) => s.id === student2.id);

        expect(s1.attendancePercentage).toBe(100);
        expect(s2.attendancePercentage).toBe(0);
    });

    it('3. sin notas ni asistencia → promedio 0 ("Sin calificar") y 0%', async () => {
        const res = await request(server.server)
            .get('/api/students')
            .query({ classroomId: classroom.id, isActive: 'true' })
            .set(auth(teacher.token))
            .expect(200);

        const students = res.body.students as any[];
        const s1 = students.find((s: any) => s.id === student1.id);

        expect(s1.average).toBe(0);
        expect(s1.attendancePercentage).toBe(0);
    });

    it('4. la nota de Grade (plan editor) también se refleja y se combina con la ad-hoc', async () => {
        // Grade del plan editor: 18/20
        const activityRow = await prisma.activity.create({
            data: {
                title: 'Prueba Escrita de Sumas',
                type: 'SUMATIVA',
                scope: 'CLASSROOM',
                startDate: new Date('2024-05-01'),
                maxGrade: 20,
                weight: 1,
                classroomId: classroom.id,
                subjectId: subject.id,
                periodId: period.id,
                lapso: '1',
                createdBy: teacher.user.id,
                instituteId: 'institute',
            },
        });
        await prisma.grade.create({
            data: {
                studentId: student1.id,
                activityId: activityRow.id,
                subjectId: subject.id,
                periodId: period.id,
                teacherId: teacher.user.id,
                score: 18,
            },
        });
        // ClassActivity ad-hoc: 14/20 en la misma materia
        await prisma.classActivity.create({
            data: {
                classroomId: classroom.id,
                subjectId: subject.id,
                title: 'Tarea de fracciones',
                type: 'TAREA',
                target: 'CURRENT',
                planRowId: null,
                maxScore: 20,
                scores: { [student1.id]: 14 },
            },
        });

        const res = await request(server.server)
            .get('/api/students')
            .query({ classroomId: classroom.id, isActive: 'true' })
            .set(auth(teacher.token))
            .expect(200);

        const s1 = (res.body.students as any[]).find((s: any) => s.id === student1.id);
        // Fallback: (18 + 14) / 2 = 16.0
        expect(Number(s1.average)).toBeCloseTo(16, 1);
    });
});
