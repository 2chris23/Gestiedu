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
 * PANTALLAS DEL PROFESOR (FASE D)
 *
 * Verificación estricta de permisos y alcances del rol TEACHER:
 * 1. Académico: solo ciclos donde dio clase o fue guía; dentro del ciclo,
 *    solo sus secciones; dentro de la sección, solo sus materias.
 * 2. Bloqueo 403 al abrir una materia de otro profesor.
 * 3. Horarios: solo su propio horario en modo lectura; 403 al consultar
 *    horarios de otros docentes o intentar guardar bloques.
 * 4. Mi sección guía: listado de secciones guía y cuadro general con notas.
 *    403 al consultar cuadro general de sección no autorizada.
 * 5. Observaciones: filtrado estricto para ver solo las creadas por él
 *    si no es el guía de la sección.
 */

const SLUG = 'test-institute';

describe('Fase D — Pantallas y permisos del profesor', () => {
    let server: FastifyInstance;
    let prisma: PrismaClient;

    let yearActivo: any;
    let yearAjeno: any;
    let aulaGuia: any;
    let aulaDondeDaClase: any;
    let aulaAjena: any;
    let materiaProfe: any;
    let materiaOtro: any;
    let profe: any;
    let profe2: any;
    let admin: any;

    const tk: Record<string, string> = {};
    const cab = (token: string) => ({ Authorization: `Bearer ${token}`, 'X-Institute-Slug': SLUG });

    beforeAll(async () => {
        server = await createTestServer();
        prisma = await createTestPrismaClient();

        admin = (await createTestUser(prisma, UserRole.ADMIN)).user;
        profe = (await createTestUser(prisma, UserRole.TEACHER)).user;
        profe2 = (await createTestUser(prisma, UserRole.TEACHER)).user;

        // Dos ciclos escolares: uno donde el profesor tiene actividad y otro ajeno
        yearActivo = await createTestAcademicYear(prisma, 'institute');
        yearAjeno = await prisma.academicYear.create({
            data: {
                id: `ay-${createId()}`,
                name: 'Ciclo 2024-2025 Sin Profe',
                startDate: new Date('2024-09-01'),
                endDate: new Date('2025-07-31'),
                status: 'COMPLETED',
                instituteId: 'institute',
            },
        });

        // Sección del ciclo ajeno (el profesor no participa aquí)
        await prisma.classroom.create({
            data: {
                id: `c${createId()}`,
                name: '1er Año Única Ajena',
                slug: `aula-ajena-ano-${createId()}`,
                grade: 1,
                section: 'A',
                capacity: 30,
                academicYearId: yearAjeno.id,
                instituteId: 'institute',
                teacherId: profe2.id,
            },
        });

        // Secciones del ciclo activo
        aulaGuia = await prisma.classroom.create({
            data: {
                id: `c${createId()}`,
                name: '1er Año A (Guía)',
                slug: `aula-guia-${createId()}`,
                grade: 1,
                section: 'A',
                capacity: 30,
                academicYearId: yearActivo.id,
                instituteId: 'institute',
                teacherId: profe.id,
            },
        });

        aulaDondeDaClase = await prisma.classroom.create({
            data: {
                id: `c${createId()}`,
                name: '1er Año B (Clase)',
                slug: `aula-clase-${createId()}`,
                grade: 1,
                section: 'B',
                capacity: 30,
                academicYearId: yearActivo.id,
                instituteId: 'institute',
                teacherId: profe2.id,
            },
        });

        aulaAjena = await prisma.classroom.create({
            data: {
                id: `c${createId()}`,
                name: '2do Año C (Ajena)',
                slug: `aula-ajena-${createId()}`,
                grade: 2,
                section: 'C',
                capacity: 30,
                academicYearId: yearActivo.id,
                instituteId: 'institute',
                teacherId: profe2.id,
            },
        });

        // Materias en aulaDondeDaClase
        materiaProfe = await createTestSubject(prisma, 'institute');
        materiaOtro = await createTestSubject(prisma, 'institute');

        await prisma.classroomSubject.create({
            data: {
                classroomId: aulaDondeDaClase.id,
                subjectId: materiaProfe.id,
                teacherId: profe.id,
            },
        });

        await prisma.classroomSubject.create({
            data: {
                classroomId: aulaDondeDaClase.id,
                subjectId: materiaOtro.id,
                teacherId: profe2.id,
            },
        });

        // Tokens
        tk.admin = generateTestToken(admin.id, UserRole.ADMIN, 'institute');
        tk.profe = generateTestToken(profe.id, UserRole.TEACHER, 'institute');
        tk.profe2 = generateTestToken(profe2.id, UserRole.TEACHER, 'institute');
    });

    afterAll(async () => {
        await prisma.$disconnect();
        await server.close();
    });

    describe('1. Ciclos escolares para el profesor', () => {
        it('el profesor solo ve los ciclos donde dio clase o fue guía', async () => {
            const res = await request(server.server)
                .get('/api/academic-years')
                .set(cab(tk.profe))
                .expect(200);

            const ids = (res.body as any[]).map((y) => y.id);
            expect(ids).toContain(yearActivo.id);
            expect(ids).not.toContain(yearAjeno.id);
        });

        it('el administrador ve todos los ciclos escolares', async () => {
            const res = await request(server.server)
                .get('/api/academic-years')
                .set(cab(tk.admin))
                .expect(200);

            const ids = (res.body as any[]).map((y) => y.id);
            expect(ids).toContain(yearActivo.id);
            expect(ids).toContain(yearAjeno.id);
        });
    });

    describe('2. Materias dentro de la sección', () => {
        it('el profesor solo recibe sus materias asignadas en la sección', async () => {
            const res = await request(server.server)
                .get(`/api/classrooms/${aulaDondeDaClase.id}/subjects`)
                .set(cab(tk.profe))
                .expect(200);

            const subjects = res.body.subjects || [];
            const subjectIds = subjects.map((s: any) => s.subjectId);

            expect(subjectIds).toContain(materiaProfe.id);
            expect(subjectIds).not.toContain(materiaOtro.id);
        });

        it('el administrador recibe todas las materias asignadas a la sección', async () => {
            const res = await request(server.server)
                .get(`/api/classrooms/${aulaDondeDaClase.id}/subjects`)
                .set(cab(tk.admin))
                .expect(200);

            const subjects = res.body.subjects || [];
            const subjectIds = subjects.map((s: any) => s.subjectId);

            expect(subjectIds).toContain(materiaProfe.id);
            expect(subjectIds).toContain(materiaOtro.id);
        });

        it('el profesor puede ver el detalle de su materia asignada', async () => {
            await request(server.server)
                .get(`/api/classrooms/${aulaDondeDaClase.id}/subjects/${materiaProfe.id}`)
                .set(cab(tk.profe))
                .expect(200);
        });

        it('el profesor recibe 403 FORBIDDEN si abre una materia asignada a otro docente', async () => {
            const res = await request(server.server)
                .get(`/api/classrooms/${aulaDondeDaClase.id}/subjects/${materiaOtro.id}`)
                .set(cab(tk.profe))
                .expect(403);

            expect(res.body.code).toBe('FORBIDDEN');
        });
    });

    describe('3. Horarios: solo su propio horario en modo lectura', () => {
        it('el profesor puede consultar su propio horario', async () => {
            const res = await request(server.server)
                .get(`/api/schedules/teacher/${profe.id}/blocks`)
                .set(cab(tk.profe))
                .expect(200);

            expect(Array.isArray(res.body.scheduleBlocks)).toBe(true);
        });

        it('el profesor recibe 403 al intentar consultar el horario de otro profesor', async () => {
            const res = await request(server.server)
                .get(`/api/schedules/teacher/${profe2.id}/blocks`)
                .set(cab(tk.profe))
                .expect(403);

            expect(res.body.code).toBe('FORBIDDEN');
        });

        it('el profesor recibe 403 al intentar guardar o editar bloques de horario', async () => {
            await request(server.server)
                .post(`/api/schedules/teacher/${profe.id}/bulk`)
                .set(cab(tk.profe))
                .send({ created: [], updated: [], deletedIds: [] })
                .expect(403);
        });
    });

    describe('4. Mi sección guía', () => {
        it('GET /api/classrooms/mis-secciones-guia devuelve la sección donde es guía', async () => {
            const res = await request(server.server)
                .get('/api/classrooms/mis-secciones-guia')
                .set(cab(tk.profe))
                .expect(200);

            const classrooms = res.body.classrooms || [];
            const ids = classrooms.map((c: any) => c.id);
            expect(ids).toContain(aulaGuia.id);
            expect(ids).not.toContain(aulaDondeDaClase.id);
            expect(ids).not.toContain(aulaAjena.id);
        });

        it('GET /api/classrooms/:id/cuadro-general funciona para la sección que guía', async () => {
            const res = await request(server.server)
                .get(`/api/classrooms/${aulaGuia.id}/cuadro-general`)
                .set(cab(tk.profe))
                .expect(200);

            expect(res.body.data).toBeDefined();
            expect(res.body.data.classroom.id).toBe(aulaGuia.id);
            expect(Array.isArray(res.body.data.students)).toBe(true);
            expect(Array.isArray(res.body.data.subjects)).toBe(true);
        });

        it('GET /api/classrooms/:id/cuadro-general responde 403 para una sección que no guía', async () => {
            const res = await request(server.server)
                .get(`/api/classrooms/${aulaAjena.id}/cuadro-general`)
                .set(cab(tk.profe))
                .expect(403);

            expect(res.body.code).toBe('FORBIDDEN');
        });

        it('el alumno de la sección y su representante reciben 403: son las notas de todos', async () => {
            const alumno = (await createTestUser(prisma, UserRole.STUDENT)).user;
            const tutor = (await createTestUser(prisma, UserRole.TUTOR)).user;
            await prisma.studentClassroom.create({
                data: { studentId: alumno.id, classroomId: aulaGuia.id, academicYearId: yearActivo.id, isActive: true },
            });
            await prisma.studentTutor.create({ data: { id: `c${createId()}`, studentId: alumno.id, tutorId: tutor.id, relationship: 'Madre' } as any });

            for (const [id, rol] of [[alumno.id, UserRole.STUDENT], [tutor.id, UserRole.TUTOR]] as const) {
                const res = await request(server.server)
                    .get(`/api/classrooms/${aulaGuia.id}/cuadro-general`)
                    .set(cab(generateTestToken(id, rol, 'institute')));
                expect(res.status).toBe(403);
                expect(JSON.stringify(res.body)).not.toContain('grades');
            }
        });
    });

    describe('5. Observaciones', () => {
        it('un profesor no guía solo recibe sus propias observaciones en la sección', async () => {
            // Creamos un alumno y dos observaciones: una del profesor y una de otro docente
            const alumno = (await createTestUser(prisma, UserRole.STUDENT)).user;
            await prisma.studentClassroom.create({
                data: {
                    id: `sc-${createId()}`,
                    studentId: alumno.id,
                    classroomId: aulaDondeDaClase.id,
                    academicYearId: yearActivo.id,
                    isActive: true,
                },
            });

            const obsProfe = await prisma.observation.create({
                data: {
                    title: 'Observación del profesor',
                    description: 'Detalle de observación',
                    type: 'ACADEMIC',
                    studentId: alumno.id,
                    classroomId: aulaDondeDaClase.id,
                    createdById: profe.id,
                    instituteId: 'institute',
                },
            });

            const obsOtro = await prisma.observation.create({
                data: {
                    title: 'Observación de otro profesor',
                    description: 'Detalle de observación ajena',
                    type: 'ACADEMIC',
                    studentId: alumno.id,
                    classroomId: aulaDondeDaClase.id,
                    createdById: profe2.id,
                    instituteId: 'institute',
                },
            });

            const res = await request(server.server)
                .get(`/api/observations/classroom/${aulaDondeDaClase.id}`)
                .set(cab(tk.profe))
                .expect(200);

            const observaciones = res.body.observations || [];
            const ids = observaciones.map((o: any) => o.id);

            expect(ids).toContain(obsProfe.id);
            expect(ids).not.toContain(obsOtro.id);
        });
    });
});
