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
    createTestUserWithPassword,
    createTestAcademicYear,
    createTestSubject,
    generateTestToken,
} from '../helpers';

/**
 * PUERTAS SIN CERRADURA
 *
 * `auditoria-permisos` ya comprobaba las reglas del liceo… **en las puertas que
 * se le ocurrieron a quien la escribió**. Un barrido de todas las rutas del
 * servidor, cruzando `routes/` con `controllers/`, destapó seis que nadie había
 * probado y que estaban abiertas.
 *
 * Las seis tienen la misma forma: la ruta solo pide `authenticate` —«¿quién
 * eres?»— y nadie pregunta después «¿y puedes hacer esto?». El comentario de la
 * ruta a veces hasta lo dice («Inscribir/Desinscribir estudiantes
 * (Teacher/Admin)») y el código no lo cumple.
 *
 * Lo que un ALUMNO podía hacer, con su sesión normal:
 *
 *   1. meter a cualquier compañero en cualquier sección;
 *   2. sacar a cualquier compañero de su sección (solo hacía falta su PROPIA
 *      contraseña, que obviamente tiene);
 *   3. reescribir la cabecera del plan de evaluación de cualquier clase — el
 *      nombre del profesor, su cédula, su teléfono y su correo;
 *   4. leer la asistencia completa de una sección entera.
 *
 * Lo que un PROFESOR podía hacer en clases que no imparte:
 *
 *   5. cambiar la nota de cualquier alumno del liceo;
 *   6. borrar la nota de cualquier alumno del liceo.
 *
 * Y un REPRESENTANTE podía leer la asistencia de alumnos que no representa.
 *
 * Ninguna de las 696 pruebas anteriores tocaba estas rutas. Por eso esta.
 *
 * Montaje: el profesor A imparte Matemática en 1er Año A y es su guía. El
 * profesor B no imparte nada ahí. Ana estudia en A; Luis, en B. La madre de Luis
 * lo representa solo a él.
 */

const SLUG = 'test-institute';
const HOY = todayInTimezone('America/Caracas');
const gId = () => `c${createId()}`;
const CLAVE_DE_ANA = 'AnaEstudiante2026';

describe('Puertas sin cerradura', () => {
    let server: FastifyInstance;
    let prisma: PrismaClient;

    let profeA: any;
    let profeB: any;
    let ana: any;
    let luis: any;
    let madreDeLuis: any;
    const tk: Record<string, string> = {};

    let year: any;
    let period: any;
    let seccionA: any;
    let seccionB: any;
    let matematica: any;
    let actividad: any;
    let notaDeAna: any;

    const auth = (token: string) => (req: request.Test) =>
        req.set('Authorization', `Bearer ${token}`).set('X-Institute-Slug', SLUG);

    /** Prohibido = 401 o 403. Nunca 200, y nunca un 500 por reventar. */
    const prohibido = (res: request.Response) => {
        expect([401, 403]).toContain(res.status);
    };

    beforeAll(async () => {
        server = await createTestServer();
        prisma = await createTestPrismaClient();

        profeA = (await createTestUser(prisma, UserRole.TEACHER)).user;
        profeB = (await createTestUser(prisma, UserRole.TEACHER)).user;
        ana = (await createTestUserWithPassword(prisma, UserRole.STUDENT, CLAVE_DE_ANA)).user;
        luis = (await createTestUser(prisma, UserRole.STUDENT)).user;
        madreDeLuis = (await createTestUser(prisma, UserRole.TUTOR)).user;

        tk.profeA = generateTestToken(profeA.id, UserRole.TEACHER, 'institute');
        tk.profeB = generateTestToken(profeB.id, UserRole.TEACHER, 'institute');
        tk.ana = generateTestToken(ana.id, UserRole.STUDENT, 'institute');
        tk.madre = generateTestToken(madreDeLuis.id, UserRole.TUTOR, 'institute');

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
                    slug: `puerta-${letra.toLowerCase()}-${gId()}`,
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
        await prisma.classroomSubject.create({
            data: { classroomId: seccionA.id, subjectId: matematica.id, teacherId: profeA.id, weeklyBlocks: 4 },
        });

        await prisma.studentClassroom.create({
            data: { studentId: ana.id, classroomId: seccionA.id, academicYearId: year.id, isActive: true },
        });
        await prisma.studentClassroom.create({
            data: { studentId: luis.id, classroomId: seccionB.id, academicYearId: year.id, isActive: true },
        });

        // La madre representa a Luis, NO a Ana.
        await prisma.studentTutor.create({
            data: { studentId: luis.id, tutorId: madreDeLuis.id, relationship: 'MADRE' },
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

        notaDeAna = await prisma.grade.create({
            data: {
                id: gId(),
                score: 15,
                studentId: ana.id,
                activityId: actividad.id,
                subjectId: matematica.id,
                periodId: period.id,
                teacherId: profeA.id,
            },
        });

        await prisma.dailyAttendance.create({
            data: {
                studentId: luis.id,
                classroomId: seccionB.id,
                date: new Date(HOY),
                status: 'PRESENT',
                teacherId: profeA.id,
            },
        });
    }, 180000);

    afterAll(async () => {
        await prisma.$disconnect();
        await server.close();
    }, 120000);

    // ═════════════════════════════════════════════════════════════════════════
    // LO QUE UN ALUMNO NO PUEDE HACER
    // ═════════════════════════════════════════════════════════════════════════

    describe('el alumno no mueve a nadie de sección', () => {
        it('PUERTA-01: un alumno NO puede inscribir a otro en una sección', async () => {
            prohibido(
                await auth(tk.ana)(
                    request(server.server).post(`/api/classrooms/${seccionB.id}/students`)
                ).send({ studentId: luis.id })
            );

            // Y la base no se movió: Luis sigue solo en su sección.
            const donde = await prisma.studentClassroom.count({
                where: { studentId: luis.id, classroomId: seccionB.id, isActive: true },
            });
            expect(donde).toBe(1);
            const enLaOtra = await prisma.studentClassroom.count({
                where: { studentId: luis.id, classroomId: seccionA.id, isActive: true },
            });
            expect(enLaOtra).toBe(0);
        }, 60000);

        it('PUERTA-02: un alumno NO puede sacar a otro de su sección, ni con su propia contraseña', async () => {
            // Su contraseña la tiene: es la suya. Lo que no tiene es el permiso.
            prohibido(
                await auth(tk.ana)(
                    request(server.server).delete(`/api/classrooms/${seccionB.id}/students/${luis.id}`)
                ).send({ password: CLAVE_DE_ANA })
            );

            const sigue = await prisma.studentClassroom.count({
                where: { studentId: luis.id, classroomId: seccionB.id, isActive: true },
            });
            expect(sigue).toBe(1);
        }, 60000);
    });

    describe('el alumno no escribe en el plan de evaluación', () => {
        it('PUERTA-03: un alumno NO puede reescribir la cabecera del plan', async () => {
            prohibido(
                await auth(tk.ana)(request(server.server).post('/api/evaluation-plan/metadata')).send({
                    classroomId: seccionA.id,
                    subjectId: matematica.id,
                    lapso: '1',
                    nombreDocente: 'ME LO INVENTO YO',
                    cedulaDocente: 'V-00000000',
                    telefonoDocente: '0000-0000000',
                    correoDocente: 'falso@ninguna.parte',
                })
            );

            // Y no quedó escrito nada.
            const escrito = await prisma.evaluationPlanMetadata.findFirst({
                where: { classroomId: seccionA.id, subjectId: matematica.id, lapso: '1' },
                select: { nombreDocente: true },
            });
            expect(escrito?.nombreDocente ?? '').not.toBe('ME LO INVENTO YO');
        }, 60000);
    });

    describe('el alumno no lee la asistencia de la sección entera', () => {
        it('PUERTA-04: un alumno NO puede pedir la asistencia de una sección', async () => {
            // Ni la suya: la asistencia de la sección es de los profesores y del
            // admin. El alumno ve la SUYA, que tiene su propia ruta.
            prohibido(
                await auth(tk.ana)(
                    request(server.server).get(`/api/attendance/classroom/${seccionA.id}`)
                )
            );
        }, 60000);

        it('PUERTA-05: un profesor NO puede leer la asistencia de una sección que no lleva', async () => {
            prohibido(
                await auth(tk.profeB)(
                    request(server.server).get(`/api/attendance/classroom/${seccionA.id}`)
                )
            );
        }, 60000);
    });

    // ═════════════════════════════════════════════════════════════════════════
    // LO QUE UN PROFESOR NO PUEDE HACER FUERA DE SUS CLASES
    // ═════════════════════════════════════════════════════════════════════════

    describe('el profesor solo toca las notas de las clases que imparte', () => {
        it('PUERTA-06: un profesor NO puede cambiar la nota de una clase que no imparte', async () => {
            prohibido(
                await auth(tk.profeB)(
                    request(server.server).put(`/api/grades/${notaDeAna.id}`)
                ).send({ score: 1 })
            );

            const sigue = await prisma.grade.findUnique({
                where: { id: notaDeAna.id },
                select: { score: true },
            });
            expect(Number(sigue?.score)).toBe(15);
        }, 60000);

        it('PUERTA-07: un profesor NO puede borrar la nota de una clase que no imparte', async () => {
            prohibido(
                await auth(tk.profeB)(
                    request(server.server).delete(`/api/grades/${notaDeAna.id}`)
                )
            );

            const sigue = await prisma.grade.count({ where: { id: notaDeAna.id } });
            expect(sigue).toBe(1);
        }, 60000);

        it('PUERTA-08: el profesor que SÍ la imparte puede cambiarla', async () => {
            // El contrapeso: si al cerrar la puerta se cerrara también para
            // quien tiene la llave, el sistema quedaría inservible.
            const res = await auth(tk.profeA)(
                request(server.server).put(`/api/grades/${notaDeAna.id}`)
            ).send({ score: 16 });

            expect(res.status).toBe(200);
            const ahora = await prisma.grade.findUnique({
                where: { id: notaDeAna.id },
                select: { score: true },
            });
            expect(Number(ahora?.score)).toBe(16);
        }, 60000);
    });

    // ═════════════════════════════════════════════════════════════════════════
    // LO QUE UN REPRESENTANTE NO PUEDE HACER
    // ═════════════════════════════════════════════════════════════════════════

    describe('el representante solo ve a los suyos', () => {
        it('PUERTA-09: NO puede leer la asistencia de un alumno que no representa', async () => {
            prohibido(
                await auth(tk.madre)(
                    request(server.server).get(`/api/attendance/student/${ana.id}`)
                )
            );
        }, 60000);

        it('PUERTA-10: SÍ puede leer la de su propio representado', async () => {
            const res = await auth(tk.madre)(
                request(server.server).get(`/api/attendance/student/${luis.id}`)
            );
            expect(res.status).toBe(200);
        }, 60000);
    });
});
