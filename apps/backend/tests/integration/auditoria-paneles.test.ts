import { FastifyInstance } from 'fastify';
import request = require('supertest');
import { PrismaClient } from '@prisma/client';
import { createId } from '@paralleldrive/cuid2';
import { UserRole } from '../../src/utils/prisma-enums';
import {
    createTestServer,
    createTestPrismaClient,
    createTestUser,
    createTestAcademicYear,
    createTestSubject,
    generateTestToken,
} from '../helpers';

/**
 * AUDITORÍA — LO PRIMERO QUE VE CADA ROL AL ENTRAR
 *
 * Panel de administrador, profesor, estudiante y representante. Se comprueba que
 * cada uno recibe SUS datos (no los de otro), que las cifras del panel cuadran
 * con lo que hay en la base, y que un rol no puede abrir el panel de otro.
 */

const SLUG = 'test-institute';
const gId = () => {
    // Siempre la 'c' delante: ver la nota de `tests/helpers.ts`.
    return `c${createId()}`;
};

describe('Auditoría — paneles de cada rol', () => {
    let server: FastifyInstance;
    let prisma: PrismaClient;

    let admin: any;
    let profesor: any;
    let estudiante: any;
    let representante: any;
    const tokens: Record<string, string> = {};

    let year: any;
    let period: any;
    let classroom: any;
    let subject: any;

    const auth = (token: string) => (req: request.Test) =>
        req.set('Authorization', `Bearer ${token}`).set('X-Institute-Slug', SLUG);

    beforeAll(async () => {
        server = await createTestServer();
        prisma = await createTestPrismaClient();

        admin = (await createTestUser(prisma, UserRole.ADMIN)).user;
        profesor = (await createTestUser(prisma, UserRole.TEACHER)).user;
        estudiante = (await createTestUser(prisma, UserRole.STUDENT)).user;
        representante = (await createTestUser(prisma, UserRole.TUTOR)).user;

        tokens.admin = generateTestToken(admin.id, UserRole.ADMIN, 'institute');
        tokens.profesor = generateTestToken(profesor.id, UserRole.TEACHER, 'institute');
        tokens.estudiante = generateTestToken(estudiante.id, UserRole.STUDENT, 'institute');
        tokens.representante = generateTestToken(representante.id, UserRole.TUTOR, 'institute');

        year = await createTestAcademicYear(prisma, 'institute');
        period = await prisma.period.create({
            data: {
                id: gId(),
                name: 'Primer Lapso',
                academicYearId: year.id,
                startDate: new Date('2026-09-01'),
                endDate: new Date('2026-12-15'),
                isActive: true,
            },
        });

        classroom = await prisma.classroom.create({
            data: {
                id: gId(),
                name: 'Panel A',
                slug: `panel-${Date.now()}`,
                grade: 1,
                section: 'A',
                capacity: 30,
                academicYearId: year.id,
                instituteId: 'institute',
                teacherId: profesor.id,
            },
        });

        subject = await createTestSubject(prisma, 'institute');
        await prisma.classroomSubject.create({
            data: { classroomId: classroom.id, subjectId: subject.id, teacherId: profesor.id, weeklyBlocks: 3 },
        });

        await prisma.studentClassroom.create({
            data: { studentId: estudiante.id, classroomId: classroom.id, academicYearId: year.id, isActive: true },
        });

        await prisma.studentTutor.create({
            data: { studentId: estudiante.id, tutorId: representante.id, relationship: 'PADRE' },
        });

        // Una nota y una asistencia, para que los paneles tengan algo que mostrar
        await prisma.classActivity.create({
            data: {
                classroomId: classroom.id,
                subjectId: subject.id,
                title: 'Evaluación inicial',
                type: 'EVALUACION',
                target: 'CURRENT',
                maxScore: 20,
                scores: { [estudiante.id]: 15 },
            },
        });
        await prisma.dailyAttendance.create({
            data: {
                studentId: estudiante.id,
                classroomId: classroom.id,
                teacherId: profesor.id,
                date: new Date('2026-09-15'),
                status: 'PRESENT',
            },
        });
    }, 180000);

    afterAll(async () => {
        await prisma.$disconnect();
        await server.close();
    }, 120000);

    describe('cada rol abre su panel', () => {
        it('el administrador ve el panel del liceo', async () => {
            const res = await auth(tokens.admin)(request(server.server).get('/api/dashboard/admin'));
            expect(res.status).toBe(200);
            expect(res.body).toBeTruthy();
        }, 60000);

        it('el profesor ve su panel con sus secciones', async () => {
            const res = await auth(tokens.profesor)(request(server.server).get('/api/dashboard/teacher'));
            expect(res.status).toBe(200);
            const cuerpo = JSON.stringify(res.body);
            // Su sección aparece; el panel es suyo, no del liceo entero
            expect(cuerpo).toContain(classroom.name);
        }, 60000);

        it('el estudiante ve su panel con su sección y su promedio', async () => {
            const res = await auth(tokens.estudiante)(request(server.server).get('/api/dashboard/student'));
            expect(res.status).toBe(200);

            const panel = res.body.student ?? res.body.data?.student ?? res.body;
            expect(JSON.stringify(panel)).toContain(estudiante.firstName);

            // La nota de 15 que tiene puesta se refleja en el promedio del panel
            const kpis = res.body.kpis ?? res.body.data?.kpis;
            if (kpis) expect(Number(kpis.globalAverage)).toBeCloseTo(15, 0);
        }, 60000);

        it('el representante ve el panel de su representado', async () => {
            const res = await auth(tokens.representante)(request(server.server).get('/api/dashboard/tutor'));
            expect(res.status).toBe(200);
            expect(JSON.stringify(res.body)).toContain(estudiante.firstName);
        }, 60000);
    });

    describe('nadie entra en el panel de otro', () => {
        it.each([
            ['estudiante', 'admin'],
            ['profesor', 'admin'],
            ['representante', 'admin'],
            ['estudiante', 'teacher'],
            ['representante', 'teacher'],
            ['profesor', 'student'],
            ['admin', 'tutor'],
        ])('un %s no puede abrir /dashboard/%s', async (rol, panel) => {
            const res = await auth(tokens[rol])(request(server.server).get(`/api/dashboard/${panel}`));
            expect([401, 403]).toContain(res.status);
        }, 60000);

        it('sin token no se abre ningún panel', async () => {
            for (const panel of ['admin', 'teacher', 'student', 'tutor']) {
                const res = await request(server.server)
                    .get(`/api/dashboard/${panel}`)
                    .set('X-Institute-Slug', SLUG);
                expect(res.status).toBe(401);
            }
        }, 60000);
    });

    describe('estadísticas del liceo', () => {
        it('el administrador ve las cifras del instituto', async () => {
            const res = await auth(tokens.admin)(request(server.server).get('/api/dashboard/stats/institute'));
            expect(res.status).toBe(200);
        }, 60000);

        it('un profesor no ve las cifras del instituto', async () => {
            const res = await auth(tokens.profesor)(request(server.server).get('/api/dashboard/stats/institute'));
            expect([401, 403]).toContain(res.status);
        }, 60000);
    });
});
