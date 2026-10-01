import { FastifyInstance } from 'fastify';
import request = require('supertest');
import { PrismaClient } from '@prisma/client';
import { createId } from '@paralleldrive/cuid2';
import { UserRole } from '../../src/utils/prisma-enums';
import { reenlazarActividades } from '../../src/services/evaluacion-de-la-semana.service';
import {
    createTestServer,
    createTestPrismaClient,
    cleanTestDatabase,
    createTestUserWithPassword,
    createTestAcademicYear,
    createTestClassroom,
    createTestSubject,
} from '../helpers';

/**
 * LA ACTIVIDAD SALE EN LA CLASE DONDE SE CREA, Y SUMA DONDE DEBE
 *
 * Reportado por Cristian (2026-09-27): «no puedo crear actividades». El
 * servidor las guardaba (201) pero no salían: la clase de ese día aún no tenía
 * sesión (no se había guardado asistencia), la actividad quedaba sin sesión y
 * se fechaba por su `createdAt` en UTC. Vista la clase del 21 el día 27, era
 * «del 27»: ni en «Clase de hoy» ni en «Próxima clase» (ACTDIA-*).
 *
 * Y a qué evaluación del plan suma (SEMEVAL-*): la que cubre su semana, también
 * si está unida a varias semanas; sin evaluación en la semana, no suma.
 *
 * Plan desde el miércoles 19/08: semana 1 = 19/08–30/08, 2 = 31/08, 3 = 07/09,
 * 4 = 14/09, 5 = 21/09.
 */

const SLUG = 'test-institute';
const LUNES_21 = '2026-09-21';
const gId = () => `c${createId()}`;

describe('Actividades de la clase en vivo: su día y su evaluación', () => {
    let server: FastifyInstance;
    let prisma: PrismaClient;
    let classroom: any;
    let subject: any;
    let teacher: { user: any; token: string };
    let alumno: { user: any; token: string };
    let evalSemana5: any;
    let evalSemanas3y4: any;
    let year: any;

    const auth = (token: string) => ({ Authorization: `Bearer ${token}`, 'X-Institute-Slug': SLUG });
    const login = async (email: string, password: string) =>
        (await request(server.server).post('/api/auth/login').set('X-Institute-Slug', SLUG).send({ email, password }).expect(200)).body.tokens
            .accessToken;
    const crear = (body: any) =>
        request(server.server)
            .post('/api/sessions/activities')
            .set(auth(teacher.token))
            .send({ classroomId: classroom.id, subjectId: subject.id, title: 'Ejercicios', ...body });
    const detalle = (date: string) =>
        request(server.server)
            .get('/api/sessions/live-detail')
            .query({ classroomId: classroom.id, subjectId: subject.id, date })
            .set(auth(teacher.token))
            .expect(200);

    beforeAll(async () => {
        server = await createTestServer();
        prisma = await createTestPrismaClient();
    });
    afterAll(async () => {
        await prisma.$disconnect();
        await server.close();
    });

    beforeEach(async () => {
        await cleanTestDatabase(prisma);
        await prisma.institute.upsert({
            where: { id: 'institute' },
            update: {},
            create: { id: 'institute', code: 'TEST_INST', slug: SLUG, name: 'Test Institute', email: 'test@institute.com' },
        });
        year = await createTestAcademicYear(prisma, 'institute');
        await prisma.period.create({
            data: { id: gId(), name: 'Primer Lapso', startDate: new Date('2026-08-19'), endDate: new Date('2026-12-31'), isActive: true, academicYearId: year.id },
        });
        classroom = await createTestClassroom(prisma, year.id, 'institute');
        subject = await createTestSubject(prisma, 'institute');
        await prisma.evaluationPlanMetadata.create({
            data: { classroomId: classroom.id, subjectId: subject.id, lapso: '1', totalSemanas: 15, fechaDesde: new Date('2026-08-19'), fechaHasta: new Date('2026-12-31') },
        });
        const fila = (weekNumber: number, datos: any) =>
            prisma.evaluationPlanRow.create({
                data: { classroomId: classroom.id, subjectId: subject.id, lapso: '1', rowType: 'EVALUATION', weekNumber, orderIndex: weekNumber, ...datos },
            });
        // Semanas 3 y 4: una evaluación unida dos semanas (su actividad y sus puntos).
        evalSemanas3y4 = await fila(3, { actividadEval: 'Infografía', puntos: 5, extraData: JSON.stringify({ __uniones: { actividadEval: 2, puntos: 2, title: 6 } }) });
        await fila(4, { puntos: 0 });
        evalSemana5 = await fila(5, { actividadEval: 'Examen práctico', puntos: 5 });

        const t = await createTestUserWithPassword(prisma, UserRole.TEACHER, 'TeacherPass123!');
        await prisma.classroomSubject.create({ data: { classroomId: classroom.id, subjectId: subject.id, teacherId: t.user.id } });
        teacher = { user: t.user, token: await login(t.user.email, 'TeacherPass123!') };
        const s = await createTestUserWithPassword(prisma, UserRole.STUDENT, 'StudentPass123!');
        await prisma.studentClassroom.create({ data: { studentId: s.user.id, classroomId: classroom.id, academicYearId: year.id, isActive: true } });
        alumno = { user: s.user, token: await login(s.user.email, 'StudentPass123!') };
    });

    it('ACTDIA-01: creada en un día pasado sin sesión, sale en la clase de ese día', async () => {
        expect((await detalle(LUNES_21)).body.session).toBeNull();
        const r = await crear({ target: 'CURRENT', date: LUNES_21 }).expect(201);
        expect(r.body.dondeSale).toBe('HOY');
        expect(r.body.activity.classSessionId).toBeTruthy();

        const d = (await detalle(LUNES_21)).body;
        const a = d.activities.find((x: any) => x.id === r.body.activity.id);
        expect(a).toMatchObject({ dueToday: true, belongsToSession: true });
        expect(d.session?.id).toBe(r.body.activity.classSessionId);
        // Y no en la clase del martes.
        const martes = (await detalle('2026-09-22')).body.activities.find((x: any) => x.id === r.body.activity.id);
        expect(martes).toMatchObject({ dueToday: false, isFuture: false });
    });

    it('ACTDIA-02: «para la próxima clase» también nace en su clase y cuenta en «Próx.»', async () => {
        const r = await crear({ target: 'NEXT', date: LUNES_21, dueDate: '2026-09-25' }).expect(201);
        expect(r.body.dondeSale).toBe('PROXIMA');
        const a = (await detalle(LUNES_21)).body.activities.find((x: any) => x.id === r.body.activity.id);
        expect(a.isFuture).toBe(true);
        const vista = await request(server.server)
            .get('/api/sessions/live-overview')
            .query({ classroomId: classroom.id, date: LUNES_21 })
            .set(auth(teacher.token))
            .expect(200);
        expect(vista.body.overview[subject.id].nextActivitiesCount).toBe(1);
    });

    it('ACTDIA-03: una vieja sin sesión creada a las 20:30 de Caracas es de ESE día, no del siguiente', async () => {
        const vieja = await prisma.classActivity.create({
            data: {
                classroomId: classroom.id,
                subjectId: subject.id,
                title: 'Vieja',
                target: 'CURRENT',
                scores: {},
                createdAt: new Date('2026-09-22T00:30:00.000Z'), // 21/09 20:30 en Caracas
            },
        });
        const del21 = (await detalle(LUNES_21)).body.activities.find((x: any) => x.id === vieja.id);
        expect(del21.dueToday).toBe(true);
        const del22 = (await detalle('2026-09-22')).body.activities.find((x: any) => x.id === vieja.id);
        expect(del22.dueToday).toBe(false);
    });

    it('ACTDIA-04: en un día que no ha llegado no se crea (400 FUTURE_DATE)', async () => {
        const r = await crear({ target: 'CURRENT', date: '2099-01-05' }).expect(400);
        expect(r.body.code).toBe('FUTURE_DATE');
        expect(await prisma.classActivity.count()).toBe(0);
    });

    it('ACTDIA-05: la sesión de otra materia no vale (400 SESION_AJENA)', async () => {
        const otra = await createTestSubject(prisma, 'institute');
        const ajena = await prisma.classSession.create({
            data: { publicId: gId(), classroomId: classroom.id, subjectId: otra.id, date: new Date(`${LUNES_21}T00:00:00.000Z`) },
        });
        const r = await crear({ target: 'CURRENT', classSessionId: ajena.id }).expect(400);
        expect(r.body.code).toBe('SESION_AJENA');
    });

    it('ACTDIA-06: sale en el horario del alumno ese día', async () => {
        await crear({ target: 'CURRENT', date: LUNES_21 }).expect(201);
        const vista = await request(server.server)
            .get('/api/sessions/live-overview')
            .query({ classroomId: classroom.id, date: LUNES_21 })
            .set(auth(alumno.token))
            .expect(200);
        expect(vista.body.overview[subject.id].todayActivitiesCount).toBe(1);
    });

    it('SEMEVAL-01: suma a la evaluación de su semana', async () => {
        const r = await crear({ target: 'CURRENT', date: LUNES_21 }).expect(201);
        expect(r.body.activity.planRowId).toBe(evalSemana5.id);
        expect(r.body.sumaALaNota).toBe(true);
        const d = (await detalle(LUNES_21)).body;
        expect(d.evaluacionesDeLaSemana.map((e: any) => e.id)).toEqual([evalSemana5.id]);
    });

    it('SEMEVAL-02: una evaluación unida a dos semanas recoge las de la segunda', async () => {
        // Semana 4 (14/09): su fila propia está vacía (0 puntos); cuenta la de la semana 3.
        const vacia = await prisma.evaluationPlanRow.findFirst({ where: { weekNumber: 4 } });
        const r = await crear({ target: 'CURRENT', date: '2026-09-15', planRowId: vacia!.id }).expect(201);
        expect(r.body.activity.planRowId).toBe(evalSemanas3y4.id);
    });

    it('SEMEVAL-03: en una semana sin evaluación se guarda pero no suma, y se dice', async () => {
        const r = await crear({ target: 'CURRENT', date: '2026-09-01' }).expect(201);
        expect(r.body.activity.planRowId).toBeNull();
        expect(r.body.sumaALaNota).toBe(false);
        const d = (await detalle('2026-09-01')).body;
        expect(d.evaluacionesDeLaSemana).toEqual([]);
        expect(d.planConPuntos).toBe(true);
    });

    it('SEMEVAL-04: con dos evaluaciones en la semana hay que elegir (400 ELIGE_LA_EVALUACION)', async () => {
        const segunda = await prisma.evaluationPlanRow.create({
            data: { classroomId: classroom.id, subjectId: subject.id, lapso: '1', rowType: 'EVALUATION', weekNumber: 5, orderIndex: 50, actividadEval: 'Taller', puntos: 5 },
        });
        const sinElegir = await crear({ target: 'CURRENT', date: LUNES_21 }).expect(400);
        expect(sinElegir.body.code).toBe('ELIGE_LA_EVALUACION');
        const elegida = await crear({ target: 'CURRENT', date: LUNES_21, planRowId: segunda.id }).expect(201);
        expect(elegida.body.activity.planRowId).toBe(segunda.id);
    });

    const calificada = (planRowId: string, extra: any = {}) =>
        prisma.classActivity.create({
            data: { classroomId: classroom.id, subjectId: subject.id, title: 'Con nota', target: 'CURRENT', planRowId, scores: { x: 18 }, ...extra },
        });

    it('SEMEVAL-05: guardar el plan dejando sin puntos una evaluación con notas → 409, y no cambia nada', async () => {
        await calificada(evalSemana5.id);
        const r = await request(server.server)
            .post('/api/evaluation-plan/rows/batch')
            .set(auth(teacher.token))
            .send({
                classroomId: classroom.id,
                subjectId: subject.id,
                lapso: '1',
                rows: [
                    { id: evalSemanas3y4.id, weekNumber: 3, rowType: 'EVALUATION', actividadEval: 'Infografía', puntos: 5, extraData: evalSemanas3y4.extraData },
                    { weekNumber: 4, rowType: 'EVALUATION', puntos: 0 },
                    { id: evalSemana5.id, weekNumber: 5, rowType: 'EVALUATION', actividadEval: 'Examen práctico', puntos: 0 },
                    { weekNumber: 6, rowType: 'EVALUATION', actividadEval: 'Otra', puntos: 15 },
                ],
            })
            .expect(409);
        expect(r.body.code).toBe('EVALUACION_CON_NOTAS');
        expect(r.body.error).toContain('Examen práctico');
        expect((await prisma.evaluationPlanRow.findUnique({ where: { id: evalSemana5.id } }))!.puntos).toBe(5);
    });

    it('SEMEVAL-06: copiar el plan encima no deja sin evaluación las notas del destino', async () => {
        const destino = await prisma.classroom.create({
            data: { id: gId(), name: '1er Grado B', slug: `aula-${gId()}`, grade: 1, section: 'B', capacity: 30, academicYearId: year.id, instituteId: 'institute' },
        });
        await prisma.classroomSubject.create({ data: { classroomId: destino.id, subjectId: subject.id, teacherId: teacher.user.id } });
        const suya = await prisma.evaluationPlanRow.create({
            data: { classroomId: destino.id, subjectId: subject.id, lapso: '1', rowType: 'EVALUATION', weekNumber: 5, orderIndex: 5, actividadEval: 'Suya', puntos: 20 },
        });
        const act = await prisma.classActivity.create({
            data: { classroomId: destino.id, subjectId: subject.id, title: 'Con nota', target: 'CURRENT', planRowId: suya.id, scores: { x: 18 } },
        });
        await request(server.server)
            .post('/api/evaluation-plan/copy')
            .set(auth(teacher.token))
            .send({ sourceClassroomId: classroom.id, sourceSubjectId: subject.id, sourceLapso: '1', targetClassroomIds: [destino.id] })
            .expect(200);
        const despues = await prisma.classActivity.findUnique({ where: { id: act.id }, include: { planRow: true } });
        expect(despues!.planRow).toMatchObject({ classroomId: destino.id, weekNumber: 5, actividadEval: 'Examen práctico' });
    });

    it('SEMEVAL-07: re-enganchar las que quedaron en la fila vacía de una semana unida', async () => {
        const vacia = await prisma.evaluationPlanRow.findFirst({ where: { weekNumber: 4 } });
        const suelta = await calificada(vacia!.id, { createdAt: new Date('2026-09-15T15:00:00.000Z') });
        const enSeco = await reenlazarActividades(prisma, 'America/Caracas', false);
        expect(enSeco.map((c) => c.id)).toEqual([suelta.id]);
        expect((await prisma.classActivity.findUnique({ where: { id: suelta.id } }))!.planRowId).toBe(vacia!.id);
        await reenlazarActividades(prisma, 'America/Caracas', true);
        expect((await prisma.classActivity.findUnique({ where: { id: suelta.id } }))!.planRowId).toBe(evalSemanas3y4.id);
    });
});
