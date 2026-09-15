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
 * AUDITORÍA — LA CLASE EN VIVO
 *
 * La pantalla donde el profesor pasa la hora: guarda el tema, pasa asistencia,
 * deja actividades, pone notas a una actividad de clase y llena la fila de la
 * semana del plan.
 *
 * Es la pantalla que más se usa y la que más veces al día toca la base de datos,
 * así que se comprueba lo de siempre: que lo guardado quede guardado, que un
 * profesor no pueda hacerlo en una sección que no es suya, y que lo que se
 * borra desaparezca de verdad.
 */

const SLUG = 'test-institute';
const HOY = new Date().toISOString().slice(0, 10);
const gId = () => {
    // Siempre la 'c' delante: ver la nota de `tests/helpers.ts`.
    return `c${createId()}`;
};

describe('Auditoría — la clase en vivo', () => {
    let server: FastifyInstance;
    let prisma: PrismaClient;

    let profesor: any;
    let intruso: any;
    let alumno: any;
    let alumnoB: any;
    const tokens: Record<string, string> = {};

    let year: any;
    let period: any;
    let classroom: any;
    let subject: any;

    const auth = (token: string) => (req: request.Test) =>
        req.set('Authorization', `Bearer ${token}`).set('X-Institute-Slug', SLUG);
    const comoProfesor = (req: request.Test) => auth(tokens.profesor)(req);
    const comoIntruso = (req: request.Test) => auth(tokens.intruso)(req);

    beforeAll(async () => {
        server = await createTestServer();
        prisma = await createTestPrismaClient();

        profesor = (await createTestUser(prisma, UserRole.TEACHER)).user;
        intruso = (await createTestUser(prisma, UserRole.TEACHER)).user;
        alumno = (await createTestUser(prisma, UserRole.STUDENT)).user;
        alumnoB = (await createTestUser(prisma, UserRole.STUDENT)).user;

        tokens.profesor = generateTestToken(profesor.id, UserRole.TEACHER, 'institute');
        tokens.intruso = generateTestToken(intruso.id, UserRole.TEACHER, 'institute');

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
                name: 'Clase en Vivo A',
                slug: `vivo-${Date.now()}`,
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

        for (const est of [alumno, alumnoB]) {
            await prisma.studentClassroom.create({
                data: { studentId: est.id, classroomId: classroom.id, academicYearId: year.id, isActive: true },
            });
        }
    }, 180000);

    afterAll(async () => {
        await prisma.$disconnect();
        await server.close();
    }, 120000);

    it('VIVO-01: guardar la clase deja el tema y la asistencia puestos', async () => {
        const res = await comoProfesor(request(server.server).post('/api/sessions/live-save')).send({
            classroomId: classroom.id,
            subjectId: subject.id,
            date: HOY,
            topic: 'Los números enteros',
            observations: 'Buen ritmo de clase',
            observationsTitle: 'Nota general',
            attendances: [
                { studentId: alumno.id, status: 'PRESENT' },
                { studentId: alumnoB.id, status: 'ABSENT' },
            ],
        });

        expect([200, 201]).toContain(res.status);

        const sesion = await prisma.classSession.findFirst({
            where: { classroomId: classroom.id, subjectId: subject.id },
        });
        expect(sesion).not.toBeNull();
        expect(sesion!.topic).toBe('Los números enteros');

        const asistencia = await prisma.dailyAttendance.findMany({
            where: { classroomId: classroom.id },
        });
        expect(asistencia).toHaveLength(2);
        expect(asistencia.filter((a) => a.status === 'ABSENT')).toHaveLength(1);
    }, 60000);

    it('VIVO-02: guardar la clase otra vez corrige, no duplica', async () => {
        const res = await comoProfesor(request(server.server).post('/api/sessions/live-save')).send({
            classroomId: classroom.id,
            subjectId: subject.id,
            date: HOY,
            topic: 'Los números enteros (corregido)',
            attendances: [
                { studentId: alumno.id, status: 'PRESENT' },
                { studentId: alumnoB.id, status: 'PRESENT' },
            ],
        });

        expect([200, 201]).toContain(res.status);

        const sesiones = await prisma.classSession.findMany({
            where: { classroomId: classroom.id, subjectId: subject.id },
        });
        expect(sesiones).toHaveLength(1);
        expect(sesiones[0].topic).toBe('Los números enteros (corregido)');

        const asistencia = await prisma.dailyAttendance.findMany({ where: { classroomId: classroom.id } });
        expect(asistencia).toHaveLength(2);
        expect(asistencia.every((a) => a.status === 'PRESENT')).toBe(true);
    }, 60000);

    it('VIVO-03: el resumen en vivo responde para esa sección y día', async () => {
        const res = await comoProfesor(
            request(server.server).get('/api/sessions/live-overview').query({ classroomId: classroom.id, date: HOY })
        );

        expect(res.status).toBe(200);
        expect(JSON.stringify(res.body)).toContain(subject.id);
    }, 60000);

    it('VIVO-04: el resumen en vivo sin parámetros dice qué falta, no revienta', async () => {
        const res = await comoProfesor(request(server.server).get('/api/sessions/live-overview'));

        expect(res.status).toBe(400);
        expect(JSON.stringify(res.body)).toMatch(/classroomId|date|falta/i);
    }, 60000);

    let actividadId: string;

    it('VIVO-05: el profesor deja una actividad y aparece en la lista', async () => {
        const crear = await comoProfesor(request(server.server).post('/api/sessions/activities')).send({
            classroomId: classroom.id,
            subjectId: subject.id,
            title: 'Ejercicios de la página 40',
            description: 'Del 1 al 10',
            target: 'NEXT',
            maxScore: 20,
        });

        expect([200, 201]).toContain(crear.status);
        actividadId = crear.body?.activity?.id ?? crear.body?.data?.id ?? crear.body?.id;
        expect(actividadId).toBeTruthy();

        const lista = await comoProfesor(
            request(server.server).get('/api/sessions/activities').query({ classroomId: classroom.id, subjectId: subject.id })
        );
        expect(lista.status).toBe(200);
        expect(JSON.stringify(lista.body)).toContain('Ejercicios de la página 40');
    }, 60000);

    it('VIVO-06: se puede corregir el enunciado de la actividad', async () => {
        const res = await comoProfesor(request(server.server).put(`/api/sessions/activities/${actividadId}`)).send({
            title: 'Ejercicios de la página 41',
        });

        expect([200, 201]).toContain(res.status);

        const enBD = await prisma.classActivity.findUnique({ where: { id: actividadId } });
        expect(enBD!.title).toBe('Ejercicios de la página 41');
    }, 60000);

    it('VIVO-07: poner notas a la actividad de clase las deja guardadas', async () => {
        const res = await comoProfesor(
            request(server.server).post(`/api/sessions/activities/${actividadId}/grades`)
        ).send({
            scores: { [alumno.id]: 18, [alumnoB.id]: 11 },
            maxScore: 20,
        });

        expect([200, 201]).toContain(res.status);

        const enBD = await prisma.classActivity.findUnique({ where: { id: actividadId } });
        const guardadas = (enBD as any)?.scores ?? {};
        expect(String(JSON.stringify(guardadas))).toMatch(/18/);
        expect(String(JSON.stringify(guardadas))).toMatch(/11/);
    }, 60000);

    it('VIVO-08: buscar estudiantes para involucrarlos en la clase', async () => {
        const res = await comoProfesor(
            request(server.server).get('/api/sessions/search-students').query({ search: alumno.lastName })
        );

        expect(res.status).toBe(200);
        expect(JSON.stringify(res.body)).toContain(alumno.id);
    }, 60000);

    it('VIVO-09: guardar la fila de la semana del plan desde la clase', async () => {
        const res = await comoProfesor(request(server.server).post('/api/sessions/plan-week-save')).send({
            classroomId: classroom.id,
            subjectId: subject.id,
            date: HOY,
            values: { tema: 'Números enteros', estrategia: 'Ejercicios en pizarra' },
        });

        expect([200, 201]).toContain(res.status);
    }, 60000);

    it('VIVO-10: un profesor que no imparte ahí no toca nada de esta clase', async () => {
        const guardar = await comoIntruso(request(server.server).post('/api/sessions/live-save')).send({
            classroomId: classroom.id,
            subjectId: subject.id,
            date: HOY,
            topic: 'Tema metido por otro',
            attendances: [{ studentId: alumno.id, status: 'ABSENT' }],
        });
        expect([401, 403]).toContain(guardar.status);

        const actividad = await comoIntruso(request(server.server).post('/api/sessions/activities')).send({
            classroomId: classroom.id,
            subjectId: subject.id,
            title: 'Actividad metida por otro',
        });
        expect([401, 403]).toContain(actividad.status);

        // Y nada de eso quedó
        const sesion = await prisma.classSession.findFirst({
            where: { classroomId: classroom.id, subjectId: subject.id },
        });
        expect(sesion!.topic).not.toBe('Tema metido por otro');
        expect(
            await prisma.classActivity.findFirst({ where: { title: 'Actividad metida por otro' } })
        ).toBeNull();
    }, 60000);

    it('VIVO-11: borrar la actividad la quita de verdad', async () => {
        const res = await comoProfesor(request(server.server).delete(`/api/sessions/activities/${actividadId}`)).send({});

        expect([200, 204]).toContain(res.status);
        expect(await prisma.classActivity.findUnique({ where: { id: actividadId } })).toBeNull();
    }, 60000);
});
