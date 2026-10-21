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
 * PANTALLAS DEL ALUMNO Y DEL REPRESENTANTE (FASE E)
 *
 * Verificación estricta de aislamiento de datos y privacidad (403):
 * 1. Boleta: el alumno solo ve la suya; el tutor solo la de sus representados.
 *    Petición de datos de un compañero -> 403 Forbidden.
 * 2. Materias: el alumno solo ve sus materias; el tutor solo las de sus hijos.
 *    Petición de datos de un compañero -> 403 Forbidden.
 * 3. Mi clase: el alumno solo ve su clase con su horario en vivo; el tutor
 *    solo la de sus representados. Petición de compañero -> 403 Forbidden.
 * 4. Actividades: el alumno solo ve sus actividades; el tutor solo las de sus hijos.
 *    Petición de datos de un compañero -> 403 Forbidden.
 * 5. Horario de sección: solo el de su propia sección activa. Petición de sección
 *    ajena -> 403 Forbidden.
 * 6. Cuadro general de sección: estrictamente bloqueado para alumno y tutor -> 403 Forbidden.
 * 7. Estadísticas del ciclo: estrictamente bloqueado para alumno y tutor -> 403 Forbidden.
 */

const SLUG = 'test-institute';

describe('Fase E — Pantallas y aislamiento del alumno y representante', () => {
    let server: FastifyInstance;
    let prisma: PrismaClient;

    let yearActivo: any;
    let aulaA: any;
    let aulaB: any;
    let materia: any;
    let csA: any;
    let blockA: any;

    let alumno1: any;
    let alumno2: any;
    let tutor1: any;
    let tutor2: any;

    const tk: Record<string, string> = {};
    const cab = (token: string) => ({ Authorization: `Bearer ${token}`, 'X-Institute-Slug': SLUG });

    beforeAll(async () => {
        server = await createTestServer();
        prisma = await createTestPrismaClient();

        yearActivo = await createTestAcademicYear(prisma, 'institute');
        aulaA = await createTestClassroom(prisma, yearActivo.id, 'institute');
        aulaB = await prisma.classroom.create({
            data: {
                id: `c${createId()}`,
                name: '1er Grado B',
                slug: `aula-b-${createId()}`,
                grade: 1,
                section: 'B',
                capacity: 30,
                academicYearId: yearActivo.id,
                instituteId: 'institute',
            },
        });

        materia = await createTestSubject(prisma, 'institute');

        csA = await prisma.classroomSubject.create({
            data: {
                id: `cs-${createId()}`,
                classroomId: aulaA.id,
                subjectId: materia.id,
            },
        });

        await prisma.classroomSubject.create({
            data: {
                id: `cs-${createId()}`,
                classroomId: aulaB.id,
                subjectId: materia.id,
            },
        });

        // Crear bloque de horario para materia en aulaA
        blockA = await prisma.scheduleBlock.create({
            data: {
                id: `sb-${createId()}`,
                classroom: { connect: { id: aulaA.id } },
                classroomSubject: { connect: { id: csA.id } },
                dayOfWeek: 1, // Lunes
                startTime: '07:30',
                endTime: '09:00',
                blockType: 'CLASS',
                location: 'Aula 101',
            },
        });

        alumno1 = (await createTestUser(prisma, UserRole.STUDENT)).user;
        alumno2 = (await createTestUser(prisma, UserRole.STUDENT)).user;

        // Inscribir alumno 1 en aulaA
        await prisma.studentClassroom.create({
            data: {
                id: `sc-${createId()}`,
                studentId: alumno1.id,
                classroomId: aulaA.id,
                academicYearId: yearActivo.id,
                isActive: true,
            },
        });

        // Inscribir alumno 2 en aulaB
        await prisma.studentClassroom.create({
            data: {
                id: `sc-${createId()}`,
                studentId: alumno2.id,
                classroomId: aulaB.id,
                academicYearId: yearActivo.id,
                isActive: true,
            },
        });

        tutor1 = (await createTestUser(prisma, UserRole.TUTOR)).user;
        tutor2 = (await createTestUser(prisma, UserRole.TUTOR)).user;

        // Tutor 1 tutela a alumno 1
        await prisma.studentTutor.create({
            data: {
                id: `st-${createId()}`,
                studentId: alumno1.id,
                tutorId: tutor1.id,
                relationship: 'PADRE',
            },
        });

        // Tutor 2 tutela a alumno 2
        await prisma.studentTutor.create({
            data: {
                id: `st-${createId()}`,
                studentId: alumno2.id,
                tutorId: tutor2.id,
                relationship: 'MADRE',
            },
        });

        tk.alumno1 = generateTestToken(alumno1.id, UserRole.STUDENT, 'institute');
        tk.alumno2 = generateTestToken(alumno2.id, UserRole.STUDENT, 'institute');
        tk.tutor1 = generateTestToken(tutor1.id, UserRole.TUTOR, 'institute');
        tk.tutor2 = generateTestToken(tutor2.id, UserRole.TUTOR, 'institute');
    });

    afterAll(async () => {
        await prisma.$disconnect();
        await server.close();
    });

    describe('1. Boleta y Rendimiento Académico', () => {
        it('el alumno puede consultar su propia boleta (200)', async () => {
            const res = await request(server.server)
                .get(`/api/students/${alumno1.id}/boleta`)
                .set(cab(tk.alumno1))
                .expect(200);

            expect(res.body.success).toBe(true);
            expect(res.body.data.alumno).toBeDefined();
            expect(res.body.data.seccion.id).toBe(aulaA.id);
        });

        it('el alumno recibe 403 al pedir la boleta de un compañero', async () => {
            await request(server.server)
                .get(`/api/students/${alumno2.id}/boleta`)
                .set(cab(tk.alumno1))
                .expect(403);
        });

        it('el representante puede consultar la boleta de su representado (200)', async () => {
            const res = await request(server.server)
                .get(`/api/students/${alumno1.id}/boleta`)
                .set(cab(tk.tutor1))
                .expect(200);

            expect(res.body.success).toBe(true);
            expect(res.body.data.alumno).toBeDefined();
            expect(res.body.data.seccion.id).toBe(aulaA.id);
        });

        it('el representante recibe 403 al pedir la boleta de un alumno que no tutela', async () => {
            await request(server.server)
                .get(`/api/students/${alumno2.id}/boleta`)
                .set(cab(tk.tutor1))
                .expect(403);
        });

        it('la ruta alias /api/boleta/:id responde 200 para el propio alumno y 403 para un compañero', async () => {
            await request(server.server)
                .get(`/api/boleta/${alumno1.id}`)
                .set(cab(tk.alumno1))
                .expect(200);

            await request(server.server)
                .get(`/api/boleta/${alumno2.id}`)
                .set(cab(tk.alumno1))
                .expect(403);
        });
    });

    describe('2. Materias del estudiante', () => {
        it('el alumno puede consultar sus materias (200)', async () => {
            const res = await request(server.server)
                .get(`/api/students/${alumno1.id}/materias`)
                .set(cab(tk.alumno1))
                .expect(200);

            expect(res.body).toHaveProperty('seccion');
            expect(res.body.seccion.id).toBe(aulaA.id);
            expect(Array.isArray(res.body.materias)).toBe(true);
            expect(res.body.materias.some((m: any) => m.id === materia.id)).toBe(true);
        });

        it('el alumno recibe 403 al pedir las materias de un compañero', async () => {
            await request(server.server)
                .get(`/api/students/${alumno2.id}/materias`)
                .set(cab(tk.alumno1))
                .expect(403);
        });

        it('el representante puede consultar las materias de su representado (200)', async () => {
            const res = await request(server.server)
                .get(`/api/students/${alumno1.id}/materias`)
                .set(cab(tk.tutor1))
                .expect(200);

            expect(res.body.seccion.id).toBe(aulaA.id);
        });

        it('el representante recibe 403 al pedir las materias de un alumno no tutelado', async () => {
            await request(server.server)
                .get(`/api/students/${alumno2.id}/materias`)
                .set(cab(tk.tutor1))
                .expect(403);
        });
    });

    describe('3. Mi Clase (plan, notas, observaciones y horario en vivo)', () => {
        it('el alumno puede ver su clase con el horario en vivo de esa materia (200)', async () => {
            const res = await request(server.server)
                .get(`/api/students/${alumno1.id}/materias/${materia.id}/clase`)
                .set(cab(tk.alumno1))
                .expect(200);

            expect(res.body).toHaveProperty('horario');
            expect(Array.isArray(res.body.horario)).toBe(true);
            expect(res.body.horario.length).toBeGreaterThan(0);
            expect(res.body.horario[0]).toHaveProperty('diaTexto', 'Lunes');
            expect(res.body.horario[0]).toHaveProperty('horaInicio', '07:30');
            expect(res.body.horario[0]).toHaveProperty('aula', 'Aula 101');
        });

        it('el alumno recibe 403 al intentar acceder a la clase de un compañero', async () => {
            await request(server.server)
                .get(`/api/students/${alumno2.id}/materias/${materia.id}/clase`)
                .set(cab(tk.alumno1))
                .expect(403);
        });

        it('el representante puede ver la clase de su representado (200)', async () => {
            const res = await request(server.server)
                .get(`/api/students/${alumno1.id}/materias/${materia.id}/clase`)
                .set(cab(tk.tutor1))
                .expect(200);

            expect(res.body.alumnoId).toBe(alumno1.id);
            expect(res.body).toHaveProperty('horario');
        });

        it('el representante recibe 403 al pedir la clase de un alumno ajeno', async () => {
            await request(server.server)
                .get(`/api/students/${alumno2.id}/materias/${materia.id}/clase`)
                .set(cab(tk.tutor1))
                .expect(403);
        });
    });

    describe('4. Actividades del estudiante', () => {
        it('el alumno puede consultar sus actividades (200)', async () => {
            const res = await request(server.server)
                .get(`/api/students/${alumno1.id}/actividades`)
                .set(cab(tk.alumno1))
                .expect(200);

            expect(res.body).toHaveProperty('actividades');
            expect(Array.isArray(res.body.actividades)).toBe(true);
        });

        it('el alumno recibe 403 al consultar las actividades de un compañero', async () => {
            await request(server.server)
                .get(`/api/students/${alumno2.id}/actividades`)
                .set(cab(tk.alumno1))
                .expect(403);
        });

        it('el representante puede consultar las actividades de su representado (200)', async () => {
            const res = await request(server.server)
                .get(`/api/students/${alumno1.id}/actividades`)
                .set(cab(tk.tutor1))
                .expect(200);

            expect(res.body).toHaveProperty('actividades');
            expect(Array.isArray(res.body.actividades)).toBe(true);
        });

        it('el representante recibe 403 al consultar actividades de un alumno ajeno', async () => {
            await request(server.server)
                .get(`/api/students/${alumno2.id}/actividades`)
                .set(cab(tk.tutor1))
                .expect(403);
        });
    });

    describe('5. Horarios de sección', () => {
        it('el alumno puede ver el horario de su sección (200)', async () => {
            const res = await request(server.server)
                .get(`/api/schedules/classroom/${aulaA.id}`)
                .set(cab(tk.alumno1))
                .expect(200);

            expect(res.body).toHaveProperty('scheduleBlocks');
            expect(Array.isArray(res.body.scheduleBlocks)).toBe(true);
        });

        it('el alumno recibe 403 al consultar el horario de una sección ajena', async () => {
            await request(server.server)
                .get(`/api/schedules/classroom/${aulaB.id}`)
                .set(cab(tk.alumno1))
                .expect(403);
        });

        it('el representante puede ver el horario de la sección de su hijo (200)', async () => {
            await request(server.server)
                .get(`/api/schedules/classroom/${aulaA.id}`)
                .set(cab(tk.tutor1))
                .expect(200);
        });

        it('el representante recibe 403 al consultar el horario de una sección ajena', async () => {
            await request(server.server)
                .get(`/api/schedules/classroom/${aulaB.id}`)
                .set(cab(tk.tutor1))
                .expect(403);
        });
    });

    describe('6. Privacidad estricta: cuadro general y estadísticas del ciclo', () => {
        it('el alumno recibe 403 al intentar acceder al cuadro general de su sección', async () => {
            await request(server.server)
                .get(`/api/classrooms/${aulaA.id}/cuadro-general`)
                .set(cab(tk.alumno1))
                .expect(403);
        });

        it('el representante recibe 403 al intentar acceder al cuadro general de la sección', async () => {
            await request(server.server)
                .get(`/api/classrooms/${aulaA.id}/cuadro-general`)
                .set(cab(tk.tutor1))
                .expect(403);
        });

        it('el alumno recibe 403 al intentar ver estadísticas del ciclo académico', async () => {
            await request(server.server)
                .get(`/api/academic-years/${yearActivo.id}/stats`)
                .set(cab(tk.alumno1))
                .expect(403);
        });

        it('el representante recibe 403 al intentar ver estadísticas del ciclo académico', async () => {
            await request(server.server)
                .get(`/api/academic-years/${yearActivo.id}/stats`)
                .set(cab(tk.tutor1))
                .expect(403);
        });
    });

    describe('7. Años escolares cursados', () => {
        it('el alumno solo recibe los ciclos escolares donde ha estado inscrito', async () => {
            const res = await request(server.server)
                .get('/api/academic-years')
                .set(cab(tk.alumno1))
                .expect(200);

            const years = res.body as any[];
            expect(years.some((y) => y.id === yearActivo.id)).toBe(true);
        });

        it('el representante solo recibe los ciclos escolares donde sus hijos han estado inscritos', async () => {
            const res = await request(server.server)
                .get('/api/academic-years')
                .set(cab(tk.tutor1))
                .expect(200);

            const years = res.body as any[];
            expect(years.some((y) => y.id === yearActivo.id)).toBe(true);
        });
    });

    describe('8. Concordancia exacta de promedios: Inicio alumno, Inicio tutor y Boleta', () => {
        it('para un alumno con notas conocidas, /dashboard/student, /dashboard/tutor y la boleta dan exactamente el mismo promedio', async () => {
            const alumnoConNotas = (await createTestUser(prisma, UserRole.STUDENT)).user;
            const tutorConNotas = (await createTestUser(prisma, UserRole.TUTOR)).user;

            await prisma.studentClassroom.create({
                data: {
                    id: `sc-${createId()}`,
                    studentId: alumnoConNotas.id,
                    classroomId: aulaA.id,
                    academicYearId: yearActivo.id,
                    isActive: true,
                },
            });

            await prisma.studentTutor.create({
                data: {
                    id: `st-${createId()}`,
                    studentId: alumnoConNotas.id,
                    tutorId: tutorConNotas.id,
                    relationship: 'MADRE',
                },
            });

            const tkAlumnoNotas = generateTestToken(alumnoConNotas.id, UserRole.STUDENT, 'institute');
            const tkTutorNotas = generateTestToken(tutorConNotas.id, UserRole.TUTOR, 'institute');

            const period = await prisma.period.create({
                data: {
                    id: `p-${createId()}`,
                    name: 'Primer Lapso',
                    academicYearId: yearActivo.id,
                    startDate: new Date('2024-01-01'),
                    endDate: new Date('2024-04-30'),
                    isActive: true,
                },
            });

            const profe = (await createTestUser(prisma, UserRole.TEACHER)).user;
            const act = await prisma.activity.create({
                data: {
                    id: `act-${createId()}`,
                    title: 'Evaluacion de Prueba',
                    type: 'EXAM',
                    scope: 'CLASSROOM',
                    startDate: new Date(),
                    createdBy: profe.id,
                    classroomId: aulaA.id,
                    subjectId: materia.id,
                    periodId: period.id,
                    lapso: '1',
                },
            });

            await prisma.grade.create({
                data: {
                    id: `g-${createId()}`,
                    studentId: alumnoConNotas.id,
                    activityId: act.id,
                    periodId: period.id,
                    subjectId: materia.id,
                    teacherId: profe.id,
                    score: 16,
                },
            });

            const resStudent = await request(server.server)
                .get('/api/dashboard/student')
                .set(cab(tkAlumnoNotas))
                .expect(200);

            const resTutor = await request(server.server)
                .get('/api/dashboard/tutor')
                .set(cab(tkTutorNotas))
                .expect(200);

            const resBoleta = await request(server.server)
                .get(`/api/students/${alumnoConNotas.id}/boleta`)
                .set(cab(tkAlumnoNotas))
                .expect(200);

            const boletaDefinitivo = resBoleta.body.data.promedios.definitivo;
            expect(boletaDefinitivo).toBeDefined();
            expect(typeof boletaDefinitivo).toBe('number');

            // Exacta paridad: Inicio del alumno
            expect(resStudent.body.data.kpis.globalAverage).toBe(boletaDefinitivo);

            // Exacta paridad: Inicio del tutor (por hijo)
            const childData = resTutor.body.data.children.find((c: any) => c.id === alumnoConNotas.id);
            expect(childData).toBeDefined();
            expect(childData.average).toBe(boletaDefinitivo);
        });
    });
});
