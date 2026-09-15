import { FastifyInstance } from 'fastify';
import request = require('supertest');
import { PrismaClient } from '@prisma/client';
import { createId } from '@paralleldrive/cuid2';
import { UserRole } from '../../src/utils/prisma-enums';
import { todayInTimezone } from '../../src/utils/school-time';
import {
    createTestServer,
    createTestPrismaClient,
    createTestUser,
    createTestAcademicYear,
    createTestSubject,
    generateTestToken,
} from '../helpers';

/**
 * AUDITORÍA — QUIÉN PUEDE HACER QUÉ
 *
 * Las reglas del liceo, tal cual:
 *
 *   ESTUDIANTE   solo MIRA lo suyo: su información, sus clases, sus actividades.
 *                No sube, no edita, no agrega nada.
 *   REPRESENTANTE solo mira a los estudiantes que representa.
 *   PROFESOR     pone notas, pasa asistencia, arma el plan de evaluación y deja
 *                observaciones ÚNICAMENTE de las clases que imparte; y ve el
 *                promedio de sus secciones guía.
 *   ADMIN        el resto.
 *
 * Montaje: el profesor A imparte Matemática en 1er Año A (y es su guía). El
 * profesor B no imparte nada ahí. Ana estudia en 1er Año A; Luis, en 1er Año B.
 * La madre de Ana la representa a ella.
 */

const SLUG = 'test-institute';
// El sistema no admite registrar en días futuros
const HOY = todayInTimezone('America/Caracas');
const gId = () => {
    // Siempre la 'c' delante: ver la nota de `tests/helpers.ts`.
    return `c${createId()}`;
};

describe('Auditoría — quién puede hacer qué', () => {
    let server: FastifyInstance;
    let prisma: PrismaClient;

    let profeA: any;
    let profeB: any;
    let ana: any;
    let luis: any;
    let madreDeAna: any;
    const tk: Record<string, string> = {};

    let year: any;
    let period: any;
    let seccionA: any;
    let seccionB: any;
    let matematica: any;
    let actividad: any;

    const auth = (token: string) => (req: request.Test) =>
        req.set('Authorization', `Bearer ${token}`).set('X-Institute-Slug', SLUG);

    /** Prohibido = 401 o 403; nunca 200, y nunca un 500 por reventar. */
    const prohibido = (res: request.Response) => {
        expect([401, 403]).toContain(res.status);
    };

    beforeAll(async () => {
        server = await createTestServer();
        prisma = await createTestPrismaClient();

        profeA = (await createTestUser(prisma, UserRole.TEACHER)).user;
        profeB = (await createTestUser(prisma, UserRole.TEACHER)).user;
        ana = (await createTestUser(prisma, UserRole.STUDENT)).user;
        luis = (await createTestUser(prisma, UserRole.STUDENT)).user;
        madreDeAna = (await createTestUser(prisma, UserRole.TUTOR)).user;

        tk.profeA = generateTestToken(profeA.id, UserRole.TEACHER, 'institute');
        tk.profeB = generateTestToken(profeB.id, UserRole.TEACHER, 'institute');
        tk.ana = generateTestToken(ana.id, UserRole.STUDENT, 'institute');
        tk.luis = generateTestToken(luis.id, UserRole.STUDENT, 'institute');
        tk.madre = generateTestToken(madreDeAna.id, UserRole.TUTOR, 'institute');

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

        const crearSeccion = (nombre: string, letra: string, guia?: string) =>
            prisma.classroom.create({
                data: {
                    id: gId(),
                    name: nombre,
                    slug: `${letra.toLowerCase()}-${Date.now()}${letra}`,
                    grade: 1,
                    section: letra,
                    capacity: 30,
                    academicYearId: year.id,
                    instituteId: 'institute',
                    teacherId: guia,
                },
            });

        seccionA = await crearSeccion('1er Año A', 'A', profeA.id);
        seccionB = await crearSeccion('1er Año B', 'B');

        matematica = await createTestSubject(prisma, 'institute');
        // El profesor A imparte Matemática en la sección A; en la B no hay nadie
        await prisma.classroomSubject.create({
            data: { classroomId: seccionA.id, subjectId: matematica.id, teacherId: profeA.id, weeklyBlocks: 4 },
        });
        await prisma.classroomSubject.create({
            data: { classroomId: seccionB.id, subjectId: matematica.id, weeklyBlocks: 4 },
        });

        await prisma.studentClassroom.create({
            data: { studentId: ana.id, classroomId: seccionA.id, academicYearId: year.id, isActive: true },
        });
        await prisma.studentClassroom.create({
            data: { studentId: luis.id, classroomId: seccionB.id, academicYearId: year.id, isActive: true },
        });

        await prisma.studentTutor.create({
            data: { studentId: ana.id, tutorId: madreDeAna.id, relationship: 'MADRE' },
        });

        actividad = await prisma.activity.create({
            data: {
                title: 'Prueba de sumas',
                type: 'SUMATIVA',
                scope: 'CLASSROOM',
                startDate: new Date('2026-09-10'),
                maxGrade: 20,
                weight: 1,
                classroomId: seccionA.id,
                subjectId: matematica.id,
                periodId: period.id,
                lapso: '1',
                createdBy: profeA.id,
                instituteId: 'institute',
            },
        });
    }, 180000);

    afterAll(async () => {
        await prisma.$disconnect();
        await server.close();
    }, 120000);

    // ------------------------------------------------------------------
    describe('el estudiante solo mira lo suyo', () => {
        it('ve su propia información', async () => {
            const res = await auth(tk.ana)(request(server.server).get('/api/dashboard/student'));
            expect(res.status).toBe(200);
        }, 60000);

        it('ve sus clases y su horario', async () => {
            const res = await auth(tk.ana)(request(server.server).get('/api/students/my-dashboard'));
            expect([200, 404]).toContain(res.status);
            expect(res.status).not.toBe(500);
        }, 60000);

        it('NO puede ponerse ni poner notas', async () => {
            prohibido(
                await auth(tk.ana)(request(server.server).post('/api/grades')).send({
                    score: 20,
                    studentId: ana.id,
                    activityId: actividad.id,
                    periodId: period.id,
                    subjectId: matematica.id,
                })
            );
        }, 60000);

        it('NO puede pasar asistencia', async () => {
            prohibido(
                await auth(tk.ana)(request(server.server).post('/api/attendance')).send({
                    studentId: ana.id,
                    classroomId: seccionA.id,
                    date: HOY,
                    status: 'PRESENT',
                })
            );
        }, 60000);

        it('NO puede tocar el plan de evaluación', async () => {
            prohibido(
                await auth(tk.ana)(request(server.server).post('/api/evaluation-plan/rows/batch')).send({
                    classroomId: seccionA.id,
                    subjectId: matematica.id,
                    lapso: '1',
                    rows: [{ rowType: 'EVALUATION', weekNumber: 1, orderIndex: 0, puntos: 20 }],
                })
            );
        }, 60000);

        it('NO puede escribir observaciones', async () => {
            prohibido(
                await auth(tk.ana)(request(server.server).post('/api/observations')).send({
                    studentIds: [ana.id],
                    classroomId: seccionA.id,
                    subjectId: matematica.id,
                    type: 'ACADEMICA',
                    title: 'Autoelogio',
                    description: 'Me porté muy bien',
                })
            );
        }, 60000);

        it('NO puede crear materias, secciones ni usuarios', async () => {
            prohibido(
                await auth(tk.ana)(request(server.server).post('/api/subjects')).send({ name: 'Recreo', code: 'REC1' })
            );
            prohibido(
                await auth(tk.ana)(request(server.server).post('/api/classrooms')).send({
                    academicYearId: year.id,
                    grade: 1,
                    section: 'Z',
                    capacity: 10,
                })
            );
            prohibido(
                await auth(tk.ana)(request(server.server).post('/api/users')).send({
                    id: 'V99999999',
                    email: `intruso-${Date.now()}@test.com`,
                    password: 'Clave12345!',
                    firstName: 'Intruso',
                    lastName: 'Falso',
                    role: 'ADMIN',
                })
            );
        }, 60000);

        it('NO ve la información de otro estudiante', async () => {
            prohibido(await auth(tk.ana)(request(server.server).get(`/api/students/${luis.id}/dashboard`)));
            prohibido(await auth(tk.ana)(request(server.server).get(`/api/grades/student/${luis.id}`)));
            prohibido(await auth(tk.ana)(request(server.server).get(`/api/observations/student/${luis.id}`)));
        }, 60000);

        it('NO ve el listado de estudiantes de una sección', async () => {
            prohibido(
                await auth(tk.ana)(request(server.server).get('/api/students').query({ classroomId: seccionA.id }))
            );
        }, 60000);
    });

    // ------------------------------------------------------------------
    describe('el representante solo mira a quien representa', () => {
        it('ve a su representada', async () => {
            const res = await auth(tk.madre)(request(server.server).get('/api/dashboard/tutor'));
            expect(res.status).toBe(200);
            expect(JSON.stringify(res.body)).toContain(ana.firstName);
        }, 60000);

        it('NO ve a un estudiante que no representa', async () => {
            prohibido(await auth(tk.madre)(request(server.server).get(`/api/students/${luis.id}/dashboard`)));
            prohibido(await auth(tk.madre)(request(server.server).get(`/api/grades/student/${luis.id}`)));
            prohibido(await auth(tk.madre)(request(server.server).get(`/api/observations/student/${luis.id}`)));
        }, 60000);

        it('NO escribe nada', async () => {
            prohibido(
                await auth(tk.madre)(request(server.server).post('/api/grades')).send({
                    score: 20,
                    studentId: ana.id,
                    activityId: actividad.id,
                    periodId: period.id,
                    subjectId: matematica.id,
                })
            );
            prohibido(
                await auth(tk.madre)(request(server.server).post('/api/attendance')).send({
                    studentId: ana.id,
                    classroomId: seccionA.id,
                    date: HOY,
                    status: 'PRESENT',
                })
            );
            prohibido(
                await auth(tk.madre)(request(server.server).post('/api/observations')).send({
                    studentIds: [ana.id],
                    classroomId: seccionA.id,
                    subjectId: matematica.id,
                    type: 'ACADEMICA',
                    title: 'Nota de la madre',
                    description: 'Mi hija es la mejor',
                })
            );
        }, 60000);
    });

    // ------------------------------------------------------------------
    describe('el profesor solo toca las clases que imparte', () => {
        it('SÍ pone nota en su materia', async () => {
            const res = await auth(tk.profeA)(request(server.server).post('/api/grades')).send({
                score: 15,
                studentId: ana.id,
                activityId: actividad.id,
                periodId: period.id,
                subjectId: matematica.id,
            });
            expect([200, 201]).toContain(res.status);
        }, 60000);

        it('SÍ pasa asistencia en su sección', async () => {
            const res = await auth(tk.profeA)(request(server.server).post('/api/attendance')).send({
                studentId: ana.id,
                classroomId: seccionA.id,
                date: HOY,
                status: 'PRESENT',
            });
            expect([200, 201]).toContain(res.status);
        }, 60000);

        it('SÍ arma el plan de evaluación de su materia', async () => {
            const res = await auth(tk.profeA)(request(server.server).post('/api/evaluation-plan/rows/batch')).send({
                classroomId: seccionA.id,
                subjectId: matematica.id,
                lapso: '1',
                rows: [{ rowType: 'EVALUATION', weekNumber: 1, orderIndex: 0, actividadEval: 'Taller', puntos: 20 }],
            });
            expect(res.status).toBe(200);
        }, 60000);

        it('NO pone nota en una sección que no imparte', async () => {
            const otraActividad = await prisma.activity.create({
                data: {
                    title: 'Prueba ajena',
                    type: 'SUMATIVA',
                    scope: 'CLASSROOM',
                    startDate: new Date('2026-09-10'),
                    maxGrade: 20,
                    weight: 1,
                    classroomId: seccionB.id,
                    subjectId: matematica.id,
                    periodId: period.id,
                    lapso: '1',
                    createdBy: profeB.id,
                    instituteId: 'institute',
                },
            });

            prohibido(
                await auth(tk.profeB)(request(server.server).post('/api/grades')).send({
                    score: 20,
                    studentId: ana.id,
                    activityId: actividad.id,
                    periodId: period.id,
                    subjectId: matematica.id,
                })
            );

            // Y tampoco al revés: el profesor A en la sección B
            prohibido(
                await auth(tk.profeA)(request(server.server).post('/api/grades')).send({
                    score: 20,
                    studentId: luis.id,
                    activityId: otraActividad.id,
                    periodId: period.id,
                    subjectId: matematica.id,
                })
            );
        }, 60000);

        it('NO pasa asistencia en una sección que no imparte', async () => {
            prohibido(
                await auth(tk.profeB)(request(server.server).post('/api/attendance')).send({
                    studentId: ana.id,
                    classroomId: seccionA.id,
                    date: HOY,
                    status: 'ABSENT',
                })
            );
        }, 60000);

        it('NO toca el plan de evaluación de una materia que no imparte', async () => {
            prohibido(
                await auth(tk.profeB)(request(server.server).post('/api/evaluation-plan/rows/batch')).send({
                    classroomId: seccionA.id,
                    subjectId: matematica.id,
                    lapso: '1',
                    rows: [{ rowType: 'EVALUATION', weekNumber: 1, orderIndex: 0, puntos: 20 }],
                })
            );
        }, 60000);

        it('NO deja observaciones en una sección que no imparte', async () => {
            prohibido(
                await auth(tk.profeB)(request(server.server).post('/api/observations')).send({
                    studentIds: [ana.id],
                    classroomId: seccionA.id,
                    subjectId: matematica.id,
                    type: 'ACADEMICA',
                    title: 'Observación ajena',
                    description: 'De una clase que no imparto',
                })
            );
        }, 60000);

        it('ve el promedio de su sección guía, no el de las demás', async () => {
            const propia = await auth(tk.profeA)(
                request(server.server).get('/api/students').query({ classroomId: seccionA.id })
            );
            expect(propia.status).toBe(200);

            const ajena = await auth(tk.profeA)(
                request(server.server).get('/api/students').query({ classroomId: seccionB.id })
            );
            prohibido(ajena);
        }, 60000);

        it('NO crea materias, secciones ni usuarios', async () => {
            prohibido(
                await auth(tk.profeA)(request(server.server).post('/api/subjects')).send({ name: 'Inventada', code: 'INV1' })
            );
            prohibido(
                await auth(tk.profeA)(request(server.server).post('/api/classrooms')).send({
                    academicYearId: year.id,
                    grade: 2,
                    section: 'Z',
                    capacity: 10,
                })
            );
        }, 60000);
    });

    // ------------------------------------------------------------------
    describe('los datos personales solo los toca el administrador', () => {
        it('el estudiante NO puede editar su propia ficha', async () => {
            prohibido(
                await auth(tk.ana)(request(server.server).put('/api/students/profile/me')).send({
                    firstName: 'ElMejor',
                    lastName: 'DelLiceo',
                })
            );
            prohibido(
                await auth(tk.ana)(request(server.server).put('/api/users/profile/me')).send({ phone: '0000000' })
            );

            const enBD = await prisma.user.findUnique({ where: { id: ana.id } });
            expect(enBD!.firstName).toBe(ana.firstName);
        }, 60000);

        it('el profesor NO puede editar su propia ficha', async () => {
            prohibido(
                await auth(tk.profeA)(request(server.server).put('/api/teachers/profile/me')).send({
                    firstName: 'Profesor',
                    lastName: 'Cambiado',
                })
            );
            prohibido(
                await auth(tk.profeA)(request(server.server).put('/api/users/profile/me')).send({
                    firstName: 'Otro',
                })
            );

            const enBD = await prisma.user.findUnique({ where: { id: profeA.id } });
            expect(enBD!.firstName).toBe(profeA.firstName);
        }, 60000);

        it('el representante NO puede editar su ficha ni la de su representada', async () => {
            prohibido(
                await auth(tk.madre)(request(server.server).put('/api/users/profile/me')).send({ phone: '1111111' })
            );
            prohibido(
                await auth(tk.madre)(request(server.server).put(`/api/users/${ana.id}`)).send({ firstName: 'Princesa' })
            );
        }, 60000);

        it('el administrador SÍ corrige los datos de cualquiera', async () => {
            const admin = await createTestUser(prisma, UserRole.ADMIN);
            const tokenAdmin = generateTestToken(admin.user.id, UserRole.ADMIN, 'institute');

            const res = await auth(tokenAdmin)(request(server.server).put(`/api/users/${ana.id}`)).send({
                firstName: 'Ana María',
            });
            expect(res.status).toBe(200);
            expect((await prisma.user.findUnique({ where: { id: ana.id } }))!.firstName).toBe('Ana María');
        }, 60000);
    });
});
