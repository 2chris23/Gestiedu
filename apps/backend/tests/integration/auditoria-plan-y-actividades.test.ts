import { FastifyInstance } from 'fastify';
import request = require('supertest');
import { PrismaClient } from '@prisma/client';
import { createId } from '@paralleldrive/cuid2';
import { UserRole } from '../../src/utils/prisma-enums';
import {
    createTestServer,
    createTestPrismaClient,
    cleanTestDatabase,
    createTestUser,
    generateTestToken,
    createTestAcademicYear,
    createTestSubject,
} from '../helpers';

/**
 * EL PLAN DE EVALUACIÓN Y LAS ACTIVIDADES: ACCIONES QUE NADIE PROBABA
 *
 * Se midió qué acciones de la API no tenían NINGUNA prueba detrás preguntándole
 * al propio servidor por sus rutas (`printRoutes`) y buscando cada una en todos
 * los archivos de prueba. Salieron 28 sin tocar. Estas son las del plan de
 * evaluación y las actividades, que es donde el profesor pasa el día.
 *
 * Al escribirlas aparecieron tres cosas que el sistema hacía mal.
 */

const SLUG = 'test-institute';

function gId(): string {
    // Siempre la 'c' delante: ver la nota de `tests/helpers.ts`.
    return `c${createId()}`;
}

describe('Plan de evaluación y actividades: lo que no se probaba', () => {
    let server: FastifyInstance;
    let prisma: PrismaClient;

    let year: any;
    let seccionDeAna: any;
    let seccionDeBeto: any;
    let materia: any;
    let ana: any; // profesora de la sección A
    let beto: any; // profesor de la sección B
    let tokenAna: string;
    let tokenBeto: string;
    let admin: any;
    let tokenAdmin: string;

    const auth = (token: string) => ({
        Authorization: `Bearer ${token}`,
        'X-Institute-Slug': SLUG,
    });

    const filaDe20Puntos = (titulo: string) => ({
        rowType: 'EVALUATION',
        weekNumber: 1,
        title: titulo,
        actividadEval: titulo,
        puntos: 20,
        tipoEvaluacion: 'OTHER',
    });

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
            create: {
                id: 'institute',
                code: 'TEST_INST',
                slug: SLUG,
                name: 'Test Institute',
                email: 'test@institute.com',
            },
        });

        year = await createTestAcademicYear(prisma, 'institute');
        materia = await createTestSubject(prisma, 'institute');

        seccionDeAna = await prisma.classroom.create({
            data: {
                id: gId(),
                name: '1er Grado A',
                slug: `aula-a-${gId()}`,
                grade: 1,
                section: 'A',
                capacity: 30,
                academicYearId: year.id,
                instituteId: 'institute',
            },
        });
        seccionDeBeto = await prisma.classroom.create({
            data: {
                id: gId(),
                name: '1er Grado B',
                slug: `aula-b-${gId()}`,
                grade: 1,
                section: 'B',
                capacity: 30,
                academicYearId: year.id,
                instituteId: 'institute',
            },
        });

        const a = await createTestUser(prisma, UserRole.TEACHER);
        ana = a.user;
        const b = await createTestUser(prisma, UserRole.TEACHER);
        beto = b.user;
        const ad = await createTestUser(prisma, UserRole.ADMIN);
        admin = ad.user;

        // Cada profesor da ESA materia en SU sección, y solo en la suya.
        await prisma.classroomSubject.create({
            data: { classroomId: seccionDeAna.id, subjectId: materia.id, teacherId: ana.id },
        });
        await prisma.classroomSubject.create({
            data: { classroomId: seccionDeBeto.id, subjectId: materia.id, teacherId: beto.id },
        });

        tokenAna = generateTestToken(ana.id, UserRole.TEACHER, 'institute');
        tokenBeto = generateTestToken(beto.id, UserRole.TEACHER, 'institute');
        tokenAdmin = generateTestToken(admin.id, UserRole.ADMIN, 'institute');
    });

    // ─────────────────────────────────────────────────────────────────────────
    // COPIAR EL PLAN A OTRA SECCIÓN
    // ─────────────────────────────────────────────────────────────────────────

    it('PLAN-01: copiar el plan a una sección ajena no se permite', async () => {
        // Ana arma su plan en su sección.
        await request(server.server)
            .post('/api/evaluation-plan/rows/batch')
            .set(auth(tokenAna))
            .send({
                classroomId: seccionDeAna.id,
                subjectId: materia.id,
                lapso: '1',
                rows: [filaDe20Puntos('Examen de Ana')],
            })
            .expect(200);

        // Beto arma el suyo en la suya.
        await request(server.server)
            .post('/api/evaluation-plan/rows/batch')
            .set(auth(tokenBeto))
            .send({
                classroomId: seccionDeBeto.id,
                subjectId: materia.id,
                lapso: '1',
                rows: [filaDe20Puntos('Examen de Beto')],
            })
            .expect(200);

        // Beto intenta volcar SU plan encima de la sección de Ana.
        const res = await request(server.server)
            .post('/api/evaluation-plan/copy')
            .set(auth(tokenBeto))
            .send({
                sourceClassroomId: seccionDeBeto.id,
                sourceSubjectId: materia.id,
                sourceLapso: '1',
                targetClassroomIds: [seccionDeAna.id],
            });

        // Lo primero que se comprueba es el daño, no el código de respuesta:
        // el plan de Ana tiene que seguir siendo el de Ana.
        const filasDeAna = await prisma.evaluationPlanRow.findMany({
            where: { classroomId: seccionDeAna.id, subjectId: materia.id, lapso: '1' },
        });
        expect(filasDeAna.map((f: any) => f.title)).toEqual(['Examen de Ana']);

        expect(res.status).toBe(403);
    });

    it('PLAN-02: copiar el plan DESDE una sección ajena no se permite', async () => {
        await request(server.server)
            .post('/api/evaluation-plan/rows/batch')
            .set(auth(tokenAna))
            .send({
                classroomId: seccionDeAna.id,
                subjectId: materia.id,
                lapso: '1',
                rows: [filaDe20Puntos('Examen de Ana')],
            })
            .expect(200);

        // Beto se lleva el plan de Ana a su propia sección.
        const res = await request(server.server)
            .post('/api/evaluation-plan/copy')
            .set(auth(tokenBeto))
            .send({
                sourceClassroomId: seccionDeAna.id,
                sourceSubjectId: materia.id,
                sourceLapso: '1',
                targetClassroomIds: [seccionDeBeto.id],
            });

        expect(res.status).toBe(403);
    });

    it('PLAN-03: el profesor sí puede copiar entre secciones suyas', async () => {
        // El admin le da a Ana también la sección B.
        await prisma.classroomSubject.create({
            data: { classroomId: seccionDeBeto.id, subjectId: materia.id, teacherId: ana.id },
        }).catch(async () => {
            await prisma.classroomSubject.updateMany({
                where: { classroomId: seccionDeBeto.id, subjectId: materia.id },
                data: { teacherId: ana.id },
            });
        });

        await request(server.server)
            .post('/api/evaluation-plan/rows/batch')
            .set(auth(tokenAna))
            .send({
                classroomId: seccionDeAna.id,
                subjectId: materia.id,
                lapso: '1',
                rows: [filaDe20Puntos('Examen de Ana')],
            })
            .expect(200);

        const res = await request(server.server)
            .post('/api/evaluation-plan/copy')
            .set(auth(tokenAna))
            .send({
                sourceClassroomId: seccionDeAna.id,
                sourceSubjectId: materia.id,
                sourceLapso: '1',
                targetClassroomIds: [seccionDeBeto.id],
            });

        expect(res.status).toBe(200);
        expect(res.body.copiedCount).toBe(1);

        const copiadas = await prisma.evaluationPlanRow.findMany({
            where: { classroomId: seccionDeBeto.id, subjectId: materia.id, lapso: '1' },
        });
        expect(copiadas).toHaveLength(1);
        expect(copiadas[0].title).toBe('Examen de Ana');
    });

    // ─────────────────────────────────────────────────────────────────────────
    // LA LISTA DE SECCIONES QUE OFRECE EL BOTÓN
    //
    // Copiar un plan BORRA el del destino, así que la pantalla no puede ofrecer
    // secciones a ojo: lo que aparece en la lista tiene que ser exactamente lo
    // que el servidor va a aceptar después. Si no, el profesor marca una casilla
    // y recibe un "no tienes permisos" sin entender por qué.
    // ─────────────────────────────────────────────────────────────────────────

    const destinosPara = (token: string, seccionId: string) =>
        request(server.server)
            .get('/api/evaluation-plan/copy-targets')
            .query({ sourceClassroomId: seccionId, subjectId: materia.id })
            .set(auth(token));

    it('PLAN-3A: al profesor solo se le ofrecen las secciones donde da esa materia', async () => {
        // Beto solo da la materia en la suya: no hay a dónde copiar, y la lista
        // sale vacía en vez de ofrecerle la de Ana.
        const deBeto = await destinosPara(tokenBeto, seccionDeBeto.id).expect(200);
        expect(deBeto.body.classrooms).toEqual([]);

        // A Ana el admin le da también la sección B, así que a ella sí se le
        // ofrece. Se pregunta con otro usuario a propósito: la respuesta de un
        // profesor se guarda cinco minutos, y este cambio se hace directo en la
        // base, sin pasar por la API que limpiaría lo guardado.
        await prisma.classroomSubject.updateMany({
            where: { classroomId: seccionDeBeto.id, subjectId: materia.id },
            data: { teacherId: ana.id },
        });

        const deAna = await destinosPara(tokenAna, seccionDeAna.id).expect(200);
        expect(deAna.body.classrooms.map((c: any) => c.id)).toEqual([seccionDeBeto.id]);
    });

    it('PLAN-3B: la sección de origen nunca aparece como destino de sí misma', async () => {
        await prisma.classroomSubject.updateMany({
            where: { classroomId: seccionDeBeto.id, subjectId: materia.id },
            data: { teacherId: ana.id },
        });

        const res = await destinosPara(tokenAna, seccionDeAna.id).expect(200);

        expect(res.body.classrooms.map((c: any) => c.id)).not.toContain(seccionDeAna.id);
    });

    it('PLAN-3C: lo que ofrece la lista es exactamente lo que el copiado acepta', async () => {
        // Esta es la prueba que importa: se copia a TODO lo que la lista ofrece
        // y ninguna tiene que ser rechazada.
        await prisma.classroomSubject.updateMany({
            where: { classroomId: seccionDeBeto.id, subjectId: materia.id },
            data: { teacherId: ana.id },
        });

        await request(server.server)
            .post('/api/evaluation-plan/rows/batch')
            .set(auth(tokenAna))
            .send({
                classroomId: seccionDeAna.id,
                subjectId: materia.id,
                lapso: '1',
                rows: [filaDe20Puntos('Examen de Ana')],
            })
            .expect(200);

        const lista = await destinosPara(tokenAna, seccionDeAna.id).expect(200);
        const ofrecidas = lista.body.classrooms.map((c: any) => c.id);
        expect(ofrecidas.length).toBeGreaterThan(0);

        const copia = await request(server.server)
            .post('/api/evaluation-plan/copy')
            .set(auth(tokenAna))
            .send({
                sourceClassroomId: seccionDeAna.id,
                sourceSubjectId: materia.id,
                sourceLapso: '1',
                targetClassroomIds: ofrecidas,
            });

        expect(copia.status).toBe(200);
        expect(copia.body.copiedCount).toBe(ofrecidas.length);
    });

    it('PLAN-3D: pedir los destinos de una sección ajena no se permite', async () => {
        const res = await destinosPara(tokenBeto, seccionDeAna.id);
        expect(res.status).toBe(403);
    });

    it('PLAN-3E: un estudiante no puede ni preguntar', async () => {
        const alumno = (await createTestUser(prisma, UserRole.STUDENT)).user;
        const tokenAlumno = generateTestToken(alumno.id, UserRole.STUDENT, 'institute');

        const res = await destinosPara(tokenAlumno, seccionDeAna.id);
        expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it('PLAN-04: el administrador puede copiar entre cualesquiera secciones', async () => {
        await request(server.server)
            .post('/api/evaluation-plan/rows/batch')
            .set(auth(tokenAna))
            .send({
                classroomId: seccionDeAna.id,
                subjectId: materia.id,
                lapso: '1',
                rows: [filaDe20Puntos('Examen de Ana')],
            })
            .expect(200);

        const res = await request(server.server)
            .post('/api/evaluation-plan/copy')
            .set(auth(tokenAdmin))
            .send({
                sourceClassroomId: seccionDeAna.id,
                sourceSubjectId: materia.id,
                sourceLapso: '1',
                targetClassroomIds: [seccionDeBeto.id],
            });

        expect(res.status).toBe(200);
        expect(res.body.copiedCount).toBe(1);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // GUARDAR EL PLAN CON DATOS A MEDIAS
    // ─────────────────────────────────────────────────────────────────────────

    it('PLAN-05: guardar el plan sin la lista de filas dice qué falta, no "error interno"', async () => {
        const res = await request(server.server)
            .post('/api/evaluation-plan/rows/batch')
            .set(auth(tokenAna))
            .send({
                classroomId: seccionDeAna.id,
                subjectId: materia.id,
                lapso: '1',
                // falta `rows` a propósito
            });

        expect(res.status).toBe(400);
        expect(JSON.stringify(res.body).toLowerCase()).toContain('fila');
    });

    it('PLAN-06: copiar sin decir a qué secciones dice qué falta, no "error interno"', async () => {
        const res = await request(server.server)
            .post('/api/evaluation-plan/copy')
            .set(auth(tokenAna))
            .send({
                sourceClassroomId: seccionDeAna.id,
                sourceSubjectId: materia.id,
                sourceLapso: '1',
                // falta targetClassroomIds a propósito
            });

        expect(res.status).toBe(400);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // LA RUTA VIEJA QUE LA PANTALLA TODAVÍA USA
    // ─────────────────────────────────────────────────────────────────────────

    it('PLAN-07: la ruta vieja /activities/batch guarda igual que la nueva', async () => {
        // `apps/web/src/hooks/useEvaluationPlan.ts` sigue llamando a esta.
        const res = await request(server.server)
            .post('/api/evaluation-plan/activities/batch')
            .set(auth(tokenAna))
            .send({
                classroomId: seccionDeAna.id,
                subjectId: materia.id,
                lapso: '1',
                rows: [filaDe20Puntos('Por la ruta vieja')],
            });

        expect(res.status).toBe(200);
        const filas = await prisma.evaluationPlanRow.findMany({
            where: { classroomId: seccionDeAna.id, subjectId: materia.id, lapso: '1' },
        });
        expect(filas).toHaveLength(1);
        expect(filas[0].title).toBe('Por la ruta vieja');
    });

    it('PLAN-08: la ruta vieja tampoco deja escribir en sección ajena', async () => {
        const res = await request(server.server)
            .post('/api/evaluation-plan/activities/batch')
            .set(auth(tokenBeto))
            .send({
                classroomId: seccionDeAna.id,
                subjectId: materia.id,
                lapso: '1',
                rows: [filaDe20Puntos('Intruso')],
            });

        expect(res.status).toBe(403);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // BUSCAR ACTIVIDADES
    // ─────────────────────────────────────────────────────────────────────────

    it('ACT-01: buscar una actividad por texto filtra de verdad (profesor)', async () => {
        await prisma.teacherClassroom.create({
            data: { teacherId: ana.id, classroomId: seccionDeAna.id },
        });

        await prisma.activity.createMany({
            data: [
                {
                    id: gId(),
                    title: 'Examen de fracciones',
                    type: 'EXAM',
                    scope: 'CLASSROOM',
                    startDate: new Date('2024-03-01'),
                    maxGrade: 20,
                    classroomId: seccionDeAna.id,
                    subjectId: materia.id,
                    createdBy: ana.id,
                    isActive: true,
                },
                {
                    id: gId(),
                    title: 'Taller de geometría',
                    type: 'HOMEWORK',
                    scope: 'CLASSROOM',
                    startDate: new Date('2024-03-02'),
                    maxGrade: 20,
                    classroomId: seccionDeAna.id,
                    subjectId: materia.id,
                    createdBy: ana.id,
                    isActive: true,
                },
            ],
        });

        const res = await request(server.server)
            .get('/api/activities')
            .query({ search: 'fracciones' })
            .set(auth(tokenAna))
            .expect(200);

        const titulos = res.body.activities.map((a: any) => a.title);
        expect(titulos).toEqual(['Examen de fracciones']);
    });

    it('ACT-02: buscar una actividad por texto filtra de verdad (estudiante)', async () => {
        const e = await createTestUser(prisma, UserRole.STUDENT);
        await prisma.studentClassroom.create({
            data: {
                studentId: e.user.id,
                classroomId: seccionDeAna.id,
                academicYearId: year.id,
                isActive: true,
            },
        });

        await prisma.activity.createMany({
            data: [
                {
                    id: gId(),
                    title: 'Examen de fracciones',
                    type: 'EXAM',
                    scope: 'CLASSROOM',
                    startDate: new Date('2024-03-01'),
                    maxGrade: 20,
                    classroomId: seccionDeAna.id,
                    subjectId: materia.id,
                    createdBy: ana.id,
                    isActive: true,
                    isVisible: true,
                },
                {
                    id: gId(),
                    title: 'Taller de geometría',
                    type: 'HOMEWORK',
                    scope: 'CLASSROOM',
                    startDate: new Date('2024-03-02'),
                    maxGrade: 20,
                    classroomId: seccionDeAna.id,
                    subjectId: materia.id,
                    createdBy: ana.id,
                    isActive: true,
                    isVisible: true,
                },
            ],
        });

        const token = generateTestToken(e.user.id, UserRole.STUDENT, 'institute');
        const res = await request(server.server)
            .get('/api/activities/student/my-activities')
            .query({ search: 'geometría' })
            .set(auth(token))
            .expect(200);

        const titulos = res.body.activities.map((a: any) => a.title);
        expect(titulos).toEqual(['Taller de geometría']);
    });

    it('ACT-03: la búsqueda no abre la puerta a actividades de otra sección', async () => {
        const e = await createTestUser(prisma, UserRole.STUDENT);
        await prisma.studentClassroom.create({
            data: {
                studentId: e.user.id,
                classroomId: seccionDeAna.id,
                academicYearId: year.id,
                isActive: true,
            },
        });

        await prisma.activity.create({
            data: {
                id: gId(),
                title: 'Examen de la sección B',
                type: 'EXAM',
                scope: 'CLASSROOM',
                startDate: new Date('2024-03-01'),
                maxGrade: 20,
                classroomId: seccionDeBeto.id,
                subjectId: materia.id,
                createdBy: beto.id,
                isActive: true,
                isVisible: true,
            },
        });

        const token = generateTestToken(e.user.id, UserRole.STUDENT, 'institute');
        const res = await request(server.server)
            .get('/api/activities/student/my-activities')
            .query({ search: 'Examen' })
            .set(auth(token))
            .expect(200);

        expect(res.body.activities).toHaveLength(0);
    });

    it('ACT-04: las actividades de una materia se piden por su ruta', async () => {
        const otraMateria = await createTestSubject(prisma, 'institute');
        await prisma.classroomSubject.create({
            data: { classroomId: seccionDeAna.id, subjectId: otraMateria.id, teacherId: ana.id },
        });
        await prisma.teacherClassroom.create({
            data: { teacherId: ana.id, classroomId: seccionDeAna.id },
        });

        await prisma.activity.createMany({
            data: [
                {
                    id: gId(),
                    title: 'De la materia pedida',
                    type: 'EXAM',
                    scope: 'CLASSROOM',
                    startDate: new Date('2024-03-01'),
                    maxGrade: 20,
                    classroomId: seccionDeAna.id,
                    subjectId: materia.id,
                    createdBy: ana.id,
                    isActive: true,
                },
                {
                    id: gId(),
                    title: 'De la otra materia',
                    type: 'EXAM',
                    scope: 'CLASSROOM',
                    startDate: new Date('2024-03-02'),
                    maxGrade: 20,
                    classroomId: seccionDeAna.id,
                    subjectId: otraMateria.id,
                    createdBy: ana.id,
                    isActive: true,
                },
            ],
        });

        const res = await request(server.server)
            .get(`/api/activities/subject/${materia.id}`)
            .set(auth(tokenAna))
            .expect(200);

        const titulos = res.body.activities.map((a: any) => a.title);
        expect(titulos).toEqual(['De la materia pedida']);
    });

    it('ACT-05: las actividades de una sección se piden por su ruta', async () => {
        await prisma.teacherClassroom.create({
            data: { teacherId: ana.id, classroomId: seccionDeAna.id },
        });

        await prisma.activity.createMany({
            data: [
                {
                    id: gId(),
                    title: 'De la sección A',
                    type: 'EXAM',
                    scope: 'CLASSROOM',
                    startDate: new Date('2024-03-01'),
                    maxGrade: 20,
                    classroomId: seccionDeAna.id,
                    subjectId: materia.id,
                    createdBy: ana.id,
                    isActive: true,
                },
                {
                    id: gId(),
                    title: 'De la sección B',
                    type: 'EXAM',
                    scope: 'CLASSROOM',
                    startDate: new Date('2024-03-02'),
                    maxGrade: 20,
                    classroomId: seccionDeBeto.id,
                    subjectId: materia.id,
                    createdBy: beto.id,
                    isActive: true,
                },
            ],
        });

        const res = await request(server.server)
            .get(`/api/activities/classroom/${seccionDeAna.id}`)
            .set(auth(tokenAna))
            .expect(200);

        const titulos = res.body.activities.map((a: any) => a.title);
        expect(titulos).toEqual(['De la sección A']);
    });
});
