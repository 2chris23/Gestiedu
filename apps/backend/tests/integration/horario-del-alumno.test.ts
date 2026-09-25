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
    createTestClassroom,
    createTestSubject,
    generateTestToken,
} from '../helpers';

/**
 * EL HORARIO DEL ALUMNO, CON CONTENIDO Y SIN MENTIRAS
 *
 * Dos cosas que el liceo vio y no cuadraban:
 *
 *  1. El horario del alumno salía vacío —«—» en el tema y «Hoy: 0 · Próx: 0»—
 *     porque el resumen de la sección solo lo podía pedir un profesor. El
 *     alumno no podía ver SU propio horario con contenido.
 *
 *  2. El contador «Próx.» anunciaba actividades para la próxima clase que al
 *     entrar no existían: sumaba TODA actividad pendiente de la materia. Lo que
 *     tiene que decir es otra cosa: *en esta clase se dejó algo para otro día*.
 *
 * Y de paso: leer el detalle de una clase tampoco comprobaba que la clase fuera
 * del profesor que preguntaba.
 */

const SLUG = 'test-institute';
const LUNES = '2026-09-14';
const MARTES = '2026-09-15';

describe('Horario en vivo del alumno', () => {
    let server: FastifyInstance;
    let prisma: PrismaClient;

    let year: any;
    let seccion: any;
    let otraSeccion: any;
    let materia: any;
    let profe: any;
    let profeAjeno: any;
    let ana: any;
    let luis: any; // alumno de la otra sección
    let madre: any;
    let otroTutor: any;
    let sesionLunes: any;

    const tk: Record<string, string> = {};

    const cab = (token: string) => ({ Authorization: `Bearer ${token}`, 'X-Institute-Slug': SLUG });

    const resumen = (token: string, classroomId: string, date: string) =>
        request(server.server).get('/api/sessions/live-overview').query({ classroomId, date }).set(cab(token));

    beforeAll(async () => {
        server = await createTestServer();
        prisma = await createTestPrismaClient();

        year = await createTestAcademicYear(prisma, 'institute');
        seccion = await createTestClassroom(prisma, year.id, 'institute');
        otraSeccion = await prisma.classroom.create({
            data: {
                id: `c${createId()}`,
                name: '1er Grado B',
                slug: `aula-b-${createId()}`,
                grade: 1,
                section: 'B',
                shift: 'TARDE',
                capacity: 30,
                academicYearId: year.id,
                instituteId: 'institute',
            },
        });
        materia = await createTestSubject(prisma, 'institute');

        const admin = (await createTestUser(prisma, UserRole.ADMIN)).user;
        tk.admin = generateTestToken(admin.id, UserRole.ADMIN, 'institute');
        profe = (await createTestUser(prisma, UserRole.TEACHER)).user;
        profeAjeno = (await createTestUser(prisma, UserRole.TEACHER)).user;
        ana = (await createTestUser(prisma, UserRole.STUDENT)).user;
        luis = (await createTestUser(prisma, UserRole.STUDENT)).user;
        madre = (await createTestUser(prisma, UserRole.TUTOR)).user;
        otroTutor = (await createTestUser(prisma, UserRole.TUTOR)).user;

        await prisma.classroomSubject.create({
            data: { classroomId: seccion.id, subjectId: materia.id, teacherId: profe.id },
        });
        await prisma.studentClassroom.create({
            data: { studentId: ana.id, classroomId: seccion.id, academicYearId: year.id, isActive: true },
        });
        await prisma.studentClassroom.create({
            data: { studentId: luis.id, classroomId: otraSeccion.id, academicYearId: year.id, isActive: true },
        });
        await prisma.studentTutor.create({
            data: { studentId: ana.id, tutorId: madre.id, relationship: 'Madre' },
        });

        // Plan de evaluación: tema generador de la semana
        await prisma.evaluationPlanMetadata.create({
            data: {
                classroomId: seccion.id,
                subjectId: materia.id,
                lapso: '1',
                totalSemanas: 12,
                fechaDesde: new Date('2026-09-14'),
                fechaHasta: new Date('2026-12-15'),
            },
        });
        await prisma.evaluationPlanRow.create({
            data: {
                classroomId: seccion.id,
                subjectId: materia.id,
                lapso: '1',
                weekNumber: 1,
                orderIndex: 0,
                rowType: 'HEADER',
                title: 'Hidrografía nacional',
            },
        });

        sesionLunes = await prisma.classSession.create({
            data: {
                classroomId: seccion.id,
                subjectId: materia.id,
                date: new Date('2026-09-14T00:00:00.000Z'),
                startTime: '07:00',
                endTime: '07:45',
            },
        });

        tk.profe = generateTestToken(profe.id, UserRole.TEACHER, 'institute');
        tk.profeAjeno = generateTestToken(profeAjeno.id, UserRole.TEACHER, 'institute');
        tk.ana = generateTestToken(ana.id, UserRole.STUDENT, 'institute');
        tk.luis = generateTestToken(luis.id, UserRole.STUDENT, 'institute');
        tk.madre = generateTestToken(madre.id, UserRole.TUTOR, 'institute');
        tk.otroTutor = generateTestToken(otroTutor.id, UserRole.TUTOR, 'institute');
    }, 90000);

    afterAll(async () => {
        await prisma?.$disconnect();
        await server?.close();
    });

    it('HORAV-01: el alumno ve el tema de la semana de SU sección', async () => {
        const res = await resumen(tk.ana, seccion.id, LUNES);
        expect(res.status).toBe(200);
        expect(res.body.overview[materia.id].temaGenerador).toBe('Hidrografía nacional');
        expect(res.body.shift).toBe('MANANA');
    }, 60000);

    it('HORAV-02: un alumno de otra sección no ve nada de esta', async () => {
        const res = await resumen(tk.luis, seccion.id, LUNES);
        expect(res.status).toBe(403);
    }, 60000);

    it('HORAV-03: el representante ve la sección de su representada; otro representante no', async () => {
        expect((await resumen(tk.madre, seccion.id, LUNES)).status).toBe(200);
        expect((await resumen(tk.otroTutor, seccion.id, LUNES)).status).toBe(403);
    }, 60000);

    it('HORAV-04: un profesor que no da clase ahí no ve el resumen ni el detalle', async () => {
        expect((await resumen(tk.profeAjeno, seccion.id, LUNES)).status).toBe(403);

        const detalle = await request(server.server)
            .get('/api/sessions/live-detail')
            .query({ classroomId: seccion.id, subjectId: materia.id, date: LUNES })
            .set(cab(tk.profeAjeno));
        expect(detalle.status).toBe(403);
    }, 60000);

    it('HORAV-05: «Próx.» solo cuenta lo que se dejó EN esa clase para otro día', async () => {
        // Puesta en la clase del lunes, para más adelante → «Próx.» del lunes.
        await prisma.classActivity.create({
            data: {
                classroomId: seccion.id,
                subjectId: materia.id,
                title: 'Tarea para el miércoles',
                type: 'TAREA',
                target: 'NEXT',
                classSessionId: sesionLunes.id,
                dueDate: new Date(2026, 8, 16, 12, 0, 0),
                maxScore: 20,
                scores: {},
            },
        });
        // Pendiente vieja, sin sesión y sin fecha: NO es de ninguna clase.
        await prisma.classActivity.create({
            data: {
                classroomId: seccion.id,
                subjectId: materia.id,
                title: 'Pendiente suelta de la materia',
                type: 'TAREA',
                target: 'NEXT',
                maxScore: 20,
                scores: {},
            },
        });

        const lunes = await resumen(tk.profe, seccion.id, LUNES);
        expect(lunes.status).toBe(200);
        expect(lunes.body.overview[materia.id].nextActivitiesCount).toBe(1);
        expect(lunes.body.overview[materia.id].todayActivitiesCount).toBe(0);

        // El martes no hubo clase de esa materia: el contador no hereda nada.
        const martes = await resumen(tk.profe, seccion.id, MARTES);
        expect(martes.body.overview[materia.id].nextActivitiesCount).toBe(0);
        expect(martes.body.overview[materia.id].todayActivitiesCount).toBe(0);
    }, 60000);

    it('HORAV-06: lo que vence ese día cuenta en «Hoy», no en «Próx.»', async () => {
        const miercoles = '2026-09-16';
        const res = await resumen(tk.profe, seccion.id, miercoles);
        expect(res.status).toBe(200);
        expect(res.body.overview[materia.id].todayActivitiesCount).toBe(1);
        expect(res.body.overview[materia.id].nextActivitiesCount).toBe(0);
        expect(res.body.overview[materia.id].actividades[0].title).toBe('Tarea para el miércoles');
    }, 60000);

    it('HORAV-07: al alumno le llega SU nota y ninguna otra', async () => {
        // Por la API, como en el liceo: así se comprueba de paso que al crear la
        // actividad se tira la copia guardada del horario de esos alumnos (si no,
        // el alumno seguiría viendo el bloque vacío hasta cinco minutos después).
        const creada = await request(server.server)
            .post('/api/sessions/activities')
            .set(cab(tk.profe))
            .send({
                classroomId: seccion.id,
                subjectId: materia.id,
                title: 'Quiz del lunes',
                type: 'EVALUACION',
                target: 'CURRENT',
                classSessionId: sesionLunes.id,
                maxScore: 20,
            });
        expect(creada.status).toBe(201);

        await request(server.server)
            .post(`/api/sessions/activities/${creada.body.activity.id}/grades`)
            .set(cab(tk.profe))
            .send({ scores: { [ana.id]: 18, [luis.id]: 5 }, maxScore: 20 })
            .expect(200);

        const res = await resumen(tk.ana, seccion.id, LUNES);
        const quiz = res.body.overview[materia.id].actividades.find((a: any) => a.title === 'Quiz del lunes');
        expect(quiz.miNota).toBe(18);
        expect(JSON.stringify(res.body)).not.toContain(luis.id);
    }, 60000);

    /**
     * LO QUE LE FALTA AL ALUMNO
     *
     * Las fechas van muy lejos a propósito (2020 y 2099): así la prueba dice lo
     * mismo el día que se corra, sin depender del reloj de quien la corre.
     */
    describe('Actividades del alumno', () => {
        const actividadesDe = (token: string, studentId: string) =>
            request(server.server).get(`/api/students/${studentId}/actividades`).set(cab(token));

        beforeAll(async () => {
            await prisma.classActivity.create({
                data: {
                    classroomId: seccion.id,
                    subjectId: materia.id,
                    title: 'Maqueta del sistema solar',
                    type: 'TAREA',
                    target: 'NEXT',
                    dueDate: new Date(2020, 0, 15, 12, 0, 0),
                    maxScore: 20,
                    scores: {},
                },
            });
            await prisma.classActivity.create({
                data: {
                    classroomId: seccion.id,
                    subjectId: materia.id,
                    title: 'Exposición final',
                    type: 'EVALUACION',
                    target: 'NEXT',
                    dueDate: new Date(2099, 0, 15, 12, 0, 0),
                    maxScore: 20,
                    scores: {},
                },
            });
        });

        it('ACT-01: dice cuáles le faltan, cuáles se le pasaron y cuáles ya tienen nota', async () => {
            const res = await actividadesDe(tk.ana, ana.id);
            expect(res.status).toBe(200);

            const porTitulo = (t: string) => res.body.actividades.find((a: any) => a.title === t);
            expect(porTitulo('Maqueta del sistema solar').estado).toBe('VENCIDA');
            expect(porTitulo('Exposición final').estado).toBe('PENDIENTE');
            expect(porTitulo('Quiz del lunes').estado).toBe('EVALUADA');
            expect(porTitulo('Quiz del lunes').nota).toBe(18);
            expect(res.body.resumen.vencidas).toBeGreaterThanOrEqual(1);
            expect(res.body.resumen.evaluadas).toBeGreaterThanOrEqual(1);
        }, 60000);

        it('ACT-02: cada quien recibe lo de SU sección (y el profesor, solo a los suyos)', async () => {
            // Luis está en otra sección: el quiz de Ana no es suyo.
            const deLuis = await actividadesDe(tk.admin, luis.id);
            expect(deLuis.status).toBe(200);
            expect(deLuis.body.actividades.find((a: any) => a.title === 'Quiz del lunes')).toBeUndefined();

            // Y este profesor no da clase en la sección de Luis: ni preguntar.
            expect((await actividadesDe(tk.profe, luis.id)).status).toBe(403);
            expect((await actividadesDe(tk.profe, ana.id)).status).toBe(200);
        }, 60000);

        it('ACT-03: un alumno no puede preguntar por otro; su representante sí', async () => {
            expect((await actividadesDe(tk.luis, ana.id)).status).toBe(403);
            expect((await actividadesDe(tk.madre, ana.id)).status).toBe(200);
            expect((await actividadesDe(tk.otroTutor, ana.id)).status).toBe(403);
        }, 60000);

        it('ACT-04: sin sesión abierta, nadie las ve', async () => {
            const res = await request(server.server)
                .get(`/api/students/${ana.id}/actividades`)
                .set({ 'X-Institute-Slug': SLUG });
            expect(res.status).toBe(401);
        }, 60000);
    });
});
