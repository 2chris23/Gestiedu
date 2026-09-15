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

/** Genera un ID compatible con los schemas zod `.cuid()`. */
function gId(): string {
    // Siempre la 'c' delante: ver la nota de `tests/helpers.ts`.
    return `c${createId()}`;
}

/**
 * REGRESIÓN — ACTIVIDADES RELATIVAS A LA CLASE Y SEMANAS ALINEADAS A LUNES
 *
 * Bugs corregidos:
 *  1. "Clase de Hoy" mostraba las actividades CURRENT en TODAS las clases de la
 *     semana (lunes, viernes, ...). Ahora una actividad CURRENT ligada a la
 *     sesión del martes NO aparece en la clase del viernes.
 *  2. "Próxima Clase" mostraba las NEXT con fecha YA PASADA: una programada
 *     para el 27/08 aparecía también en la clase del viernes 28.
 *  3. La semana del plan para el viernes 28/08 (inicio 19/08) era SEMANA 2;
 *     ahora es SEMANA 1 (semana 1 = 19/08→30/08; semana 2 abre el lunes 31/08).
 */

const INSTITUTE_SLUG = 'test-institute';
const MARTES = '2026-08-25';
const VIERNES = '2026-08-28';

describe('Regresión — Actividades por clase + semanas a lunes', () => {
    let server: FastifyInstance;
    let prisma: PrismaClient;

    let year: any;
    let period: any;
    let classroom: any;
    let subject: any;
    let teacher: { user: any; token: string };
    let student1: any;
    let sessionMartes: any;
    let sessionViernes: any;

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
                startDate: new Date('2026-08-19'),
                endDate: new Date('2026-12-31'),
                isActive: true,
                academicYearId: year.id,
            },
        });
        classroom = await createTestClassroom(prisma, year.id, 'institute');
        subject = await createTestSubject(prisma, 'institute');

        // Plan de evaluación con fechaDesde = 19/08/2026 (miércoles)
        await prisma.evaluationPlanMetadata.create({
            data: {
                classroomId: classroom.id,
                subjectId: subject.id,
                lapso: '1',
                totalSemanas: 15,
                fechaDesde: new Date('2026-08-19'),
                fechaHasta: new Date('2026-12-31'),
            },
        });

        const t = await createTestUserWithPassword(prisma, UserRole.TEACHER, 'TeacherPass123!');
        await prisma.classroomSubject.create({
            data: { classroomId: classroom.id, subjectId: subject.id, teacherId: t.user.id },
        });

        const s1 = await createTestUserWithPassword(prisma, UserRole.STUDENT, 'StudentPass123!');
        await prisma.studentClassroom.create({
            data: { studentId: s1.user.id, classroomId: classroom.id, academicYearId: year.id, isActive: true },
        });
        student1 = s1.user;

        const tLogin = await login(t.user.email, 'TeacherPass123!').expect(200);
        teacher = { user: t.user, token: tLogin.body.tokens.accessToken };

        // Dos sesiones: martes 25/08 y viernes 28/08
        for (const date of [MARTES, VIERNES]) {
            const res = await request(server.server)
                .post('/api/sessions/')
                .set(auth(teacher.token))
                .send({
                    classroomId: classroom.id,
                    subjectId: subject.id,
                    date,
                    topic: 'Clase',
                    startTime: '08:00',
                    endTime: '08:45',
                })
                .expect(201);
            if (date === MARTES) sessionMartes = res.body;
            else sessionViernes = res.body;
        }
    });

    const auth = (token: string, slug = INSTITUTE_SLUG) => ({
        Authorization: `Bearer ${token}`,
        'X-Institute-Slug': slug,
    });

    const getDetail = (date: string) =>
        request(server.server)
            .get('/api/sessions/live-detail')
            .query({ classroomId: classroom.id, subjectId: subject.id, date })
            .set(auth(teacher.token));

    it('1. actividades CURRENT de la sesión del martes NO aparecen en la clase del viernes', async () => {
        // Actividad "de hoy" creada en la sesión del MARTES
        await prisma.classActivity.create({
            data: {
                classroomId: classroom.id,
                subjectId: subject.id,
                title: 'Examen de sumas',
                type: 'EVALUACION',
                target: 'CURRENT',
                classSessionId: sessionMartes.id,
                maxScore: 20,
                scores: {},
            },
        });

        const detMartes = await getDetail(MARTES).expect(200);
        const actEnMartes = detMartes.body.activities.find((a: any) => a.title === 'Examen de sumas');
        expect(actEnMartes).toBeDefined();
        expect(actEnMartes.belongsToSession).toBe(true);

        // En el VIERNES NO pertenece a la sesión → no sale en "Clase de Hoy"
        const detViernes = await getDetail(VIERNES).expect(200);
        const actEnViernes = detViernes.body.activities.find((a: any) => a.title === 'Examen de sumas');
        expect(actEnViernes).toBeDefined();
        expect(actEnViernes.belongsToSession).toBe(false);
        expect(actEnViernes.dueToday).toBe(false);
    });

    it('2. NEXT mandada EN la clase del 25/08: es "próxima" ese día y "hoy" el 28/08', async () => {
        // La actividad se manda DURANTE la clase del martes, así que queda atada a
        // esa sesión. Es lo que hace que se anuncie ahí y solo ahí.
        await prisma.classActivity.create({
            data: {
                classroomId: classroom.id,
                subjectId: subject.id,
                title: 'Tarea para el viernes',
                type: 'TAREA',
                target: 'NEXT',
                classSessionId: sessionMartes.id,
                // mediodía local (mismo formato que parseDayDate)
                dueDate: new Date(2026, 7, 28, 12, 0, 0),
                maxScore: 20,
                scores: {},
            },
        });

        const detMartes = await getDetail(MARTES).expect(200);
        const a4 = detMartes.body.activities.find((a: any) => a.title === 'Tarea para el viernes');
        expect(a4.isFuture).toBe(true);
        expect(a4.dueToday).toBe(false);

        const detViernes = await getDetail(VIERNES).expect(200);
        const a5 = detViernes.body.activities.find((a: any) => a.title === 'Tarea para el viernes');
        expect(a5.dueToday).toBe(true);
        expect(a5.isFuture).toBe(false);
    });

    it('3. NEXT con fecha PASADA (para el 27/08) NO se muestra en la clase del viernes 28', async () => {
        await prisma.classActivity.create({
            data: {
                classroomId: classroom.id,
                subjectId: subject.id,
                title: 'Examen vencido',
                type: 'EXAMEN',
                target: 'NEXT',
                dueDate: new Date(2026, 7, 27, 12, 0, 0),
                maxScore: 20,
                scores: {},
            },
        });

        const detViernes = await getDetail(VIERNES).expect(200);
        const aVen = detViernes.body.activities.find((a: any) => a.title === 'Examen vencido');
        expect(aVen).toBeDefined();
        expect(aVen.dueToday).toBe(false);
        expect(aVen.isFuture).toBe(false);
    });

    it('4. semana del plan: el viernes 28/08 es SEMANA 1 y el lunes 31/08 es SEMANA 2', async () => {
        const v1 = await getDetail(VIERNES).expect(200);
        expect(v1.body.weekNumber).toBe(1);

        await request(server.server)
            .post('/api/sessions/')
            .set(auth(teacher.token))
            .send({
                classroomId: classroom.id,
                subjectId: subject.id,
                date: '2026-08-31',
                topic: 'Clase',
                startTime: '08:00',
                endTime: '08:45',
            })
            .expect(201);
        const v2 = await getDetail('2026-08-31').expect(200);
        expect(v2.body.weekNumber).toBe(2);
    });
});
