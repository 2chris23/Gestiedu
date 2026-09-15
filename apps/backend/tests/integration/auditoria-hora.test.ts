import { FastifyInstance } from 'fastify';
import request = require('supertest');
import { PrismaClient } from '@prisma/client';
import { createId } from '@paralleldrive/cuid2';
import { UserRole } from '../../src/utils/prisma-enums';
import { todayInTimezone, timeInTimezone, isFutureDate } from '../../src/utils/school-time';
import {
    createTestServer,
    createTestPrismaClient,
    createTestUser,
    createTestAcademicYear,
    createTestSubject,
    generateTestToken,
} from '../helpers';

/**
 * AUDITORÍA — LA HORA LA PONE EL SERVIDOR
 *
 * Si alguien cambia la hora de su teléfono o se conecta por VPN, el sistema no
 * se entera y no debe cambiar nada: el día y la hora del liceo salen del reloj
 * del servidor y de la zona horaria configurada.
 *
 * Lo que se comprueba:
 *   - hay una hora oficial que la aplicación puede consultar;
 *   - no se puede registrar asistencia, clases ni observaciones de un día que
 *     todavía no ha llegado (que es lo que haría un reloj adelantado);
 *   - lo que queda guardado lleva la marca de tiempo del servidor.
 */

const SLUG = 'test-institute';
const gId = () => {
    // Siempre la 'c' delante: ver la nota de `tests/helpers.ts`.
    return `c${createId()}`;
};

/** Un día claramente futuro, como el que vería un reloj adelantado. */
const futuro = () => {
    const d = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
    return d.toISOString().slice(0, 10);
};

describe('Auditoría — la hora la pone el servidor', () => {
    let server: FastifyInstance;
    let prisma: PrismaClient;
    let profesor: any;
    let alumno: any;
    let tokenProfesor: string;
    let tokenAlumno: string;
    let year: any;
    let classroom: any;
    let subject: any;

    const auth = (token: string) => (req: request.Test) =>
        req.set('Authorization', `Bearer ${token}`).set('X-Institute-Slug', SLUG);

    beforeAll(async () => {
        server = await createTestServer();
        prisma = await createTestPrismaClient();

        profesor = (await createTestUser(prisma, UserRole.TEACHER)).user;
        alumno = (await createTestUser(prisma, UserRole.STUDENT)).user;
        tokenProfesor = generateTestToken(profesor.id, UserRole.TEACHER, 'institute');
        tokenAlumno = generateTestToken(alumno.id, UserRole.STUDENT, 'institute');

        year = await createTestAcademicYear(prisma, 'institute');
        classroom = await prisma.classroom.create({
            data: {
                id: gId(),
                name: 'Hora A',
                slug: `hora-${Date.now()}`,
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
            data: { studentId: alumno.id, classroomId: classroom.id, academicYearId: year.id, isActive: true },
        });
    }, 180000);

    afterAll(async () => {
        await prisma.$disconnect();
        await server.close();
    }, 120000);

    describe('el cálculo de "hoy" no depende del dispositivo', () => {
        it('da el mismo día aunque el dispositivo esté en otra zona horaria', () => {
            const momento = new Date('2026-09-12T02:30:00Z'); // 22:30 del día 11 en Caracas
            expect(todayInTimezone('America/Caracas', momento)).toBe('2026-09-11');
            // Un dispositivo con VPN en Tokio vería otro día; el liceo no
            expect(todayInTimezone('Asia/Tokyo', momento)).toBe('2026-09-12');
        });

        it('una zona horaria inventada no rompe nada: cae en la del liceo', () => {
            const momento = new Date('2026-09-12T02:30:00Z');
            expect(todayInTimezone('Zona/Inventada', momento)).toBe('2026-09-11');
        });

        it('la hora sale en formato de 24 horas', () => {
            expect(timeInTimezone('America/Caracas', new Date('2026-09-12T18:05:00Z'))).toBe('14:05');
        });

        it('sabe distinguir una fecha futura de una pasada', () => {
            const ahora = new Date('2026-09-12T15:00:00Z');
            expect(isFutureDate('2026-09-13', 'America/Caracas', ahora)).toBe(true);
            expect(isFutureDate('2026-09-12', 'America/Caracas', ahora)).toBe(false);
            expect(isFutureDate('2026-09-01', 'America/Caracas', ahora)).toBe(false);
        });
    });

    describe('la aplicación puede preguntar la hora oficial', () => {
        it('devuelve día, hora y zona del liceo', async () => {
            const res = await auth(tokenProfesor)(request(server.server).get('/api/time'));

            expect(res.status).toBe(200);
            expect(res.body.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
            expect(res.body.time).toMatch(/^\d{2}:\d{2}$/);
            expect(res.body.timezone).toBeTruthy();
            // Y coincide con lo que calcula el servidor en esa zona
            expect(res.body.date).toBe(todayInTimezone(res.body.timezone));
        }, 60000);

        it('sin sesión no se consulta', async () => {
            const res = await request(server.server).get('/api/time').set('X-Institute-Slug', SLUG);
            expect(res.status).toBe(401);
        }, 60000);
    });

    describe('un reloj adelantado no mete datos en el futuro', () => {
        it('no deja pasar asistencia de un día que no ha llegado', async () => {
            const res = await auth(tokenProfesor)(request(server.server).post('/api/attendance')).send({
                studentId: alumno.id,
                classroomId: classroom.id,
                date: futuro(),
                status: 'PRESENT',
            });

            expect(res.status).toBe(400);
            expect(res.body.code).toBe('FUTURE_DATE');
            expect(await prisma.dailyAttendance.count({ where: { studentId: alumno.id } })).toBe(0);
        }, 60000);

        it('no deja abrir una clase de un día que no ha llegado', async () => {
            const res = await auth(tokenProfesor)(request(server.server).post('/api/sessions/')).send({
                classroomId: classroom.id,
                subjectId: subject.id,
                date: futuro(),
                topic: 'Clase del futuro',
                startTime: '08:00',
                endTime: '08:45',
            });

            expect(res.status).toBe(400);
            expect(res.body.code).toBe('FUTURE_DATE');
        }, 60000);

        it('no deja dejar una observación con fecha futura', async () => {
            const res = await auth(tokenProfesor)(request(server.server).post('/api/observations')).send({
                studentIds: [alumno.id],
                classroomId: classroom.id,
                subjectId: subject.id,
                title: 'Observación adelantada',
                description: 'Escrita antes de que pase',
                date: futuro(),
            });

            expect(res.status).toBe(400);
            expect(res.body.code).toBe('FUTURE_DATE');
        }, 60000);

        it('la asistencia de HOY sí se registra', async () => {
            const hoy = todayInTimezone('America/Caracas');
            const res = await auth(tokenProfesor)(request(server.server).post('/api/attendance')).send({
                studentId: alumno.id,
                classroomId: classroom.id,
                date: hoy,
                status: 'PRESENT',
            });

            expect([200, 201]).toContain(res.status);
        }, 60000);
    });

    describe('lo guardado lleva la marca del servidor', () => {
        it('la observación se guarda con la hora del servidor, no con la que mande el cliente', async () => {
            const antes = Date.now();
            const res = await auth(tokenProfesor)(request(server.server).post('/api/observations')).send({
                studentIds: [alumno.id],
                classroomId: classroom.id,
                subjectId: subject.id,
                title: 'Observación normal',
                description: 'Sin fecha: manda el servidor',
                // Intento de colar una marca de tiempo del cliente
                createdAt: '2020-01-01T00:00:00.000Z',
            });
            expect([200, 201]).toContain(res.status);

            const guardada = await prisma.observation.findFirst({
                where: { studentId: alumno.id, title: 'Observación normal' },
            });
            expect(guardada).not.toBeNull();
            expect(guardada!.createdAt.getTime()).toBeGreaterThanOrEqual(antes - 5000);
            expect(guardada!.createdAt.getFullYear()).toBeGreaterThan(2020);
        }, 60000);
    });
});
