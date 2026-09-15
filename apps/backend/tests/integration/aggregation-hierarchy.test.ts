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
import {
    subjectSectionAverage,
    sectionAverage,
    yearGradeAverage,
    cycleAverage,
} from '../../src/services/aggregation.service';

/** Genera un ID compatible con los schemas zod `.cuid()`. */
function gId(): string {
    // Siempre la 'c' delante: ver la nota de `tests/helpers.ts`.
    return `c${createId()}`;
}

/**
 * JERARQUÍA DE AGREGACIÓN (Niveles 3-6) + BUG DEL ROSTER (Parte 4)
 *
 * Principio del producto: UNA sola nota (20/20 en un criterio de 4 puntos) debe
 * reflejarse en cascada: Promedio materia/sección → año → ciclo = 20.
 * Regla de exclusión: estudiantes sin notas NO cuentan (no promedian 0), y una
 * materia sin ninguna nota tampoco afecta el promedio de la sección.
 */

const INSTITUTE_SLUG = 'test-institute';

describe('Jerarquía de agregación (N3-N6) + roster', () => {
    let server: FastifyInstance;
    let prisma: PrismaClient;

    let year: any;
    let period: any;
    let classroom: any;
    let subject: any;
    let subjectVacia: any;
    let teacher: { user: any; token: string };
    let student1: any;

    const login = (email: string, password: string) =>
        request(server.server)
            .post('/api/auth/login')
            .set('X-Institute-Slug', INSTITUTE_SLUG)
            .send({ email, password });

    const auth = (token: string, slug = INSTITUTE_SLUG) => ({
        Authorization: `Bearer ${token}`,
        'X-Institute-Slug': slug,
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
        subjectVacia = await prisma.subject.create({
            data: {
                name: 'Física Vacía',
                code: 'FIS-VA',
                slug: `fisica-${gId().substring(0, 16)}`,
                color: '#444444',
                instituteId: 'institute',
            },
        });

        const t = await createTestUserWithPassword(prisma, UserRole.TEACHER, 'TeacherPass123!');
        await prisma.classroomSubject.create({
            data: { classroomId: classroom.id, subjectId: subject.id, teacherId: t.user.id },
        });
        await prisma.classroomSubject.create({
            data: { classroomId: classroom.id, subjectId: subjectVacia.id, teacherId: t.user.id },
        });

        const s1 = await createTestUserWithPassword(prisma, UserRole.STUDENT, 'StudentPass123!');
        await prisma.studentClassroom.create({
            data: { studentId: s1.user.id, classroomId: classroom.id, academicYearId: year.id, isActive: true },
        });
        student1 = s1.user;

        // Plan de evaluación: 3 criterios que suman 20 (4 + 8 + 8)
        const planRows = [
            { actividadEval: 'Criterio A (4 pts)', puntos: 4 },
            { actividadEval: 'Criterio B (8 pts)', puntos: 8 },
            { actividadEval: 'Criterio C (8 pts)', puntos: 8 },
        ];
        await prisma.evaluationPlanMetadata.create({
            data: {
                classroomId: classroom.id,
                subjectId: subject.id,
                lapso: '1',
                totalSemanas: 8,
                fechaDesde: new Date('2024-01-01'),
                fechaHasta: new Date('2024-08-31'),
            },
        });
        for (const row of planRows) {
            await prisma.evaluationPlanRow.create({
                data: {
                    classroomId: classroom.id,
                    subjectId: subject.id,
                    lapso: '1',
                    rowType: 'EVALUATION',
                    weekNumber: 1,
                    orderIndex: 0,
                    actividadEval: row.actividadEval,
                    ponderacion: row.puntos * 5,
                    puntos: row.puntos,
                },
            });
        }

        // La ÚNICA nota del sistema: 20/20 en el criterio de 4 puntos
        const critA = await prisma.evaluationPlanRow.findFirst({
            where: { classroomId: classroom.id, subjectId: subject.id, puntos: 4 },
        });
        await prisma.classActivity.create({
            data: {
                classroomId: classroom.id,
                subjectId: subject.id,
                title: 'Único examen',
                type: 'EVALUACION',
                target: 'NEXT',
                planRowId: critA!.id,
                maxScore: 20,
                scores: { [student1.id]: 20 },
            },
        });

        const tLogin = await login(t.user.email, 'TeacherPass123!').expect(200);
        teacher = { user: t.user, token: tLogin.body.tokens.accessToken };
    });

    it('1. UNA sola nota 20/20 (criterio de 4 pts) → Nivel 3, 4, 5 Y 6 = 20', async () => {
        const n3 = await subjectSectionAverage(prisma, classroom.id, subject.id);
        expect(n3.hasData).toBe(true);
        expect(n3.average).toBe(20);

        const n4 = await sectionAverage(prisma, classroom.id);
        expect(n4.hasData).toBe(true);
        expect(n4.average).toBe(20);

        const n5 = await yearGradeAverage(prisma, year.id, classroom.grade);
        expect(n5.hasData).toBe(true);
        expect(n5.average).toBe(20);

        const n6 = await cycleAverage(prisma, year.id);
        expect(n6.hasData).toBe(true);
        expect(n6.average).toBe(20);
    });

    it('2. Segundo estudiante SIN notas → el promedio de sección NO baja (se excluye)', async () => {
        const s2 = await createTestUserWithPassword(prisma, UserRole.STUDENT, 'StudentPass123!');
        await prisma.studentClassroom.create({
            data: { studentId: s2.user.id, classroomId: classroom.id, academicYearId: year.id, isActive: true },
        });

        const n4 = await sectionAverage(prisma, classroom.id);
        expect(n4.average).toBe(20); // el sin notas no cuenta como 0
    });

    it('3. Segunda materia SIN ninguna nota → el promedio de sección no se ve afectado', async () => {
        const n4 = await sectionAverage(prisma, classroom.id);
        const fisica = n4.subjectAverages.find(s => s.subjectId === subjectVacia.id);
        expect(fisica).toBeDefined();
        expect(fisica!.average).toBe(0); // materia sin datos
        expect(n4.average).toBe(20); // NO la promedia como 0
    });

    it('4. BUG ROSTER: una sesión sin actividades NO muestra la nota de otra sesión', async () => {        // Sesión 1 (19/08/2024): actividad calificada para esa sesión
        const s1 = await request(server.server)
            .post('/api/sessions/')
            .set(auth(teacher.token))
            .send({
                classroomId: classroom.id,
                subjectId: subject.id,
                date: '2024-01-19',
                topic: 'Clase 1',
                startTime: '08:00',
                endTime: '08:45',
            })
            .expect(201);

        await prisma.classActivity.create({
            data: {
                classroomId: classroom.id,
                subjectId: subject.id,
                title: 'Examen de la sesión 1',
                type: 'EVALUACION',
                target: 'CURRENT',
                classSessionId: s1.body.id,
                maxScore: 20,
                scores: { [student1.id]: 15 },
            },
        });

        const det1 = await request(server.server)
            .get('/api/sessions/live-detail')
            .query({ classroomId: classroom.id, subjectId: subject.id, date: '2024-01-19' })
            .set(auth(teacher.token))
            .expect(200);
        const act1 = (det1.body.activities || []).find(a => a.classSessionId === s1.body.id);
        expect(act1).toBeDefined();
        expect(act1.belongsToSession).toBe(true);

        // Sesión 2 (día siguiente): SIN actividades
        await request(server.server)
            .post('/api/sessions/')
            .set(auth(teacher.token))
            .send({
                classroomId: classroom.id,
                subjectId: subject.id,
                date: '2024-01-22',
                topic: 'Clase 2',
                startTime: '08:00',
                endTime: '08:45',
            })
            .expect(201);

        const det2 = await request(server.server)
            .get('/api/sessions/live-detail')
            .query({ classroomId: classroom.id, subjectId: subject.id, date: '2024-01-22' })
            .set(auth(teacher.token))
            .expect(200);

        // El roster (columna "Calificaciones") filtra por belongsToSession/dueToday:
        // ninguna actividad de la sesión 2 es de esta clase → "Sin notas hoy".
        const rosterActivities = (det2.body.activities || [])
            .filter((a: any) => a.belongsToSession || a.dueToday);
        expect(rosterActivities.length).toBe(0);
    });

    it('5. FILTRO POR LAPSO (Fase 3.5-A): "1er Momento" ≠ "Todo el ciclo"; lapso vacío → sin datos', async () => {
        // Segundo lapso (no activo) con su propia nota de 10 en el mismo criterio
        const period2 = await prisma.period.create({
            data: {
                id: gId(),
                name: 'Segundo Lapso',
                startDate: new Date('2024-05-01'),
                endDate: new Date('2024-08-31'),
                isActive: false,
                academicYearId: year.id,
            },
        });
        // Fila EVALUATION del lapso 2 con el mismo criterio (4 pts)
        await prisma.evaluationPlanRow.create({
            data: {
                classroomId: classroom.id,
                subjectId: subject.id,
                lapso: '2',
                rowType: 'EVALUATION',
                weekNumber: 1,
                orderIndex: 0,
                actividadEval: 'Criterio A (4 pts) — L2',
                ponderacion: 20,
                puntos: 4,
            },
        });
        const critL2 = await prisma.evaluationPlanRow.findFirst({
            where: { classroomId: classroom.id, subjectId: subject.id, lapso: '2' },
        });
        await prisma.classActivity.create({
            data: {
                classroomId: classroom.id,
                subjectId: subject.id,
                title: 'Examen lapso 2',
                type: 'EVALUACION',
                target: 'NEXT',
                planRowId: critL2!.id,
                maxScore: 20,
                scores: { [student1.id]: 10 },
            },
        });

        // 1er Momento → 20 (solo la nota del primer lapso)
        const n3P1 = await subjectSectionAverage(prisma, classroom.id, subject.id, period.id);
        expect(n3P1.hasData).toBe(true);
        expect(n3P1.average).toBe(20);

        // Todo el ciclo → promedio simple de los lapsos con datos (20 + 10) / 2 = 15
        const n3All = await subjectSectionAverage(prisma, classroom.id, subject.id);
        expect(n3All.hasData).toBe(true);
        expect(n3All.average).toBe(15);

        // Tercer lapso sin ninguna nota → "Sin calificar" (hasData=false, no un 0 engañoso)
        const period3 = await prisma.period.create({
            data: {
                id: gId(),
                name: 'Tercer Lapso',
                startDate: new Date('2024-09-01'),
                endDate: new Date('2024-12-31'),
                isActive: false,
                academicYearId: year.id,
            },
        });
        const n3P3 = await subjectSectionAverage(prisma, classroom.id, subject.id, period3.id);
        expect(n3P3.hasData).toBe(false);
        expect(n3P3.average).toBe(0);
    });
});
