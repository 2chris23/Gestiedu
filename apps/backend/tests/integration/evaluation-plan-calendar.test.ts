import { FastifyInstance } from 'fastify';
import request = require('supertest');
import { PrismaClient } from '@prisma/client';
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
 * REGRESIÓN — zona horaria en el calendario del plan de evaluación
 *
 * `startDate`/`endDate` llegan como "YYYY-MM-DD", que JavaScript interpreta como
 * medianoche UTC. El recorrido usaba `getDay()` (hora local): en America/Caracas
 * (UTC-4) esa medianoche UTC es las 20:00 del día ANTERIOR, así que cada fecha
 * recibía los bloques del día anterior — el bloque del lunes aparecía el martes.
 *
 * La zona se fuerza dentro del test: en una máquina en UTC, getDay() y
 * getUTCDay() coinciden y el bug no se vería.
 */

const MONDAY = '2026-09-14';
const TUESDAY = '2026-09-15';

describe('Calendario del plan de evaluación — día de la semana en UTC', () => {
    let server: FastifyInstance;
    let prisma: PrismaClient;
    let adminToken: string;
    let classroom: any;
    let subject: any;
    const originalTZ = process.env.TZ;

    const auth = (req: request.Test) =>
        req.set('Authorization', `Bearer ${adminToken}`).set('X-Institute-Slug', 'test-institute');

    beforeAll(async () => {
        process.env.TZ = 'America/Caracas';

        server = await createTestServer();
        prisma = await createTestPrismaClient();

        const admin = await createTestUser(prisma, UserRole.ADMIN);
        adminToken = generateTestToken(admin.user.id, UserRole.ADMIN, 'institute');

        const year = await createTestAcademicYear(prisma, 'institute');
        classroom = await prisma.classroom.create({
            data: {
                id: `cal${Date.now()}`.substring(0, 24),
                name: '3er Año A',
                slug: `cal-3a-${Date.now()}`,
                grade: 3,
                section: 'A',
                capacity: 30,
                academicYearId: year.id,
                instituteId: 'institute',
            },
        });
        subject = await createTestSubject(prisma, 'institute');
        const cs = await prisma.classroomSubject.create({
            data: { classroomId: classroom.id, subjectId: subject.id, weeklyBlocks: 1 },
        });

        // Un único bloque: lunes a las 07:00
        await prisma.scheduleBlock.create({
            data: {
                classroomId: classroom.id,
                classroomSubjectId: cs.id,
                dayOfWeek: 1,
                startTime: '07:00',
                endTime: '07:45',
                blockType: 'CLASS',
            },
        });
    }, 120000);

    afterAll(async () => {
        await prisma.scheduleBlock.deleteMany({ where: { classroomId: classroom.id } }).catch(() => {});
        await prisma.classroomSubject.deleteMany({ where: { classroomId: classroom.id } }).catch(() => {});
        await prisma.classroom.deleteMany({ where: { id: classroom.id } }).catch(() => {});
        await prisma.$disconnect();
        await server.close();
        // runInBand: todos los ficheros comparten proceso, no dejar la zona cambiada
        if (originalTZ === undefined) delete process.env.TZ;
        else process.env.TZ = originalTZ;
    }, 120000);

    it('el bloque del lunes cae el lunes, no el martes', async () => {
        const res = await auth(
            request(server.server).get(
                `/api/evaluation-plan/calendar-data?classroomId=${classroom.id}&startDate=${MONDAY}&endDate=2026-09-18`
            )
        );

        expect(res.status).toBe(200);
        const entries = res.body.calendarData.filter((e: any) => e.subjectId === subject.id);

        // Una semana de lunes a viernes con un solo bloque semanal → una entrada
        expect(entries).toHaveLength(1);
        expect(entries[0].date).toBe(MONDAY);
        expect(entries[0].dayOfWeek).toBe(1);
        expect(entries.find((e: any) => e.date === TUESDAY)).toBeUndefined();
    }, 60000);
});
