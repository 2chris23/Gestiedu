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

const SLUG = 'test-institute';
const LICEO = 'institute';
const gId = () => `c${createId()}`;

describe('Cifras y estadísticas por lapso (Fase C+)', () => {
    let server: FastifyInstance;
    let prisma: PrismaClient;
    let admin: any;
    let alumno1: any;
    let alumno2: any;
    let year: any;
    let lapso1: any;
    let lapso2: any;
    let seccion: any;
    let materia: any;

    const auth = (id: string, role: UserRole) => ({
        Authorization: `Bearer ${generateTestToken(id, role, LICEO)}`,
        'X-Institute-Slug': SLUG,
    });

    beforeAll(async () => {
        server = await createTestServer();
        prisma = await createTestPrismaClient();
    }, 120000);

    afterAll(async () => {
        await prisma.$disconnect();
        await server.close();
    });

    beforeEach(async () => {
        await cleanTestDatabase(prisma);

        admin = (await createTestUser(prisma, UserRole.ADMIN)).user;
        alumno1 = (await createTestUser(prisma, UserRole.STUDENT)).user;
        alumno2 = (await createTestUser(prisma, UserRole.STUDENT)).user;

        year = await prisma.academicYear.create({
            data: {
                id: gId(),
                name: 'Ciclo 2026-2027',
                startDate: new Date('2026-09-01T00:00:00Z'),
                endDate: new Date('2027-07-31T23:59:59Z'),
                status: 'ACTIVE',
            },
        });

        lapso1 = await prisma.period.create({
            data: {
                id: gId(),
                name: 'Primer Lapso',
                startDate: new Date('2026-09-01T00:00:00Z'),
                endDate: new Date('2026-12-15T23:59:59Z'),
                academicYearId: year.id,
            },
        });

        lapso2 = await prisma.period.create({
            data: {
                id: gId(),
                name: 'Segundo Lapso',
                startDate: new Date('2027-01-10T00:00:00Z'),
                endDate: new Date('2027-04-10T23:59:59Z'),
                academicYearId: year.id,
            },
        });

        seccion = await prisma.classroom.create({
            data: {
                id: gId(),
                name: '1er Año A',
                slug: `1er-ano-a-${gId().slice(0, 6)}`,
                grade: 1,
                section: 'A',
                academicYearId: year.id,
                capacity: 30,
            },
        });

        materia = await prisma.subject.create({
            data: {
                id: gId(),
                name: 'Matemática',
                slug: `matematica-${gId().slice(0, 6)}`,
                code: `MAT-${gId().slice(0, 4)}`,
                evaluacion: 'NUMERICA',
            },
        });

        await prisma.classroomSubject.create({
            data: {
                id: gId(),
                classroomId: seccion.id,
                subjectId: materia.id,
            },
        });

        await prisma.studentClassroom.create({
            data: {
                id: gId(),
                studentId: alumno1.id,
                classroomId: seccion.id,
                academicYearId: year.id,
                isActive: true,
            },
        });

        await prisma.studentClassroom.create({
            data: {
                id: gId(),
                studentId: alumno2.id,
                classroomId: seccion.id,
                academicYearId: year.id,
                isActive: true,
            },
        });

        // Lapso 1: Actividad y Notas 16 y 14 -> promedio 15.0
        const act1 = await prisma.activity.create({
            data: {
                id: gId(),
                title: 'Examen 1',
                type: 'EXAMEN' as any,
                scope: 'CLASSROOM' as any,
                classroomId: seccion.id,
                subjectId: materia.id,
                periodId: lapso1.id,
                createdBy: admin.id,
                maxGrade: 20,
                weight: 1,
                startDate: new Date('2026-10-01'),
                endDate: new Date('2026-10-01'),
                dueDate: new Date('2026-10-01'),
            } as any,
        });

        await prisma.grade.create({
            data: {
                id: gId(),
                studentId: alumno1.id,
                activityId: act1.id,
                subjectId: materia.id,
                periodId: lapso1.id,
                teacherId: admin.id,
                score: 16,
            },
        });
        await prisma.grade.create({
            data: {
                id: gId(),
                studentId: alumno2.id,
                activityId: act1.id,
                subjectId: materia.id,
                periodId: lapso1.id,
                teacherId: admin.id,
                score: 14,
            },
        });

        // Lapso 1: Asistencia (1 PRESENT, 1 LATE = 100%)
        await prisma.dailyAttendance.create({
            data: {
                id: gId(),
                studentId: alumno1.id,
                classroomId: seccion.id,
                teacherId: admin.id,
                date: new Date('2026-10-15T12:00:00Z'),
                status: 'PRESENT',
            },
        });
        await prisma.dailyAttendance.create({
            data: {
                id: gId(),
                studentId: alumno2.id,
                classroomId: seccion.id,
                teacherId: admin.id,
                date: new Date('2026-10-15T12:00:00Z'),
                status: 'LATE',
            },
        });

        // Lapso 1: 1 Observación
        await prisma.observation.create({
            data: {
                id: gId(),
                studentId: alumno1.id,
                createdById: admin.id,
                title: 'Buen desempeño',
                description: 'Participa activamente en clase',
                type: 'ACADEMIC',
                date: new Date('2026-10-20T12:00:00Z'),
            },
        });
    });

    it('calcula las cifras del Primer Lapso con los datos conocidos en el año escolar', async () => {
        const res = await request(server.server)
            .get(`/api/academic-years/${year.id}/stats?periodId=${lapso1.id}`)
            .set(auth(admin.id, UserRole.ADMIN));

        expect(res.status).toBe(200);
        const g1 = res.body.find((item: any) => item.grade === 1);
        expect(g1).toBeDefined();
        expect(g1.stats.average).toBe(15.0);
        expect(g1.stats.riskCount).toBe(0);
        expect(g1.stats.attendance).toBe('100%');
        expect(g1.stats.observations).toBe(1);
    });

    it('devuelve average: null, asistencia null y 0 observaciones para un lapso sin datos en el año', async () => {
        const res = await request(server.server)
            .get(`/api/academic-years/${year.id}/stats?periodId=${lapso2.id}`)
            .set(auth(admin.id, UserRole.ADMIN));

        expect(res.status).toBe(200);
        const g1 = res.body.find((item: any) => item.grade === 1);
        expect(g1).toBeDefined();
        expect(g1.stats.average).toBeNull();
        expect(g1.stats.riskCount).toBe(0);
        expect(g1.stats.attendance).toBeNull();
        expect(g1.stats.observations).toBe(0);
    });

    it('calcula las cifras del Primer Lapso con los datos conocidos en la sección', async () => {
        const res = await request(server.server)
            .get(`/api/classrooms/${seccion.id}/stats?periodId=${lapso1.id}`)
            .set(auth(admin.id, UserRole.ADMIN));

        expect(res.status).toBe(200);
        expect(res.body.average).toBe(15.0);
        expect(res.body.riskCount).toBe(0);
        expect(res.body.attendance).toBe('100%');
        expect(res.body.observations).toBe(1);
    });

    it('devuelve average: null y asistencia null en la sección para un lapso sin notas ni asistencias', async () => {
        const res = await request(server.server)
            .get(`/api/classrooms/${seccion.id}/stats?periodId=${lapso2.id}`)
            .set(auth(admin.id, UserRole.ADMIN));

        expect(res.status).toBe(200);
        expect(res.body.average).toBeNull();
        expect(res.body.minAverage).toBeNull();
        expect(res.body.maxAverage).toBeNull();
        expect(res.body.riskCount).toBe(0);
        expect(res.body.attendance).toBeNull();
        expect(res.body.observations).toBe(0);
    });
});
