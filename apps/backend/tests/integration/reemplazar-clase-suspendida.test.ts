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
 * SUSPENDER UNA CLASE Y PONER OTRA MATERIA EN SU LUGAR
 *
 * Dos cosas:
 *
 *   1. **Suspender es del admin.** Hasta ahora bastaba ser profesor —de
 *      cualquier sección, sin mirar si la clase era suya— para dejar a una
 *      sección sin su hora y correr el plan de evaluación de otra persona.
 *
 *   2. **El reemplazo.** El admin pone otra materia de la sección en ese hueco,
 *      y solo si el profesor que entra está libre a esa hora.
 *
 * Montaje, el lunes 21-09-2026:
 *   1er A: Matemática (profe Ana) 07:00–08:30 en dos bloques; Historia (profe
 *          Beto) a las 10:00; Física sin profesor.
 *   1er B: Beto da Historia 07:00–07:45 → a esa hora NO está libre.
 */

const SLUG = 'test-institute';
const LUNES = '2026-09-21';
const gId = () => `c${createId()}`;

describe('Suspender y reemplazar una clase', () => {
    let server: FastifyInstance;
    let prisma: PrismaClient;
    const tk: Record<string, string> = {};
    let admin: any, ana: any, beto: any, otroProfe: any, alumno: any;
    let seccionA: any, seccionB: any, yearId: string;
    let mate: any, historia: any, fisica: any, quimica: any;

    const auth = (token: string) => (req: request.Test) =>
        req.set('Authorization', `Bearer ${token}`).set('X-Institute-Slug', SLUG);
    const suspender = (token: string, body: Record<string, unknown>) =>
        auth(token)(request(server.server).post('/api/sessions/suspend').send(body));
    const reemplazar = (token: string, body: Record<string, unknown>) =>
        auth(token)(request(server.server).post('/api/class-replacements').send(body));

    beforeAll(async () => {
        server = await createTestServer();
        prisma = await createTestPrismaClient();

        admin = (await createTestUser(prisma, UserRole.ADMIN)).user;
        ana = (await createTestUser(prisma, UserRole.TEACHER, { firstName: 'Ana' })).user;
        beto = (await createTestUser(prisma, UserRole.TEACHER, { firstName: 'Beto' })).user;
        otroProfe = (await createTestUser(prisma, UserRole.TEACHER)).user;
        alumno = (await createTestUser(prisma, UserRole.STUDENT)).user;
        tk.admin = generateTestToken(admin.id, UserRole.ADMIN, 'institute');
        tk.ana = generateTestToken(ana.id, UserRole.TEACHER, 'institute');
        tk.beto = generateTestToken(beto.id, UserRole.TEACHER, 'institute');
        tk.otro = generateTestToken(otroProfe.id, UserRole.TEACHER, 'institute');
        tk.alumno = generateTestToken(alumno.id, UserRole.STUDENT, 'institute');

        const year = await createTestAcademicYear(prisma, 'institute');
        yearId = year.id;
        const seccion = (name: string, letra: string) =>
            prisma.classroom.create({
                data: {
                    id: gId(), name, slug: `reemp-${letra}-${gId()}`, grade: 1, section: letra,
                    capacity: 30, academicYearId: year.id, instituteId: 'institute',
                },
            });
        seccionA = await seccion('1er Año A', 'A');
        seccionB = await seccion('1er Año B', 'B');
        [mate, historia, fisica, quimica] = await Promise.all([1, 2, 3, 4].map(() => createTestSubject(prisma, 'institute')));

        const asignar = (classroomId: string, subjectId: string, teacherId: string | null) =>
            prisma.classroomSubject.create({ data: { classroomId, subjectId, teacherId, weeklyBlocks: 2 } });
        const csMate = await asignar(seccionA.id, mate.id, ana.id);
        const csHistA = await asignar(seccionA.id, historia.id, beto.id);
        await asignar(seccionA.id, fisica.id, null);
        const csHistB = await asignar(seccionB.id, historia.id, beto.id);

        const bloque = (classroomId: string, classroomSubjectId: string, startTime: string, endTime: string) =>
            prisma.scheduleBlock.create({
                data: { classroomId, classroomSubjectId, dayOfWeek: 1, startTime, endTime, blockType: 'CLASS' },
            });
        await bloque(seccionA.id, csMate.id, '07:00', '07:45');
        await bloque(seccionA.id, csMate.id, '07:45', '08:30');
        await bloque(seccionA.id, csHistA.id, '10:00', '10:45');
        await bloque(seccionB.id, csHistB.id, '07:00', '07:45');
    }, 60000);

    afterAll(async () => {
        await prisma?.$disconnect();
        await server?.close();
    });

    it('REEMP-01: un profesor ya NO puede suspender una clase, ni la suya', async () => {
        for (const t of [tk.ana, tk.otro, tk.alumno]) {
            const res = await suspender(t, { classroomId: seccionA.id, subjectId: mate.id, date: LUNES });
            expect([401, 403]).toContain(res.status);
        }
        expect(await prisma.classSession.count({ where: { classroomId: seccionA.id } })).toBe(0);
    }, 60000);

    it('REEMP-02: el admin no puede suspender una materia que la sección no tiene', async () => {
        const res = await suspender(tk.admin, { classroomId: seccionA.id, subjectId: quimica.id, date: LUNES });
        expect(res.status).toBe(404);
        const mala = await suspender(tk.admin, { classroomId: seccionA.id, subjectId: mate.id, date: '21/09/2026' });
        expect(mala.status).toBe(400);
    }, 60000);

    it('REEMP-03: no se reemplaza una clase que NO está suspendida', async () => {
        const res = await reemplazar(tk.admin, {
            classroomId: seccionA.id, suspendedSubjectId: mate.id, subjectId: historia.id, date: LUNES,
        });
        expect(res.status).toBe(409);
        expect(res.body.code).toBe('CLASS_NOT_SUSPENDED');
    }, 60000);

    it('REEMP-04: si el profesor que entra está ocupado, ni se reemplaza NI se suspende', async () => {
        const res = await suspender(tk.admin, {
            classroomId: seccionA.id, subjectId: mate.id, date: LUNES, reason: 'Ana en reposo', replacementSubjectId: historia.id,
        });
        expect(res.status).toBe(409);
        expect(res.body.code).toBe('TEACHER_BUSY');
        expect(res.body.error).toMatch(/07:00/);
        // Todo o nada: la clase de Ana sigue en pie.
        const sesion = await prisma.classSession.findFirst({ where: { classroomId: seccionA.id, subjectId: mate.id } });
        expect(sesion?.status ?? 'ACTIVE').toBe('ACTIVE');
        expect(await prisma.classReplacement.count()).toBe(0);
    }, 60000);

    it('REEMP-05: materia sin profesor, la misma materia u otra sección → rechazado', async () => {
        await suspender(tk.admin, { classroomId: seccionA.id, subjectId: mate.id, date: LUNES });
        const base = { classroomId: seccionA.id, suspendedSubjectId: mate.id, date: LUNES };
        expect((await reemplazar(tk.admin, { ...base, subjectId: fisica.id })).body.code).toBe('SUBJECT_WITHOUT_TEACHER');
        expect((await reemplazar(tk.admin, { ...base, subjectId: mate.id })).status).toBe(400);
        expect((await reemplazar(tk.admin, { ...base, subjectId: quimica.id })).status).toBe(404);
    }, 60000);

    it('REEMP-06: si la clase de Beto en 1er B también se suspende, queda libre y el reemplazo entra', async () => {
        const libre = await suspender(tk.admin, { classroomId: seccionB.id, subjectId: historia.id, date: LUNES });
        expect(libre.status).toBe(200);

        const res = await reemplazar(tk.admin, {
            classroomId: seccionA.id, suspendedSubjectId: mate.id, subjectId: historia.id, date: LUNES, reason: 'Ana en reposo',
        });
        expect(res.status).toBe(201);
        // Un reemplazo por cada bloque de Matemática ese día.
        expect(res.body.replacements.map((r: any) => r.startTime)).toEqual(['07:00', '07:45']);
        expect(res.body.replacements[0].teacher.id).toBe(beto.id);

        // Los dos profesores se enteran.
        const avisos = await prisma.notification.findMany({ where: { type: 'CLASS_REPLACEMENT' } });
        expect(avisos.map((a) => a.recipientId).sort()).toEqual([ana.id, beto.id].sort());
    }, 60000);

    it('REEMP-07: el mismo hueco no se cubre dos veces', async () => {
        const res = await reemplazar(tk.admin, {
            classroomId: seccionA.id, suspendedSubjectId: mate.id, subjectId: historia.id, date: LUNES,
        });
        expect(res.status).toBe(409);
        expect(res.body.code).toBe('ALREADY_REPLACED');
    }, 60000);

    it('REEMP-08: quién ve los reemplazos', async () => {
        const ver = (t: string, q: string) =>
            auth(t)(request(server.server).get(`/api/class-replacements?${q}&from=${LUNES}&to=${LUNES}`));

        expect((await ver(tk.beto, `teacherId=${beto.id}`)).body.replacements).toHaveLength(2);
        expect((await ver(tk.ana, `classroomId=${seccionA.id}`)).body.replacements).toHaveLength(2);
        expect((await ver(tk.admin, `classroomId=${seccionA.id}`)).status).toBe(200);
        // Un profesor que no da clase en la sección, ni viendo los de otro.
        expect((await ver(tk.otro, `classroomId=${seccionA.id}`)).status).toBe(403);
        expect((await ver(tk.otro, `teacherId=${beto.id}`)).status).toBe(403);
        // El alumno que estudia EN esa sección sí: es su horario el que cambió.
        // (Sin esto veía la materia de siempre y se presentaba a otra clase.)
        expect((await ver(tk.alumno, `classroomId=${seccionA.id}`)).status).toBe(403);

        await prisma.studentClassroom.create({
            data: { studentId: alumno.id, classroomId: seccionA.id, academicYearId: yearId, isActive: true },
        });
        const suyos = await ver(tk.alumno, `classroomId=${seccionA.id}`);
        expect(suyos.status).toBe(200);
        expect(suyos.body.replacements).toHaveLength(2);

        // Pero no los de la sección de al lado.
        expect((await ver(tk.alumno, `classroomId=${seccionB.id}`)).status).toBe(403);
    }, 60000);

    it('REEMP-09: solo el admin quita el reemplazo, entero, y queda en la papelera', async () => {
        const [uno] = await prisma.classReplacement.findMany({ orderBy: { startTime: 'asc' } });
        const quitar = (t: string) => auth(t)(request(server.server).delete(`/api/class-replacements/${uno.id}`));

        expect([401, 403]).toContain((await quitar(tk.beto)).status);
        expect(await prisma.classReplacement.count()).toBe(2);

        expect((await quitar(tk.admin)).status).toBe(200);
        expect(await prisma.classReplacement.count()).toBe(0);
        expect(await prisma.registroBorrado.count({ where: { tabla: 'classReplacement' } })).toBe(2);
    }, 60000);

    it('REEMP-10: si un evento suspendió la clase y se borra el evento, el reemplazo se va con él', async () => {
        const MARTES = '2026-09-22';
        // Matemática el martes a la misma hora, y un acto que la suspende.
        const csMate = await prisma.classroomSubject.findFirst({ where: { classroomId: seccionA.id, subjectId: mate.id } });
        await prisma.scheduleBlock.create({
            data: { classroomId: seccionA.id, classroomSubjectId: csMate!.id, dayOfWeek: 2, startTime: '07:00', endTime: '07:45', blockType: 'CLASS' },
        });
        const evento = await auth(tk.admin)(request(server.server).post('/api/events')).send({
            title: 'Acto', date: MARTES, startTime: '07:00', endTime: '07:45',
            scope: 'CLASSROOMS', classroomIds: [seccionA.id], academicYearId: yearId,
        });
        expect(evento.status).toBe(201);

        const res = await reemplazar(tk.admin, {
            classroomId: seccionA.id, suspendedSubjectId: mate.id, subjectId: historia.id, date: MARTES,
        });
        expect(res.status).toBe(201);

        const id = evento.body.event?.id ?? evento.body.id;
        expect((await auth(tk.admin)(request(server.server).delete(`/api/events/${id}`))).status).toBe(200);
        expect(await prisma.classReplacement.count({ where: { date: new Date(`${MARTES}T00:00:00Z`) } })).toBe(0);
    }, 60000);
});
