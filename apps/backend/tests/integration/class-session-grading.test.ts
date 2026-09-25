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
    createTestUser,
    generateTestToken,
} from '../helpers';

/** Genera un ID compatible con los schemas zod `.cuid()` (regex /^c[^\s-]{8,}$/). */
function gId(): string {
    // Siempre la 'c' delante: ver la nota de `tests/helpers.ts`.
    return `c${createId()}`;
}

/**
 * FLUJO 2 — CREAR Y CALIFICAR UNA SESIÓN DE CLASE COMPLETA
 *
 * El flujo diario del profesor: sesión de clase → detalle en vivo →
 * calificar actividad del plan → asistencia → finalizar.
 *
 * BUGS REALES CORREGIDOS POR ESTE FLUJO (ver reporte final):
 *  - gradesService.createGrade no validaba que el estudiante perteneciera al
 *    aula de la actividad ni que el profesor impartiera la materia ahí.
 *    Ahora rechaza con 403.
 *  - grades.controller no pasaba errores de dominio (statusCode) — devolvía
 *    500 en vez de 403/400.
 *
 * COMPORTAMIENTO DOCUMENTADO:
 *  - "Cerrar sesión de clase" no existe como concepto separado: el único
 *    estado terminal es SUSPENDED (POST /api/sessions/suspend).
 */

const INSTITUTE_SLUG = 'test-institute';
const DATE = '2024-06-01';
const DATE_ISO = '2024-06-01T00:00:00.000Z';

describe('Flujo 2 — Sesión de clase + calificación', () => {
    let server: FastifyInstance;
    let prisma: PrismaClient;

    // Fixtures
    let year: any;
    let period: any;
    let classroomA: any;
    let classroomB: any;
    let subject: any;
    let teacher1: { user: any; token: string };
    let teacher2: { user: any; token: string };
    let student1: any;
    let student2: any;
    let student3: any; // estudiante de OTRA aula
    let activity: any;

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

        // Re-sembrar el instituto en la tenant DB (cleanTestDatabase lo borra)
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

        // Institutos, año con lapso, aulas, materia
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
        classroomA = await createTestClassroom(prisma, year.id, 'institute');
        classroomB = await prisma.classroom.create({
            data: {
                id: gId(),
                name: '1er Grado B',
                slug: `aula-b-${gId().substring(0, 20)}`,
                grade: 1,
                section: 'B',
                capacity: 30,
                academicYearId: year.id,
                instituteId: 'institute',
            },
        });
        subject = await createTestSubject(prisma, 'institute');

        // Profesores (contraseña real para login por API)
        const t1 = await createTestUserWithPassword(prisma, UserRole.TEACHER, 'TeacherPass123!');
        const t2 = await createTestUserWithPassword(prisma, UserRole.TEACHER, 'TeacherPass123!');

        // t1 imparte la materia en el aula A; t2 NO (imparte en aula B)
        await prisma.classroomSubject.create({
            data: { classroomId: classroomA.id, subjectId: subject.id, teacherId: t1.user.id },
        });
        await prisma.classroomSubject.create({
            data: { classroomId: classroomB.id, subjectId: subject.id, teacherId: t2.user.id },
        });

        // Estudiantes: 1 y 2 en aula A, 3 en aula B
        const s1 = await createTestUserWithPassword(prisma, UserRole.STUDENT, 'StudentPass123!');
        const s2 = await createTestUserWithPassword(prisma, UserRole.STUDENT, 'StudentPass123!');
        const s3 = await createTestUserWithPassword(prisma, UserRole.STUDENT, 'StudentPass123!');

        for (const [stu, classroom] of [[s1, classroomA], [s2, classroomA], [s3, classroomB]] as const) {
            await prisma.studentClassroom.create({
                data: {
                    studentId: (stu as any).user.id,
                    classroomId: (classroom as any).id,
                    academicYearId: year.id,
                    isActive: true,
                },
            });
        }
        student1 = s1.user;
        student2 = s2.user;
        student3 = s3.user;

        // Actividad del plan de evaluación (creada por el sistema al guardar el plan)
        activity = await prisma.activity.create({
            data: {
                title: 'Prueba Escrita de Sumas',
                type: 'SUMATIVA',
                scope: 'CLASSROOM',
                startDate: new Date('2024-05-01'),
                maxGrade: 20,
                weight: 1,
                classroomId: classroomA.id,
                subjectId: subject.id,
                periodId: period.id,
                lapso: '1',
                createdBy: t1.user.id,
                instituteId: 'institute',
            },
        });

        // Tokens por login real
        const t1Login = await login(t1.user.email, 'TeacherPass123!').expect(200);
        const t2Login = await login(t2.user.email, 'TeacherPass123!').expect(200);
        teacher1 = { user: t1.user, token: t1Login.body.tokens.accessToken };
        teacher2 = { user: t2.user, token: t2Login.body.tokens.accessToken };
    });

    const auth = (token: string, slug = INSTITUTE_SLUG) => ({
        Authorization: `Bearer ${token}`,
        'X-Institute-Slug': slug,
    });

    it('1. el profesor crea una sesión de clase para aula+materia+fecha', async () => {
        const res = await request(server.server)
            .post('/api/sessions/')
            .set(auth(teacher1.token))
            .send({
                classroomId: classroomA.id,
                subjectId: subject.id,
                date: DATE,
                topic: 'Suma de fracciones',
                startTime: '08:00',
                endTime: '08:45',
            })
            .expect(201);

        expect(res.body).toHaveProperty('id');
        expect(res.body.classroomId).toBe(classroomA.id);
    });

    it('2. el detalle en vivo trae estudiantes del aula, plan y actividades', async () => {
        // Plan de la semana (metadatos + fila EVALUATION con la actividad)
        const weekNumber =
            Math.floor((new Date(DATE).getTime() - new Date('2024-01-01').getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1;
        await prisma.evaluationPlanMetadata.upsert({
            where: { classroomId_subjectId_lapso: { classroomId: classroomA.id, subjectId: subject.id, lapso: '1' } },
            update: {},
            create: { classroomId: classroomA.id, subjectId: subject.id, lapso: '1', totalSemanas: 8 },
        });
        await prisma.evaluationPlanRow.create({
            data: {
                classroomId: classroomA.id,
                subjectId: subject.id,
                lapso: '1',
                rowType: 'EVALUATION',
                weekNumber,
                orderIndex: 0,
                actividadEval: 'Prueba Escrita de Sumas',
                ponderacion: 100,
                puntos: 20,
                activityId: activity.id,
            },
        });

        const res = await request(server.server)
            .get('/api/sessions/live-detail')
            .query({ classroomId: classroomA.id, subjectId: subject.id, date: DATE })
            .set(auth(teacher1.token))
            .expect(200);

        const studentIds = (res.body.students || []).map((s: any) => s.id);
        expect(studentIds).toContain(student1.id);
        expect(studentIds).toContain(student2.id);
        expect(studentIds).not.toContain(student3.id); // estudiante de otra aula NO aparece

        expect(res.body.subject.id).toBe(subject.id);
        expect(res.body.teacher.id).toBe(teacher1.user.id);
        expect(res.body.planContent).toBeDefined();
        expect(res.body.weekRow).toBeDefined();
        expect(res.body.activities).toBeDefined();
    });

    it('3. califica a un estudiante del aula → se persiste y es recuperable', async () => {
        const res = await request(server.server)
            .post('/api/grades')
            .set(auth(teacher1.token))
            .send({
                studentId: student1.id,
                activityId: activity.id,
                periodId: period.id,
                subjectId: subject.id,
                score: 18,
                comments: 'Excelente',
            })
            .expect(201);

        expect(res.body.grade.score).toBe(18);
        expect(res.body.grade.student.id).toBe(student1.id);

        const list = await request(server.server)
            .get('/api/grades')
            .query({ studentId: student1.id })
            .set(auth(teacher1.token))
            .expect(200);

        expect(list.body.grades.length).toBe(1);
        expect(list.body.grades[0].score).toBe(18);
    });

    it('4. calificar a un estudiante que NO pertenece al aula → 403 y no crea el registro', async () => {
        const res = await request(server.server)
            .post('/api/grades')
            .set(auth(teacher1.token))
            .send({
                studentId: student3.id, // aula B
                activityId: activity.id, // actividad del aula A
                periodId: period.id,
                subjectId: subject.id,
                score: 15,
            })
            .expect(403);

        expect(res.body.code).toBe('FORBIDDEN');

        const count = await prisma.grade.count({ where: { studentId: student3.id } });
        expect(count).toBe(0);
    });

    it('5. calificación fuera de rango (negativa o >20) → 400 y no crea el registro', async () => {
        for (const badScore of [-5, 25]) {
            await request(server.server)
                .post('/api/grades')
                .set(auth(teacher1.token))
                .send({
                    studentId: student1.id,
                    activityId: activity.id,
                    periodId: period.id,
                    subjectId: subject.id,
                    score: badScore,
                })
                .expect(400);
        }

        const count = await prisma.grade.count({ where: { studentId: student1.id } });
        expect(count).toBe(0);
    });

    it('6. un profesor de OTRA materia/aula intenta calificar → 403', async () => {
        const res = await request(server.server)
            .post('/api/grades')
            .set(auth(teacher2.token))
            .send({
                studentId: student1.id,
                activityId: activity.id,
                periodId: period.id,
                subjectId: subject.id,
                score: 17,
            })
            .expect(403);

        expect(res.body.code).toBe('FORBIDDEN');
    });

    it('7. asistencia marcada se refleja en el detalle de la clase', async () => {
        await request(server.server)
            .post('/api/attendance')
            .set(auth(teacher1.token))
            .send({
                studentId: student1.id,
                classroomId: classroomA.id,
                date: DATE, // el schema de la ruta espera formato 'date' (YYYY-MM-DD)
                status: 'PRESENT',
                subjectId: subject.id,
            })
            .expect(201);

        const res = await request(server.server)
            .get('/api/sessions/live-detail')
            .query({ classroomId: classroomA.id, subjectId: subject.id, date: DATE })
            .set(auth(teacher1.token))
            .expect(200);

        const s1 = (res.body.students || []).find((s: any) => s.id === student1.id);
        expect(s1).toBeDefined();
        expect(s1.status).toBe('PRESENT');
    });

    it('8. "cerrar" la sesión = suspender: la sesión queda SUSPENDED', async () => {
        // Documentado: no existe un concepto de "cierre"; el estado terminal es SUSPENDED.
        // Suspender es solo del admin (reemplazar-clase-suspendida.test.ts): el
        // profesor recibe 403 y el admin la suspende.
        await request(server.server)
            .post('/api/sessions/suspend')
            .set(auth(teacher1.token))
            .send({ classroomId: classroomA.id, subjectId: subject.id, date: DATE, reason: 'Feriado' })
            .expect(403);

        const admin = (await createTestUser(prisma, UserRole.ADMIN)).user;
        const res = await request(server.server)
            .post('/api/sessions/suspend')
            .set(auth(generateTestToken(admin.id, UserRole.ADMIN, 'institute')))
            .send({ classroomId: classroomA.id, subjectId: subject.id, date: DATE, reason: 'Feriado' })
            .expect(200);

        expect(res.body.success).toBe(true);

        const detail = await request(server.server)
            .get('/api/sessions/live-detail')
            .query({ classroomId: classroomA.id, subjectId: subject.id, date: DATE })
            .set(auth(teacher1.token))
            .expect(200);

        expect(detail.body.session.status).toBe('SUSPENDED');
        expect(detail.body.session.suspendedReason).toBe('Feriado');
    });
});
