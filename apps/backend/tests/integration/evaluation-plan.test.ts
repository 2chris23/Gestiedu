import { FastifyInstance } from 'fastify';
import request = require('supertest');
import { PrismaClient } from '@prisma/client';
import { createId } from '@paralleldrive/cuid2';
import { UserRole } from '../../src/utils/prisma-enums';
import { gradesService } from '../../src/services/grades.service';
import {
    createTestServer,
    createTestPrismaClient,
    cleanTestDatabase,
    createTestUserWithPassword,
    createTestAcademicYear,
    createTestClassroom,
    createTestSubject,
} from '../helpers';

/**
 * FLUJO 3 — PLAN DE EVALUACIÓN
 *
 * Creación de plan con actividades y ponderaciones, validación de suma de
 * ponderaciones y cálculo de promedio del estudiante.
 *
 * COMPORTAMIENTO DOCUMENTADO:
 *  - Ponderaciones que no suman 100% NO se bloquean: el batch se guarda igual.
 *  - El promedio del estudiante es SIMPLE (no ponderado): promedio de notas.
 *  - Una actividad sin calificar se EXCLUYE del promedio (no cuenta como 0).
 */

const INSTITUTE_SLUG = 'test-institute';

function gId(): string {
    const id = createId();
    return id.startsWith('c') ? id : `c${id}`;
}

describe('Flujo 3 — Plan de evaluación', () => {
    let server: FastifyInstance;
    let prisma: PrismaClient;

    let year: any;
    let period: any;
    let classroom: any;
    let subject: any;
    let teacher: { user: any; token: string };
    let student: any;

    const auth = (token: string) => ({
        Authorization: `Bearer ${token}`,
        'X-Institute-Slug': INSTITUTE_SLUG,
    });

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

        const s = await createTestUserWithPassword(prisma, UserRole.STUDENT, 'StudentPass123!');
        await prisma.studentClassroom.create({
            data: {
                studentId: s.user.id,
                classroomId: classroom.id,
                academicYearId: year.id,
                isActive: true,
            },
        });
        student = s.user;

        const tLogin = await request(server.server)
            .post('/api/auth/login')
            .set('X-Institute-Slug', INSTITUTE_SLUG)
            .send({ email: t.user.email, password: 'TeacherPass123!' })
            .expect(200);
        teacher = { user: t.user, token: tLogin.body.tokens.accessToken };
    });

    it('1. el profesor crea un plan con varias actividades y ponderaciones', async () => {
        await request(server.server)
            .post('/api/evaluation-plan/metadata')
            .set(auth(teacher.token))
            .send({
                classroomId: classroom.id,
                subjectId: subject.id,
                lapso: '1',
                totalSemanas: 8,
            })
            .expect(200);

        const res = await request(server.server)
            .post('/api/evaluation-plan/rows/batch')
            .set(auth(teacher.token))
            .send({
                classroomId: classroom.id,
                subjectId: subject.id,
                lapso: '1',
                rows: [
                    {
                        weekNumber: 1,
                        rowType: 'EVALUATION',
                        actividadEval: 'Prueba Escrita',
                        tecnicas: 'Análisis de producción',
                        instrumentos: 'Escala de estimación',
                        ponderacion: 60,
                        puntos: 12,
                    },
                    {
                        weekNumber: 2,
                        rowType: 'EVALUATION',
                        actividadEval: 'Exposición Oral',
                        tecnicas: 'Observación',
                        instrumentos: 'Lista de cotejo',
                        ponderacion: 40,
                        puntos: 8,
                    },
                ],
            })
            .expect(200);

        expect(res.body.success).toBe(true);

        // Las filas quedaron guardadas y crearon sus Activity asociadas
        const rows = await prisma.evaluationPlanRow.findMany({
            where: { classroomId: classroom.id, subjectId: subject.id, lapso: '1' },
            orderBy: { weekNumber: 'asc' },
        });
        expect(rows.length).toBe(2);
        expect(rows[0].ponderacion).toBe(60);
        expect(rows[1].ponderacion).toBe(40);

        const activities = await prisma.activity.findMany({
            where: { classroomId: classroom.id, subjectId: subject.id },
            orderBy: { title: 'asc' },
        });
        expect(activities.length).toBe(2);
        // maxGrade = puntos, weight = ponderación (asignados por el batch)
        expect(activities.map(a => a.maxGrade).sort((x, y) => x - y)).toEqual([8, 12]);
    });

    it('2. si la suma de puntos de los criterios NO es 20 → 400 con mensaje claro', async () => {
        await request(server.server)
            .post('/api/evaluation-plan/metadata')
            .set(auth(teacher.token))
            .send({ classroomId: classroom.id, subjectId: subject.id, lapso: '1', totalSemanas: 8 })
            .expect(200);

        // 50 + 40 = 90% (puntos 10 + 8 = 18 ≠ 20) → el sistema lo BLOQUEA (nueva validación)
        const res = await request(server.server)
            .post('/api/evaluation-plan/rows/batch')
            .set(auth(teacher.token))
            .send({
                classroomId: classroom.id,
                subjectId: subject.id,
                lapso: '1',
                rows: [
                    { weekNumber: 1, rowType: 'EVALUATION', actividadEval: 'A1', ponderacion: 50, puntos: 10 },
                    { weekNumber: 2, rowType: 'EVALUATION', actividadEval: 'A2', ponderacion: 40, puntos: 8 },
                ],
            })
            .expect(400);

        expect(res.body.code).toBe('PLAN_PUNTOS_NOT_20');
        expect(res.body.currentSum).toBe(18);

        // Nada quedó persistido
        const count = await prisma.evaluationPlanRow.count({
            where: { classroomId: classroom.id, subjectId: subject.id, lapso: '1' },
        });
        expect(count).toBe(0);
    });

    it('3. el promedio del estudiante es PONDERADO POR CRITERIO (caso 4+4+12 armado a mano)', async () => {
        await request(server.server)
            .post('/api/evaluation-plan/metadata')
            .set(auth(teacher.token))
            .send({ classroomId: classroom.id, subjectId: subject.id, lapso: '1', totalSemanas: 8 })
            .expect(200);
        // Plan: criterio 4 pts, criterio 4 pts, criterio 12 pts = 20 pts exactos
        await request(server.server)
            .post('/api/evaluation-plan/rows/batch')
            .set(auth(teacher.token))
            .send({
                classroomId: classroom.id,
                subjectId: subject.id,
                lapso: '1',
                rows: [
                    { weekNumber: 1, rowType: 'EVALUATION', actividadEval: 'C1', puntos: 4 },
                    { weekNumber: 2, rowType: 'EVALUATION', actividadEval: 'C2', puntos: 4 },
                    { weekNumber: 3, rowType: 'EVALUATION', actividadEval: 'C3', puntos: 12 },
                ],
            })
            .expect(200);

        const activities = await prisma.activity.findMany({
            where: { classroomId: classroom.id, subjectId: subject.id },
            orderBy: { title: 'asc' },
        });
        expect(activities.length).toBe(3);

        // Notas calificadas a mano:
        // C1: Grade 20 + ClassActivity(scores 10) → avg 15 → (15/20)*4 = 3
        // C2: Grade 15 (sin ninguna otra) → avg 15 → (15/20)*4 = 3
        // C3: Grade 16 + ClassActivities(scores 16 y 4) → avg 12 → (12/20)*12 = 7.2
        // TOTAL = 3 + 3 + 7.2 = 13.2
        const rowByTitle = new Map<string, string>();
        const rows = await prisma.evaluationPlanRow.findMany({
            where: { classroomId: classroom.id, subjectId: subject.id, lapso: '1' },
            select: { id: true, actividadEval: true },
        });
        rows.forEach(r => rowByTitle.set(r.actividadEval, r.id));

        await prisma.grade.create({
            data: { studentId: student.id, activityId: activities[0].id, periodId: period.id, subjectId: subject.id, teacherId: teacher.user.id, score: 20 },
        });
        await prisma.grade.create({
            data: { studentId: student.id, activityId: activities[1].id, periodId: period.id, subjectId: subject.id, teacherId: teacher.user.id, score: 15 },
        });
        await prisma.grade.create({
            data: { studentId: student.id, activityId: activities[2].id, periodId: period.id, subjectId: subject.id, teacherId: teacher.user.id, score: 16 },
        });

        // Actividades de Clase en Vivo vinculadas al criterio (planRowId) con scores
        for (const [criterioTitle, score] of [['C1', 10], ['C3', 16], ['C3', 4]] as const) {
            await prisma.classActivity.create({
                data: {
                    title: `Actividad en vivo ${criterioTitle}-${score}`,
                    type: 'ACTIVIDAD',
                    target: 'CURRENT',
                    maxScore: 20,
                    scores: JSON.stringify({ [student.id]: score }),
                    classroomId: classroom.id,
                    subjectId: subject.id,
                    planRowId: rowByTitle.get(criterioTitle),
                },
            });
        }

        const average = await gradesService.calculateSubjectAverage(
            prisma as any,
            student.id,
            subject.id,
            period.id
        );
        expect(average).toBe(13.2); // manual: 3 + 3 + 7.2
    });

    it('4. una actividad sin calificar se EXCLUYE del promedio del criterio', async () => {
        await request(server.server)
            .post('/api/evaluation-plan/metadata')
            .set(auth(teacher.token))
            .send({ classroomId: classroom.id, subjectId: subject.id, lapso: '1', totalSemanas: 8 })
            .expect(200);
        // Criterio único de 20 pts con 2 actividades (1 calificada 16, 1 sin calificar)
        await request(server.server)
            .post('/api/evaluation-plan/rows/batch')
            .set(auth(teacher.token))
            .send({
                classroomId: classroom.id,
                subjectId: subject.id,
                lapso: '1',
                rows: [
                    { weekNumber: 1, rowType: 'EVALUATION', actividadEval: 'ÚNICO', puntos: 20 },
                ],
            })
            .expect(200);

        const activities = await prisma.activity.findMany({
            where: { classroomId: classroom.id, subjectId: subject.id },
        });
        expect(activities.length).toBe(1);

        await prisma.grade.create({
            data: {
                studentId: student.id,
                activityId: activities[0].id,
                periodId: period.id,
                subjectId: subject.id,
                teacherId: teacher.user.id,
                score: 16,
            },
        });

        // Documentado: la actividad sin calificar se excluye → avg 16 → (16/20)*20 = 16
        const average = await gradesService.calculateSubjectAverage(
            prisma as any,
            student.id,
            subject.id,
            period.id
        );
        expect(average).toBe(16);
    });
});
