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
 * AUDITORÍA — NOTAS
 *
 * Poner una nota, corregirla, borrarla y consultarla. Y lo que más importa: que
 * la nota puesta llegue al promedio del estudiante y que un estudiante no pueda
 * ver ni tocar las notas de otro.
 */

const SLUG = 'test-institute';
const gId = () => {
    // Siempre la 'c' delante: ver la nota de `tests/helpers.ts`.
    return `c${createId()}`;
};

describe('Auditoría — notas', () => {
    let server: FastifyInstance;
    let prisma: PrismaClient;

    let profesor: any;
    let alumno: any;
    let otroAlumno: any;
    const tokens: Record<string, string> = {};

    let year: any;
    let period: any;
    let classroom: any;
    let subject: any;
    let actividad: any;

    const auth = (token: string) => (req: request.Test) =>
        req.set('Authorization', `Bearer ${token}`).set('X-Institute-Slug', SLUG);
    const comoProfesor = (req: request.Test) => auth(tokens.profesor)(req);

    beforeAll(async () => {
        server = await createTestServer();
        prisma = await createTestPrismaClient();

        profesor = (await createTestUser(prisma, UserRole.TEACHER)).user;
        alumno = (await createTestUser(prisma, UserRole.STUDENT)).user;
        otroAlumno = (await createTestUser(prisma, UserRole.STUDENT)).user;
        tokens.profesor = generateTestToken(profesor.id, UserRole.TEACHER, 'institute');
        tokens.alumno = generateTestToken(alumno.id, UserRole.STUDENT, 'institute');
        tokens.otroAlumno = generateTestToken(otroAlumno.id, UserRole.STUDENT, 'institute');

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
                name: 'Notas A',
                slug: `notas-${Date.now()}`,
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

        for (const est of [alumno, otroAlumno]) {
            await prisma.studentClassroom.create({
                data: { studentId: est.id, classroomId: classroom.id, academicYearId: year.id, isActive: true },
            });
        }

        actividad = await prisma.activity.create({
            data: {
                title: 'Prueba escrita',
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
    }, 180000);

    afterAll(async () => {
        await prisma.$disconnect();
        await server.close();
    }, 120000);

    let notaId: string;

    it('el profesor pone una nota y queda guardada', async () => {
        const res = await comoProfesor(request(server.server).post('/api/grades')).send({
            score: 16,
            studentId: alumno.id,
            activityId: actividad.id,
            periodId: period.id,
            subjectId: subject.id,
            comments: 'Buen trabajo',
        });

        expect([200, 201]).toContain(res.status);
        notaId = res.body.grade?.id ?? res.body.data?.id ?? res.body.id;

        const enBD = await prisma.grade.findFirst({ where: { studentId: alumno.id, activityId: actividad.id } });
        expect(enBD).not.toBeNull();
        expect(enBD!.score).toBe(16);
        expect(enBD!.comments).toBe('Buen trabajo');
        expect(enBD!.teacherId).toBe(profesor.id);
    }, 60000);

    it('la nota se refleja en el promedio del estudiante', async () => {
        const res = await comoProfesor(
            request(server.server).get('/api/students').query({ classroomId: classroom.id, isActive: 'true' })
        );

        expect(res.status).toBe(200);
        const yo = (res.body.students as any[]).find((e) => e.id === alumno.id);
        expect(Number(yo.average)).toBeCloseTo(16, 0);
    }, 60000);

    it('no acepta una nota fuera de la escala', async () => {
        const res = await comoProfesor(request(server.server).post('/api/grades')).send({
            score: 25,
            studentId: otroAlumno.id,
            activityId: actividad.id,
            periodId: period.id,
            subjectId: subject.id,
        });

        expect(res.status).toBe(400);
        expect(await prisma.grade.findFirst({ where: { studentId: otroAlumno.id } })).toBeNull();
    }, 60000);

    it('no deja poner dos notas a la misma actividad del mismo estudiante', async () => {
        const res = await comoProfesor(request(server.server).post('/api/grades')).send({
            score: 10,
            studentId: alumno.id,
            activityId: actividad.id,
            periodId: period.id,
            subjectId: subject.id,
        });

        expect([400, 409]).toContain(res.status);
        expect(JSON.stringify(res.body)).not.toMatch(/prisma|P2002|node_modules/i);
        // La nota original no cambió
        const enBD = await prisma.grade.findFirst({ where: { studentId: alumno.id, activityId: actividad.id } });
        expect(enBD!.score).toBe(16);
    }, 60000);

    it('el profesor corrige la nota y el cambio se guarda', async () => {
        const res = await comoProfesor(request(server.server).put(`/api/grades/${notaId}`)).send({
            score: 18,
            comments: 'Corregida tras revisión',
        });

        expect(res.status).toBe(200);
        const enBD = await prisma.grade.findUnique({ where: { id: notaId } });
        expect(enBD!.score).toBe(18);
        expect(enBD!.comments).toBe('Corregida tras revisión');
    }, 60000);

    it('el estudiante ve SUS notas', async () => {
        const res = await auth(tokens.alumno)(request(server.server).get('/api/grades/student/my-grades'));
        expect(res.status).toBe(200);
        expect(JSON.stringify(res.body)).toContain(String(18));
    }, 60000);

    it('un estudiante no puede ver las notas de otro', async () => {
        const res = await auth(tokens.otroAlumno)(
            request(server.server).get(`/api/grades/student/${alumno.id}`)
        );
        expect([401, 403]).toContain(res.status);
    }, 60000);

    it('un estudiante no puede ponerse notas', async () => {
        const res = await auth(tokens.alumno)(request(server.server).post('/api/grades')).send({
            score: 20,
            studentId: alumno.id,
            activityId: actividad.id,
            periodId: period.id,
            subjectId: subject.id,
        });
        expect([401, 403]).toContain(res.status);
    }, 60000);

    it('el profesor borra la nota y desaparece del promedio', async () => {
        const res = await comoProfesor(request(server.server).delete(`/api/grades/${notaId}`));
        expect([200, 204]).toContain(res.status);
        expect(await prisma.grade.findUnique({ where: { id: notaId } })).toBeNull();

        const lista = await comoProfesor(
            request(server.server).get('/api/students').query({ classroomId: classroom.id, isActive: 'true' })
        );
        const yo = (lista.body.students as any[]).find((e) => e.id === alumno.id);
        expect(Number(yo.average)).toBe(0);
    }, 60000);
});
