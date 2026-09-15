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
 * AUDITORÍA — LOS NÚMEROS QUE LA GENTE LEE
 *
 * Promedios por materia, por sección, por grado y del ciclo; informes de notas
 * y de asistencia; el expediente de un estudiante; y las observaciones de una
 * sección.
 *
 * Aquí hay dos riesgos distintos:
 *
 *   1. que el número esté mal (y entonces alguien decide sobre un dato falso);
 *   2. que lo vea quien no debe. El promedio de una sección, el expediente de
 *      un alumno o sus observaciones no son para cualquiera que tenga sesión.
 */

const SLUG = 'test-institute';
const gId = () => {
    // Siempre la 'c' delante: ver la nota de `tests/helpers.ts`.
    return `c${createId()}`;
};

describe('Auditoría — los números que la gente lee', () => {
    let server: FastifyInstance;
    let prisma: PrismaClient;

    let admin: any;
    let profesor: any;
    let otroProfesor: any;
    let alumno: any;
    let alumnoB: any;
    let alumnoAjeno: any;
    let tutor: any;
    const tokens: Record<string, string> = {};

    let year: any;
    let period: any;
    let classroom: any;
    let otraSeccion: any;
    let subject: any;

    const auth = (token: string) => (req: request.Test) =>
        req.set('Authorization', `Bearer ${token}`).set('X-Institute-Slug', SLUG);
    const como = (quien: string) => (req: request.Test) => auth(tokens[quien])(req);

    beforeAll(async () => {
        server = await createTestServer();
        prisma = await createTestPrismaClient();

        admin = (await createTestUser(prisma, UserRole.ADMIN)).user;
        profesor = (await createTestUser(prisma, UserRole.TEACHER)).user;
        otroProfesor = (await createTestUser(prisma, UserRole.TEACHER)).user;
        alumno = (await createTestUser(prisma, UserRole.STUDENT)).user;
        alumnoB = (await createTestUser(prisma, UserRole.STUDENT)).user;
        alumnoAjeno = (await createTestUser(prisma, UserRole.STUDENT)).user;
        tutor = (await createTestUser(prisma, UserRole.TUTOR)).user;

        tokens.admin = generateTestToken(admin.id, UserRole.ADMIN, 'institute');
        tokens.profesor = generateTestToken(profesor.id, UserRole.TEACHER, 'institute');
        tokens.otroProfesor = generateTestToken(otroProfesor.id, UserRole.TEACHER, 'institute');
        tokens.alumno = generateTestToken(alumno.id, UserRole.STUDENT, 'institute');
        tokens.alumnoAjeno = generateTestToken(alumnoAjeno.id, UserRole.STUDENT, 'institute');
        tokens.tutor = generateTestToken(tutor.id, UserRole.TUTOR, 'institute');

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

        const nuevaSeccion = (nombre: string, seccion: string, guia: string) =>
            prisma.classroom.create({
                data: {
                    id: gId(),
                    name: nombre,
                    slug: `num-${seccion.toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                    grade: 1,
                    section: seccion,
                    capacity: 30,
                    academicYearId: year.id,
                    instituteId: 'institute',
                    teacherId: guia,
                },
            });

        classroom = await nuevaSeccion('Números A', 'A', profesor.id);
        otraSeccion = await nuevaSeccion('Números B', 'B', otroProfesor.id);

        subject = await createTestSubject(prisma, 'institute');
        await prisma.classroomSubject.create({
            data: { classroomId: classroom.id, subjectId: subject.id, teacherId: profesor.id, weeklyBlocks: 3 },
        });

        for (const est of [alumno, alumnoB]) {
            await prisma.studentClassroom.create({
                data: { studentId: est.id, classroomId: classroom.id, academicYearId: year.id, isActive: true },
            });
        }
        await prisma.studentClassroom.create({
            data: { studentId: alumnoAjeno.id, classroomId: otraSeccion.id, academicYearId: year.id, isActive: true },
        });

        // El tutor tutela solo al primero
        await prisma.studentTutor.create({
            data: { studentId: alumno.id, tutorId: tutor.id, relationship: 'MADRE' },
        });

        const actividad = await prisma.activity.create({
            data: {
                title: 'Evaluación 1',
                type: 'SUMATIVA',
                scope: 'CLASSROOM',
                startDate: new Date('2026-09-10'),
                maxGrade: 20,
                weight: 1,
                classroomId: classroom.id,
                subjectId: subject.id,
                periodId: period.id,
                lapso: '1',
                createdBy: profesor.id,
                instituteId: 'institute',
            },
        });

        // 16 y 12 → promedio de la materia: 14
        await prisma.grade.create({
            data: {
                score: 16,
                studentId: alumno.id,
                activityId: actividad.id,
                periodId: period.id,
                subjectId: subject.id,
                teacherId: profesor.id,
            },
        });
        await prisma.grade.create({
            data: {
                score: 12,
                studentId: alumnoB.id,
                activityId: actividad.id,
                periodId: period.id,
                subjectId: subject.id,
                teacherId: profesor.id,
            },
        });

        await prisma.dailyAttendance.create({
            data: {
                studentId: alumno.id,
                classroomId: classroom.id,
                teacherId: profesor.id,
                date: new Date('2026-09-09'),
                status: 'PRESENT',
            },
        });
        await prisma.dailyAttendance.create({
            data: {
                studentId: alumnoB.id,
                classroomId: classroom.id,
                teacherId: profesor.id,
                date: new Date('2026-09-09'),
                status: 'ABSENT',
            },
        });

        await prisma.observation.create({
            data: {
                title: 'Observación de la sección A',
                description: 'Detalle',
                type: 'OBSERVACION',
                date: new Date('2026-09-09'),
                studentId: alumno.id,
                createdById: profesor.id,
                classroomId: classroom.id,
                subjectId: subject.id,
                instituteId: 'institute',
            },
        });
    }, 180000);

    afterAll(async () => {
        await prisma.$disconnect();
        await server.close();
    }, 120000);

    describe('promedios del ciclo', () => {
        it('NUM-01: el promedio de la materia en la sección sale correcto', async () => {
            const res = await como('profesor')(
                request(server.server).get(`/api/statistics/subject/${classroom.id}/${subject.id}`)
            );

            expect(res.status).toBe(200);
            const promedio = res.body?.average ?? res.body?.data?.average;
            expect(Number(promedio)).toBeCloseTo(14, 1);
        }, 60000);

        it('NUM-02: el promedio global de la sección responde', async () => {
            const res = await como('profesor')(request(server.server).get(`/api/statistics/section/${classroom.id}`));
            expect(res.status).toBe(200);
        }, 60000);

        it('NUM-03: el promedio del grado y el del ciclo responden', async () => {
            const grado = await como('admin')(request(server.server).get(`/api/statistics/grade/${year.id}/1`));
            expect(grado.status).toBe(200);

            const ciclo = await como('admin')(request(server.server).get(`/api/statistics/cycle/${year.id}`));
            expect(ciclo.status).toBe(200);
        }, 60000);

        it('NUM-04: un estudiante no anda leyendo los promedios del liceo', async () => {
            const abiertas: string[] = [];
            for (const ruta of [
                `/api/statistics/section/${classroom.id}`,
                `/api/statistics/grade/${year.id}/1`,
                `/api/statistics/cycle/${year.id}`,
            ]) {
                const res = await como('alumno')(request(server.server).get(ruta));
                if (res.status < 400) abiertas.push(`${ruta} respondió ${res.status}`);
            }
            expect(abiertas).toEqual([]);
        }, 60000);

        it('NUM-05: solo el admin limpia el caché de estadísticas', async () => {
            const deProfesor = await como('profesor')(
                request(server.server).post(`/api/statistics/cache/clear/section/${classroom.id}`)
            ).send({});
            expect([401, 403]).toContain(deProfesor.status);

            const deAdmin = await como('admin')(
                request(server.server).post(`/api/statistics/cache/clear/section/${classroom.id}`)
            ).send({});
            expect([200, 204]).toContain(deAdmin.status);

            const cicloAdmin = await como('admin')(
                request(server.server).post(`/api/statistics/cache/clear/cycle/${year.id}`)
            ).send({});
            expect([200, 204]).toContain(cicloAdmin.status);
        }, 60000);
    });

    describe('informes', () => {
        it('NUM-06: el informe de notas responde', async () => {
            const res = await como('profesor')(request(server.server).post('/api/reports/grades')).send({
                studentId: alumno.id,
                classroomId: classroom.id,
                periodId: period.id,
            });

            expect([200, 201]).toContain(res.status);
        }, 60000);

        it('NUM-07: el informe de asistencia responde y cuenta lo que hay', async () => {
            const res = await como('profesor')(
                request(server.server).get('/api/reports/attendance').query({ classroomId: classroom.id })
            );

            expect(res.status).toBe(200);
            expect(JSON.stringify(res.body)).toContain(alumno.id);
        }, 60000);

        it('NUM-08: la analítica de notas responde', async () => {
            const res = await como('profesor')(
                request(server.server).get('/api/reports/analytics/grades').query({ classroomId: classroom.id })
            );
            expect(res.status).toBe(200);
        }, 60000);

        it('NUM-09: el expediente de un alumno lo ve quien debe', async () => {
            const propio = await como('profesor')(request(server.server).get(`/api/reports/student/${alumno.id}`));
            expect(propio.status).toBe(200);
            expect(JSON.stringify(propio.body)).toContain(alumno.id);
        }, 60000);

        it('NUM-10: un estudiante no saca el expediente de otro ni los informes del liceo', async () => {
            // El expediente de OTRO alumno: esto era una fuga abierta de par en par
            // (nombre, correo, fecha de nacimiento, dirección, notas y asistencia).
            const deOtro = await como('alumno')(
                request(server.server).get(`/api/reports/student/${alumnoAjeno.id}`)
            );
            expect([401, 403]).toContain(deOtro.status);
            expect(JSON.stringify(deOtro.body)).not.toContain(alumnoAjeno.email);

            // Y los informes generales tampoco son suyos
            for (const ruta of ['/api/reports/attendance', '/api/reports/analytics/grades']) {
                const res = await como('alumno')(request(server.server).get(ruta));
                expect([401, 403]).toContain(res.status);
            }
        }, 60000);

        it('NUM-17: su propio expediente sí lo puede ver', async () => {
            const res = await como('alumno')(request(server.server).get(`/api/reports/student/${alumno.id}`));
            expect(res.status).toBe(200);
            expect(JSON.stringify(res.body)).toContain(alumno.id);
        }, 60000);

        it('NUM-18: el tutor ve el expediente del alumno que tutela, y solo ese', async () => {
            const suyo = await como('tutor')(request(server.server).get(`/api/reports/student/${alumno.id}`));
            expect(suyo.status).toBe(200);

            const ajeno = await como('tutor')(
                request(server.server).get(`/api/reports/student/${alumnoAjeno.id}`)
            );
            expect([401, 403]).toContain(ajeno.status);
        }, 60000);
    });

    describe('asistencia consultada', () => {
        it('NUM-11: la asistencia de un alumno y su resumen responden', async () => {
            const lista = await como('profesor')(request(server.server).get(`/api/attendance/student/${alumno.id}`));
            expect(lista.status).toBe(200);

            const resumen = await como('profesor')(
                request(server.server).get(`/api/attendance/summary/student/${alumno.id}`)
            );
            expect(resumen.status).toBe(200);
        }, 60000);

        it('NUM-12: el resumen de la sección responde', async () => {
            const res = await como('profesor')(
                request(server.server).get(`/api/attendance/summary/classroom/${classroom.id}`)
            );
            expect(res.status).toBe(200);
        }, 60000);

        it('NUM-13: un alumno no consulta la asistencia de otro', async () => {
            const res = await como('alumno')(request(server.server).get(`/api/attendance/student/${alumnoAjeno.id}`));
            expect([401, 403]).toContain(res.status);
        }, 60000);
    });

    describe('observaciones', () => {
        it('NUM-14: el profesor lee las observaciones de su sección y de su materia', async () => {
            const porSeccion = await como('profesor')(
                request(server.server).get(`/api/observations/classroom/${classroom.id}`)
            );
            expect(porSeccion.status).toBe(200);
            expect(JSON.stringify(porSeccion.body)).toContain('Observación de la sección A');

            const porMateria = await como('profesor')(
                request(server.server).get(`/api/observations/subject/${classroom.id}/${subject.id}`)
            );
            expect(porMateria.status).toBe(200);
        }, 60000);

        it('NUM-15: un profesor ajeno no lee las observaciones de esa sección', async () => {
            const res = await como('otroProfesor')(
                request(server.server).get(`/api/observations/classroom/${classroom.id}`)
            );
            expect([401, 403]).toContain(res.status);
        }, 60000);

        it('NUM-16: un alumno no lee las observaciones de su sección', async () => {
            const res = await como('alumno')(request(server.server).get(`/api/observations/classroom/${classroom.id}`));
            expect([401, 403]).toContain(res.status);
        }, 60000);
    });
});
