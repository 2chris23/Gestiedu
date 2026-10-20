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
 * AUDITORÍA — RESISTENCIA A FALLOS
 *
 * Lo que pasa cuando las cosas no salen limpias:
 *
 *   - el profesor pulsa dos veces "guardar" (o la red va lenta y vuelve a pulsar);
 *   - dos personas corrigen la misma nota al mismo tiempo;
 *   - un guardado de toda la sección se corta a mitad.
 *
 * Las notas y la asistencia se prueban por la clase en vivo, que es por donde
 * se escriben. «Dos personas corrigen lo mismo a la vez» con notas y
 * asistencia lo vigilan `sin-conexion` (409 CAMBIO_MIENTRAS_TANTO) y
 * `notas-que-no-se-pisan`; las rutas viejas `/api/grades` y `/api/attendance`
 * se quitaron el 20-oct-2026 con sus casos (RES-05/06/07/09/10/11).
 *
 * Ninguno de esos casos puede terminar en datos a medias, en duplicados, ni en
 * un "Error en el servidor" que deje al profesor sin saber si se guardó.
 */

const SLUG = 'test-institute';
const gId = () => {
    // Siempre la 'c' delante: ver la nota de `tests/helpers.ts`.
    return `c${createId()}`;
};

describe('Auditoría — resistencia a fallos', () => {
    let server: FastifyInstance;
    let prisma: PrismaClient;

    let profesor: any;
    let otroProfesor: any;
    const alumnos: any[] = [];
    const tokens: Record<string, string> = {};

    let year: any;
    let period: any;
    let classroom: any;
    let subject: any;
    let tarea: any;
    let tareaB: any;

    const auth = (token: string) => (req: request.Test) =>
        req.set('Authorization', `Bearer ${token}`).set('X-Institute-Slug', SLUG);
    const comoProfesor = (req: request.Test) => auth(tokens.profesor)(req);
    const comoOtroProfesor = (req: request.Test) => auth(tokens.otroProfesor)(req);
    const comoAdmin = (req: request.Test) => auth(tokens.admin)(req);

    beforeAll(async () => {
        server = await createTestServer();
        prisma = await createTestPrismaClient();

        profesor = (await createTestUser(prisma, UserRole.TEACHER)).user;
        otroProfesor = (await createTestUser(prisma, UserRole.TEACHER)).user;
        const admin = (await createTestUser(prisma, UserRole.ADMIN)).user;
        tokens.profesor = generateTestToken(profesor.id, UserRole.TEACHER, 'institute');
        tokens.otroProfesor = generateTestToken(otroProfesor.id, UserRole.TEACHER, 'institute');
        tokens.admin = generateTestToken(admin.id, UserRole.ADMIN, 'institute');

        for (let i = 0; i < 3; i++) {
            alumnos.push((await createTestUser(prisma, UserRole.STUDENT)).user);
        }

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
                name: 'Resistencia A',
                slug: `resist-${Date.now()}`,
                grade: 1,
                section: 'A',
                capacity: 30,
                academicYearId: year.id,
                instituteId: 'institute',
                teacherId: profesor.id,
            },
        });

        subject = await createTestSubject(prisma, 'institute');

        // Una materia en una sección tiene UN profesor: el esquema lo impone
        // (`@@unique([classroomId, subjectId])`). Aquí ponía un comentario que
        // decía que los dos profesores la impartían, y era imposible: solo se
        // creaba la asignación del primero.
        //
        // Daba igual mientras nadie comprobaba de quién es la clase. Desde que
        // se comprueba (ver `puertas-sin-cerradura`), el segundo profesor recibe
        // un 403 con razón, y la prueba de "dos a la vez" necesita dos personas
        // que de verdad puedan tocar esa nota: **el profesor de la materia y el
        // administrador**, que es además el caso real en un liceo.
        await prisma.classroomSubject.create({
            data: { classroomId: classroom.id, subjectId: subject.id, teacherId: profesor.id, weeklyBlocks: 3 },
        });

        for (const est of alumnos) {
            await prisma.studentClassroom.create({
                data: { studentId: est.id, classroomId: classroom.id, academicYearId: year.id, isActive: true },
            });
        }

        tarea = await prisma.classActivity.create({
            data: { classroomId: classroom.id, subjectId: subject.id, title: 'Prueba escrita', target: 'CURRENT', scores: {} },
        });
        tareaB = await prisma.classActivity.create({
            data: { classroomId: classroom.id, subjectId: subject.id, title: 'Exposicion', target: 'CURRENT', scores: {} },
        });
    }, 180000);

    afterAll(async () => {
        await prisma.$disconnect();
        await server.close();
    }, 120000);

    const sin500 = (respuestas: any[]) => {
        for (const r of respuestas) {
            expect(r.status).toBeLessThan(500);
            expect(JSON.stringify(r.body)).not.toMatch(/prisma|P20\d\d|node_modules/i);
        }
    };

    it('RES-01: pulsar dos veces "guardar nota" no deja la nota a medias ni rompe', async () => {
        const nota = { scores: { [alumnos[0].id]: 15 }, maxScore: 20 };

        // Los dos clics salen a la vez, como en un doble clic real
        const respuestas = await Promise.all([
            comoProfesor(request(server.server).post(`/api/sessions/activities/${tarea.id}/grades`)).send(nota),
            comoProfesor(request(server.server).post(`/api/sessions/activities/${tarea.id}/grades`)).send(nota),
        ]);

        sin500(respuestas);

        const enBD = await prisma.classActivity.findUnique({ where: { id: tarea.id } });
        expect(enBD?.scores).toEqual({ [alumnos[0].id]: 15 });
    }, 60000);

    it('RES-02: pulsar dos veces "pasar asistencia" no duplica ni rompe', async () => {
        const pase = {
            classroomId: classroom.id,
            subjectId: subject.id,
            date: '2026-09-11',
            attendances: alumnos.map((a, i) => ({
                studentId: a.id,
                status: i === 0 ? 'ABSENT' : 'PRESENT',
            })),
        };

        const respuestas = await Promise.all([
            comoProfesor(request(server.server).post('/api/sessions/live-save')).send(pase),
            comoProfesor(request(server.server).post('/api/sessions/live-save')).send(pase),
        ]);

        sin500(respuestas);

        const enBD = await prisma.dailyAttendance.findMany({
            where: { classroomId: classroom.id },
        });
        expect(enBD).toHaveLength(alumnos.length);
        expect(enBD.filter((a) => a.status === 'ABSENT')).toHaveLength(1);
    }, 60000);

    it('RES-03: pulsar dos veces "guardar observación" no deja dos observaciones', async () => {
        const observacion = {
            title: 'Llego tarde',
            description: 'Entro 20 minutos despues',
            type: 'OBSERVACION',
            date: '2026-09-11',
            studentIds: [alumnos[1].id],
            classroomId: classroom.id,
            subjectId: subject.id,
        };

        const respuestas = await Promise.all([
            comoProfesor(request(server.server).post('/api/observations')).send(observacion),
            comoProfesor(request(server.server).post('/api/observations')).send(observacion),
        ]);
        sin500(respuestas);

        const enBD = await prisma.observation.findMany({
            where: { studentId: alumnos[1].id, title: 'Llego tarde' },
        });
        expect(enBD).toHaveLength(1);
    }, 60000);

    it('RES-04: si una nota del guardado de la sección es inválida, no se guarda ninguna', async () => {
        const res = await comoProfesor(request(server.server).post(`/api/sessions/activities/${tareaB.id}/grades`)).send({
            scores: { [alumnos[0].id]: 14, [alumnos[1].id]: 25, [alumnos[2].id]: 12 },
            maxScore: 20,
        });
        expect(res.status).toBe(400);
        const enBD = await prisma.classActivity.findUnique({ where: { id: tareaB.id } });
        expect(enBD?.scores ?? {}).toEqual({});
    }, 60000);

    it('RES-08: volver a pulsar "guardar observación" un rato después tampoco duplica', async () => {
        const observacion = {
            title: 'Se le olvido el cuaderno',
            description: 'Segunda vez esta semana',
            type: 'OBSERVACION',
            date: '2026-09-11',
            studentIds: [alumnos[2].id],
            classroomId: classroom.id,
            subjectId: subject.id,
        };

        // Esta vez no se solapan: la primera termina antes de que salga la segunda,
        // que es lo que pasa cuando la persona pulsa, ve que no reacciona y repite.
        const primera = await comoProfesor(request(server.server).post('/api/observations')).send(observacion);
        expect([200, 201]).toContain(primera.status);

        const segunda = await comoProfesor(request(server.server).post('/api/observations')).send(observacion);
        expect(segunda.status).toBeLessThan(500);

        const enBD = await prisma.observation.findMany({
            where: { studentId: alumnos[2].id, title: 'Se le olvido el cuaderno' },
        });
        expect(enBD).toHaveLength(1);
    }, 60000);

    it('RES-12: dos administrativos corrigiendo la misma ficha: el segundo recibe aviso', async () => {
        const ficha = await prisma.user.findUnique({ where: { id: alumnos[1].id } });
        const versionQueVieron = ficha!.updatedAt.toISOString();

        // Aquí la versión va por cabecera: la ficha de usuario valida el cuerpo con
        // un esquema cerrado, así que un campo extra se descartaría. La cabecera
        // sirve en cualquier pantalla sin tocar su validación.
        const primero = await comoAdmin(
            request(server.server)
                .put(`/api/users/${alumnos[1].id}`)
                .set('X-Version-Vista', versionQueVieron)
        ).send({ phone: '0412-1111111' });
        expect([200, 201]).toContain(primero.status);

        const segundo = await comoAdmin(
            request(server.server)
                .put(`/api/users/${alumnos[1].id}`)
                .set('X-Version-Vista', versionQueVieron)
        ).send({ phone: '0424-2222222' });
        expect(segundo.status).toBe(409);

        const final = await prisma.user.findUnique({ where: { id: alumnos[1].id } });
        expect(final!.phone).toBe('0412-1111111');
    }, 60000);

});
