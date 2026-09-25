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
 * LAS NOTAS DE LA CLASE EN VIVO NO SE PISAN
 *
 * Las notas de una actividad de clase viven todas juntas en una sola columna
 * (`class_activities.scores`, un mapa alumno → nota). Guardarlas era: leer el
 * mapa, mezclarle lo nuevo en el servidor y escribir el mapa ENTERO.
 *
 * Eso pierde notas en cuanto dos guardados se cruzan, y se cruzan solos: el
 * guardado automático de la clase en vivo manda una tanda mientras la anterior
 * sigue en camino, o el profesor tiene la clase abierta en el teléfono y en el
 * portátil. Los dos leen el mismo mapa, cada uno le añade SU alumno, y el que
 * escribe el último borra al alumno del otro. Sin error, sin aviso: la nota
 * que el profesor vio guardada ya no está.
 *
 * Ahora la mezcla la hace PostgreSQL en una sola escritura (`scores || nuevo`),
 * así que da igual cuántos guardados se crucen: cada uno añade lo suyo.
 */

const SLUG = 'test-institute';
const gId = () => `c${createId()}`;

describe('Las notas de la clase en vivo no se pisan', () => {
    let server: FastifyInstance;
    let prisma: PrismaClient;

    let profesor: any;
    let token: string;
    let classroom: any;
    let subject: any;
    const alumnos: any[] = [];

    const comoProfesor = (req: request.Test) =>
        req.set('Authorization', `Bearer ${token}`).set('X-Institute-Slug', SLUG);

    async function nuevaActividad(titulo: string) {
        const res = await comoProfesor(request(server.server).post('/api/sessions/activities')).send({
            classroomId: classroom.id,
            subjectId: subject.id,
            title: titulo,
            target: 'CURRENT',
            maxScore: 20,
        });
        expect([200, 201]).toContain(res.status);
        return res.body?.activity?.id ?? res.body?.data?.id ?? res.body?.id;
    }

    async function notasEnLaBase(actividadId: string): Promise<Record<string, number | null>> {
        const fila = await prisma.classActivity.findUnique({ where: { id: actividadId } });
        return ((fila as any)?.scores ?? {}) as Record<string, number | null>;
    }

    beforeAll(async () => {
        server = await createTestServer();
        prisma = await createTestPrismaClient();

        profesor = (await createTestUser(prisma, UserRole.TEACHER)).user;
        token = generateTestToken(profesor.id, UserRole.TEACHER, 'institute');

        const year = await createTestAcademicYear(prisma, 'institute');
        classroom = await prisma.classroom.create({
            data: {
                id: gId(),
                name: 'Notas cruzadas',
                slug: `cruzadas-${Date.now()}`,
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

        for (let i = 0; i < 8; i++) {
            const est = (await createTestUser(prisma, UserRole.STUDENT)).user;
            await prisma.studentClassroom.create({
                data: { studentId: est.id, classroomId: classroom.id, academicYearId: year.id, isActive: true },
            });
            alumnos.push(est);
        }
    }, 180000);

    afterAll(async () => {
        await prisma.$disconnect();
        await server.close();
    }, 120000);

    it('NOPISA-01: ocho guardados a la vez, cada uno con su alumno, dejan las ocho notas', async () => {
        const actividadId = await nuevaActividad('Dictado');

        // Todos a la vez: como el guardado automático con la conexión lenta.
        const respuestas = await Promise.all(
            alumnos.map((est, i) =>
                comoProfesor(request(server.server).post(`/api/sessions/activities/${actividadId}/grades`)).send({
                    scores: { [est.id]: 10 + i },
                })
            )
        );
        for (const r of respuestas) expect([200, 201]).toContain(r.status);

        const notas = await notasEnLaBase(actividadId);
        const faltan = alumnos.filter((est) => notas[est.id] === undefined).map((est) => est.id);
        expect(faltan).toEqual([]);
        alumnos.forEach((est, i) => expect(notas[est.id]).toBe(10 + i));
    }, 60000);

    it('NOPISA-02: corregir una nota no toca las de los demás, y quitarla la deja vacía', async () => {
        const actividadId = await nuevaActividad('Exposición');
        const [a, b, c] = alumnos;

        await comoProfesor(request(server.server).post(`/api/sessions/activities/${actividadId}/grades`)).send({
            scores: { [a.id]: 15, [b.id]: 12, [c.id]: 9 },
        });
        await comoProfesor(request(server.server).post(`/api/sessions/activities/${actividadId}/grades`)).send({
            scores: { [b.id]: 14 },
        });
        await comoProfesor(request(server.server).post(`/api/sessions/activities/${actividadId}/grades`)).send({
            scores: { [c.id]: null },
        });

        const notas = await notasEnLaBase(actividadId);
        expect(notas[a.id]).toBe(15);
        expect(notas[b.id]).toBe(14);
        expect(notas[c.id]).toBeNull();
    }, 60000);

    it('NOPISA-03: editar la actividad mandando notas de un alumno no borra las del resto', async () => {
        const actividadId = await nuevaActividad('Taller');
        const [a, b] = alumnos;

        await comoProfesor(request(server.server).post(`/api/sessions/activities/${actividadId}/grades`)).send({
            scores: { [a.id]: 17, [b.id]: 13 },
        });

        // La otra puerta que escribe notas: la de corregir la actividad.
        const res = await comoProfesor(request(server.server).put(`/api/sessions/activities/${actividadId}`)).send({
            title: 'Taller corregido',
            scores: { [b.id]: 16 },
        });
        expect([200, 201]).toContain(res.status);

        const notas = await notasEnLaBase(actividadId);
        expect(notas[a.id]).toBe(17);
        expect(notas[b.id]).toBe(16);
    }, 60000);

    it('NOPISA-04: una nota fuera de 0–20 o que no es número no se guarda', async () => {
        const actividadId = await nuevaActividad('Quiz');
        const [a] = alumnos;

        for (const mala of [25, -3, 'diez']) {
            const res = await comoProfesor(
                request(server.server).post(`/api/sessions/activities/${actividadId}/grades`)
            ).send({ scores: { [a.id]: mala } });
            expect(res.status).toBe(400);
        }

        const notas = await notasEnLaBase(actividadId);
        expect(notas[a.id]).toBeUndefined();
    }, 60000);
});
