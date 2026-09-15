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
    let actividad: any;
    let actividadB: any;

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

        const nuevaActividad = (titulo: string) =>
            prisma.activity.create({
                data: {
                    title: titulo,
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

        actividad = await nuevaActividad('Prueba escrita');
        actividadB = await nuevaActividad('Exposicion');
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

    it('RES-01: pulsar dos veces "guardar nota" no crea dos notas', async () => {
        const nota = {
            score: 15,
            studentId: alumnos[0].id,
            activityId: actividad.id,
            periodId: period.id,
            subjectId: subject.id,
        };

        // Los dos clics salen a la vez, como en un doble clic real
        const respuestas = await Promise.all([
            comoProfesor(request(server.server).post('/api/grades')).send(nota),
            comoProfesor(request(server.server).post('/api/grades')).send(nota),
        ]);

        sin500(respuestas);

        const enBD = await prisma.grade.findMany({
            where: { studentId: alumnos[0].id, activityId: actividad.id },
        });
        expect(enBD).toHaveLength(1);
        expect(enBD[0].score).toBe(15);
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
            comoProfesor(request(server.server).post('/api/attendance/bulk')).send(pase),
            comoProfesor(request(server.server).post('/api/attendance/bulk')).send(pase),
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

    it('RES-04: si una nota del guardado masivo es inválida, no se guarda ninguna', async () => {
        const res = await comoProfesor(request(server.server).post('/api/grades/bulk')).send({
            grades: [
                { score: 18, studentId: alumnos[0].id, activityId: actividadB.id, periodId: period.id, subjectId: subject.id },
                { score: 99, studentId: alumnos[1].id, activityId: actividadB.id, periodId: period.id, subjectId: subject.id },
                { score: 12, studentId: alumnos[2].id, activityId: actividadB.id, periodId: period.id, subjectId: subject.id },
            ],
        });

        // Se rechaza entero y se dice qué fila está mal
        expect(res.status).toBe(400);

        // Y no queda ni una nota a medias
        const enBD = await prisma.grade.findMany({ where: { activityId: actividadB.id } });
        expect(enBD).toHaveLength(0);
    }, 60000);

    it('RES-05: el guardado masivo válido entra completo', async () => {
        const res = await comoProfesor(request(server.server).post('/api/grades/bulk')).send({
            grades: alumnos.map((a, i) => ({
                score: 10 + i,
                studentId: a.id,
                activityId: actividadB.id,
                periodId: period.id,
                subjectId: subject.id,
            })),
        });

        expect([200, 201]).toContain(res.status);
        const enBD = await prisma.grade.findMany({ where: { activityId: actividadB.id } });
        expect(enBD).toHaveLength(alumnos.length);
    }, 60000);

    it('RES-06: si dos personas corrigen la misma nota a la vez, la segunda recibe aviso', async () => {
        const nota = await prisma.grade.findFirst({
            where: { studentId: alumnos[0].id, activityId: actividad.id },
        });
        expect(nota).not.toBeNull();

        // Los dos abrieron la pantalla viendo la misma versión de la nota
        const versionQueVieron = nota!.updatedAt.toISOString();

        const primero = await comoProfesor(request(server.server).put(`/api/grades/${nota!.id}`)).send({
            score: 18,
            expectedUpdatedAt: versionQueVieron,
        });
        expect([200, 201]).toContain(primero.status);

        // La segunda guarda encima sin saber que ya cambió. Es el administrador:
        // el otro profesor no imparte esa materia y el sistema —con razón— ya no
        // le deja tocarla.
        const segundo = await comoAdmin(request(server.server).put(`/api/grades/${nota!.id}`)).send({
            score: 9,
            expectedUpdatedAt: versionQueVieron,
        });

        expect(segundo.status).toBe(409);
        expect(JSON.stringify(segundo.body)).toMatch(/modific|cambi|actualiz/i);

        // La nota conserva el primer cambio, no el pisotón
        const final = await prisma.grade.findUnique({ where: { id: nota!.id } });
        expect(final!.score).toBe(18);
    }, 60000);

    it('RES-10: si una nota del lote se cae por otro motivo, no queda media sección cargada', async () => {
        // Un alumno que no está en la sección: la fila del medio no se puede poner.
        const ajeno = (await createTestUser(prisma, UserRole.STUDENT)).user;
        const actividadC = await prisma.activity.create({
            data: {
                title: 'Taller',
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

        const res = await comoProfesor(request(server.server).post('/api/grades/bulk')).send({
            grades: [
                { score: 16, studentId: alumnos[0].id, activityId: actividadC.id, periodId: period.id, subjectId: subject.id },
                { score: 14, studentId: ajeno.id, activityId: actividadC.id, periodId: period.id, subjectId: subject.id },
                { score: 11, studentId: alumnos[2].id, activityId: actividadC.id, periodId: period.id, subjectId: subject.id },
            ],
        });

        expect(res.status).toBeGreaterThanOrEqual(400);
        expect(res.status).toBeLessThan(500);
        // Y dice qué fila estorba: la segunda
        expect(res.body.fila).toBe(1);

        // No quedó ninguna puesta, ni siquiera la primera
        const enBD = await prisma.grade.findMany({ where: { activityId: actividadC.id } });
        expect(enBD).toHaveLength(0);
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

    it('RES-09: intentar a propósito algo que ya existe sigue avisando', async () => {
        // El freno de los dobles clics no puede tapar un "ya existe": un botón
        // que dice "listo" sin haber hecho nada es peor que un aviso claro.
        const nota = {
            score: 14,
            studentId: alumnos[0].id,
            activityId: actividad.id,
            periodId: period.id,
            subjectId: subject.id,
        };

        const res = await comoProfesor(request(server.server).post('/api/grades')).send(nota);
        expect([400, 409]).toContain(res.status);
    }, 60000);

    it('RES-11: dos personas corrigiendo la misma asistencia: la segunda recibe aviso', async () => {
        const registro = await prisma.dailyAttendance.findFirst({
            where: { classroomId: classroom.id },
        });
        expect(registro).not.toBeNull();

        const versionQueVieron = registro!.updatedAt.toISOString();

        const primero = await comoProfesor(request(server.server).put(`/api/attendance/${registro!.id}`)).send({
            status: 'EXCUSED',
            expectedUpdatedAt: versionQueVieron,
        });
        expect([200, 201]).toContain(primero.status);

        const segundo = await comoProfesor(request(server.server).put(`/api/attendance/${registro!.id}`)).send({
            status: 'ABSENT',
            expectedUpdatedAt: versionQueVieron,
        });
        expect(segundo.status).toBe(409);

        // Se conserva el primer cambio, no el pisotón
        const final = await prisma.dailyAttendance.findUnique({ where: { id: registro!.id } });
        expect(final!.status).toBe('EXCUSED');
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

    it('RES-07: quien no envía versión sigue pudiendo corregir', async () => {
        const nota = await prisma.grade.findFirst({
            where: { studentId: alumnos[0].id, activityId: actividad.id },
        });

        const res = await comoProfesor(request(server.server).put(`/api/grades/${nota!.id}`)).send({ score: 17 });
        expect([200, 201]).toContain(res.status);

        const final = await prisma.grade.findUnique({ where: { id: nota!.id } });
        expect(final!.score).toBe(17);
    }, 60000);
});
