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
    createTestUserWithPassword,
    generateTestToken,
    createTestAcademicYear,
    createTestSubject,
} from '../helpers';

/**
 * LAS ACCIONES QUE NADIE PROBABA
 *
 * Se le preguntó al servidor por sus rutas (`printRoutes`, igual que hace
 * `ninguna-puerta-abierta.test.ts`) y se buscó cada una en los 73 archivos de
 * prueba del repositorio. 28 no aparecían en ninguno.
 *
 * Este archivo cubre las que tocan datos del liceo: observaciones de conducta,
 * alumnos, notas, horarios y sesiones abiertas. El monitoreo interno del
 * superadministrador se deja para después, a propósito: si falla, no se pierde
 * ninguna nota.
 *
 * Lo que apareció al escribirlas está en la sección 33 de la auditoría.
 */

const SLUG = 'test-institute';

function gId(): string {
    // Siempre la 'c' delante: ver la nota de `tests/helpers.ts`.
    return `c${createId()}`;
}

describe('Acciones de la API que no tenían ninguna prueba', () => {
    let server: FastifyInstance;
    let prisma: PrismaClient;

    let year: any;
    let lapso: any;
    let seccionA: any;
    let seccionB: any;
    let materia: any;
    let profeA: any;
    let profeB: any;
    let admin: any;
    let alumnoA: any;
    let alumnoB: any;
    let tokenProfeA: string;
    let tokenProfeB: string;
    let tokenAdmin: string;
    let tokenAlumnoA: string;
    let tokenAlumnoB: string;

    const auth = (token: string) => ({
        Authorization: `Bearer ${token}`,
        'X-Institute-Slug': SLUG,
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

        seccionA = await prisma.classroom.create({
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
        seccionB = await prisma.classroom.create({
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

        profeA = (await createTestUser(prisma, UserRole.TEACHER)).user;
        profeB = (await createTestUser(prisma, UserRole.TEACHER)).user;
        admin = (await createTestUser(prisma, UserRole.ADMIN)).user;
        alumnoA = (await createTestUser(prisma, UserRole.STUDENT)).user;
        alumnoB = (await createTestUser(prisma, UserRole.STUDENT)).user;

        await prisma.classroomSubject.create({
            data: {
                classroomId: seccionA.id,
                subjectId: materia.id,
                teacherId: profeA.id,
                weeklyBlocks: 10,
            },
        });
        await prisma.classroomSubject.create({
            data: {
                classroomId: seccionB.id,
                subjectId: materia.id,
                teacherId: profeB.id,
                weeklyBlocks: 10,
            },
        });

        lapso = await prisma.period.create({
            data: {
                id: gId(),
                name: 'Primer Lapso',
                startDate: new Date('2024-01-01'),
                endDate: new Date('2024-04-30'),
                isActive: true,
                academicYearId: year.id,
            },
        });

        await prisma.studentClassroom.create({
            data: {
                studentId: alumnoA.id,
                classroomId: seccionA.id,
                academicYearId: year.id,
                isActive: true,
            },
        });
        await prisma.studentClassroom.create({
            data: {
                studentId: alumnoB.id,
                classroomId: seccionB.id,
                academicYearId: year.id,
                isActive: true,
            },
        });

        tokenProfeA = generateTestToken(profeA.id, UserRole.TEACHER, 'institute');
        tokenProfeB = generateTestToken(profeB.id, UserRole.TEACHER, 'institute');
        tokenAdmin = generateTestToken(admin.id, UserRole.ADMIN, 'institute');
        tokenAlumnoA = generateTestToken(alumnoA.id, UserRole.STUDENT, 'institute');
        tokenAlumnoB = generateTestToken(alumnoB.id, UserRole.STUDENT, 'institute');
    });

    // ─────────────────────────────────────────────────────────────────────────
    // OBSERVACIONES DE CONDUCTA
    //
    // Una observación dice, con nombre y apellido, que un alumno se portó mal,
    // llegó tarde o tuvo un problema. Es de lo más delicado que guarda el liceo.
    // ─────────────────────────────────────────────────────────────────────────

    async function sesionConObservacion() {
        const sesion = await prisma.classSession.create({
            data: {
                id: gId(),
                date: new Date('2024-03-05'),
                topic: 'Clase del martes',
                subjectId: materia.id,
                classroomId: seccionA.id,
            },
        });
        await prisma.observation.create({
            data: {
                id: gId(),
                title: 'Llegó tarde y molestó en clase',
                description: 'Interrumpió tres veces',
                type: 'NEGATIVA',
                date: new Date('2024-03-05'),
                studentId: alumnoA.id,
                createdById: profeA.id,
                classroomId: seccionA.id,
                subjectId: materia.id,
                classSessionId: sesion.id,
                instituteId: 'institute',
            },
        });
        return sesion;
    }

    it('OBS-01: el profesor de esa clase ve las observaciones de su sesión', async () => {
        const sesion = await sesionConObservacion();

        const res = await request(server.server)
            .get(`/api/observations/session/${sesion.id}`)
            .set(auth(tokenProfeA))
            .expect(200);

        const lista = res.body.observations ?? res.body.data ?? res.body;
        expect(JSON.stringify(lista)).toContain('Llegó tarde y molestó en clase');
    });

    it('OBS-02: un alumno NO puede leer las observaciones de una sesión', async () => {
        const sesion = await sesionConObservacion();

        // Ni las suyas por esta puerta: la conducta la lee el profesor, no el
        // alumno, y menos la de sus compañeros que vienen en la misma respuesta.
        const res = await request(server.server)
            .get(`/api/observations/session/${sesion.id}`)
            .set(auth(tokenAlumnoA));

        expect(res.status).toBe(403);
    });

    it('OBS-03: un profesor ajeno a esa clase NO ve sus observaciones', async () => {
        const sesion = await sesionConObservacion();

        const res = await request(server.server)
            .get(`/api/observations/session/${sesion.id}`)
            .set(auth(tokenProfeB));

        expect(res.status).toBe(403);
    });

    it('OBS-04: un alumno NO puede leer las observaciones de una materia de otra sección', async () => {
        await sesionConObservacion();

        const res = await request(server.server)
            .get(`/api/observations/subject/${seccionA.id}/${materia.id}`)
            .set(auth(tokenAlumnoB));

        expect(res.status).toBe(403);
    });

    it('OBS-05: un profesor ajeno NO ve las observaciones de una materia que no imparte', async () => {
        await sesionConObservacion();

        const res = await request(server.server)
            .get(`/api/observations/subject/${seccionA.id}/${materia.id}`)
            .set(auth(tokenProfeB));

        expect(res.status).toBe(403);
    });

    it('OBS-07: un profesor NO puede borrar la observación de una clase ajena', async () => {
        await sesionConObservacion();
        const obs = await prisma.observation.findFirst({ where: { classroomId: seccionA.id } });

        const res = await request(server.server)
            .delete(`/api/observations/${obs!.id}`)
            .set(auth(tokenProfeB));

        expect(res.status).toBe(403);

        // Y sigue ahí: el expediente del alumno no se toca desde fuera.
        expect(await prisma.observation.findUnique({ where: { id: obs!.id } })).not.toBeNull();
    });

    it('OBS-08: el profesor de esa clase sí puede borrar la suya', async () => {
        await sesionConObservacion();
        const obs = await prisma.observation.findFirst({ where: { classroomId: seccionA.id } });

        await request(server.server)
            .delete(`/api/observations/${obs!.id}`)
            .set(auth(tokenProfeA))
            .expect(200);

        expect(await prisma.observation.findUnique({ where: { id: obs!.id } })).toBeNull();

        // Nada se borra de verdad: queda la copia.
        const copia = await prisma.registroBorrado.findFirst({
            where: { tabla: 'observation', registroId: obs!.id },
        });
        expect(copia).not.toBeNull();
    });

    it('OBS-06: el administrador sí las ve', async () => {
        const sesion = await sesionConObservacion();

        await request(server.server)
            .get(`/api/observations/session/${sesion.id}`)
            .set(auth(tokenAdmin))
            .expect(200);

        await request(server.server)
            .get(`/api/observations/subject/${seccionA.id}/${materia.id}`)
            .set(auth(tokenAdmin))
            .expect(200);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // ALUMNOS DISPONIBLES PARA INSCRIBIR
    // ─────────────────────────────────────────────────────────────────────────

    it('ALU-01: un alumno ya inscrito este ciclo no aparece como disponible', async () => {
        const suelto = (await createTestUser(prisma, UserRole.STUDENT)).user;

        const res = await request(server.server)
            .get('/api/students/available')
            .query({ academicYearId: year.id })
            .set(auth(tokenAdmin))
            .expect(200);

        const cuerpo = res.body.students ?? res.body.data ?? res.body;
        const ids = (Array.isArray(cuerpo) ? cuerpo : []).map((s: any) => s.id);

        expect(ids).toContain(suelto.id);
        expect(ids).not.toContain(alumnoA.id);
        expect(ids).not.toContain(alumnoB.id);
    });

    it('ALU-02: un alumno no puede pedir la lista de alumnos disponibles', async () => {
        const res = await request(server.server)
            .get('/api/students/available')
            .set(auth(tokenAlumnoA));

        expect(res.status).toBe(403);
    });

    it('ALU-03: el expediente completo lo ve el propio alumno, no otro', async () => {
        await request(server.server)
            .get(`/api/students/${alumnoA.id}/complete-history`)
            .set(auth(tokenAlumnoA))
            .expect(200);

        const res = await request(server.server)
            .get(`/api/students/${alumnoA.id}/complete-history`)
            .set(auth(tokenAlumnoB));

        expect(res.status).toBe(403);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // NOTAS POR MATERIA
    // ─────────────────────────────────────────────────────────────────────────

    async function notaEn(classroomId: string, subjectId: string, studentId: string, valor: number) {
        const actividad = await prisma.activity.create({
            data: {
                id: gId(),
                title: `Actividad ${valor}`,
                type: 'EXAM',
                scope: 'CLASSROOM',
                startDate: new Date('2024-03-01'),
                maxGrade: 20,
                classroomId,
                subjectId,
                createdBy: profeA.id,
                isActive: true,
            },
        });
        return prisma.grade.create({
            data: {
                id: gId(),
                score: valor,
                studentId,
                activityId: actividad.id,
                periodId: lapso.id,
                subjectId,
                teacherId: profeA.id,
            },
        });
    }

    it('NOT-01: las notas de una materia solo traen las de esa materia', async () => {
        const otraMateria = await createTestSubject(prisma, 'institute');
        await prisma.classroomSubject.create({
            data: { classroomId: seccionA.id, subjectId: otraMateria.id, teacherId: profeA.id },
        });

        await notaEn(seccionA.id, materia.id, alumnoA.id, 18);
        await notaEn(seccionA.id, otraMateria.id, alumnoA.id, 9);

        const res = await request(server.server)
            .get(`/api/grades/subject/${materia.id}`)
            .set(auth(tokenAdmin))
            .expect(200);

        const notas = res.body.grades ?? res.body.data ?? [];
        expect(notas).toHaveLength(1);
        expect(Number(notas[0].score)).toBe(18);
    });

    it('NOT-02: un alumno no puede pedir las notas de una materia entera', async () => {
        await notaEn(seccionA.id, materia.id, alumnoA.id, 18);

        const res = await request(server.server)
            .get(`/api/grades/subject/${materia.id}`)
            .set(auth(tokenAlumnoA));

        expect(res.status).toBe(403);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // HORARIOS: CREAR, MOVER Y BORRAR UN BLOQUE
    // ─────────────────────────────────────────────────────────────────────────

    async function bloque(dia: number, desde: string, hasta: string) {
        const cs = await prisma.classroomSubject.findFirst({
            where: { classroomId: seccionA.id, subjectId: materia.id },
        });
        const res = await request(server.server)
            .post(`/api/schedules/classroom/${seccionA.id}/blocks`)
            .set(auth(tokenAdmin))
            .send({
                classroomSubjectId: cs!.id,
                dayOfWeek: dia,
                startTime: desde,
                endTime: hasta,
                blockType: 'CLASS',
            });
        return res;
    }

    it('HOR-01: se crea un bloque de horario y aparece en el horario de la sección', async () => {
        const creado = await bloque(1, '07:00', '07:45');
        expect(creado.status).toBe(201);

        const horario = await request(server.server)
            .get(`/api/schedules/classroom/${seccionA.id}`)
            .set(auth(tokenAdmin))
            .expect(200);

        expect(JSON.stringify(horario.body)).toContain('07:00');
    });

    it('HOR-02: dos bloques a la misma hora en la misma sección se rechazan', async () => {
        await prisma.classroomSubject.updateMany({
            where: { classroomId: seccionA.id, subjectId: materia.id },
            data: { weeklyBlocks: 10 },
        });

        expect((await bloque(1, '07:00', '07:45')).status).toBe(201);

        const choque = await bloque(1, '07:15', '08:00');
        expect(choque.status).toBe(400);
        expect(choque.body.code).toBe('SCHEDULE_OVERLAP');
    });

    it('HOR-03: mover un bloque encima de otro se rechaza', async () => {
        await prisma.classroomSubject.updateMany({
            where: { classroomId: seccionA.id, subjectId: materia.id },
            data: { weeklyBlocks: 10 },
        });

        const primero = await bloque(1, '07:00', '07:45');
        const segundo = await bloque(1, '08:00', '08:45');
        expect(primero.status).toBe(201);
        expect(segundo.status).toBe(201);

        const idSegundo = segundo.body.scheduleBlock.id;

        // Se arrastra el segundo bloque encima del primero.
        const res = await request(server.server)
            .put(`/api/schedules/blocks/${idSegundo}`)
            .set(auth(tokenAdmin))
            .send({ startTime: '07:10', endTime: '07:55' });

        expect(res.status).toBe(400);

        // Y no se movió: el horario no puede quedar con dos clases a la vez.
        const enBase = await prisma.scheduleBlock.findUnique({ where: { id: idSegundo } });
        expect(enBase!.startTime).toBe('08:00');
    });

    it('HOR-03b: mover un bloque no puede poner al profesor en dos aulas a la vez', async () => {
        // El mismo profesor da la materia en las dos secciones.
        await prisma.classroomSubject.updateMany({
            where: { classroomId: seccionB.id, subjectId: materia.id },
            data: { teacherId: profeA.id, weeklyBlocks: 10 },
        });

        const csB = await prisma.classroomSubject.findFirst({
            where: { classroomId: seccionB.id, subjectId: materia.id },
        });

        // Lunes 07:00 en la sección A.
        expect((await bloque(1, '07:00', '07:45')).status).toBe(201);

        // Lunes 09:00 en la sección B, con el mismo profesor.
        const enB = await request(server.server)
            .post(`/api/schedules/classroom/${seccionB.id}/blocks`)
            .set(auth(tokenAdmin))
            .send({
                classroomSubjectId: csB!.id,
                dayOfWeek: 1,
                startTime: '09:00',
                endTime: '09:45',
                blockType: 'CLASS',
            });
        expect(enB.status).toBe(201);

        // Se arrastra el de la sección B a la misma hora que el de la A.
        const res = await request(server.server)
            .put(`/api/schedules/blocks/${enB.body.scheduleBlock.id}`)
            .set(auth(tokenAdmin))
            .send({ startTime: '07:15', endTime: '08:00' });

        expect(res.status).toBe(400);

        const enBase = await prisma.scheduleBlock.findUnique({
            where: { id: enB.body.scheduleBlock.id },
        });
        expect(enBase!.startTime).toBe('09:00');
    });

    it('HOR-04: borrar un bloque que no existe dice que no existe, no "error interno"', async () => {
        const res = await request(server.server)
            .delete(`/api/schedules/blocks/${gId()}`)
            .set(auth(tokenAdmin));

        expect(res.status).toBe(404);
        expect(res.body.code).toBe('SCHEDULE_BLOCK_NOT_FOUND');
    });

    it('HOR-05: borrar un bloque deja copia en la papelera', async () => {
        const creado = await bloque(1, '07:00', '07:45');
        const id = creado.body.scheduleBlock.id;

        await request(server.server)
            .delete(`/api/schedules/blocks/${id}`)
            .set(auth(tokenAdmin))
            .expect(200);

        expect(await prisma.scheduleBlock.findUnique({ where: { id } })).toBeNull();

        const copia = await prisma.registroBorrado.findFirst({
            where: { tabla: 'scheduleBlock', registroId: id },
        });
        expect(copia).not.toBeNull();
    });

    it('HOR-06: un profesor no puede crear, mover ni borrar bloques de horario', async () => {
        const cs = await prisma.classroomSubject.findFirst({
            where: { classroomId: seccionA.id, subjectId: materia.id },
        });

        const creando = await request(server.server)
            .post(`/api/schedules/classroom/${seccionA.id}/blocks`)
            .set(auth(tokenProfeA))
            .send({
                classroomSubjectId: cs!.id,
                dayOfWeek: 1,
                startTime: '07:00',
                endTime: '07:45',
                blockType: 'CLASS',
            });
        expect(creando.status).toBe(403);

        const creado = await bloque(1, '09:00', '09:45');
        const id = creado.body.scheduleBlock.id;

        const moviendo = await request(server.server)
            .put(`/api/schedules/blocks/${id}`)
            .set(auth(tokenProfeA))
            .send({ startTime: '10:00', endTime: '10:45' });
        expect(moviendo.status).toBe(403);

        const borrando = await request(server.server)
            .delete(`/api/schedules/blocks/${id}`)
            .set(auth(tokenProfeA));
        expect(borrando.status).toBe(403);

        // Y sigue donde estaba.
        const enBase = await prisma.scheduleBlock.findUnique({ where: { id } });
        expect(enBase!.startTime).toBe('09:00');
    });

    it('HOR-07: el resumen de horarios del ciclo responde con datos', async () => {
        await bloque(1, '07:00', '07:45');

        const res = await request(server.server)
            .get(`/api/schedules/summary/${year.id}`)
            .set(auth(tokenAdmin))
            .expect(200);

        expect(JSON.stringify(res.body)).toContain(seccionA.name);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // SESIONES ABIERTAS
    // ─────────────────────────────────────────────────────────────────────────

    it('SES-01: "cerrar las otras sesiones" cierra las otras y deja la actual', async () => {
        const u = await createTestUserWithPassword(prisma, UserRole.ADMIN, 'ClaveDePrueba123!');

        const entrar = () =>
            request(server.server)
                .post('/api/auth/login')
                .set('X-Institute-Slug', SLUG)
                .send({ email: u.user.email, password: 'ClaveDePrueba123!' })
                .expect(200);

        const telefono = await entrar();
        const tableta = await entrar();
        const computadora = await entrar();

        expect(await prisma.refreshToken.count({ where: { userId: u.user.id } })).toBe(3);

        const res = await request(server.server)
            .delete('/api/auth/sessions/others')
            .set(auth(computadora.body.tokens.accessToken))
            .set('X-Refresh-Token', computadora.body.tokens.refreshToken)
            .expect(200);

        expect(res.body.revokedCount).toBe(2);
        expect(await prisma.refreshToken.count({ where: { userId: u.user.id } })).toBe(1);

        // La sesión desde la que se pidió sigue sirviendo para renovar...
        await request(server.server)
            .post('/api/auth/refresh-token')
            .set('X-Institute-Slug', SLUG)
            .send({ refreshToken: computadora.body.tokens.refreshToken })
            .expect(200);

        // ...y las otras dos, no.
        for (const otra of [telefono, tableta]) {
            const r = await request(server.server)
                .post('/api/auth/refresh-token')
                .set('X-Institute-Slug', SLUG)
                .send({ refreshToken: otra.body.tokens.refreshToken });
            expect(r.status).toBeGreaterThanOrEqual(400);
        }
    });

    // ─────────────────────────────────────────────────────────────────────────
    // CONTADORES DEL PANEL DE USUARIOS
    // ─────────────────────────────────────────────────────────────────────────

    it('USU-01: el conteo de usuarios por rol cuadra con lo que hay', async () => {
        const res = await request(server.server)
            .get('/api/users/stats')
            .set(auth(tokenAdmin))
            .expect(200);

        const stats = res.body.stats;
        const enBase = {
            ADMIN: await prisma.user.count({ where: { role: UserRole.ADMIN } }),
            TEACHER: await prisma.user.count({ where: { role: UserRole.TEACHER } }),
            STUDENT: await prisma.user.count({ where: { role: UserRole.STUDENT } }),
            TUTOR: await prisma.user.count({ where: { role: UserRole.TUTOR } }),
        };

        expect(stats.byRole).toEqual(enBase);
        expect(stats.total).toBe(await prisma.user.count());
        expect(stats.byRole.ADMIN + stats.byRole.TEACHER + stats.byRole.STUDENT + stats.byRole.TUTOR)
            .toBe(stats.total);
    });

    it('USU-02: la lista por rol trae solo ese rol y nunca la contraseña', async () => {
        const res = await request(server.server)
            .get('/api/users/role/TEACHER')
            .set(auth(tokenAdmin))
            .expect(200);

        expect(res.body.users.length).toBe(2);
        for (const u of res.body.users) {
            expect(u.role).toBe('TEACHER');
            expect(u).not.toHaveProperty('password');
        }
    });

    it('USU-03: un profesor no puede pedir el listado de usuarios por rol', async () => {
        const res = await request(server.server)
            .get('/api/users/role/STUDENT')
            .set(auth(tokenProfeA));

        expect(res.status).toBe(403);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // MATERIAS DISPONIBLES E HISTORIAL DE PROFESOR DE UNA SECCIÓN
    // ─────────────────────────────────────────────────────────────────────────

    it('SEC-01: las materias disponibles de una sección excluyen las ya asignadas', async () => {
        const libre = await createTestSubject(prisma, 'institute');

        const res = await request(server.server)
            .get(`/api/classrooms/${seccionA.id}/subjects-available`)
            .set(auth(tokenAdmin))
            .expect(200);

        const cuerpo = res.body.data ?? res.body.subjects ?? res.body;
        const ids = (Array.isArray(cuerpo) ? cuerpo : []).map((s: any) => s.id);

        expect(ids).toContain(libre.id);
        expect(ids).not.toContain(materia.id);
    });

    it('SEC-02: el historial de profesores de una materia en una sección responde', async () => {
        const res = await request(server.server)
            .get(`/api/classrooms/${seccionA.id}/subjects/${materia.id}/teacher-history`)
            .set(auth(tokenAdmin));

        expect(res.status).toBe(200);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // AVISOS
    // ─────────────────────────────────────────────────────────────────────────

    it('AVI-01: el contador de avisos sin leer cuadra con los avisos que hay', async () => {
        await prisma.notification.createMany({
            data: [
                {
                    id: gId(),
                    title: 'Aviso leído',
                    message: 'x',
                    type: 'INFO',
                    priority: 'NORMAL',
                    recipientId: alumnoA.id,
                    readAt: new Date(),
                },
                {
                    id: gId(),
                    title: 'Aviso sin leer 1',
                    message: 'x',
                    type: 'INFO',
                    priority: 'NORMAL',
                    recipientId: alumnoA.id,
                },
                {
                    id: gId(),
                    title: 'Aviso sin leer 2',
                    message: 'x',
                    type: 'INFO',
                    priority: 'NORMAL',
                    recipientId: alumnoA.id,
                },
                {
                    id: gId(),
                    title: 'Aviso de otro',
                    message: 'x',
                    type: 'INFO',
                    priority: 'NORMAL',
                    recipientId: alumnoB.id,
                },
            ],
        });

        const res = await request(server.server)
            .get('/api/notifications/my-notifications/stats')
            .set(auth(tokenAlumnoA))
            .expect(200);

        const texto = JSON.stringify(res.body);
        const stats = res.body.data ?? res.body.stats ?? res.body;

        // El contador es del que pregunta: el aviso del compañero no cuenta.
        expect(stats.unread ?? stats.unreadCount).toBe(2);
        expect(stats.total).toBe(3);
        expect(texto).not.toContain('Aviso de otro');
    });
});
