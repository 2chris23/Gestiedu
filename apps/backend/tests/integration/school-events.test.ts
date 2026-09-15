import { FastifyInstance } from 'fastify';
import request = require('supertest');
import { PrismaClient } from '@prisma/client';
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
 * EVENTOS DEL LICEO
 *
 * Un evento siempre suspende las clases de su franja y alcance. Estos tests
 * fijan tres cosas:
 *   1. La vista de día, la vista previa y la suspensión real salen de la MISMA
 *      función: lo que promete la ventana es lo que pasa.
 *   2. El alcance (todo el liceo / años / secciones) filtra de verdad.
 *   3. Borrar el evento deshace SUS suspensiones y solo las suyas — la clase que
 *      un profesor suspendió a mano sigue suspendida.
 */

// 2026-09-14 es lunes (dayOfWeek = 1)
const MONDAY = '2026-09-14';

describe('Eventos del liceo', () => {
    let server: FastifyInstance;
    let prisma: PrismaClient;
    let adminToken: string;
    let teacherToken: string;
    let yearId: string;

    let classroomA: any; // 1er año A
    let classroomB: any; // 1er año B
    let classroomC: any; // 2do año A
    let csA: any;
    let csB: any;
    let csC: any;
    let eventId: string;

    const auth = (req: request.Test, token = adminToken) =>
        req.set('Authorization', `Bearer ${token}`).set('X-Institute-Slug', 'test-institute');

    const mkClassroom = (suffix: string, name: string, grade: number, section: string) =>
        prisma.classroom.create({
            data: {
                id: `ev${suffix}${Date.now()}`.substring(0, 24),
                name,
                slug: `ev-${suffix}-${Date.now()}`,
                grade,
                section,
                capacity: 30,
                academicYearId: yearId,
                instituteId: 'institute',
            },
        });

    beforeAll(async () => {
        server = await createTestServer();
        prisma = await createTestPrismaClient();

        const admin = await createTestUser(prisma, UserRole.ADMIN);
        adminToken = generateTestToken(admin.user.id, UserRole.ADMIN, 'institute');
        const teacher = await createTestUser(prisma, UserRole.TEACHER);
        teacherToken = generateTestToken(teacher.user.id, UserRole.TEACHER, 'institute');

        const year = await createTestAcademicYear(prisma, 'institute');
        yearId = year.id;

        classroomA = await mkClassroom('a', '1er Año A', 1, 'A');
        classroomB = await mkClassroom('b', '1er Año B', 1, 'B');
        classroomC = await mkClassroom('c', '2do Año A', 2, 'A');

        const s1 = await createTestSubject(prisma, 'institute');
        const s2 = await createTestSubject(prisma, 'institute');

        csA = await prisma.classroomSubject.create({
            data: { classroomId: classroomA.id, subjectId: s1.id, teacherId: teacher.user.id, weeklyBlocks: 3 },
        });
        csB = await prisma.classroomSubject.create({
            data: { classroomId: classroomB.id, subjectId: s1.id, weeklyBlocks: 3 },
        });
        csC = await prisma.classroomSubject.create({
            data: { classroomId: classroomC.id, subjectId: s2.id, weeklyBlocks: 3 },
        });

        // Lunes 07:00 → tres clases, una por sección
        for (const [classroom, cs] of [
            [classroomA, csA],
            [classroomB, csB],
            [classroomC, csC],
        ]) {
            await prisma.scheduleBlock.create({
                data: {
                    classroomId: classroom.id,
                    classroomSubjectId: cs.id,
                    dayOfWeek: 1,
                    startTime: '07:00',
                    endTime: '07:45',
                    blockType: 'CLASS',
                },
            });
        }
        // Lunes 09:30 → una sola clase, fuera de la franja del evento
        await prisma.scheduleBlock.create({
            data: {
                classroomId: classroomA.id,
                classroomSubjectId: csA.id,
                dayOfWeek: 1,
                startTime: '09:30',
                endTime: '10:15',
                blockType: 'CLASS',
            },
        });
    }, 120000);

    afterAll(async () => {
        const ids = [classroomA.id, classroomB.id, classroomC.id];
        await prisma.classSession.deleteMany({ where: { classroomId: { in: ids } } }).catch(() => {});
        await prisma.schoolEvent.deleteMany({ where: { academicYearId: yearId } }).catch(() => {});
        await prisma.scheduleBlock.deleteMany({ where: { classroomId: { in: ids } } }).catch(() => {});
        await prisma.classroomSubject.deleteMany({ where: { classroomId: { in: ids } } }).catch(() => {});
        await prisma.classroom.deleteMany({ where: { id: { in: ids } } }).catch(() => {});
        await prisma.$disconnect();
        await server.close();
    }, 120000);

    it('1. la vista de día cuenta las clases de cada bloque', async () => {
        const res = await auth(
            request(server.server).get(`/api/events/day?date=${MONDAY}&academicYearId=${yearId}`)
        );

        expect(res.status).toBe(200);
        expect(res.body.dayOfWeek).toBe(1);
        const at7 = res.body.classes.filter((c: any) => c.startTime === '07:00');
        expect(at7).toHaveLength(3);
        // Lo que muestra el hover: sección, materia y profesor
        const a = at7.find((c: any) => c.classroomId === classroomA.id);
        expect(a.classroomName).toBe('1er Año A');
        expect(a.subjectName).toBeTruthy();
        expect(a.teacherName).toBeTruthy();
        expect(res.body.classrooms.length).toBeGreaterThanOrEqual(3);
    }, 60000);

    it('2. el alcance por años filtra de verdad', async () => {
        const res = await auth(request(server.server).post('/api/events/preview')).send({
            date: MONDAY,
            startTime: '07:00',
            endTime: '07:45',
            scope: 'GRADES',
            grades: [1],
            academicYearId: yearId,
        });

        expect(res.status).toBe(200);
        expect(res.body.count).toBe(2);
        const ids = res.body.classes.map((c: any) => c.classroomId).sort();
        expect(ids).toEqual([classroomA.id, classroomB.id].sort());
    }, 60000);

    it('3. crear el evento suspende exactamente lo que prometió la vista previa', async () => {
        // Un profesor ya había suspendido su clase de 2do año a mano ese lunes
        await prisma.classSession.create({
            data: {
                publicId: `manual-${Date.now()}`,
                classroomId: classroomC.id,
                subjectId: csC.subjectId,
                date: new Date(`${MONDAY}T00:00:00.000Z`),
                status: 'SUSPENDED',
                suspendedReason: 'Reposo médico',
            },
        });

        const preview = await auth(request(server.server).post('/api/events/preview')).send({
            date: MONDAY,
            startTime: '07:00',
            endTime: '07:45',
            scope: 'INSTITUTE',
            academicYearId: yearId,
        });

        const res = await auth(request(server.server).post('/api/events')).send({
            title: 'Acto cívico',
            description: 'Izada de bandera',
            date: MONDAY,
            startTime: '07:00',
            endTime: '07:45',
            scope: 'INSTITUTE',
            academicYearId: yearId,
        });

        expect(res.status).toBe(201);
        eventId = res.body.event.id;

        // Fuente única: mismas clases en la vista previa y en el evento real
        expect(res.body.affectedClasses).toBe(preview.body.count);
        expect(res.body.affectedClasses).toBe(3);
        // …pero la suspensión del profesor se respeta: el evento solo toma 2
        expect(res.body.suspendedSessions).toBe(2);

        const sessions = await prisma.classSession.findMany({
            where: {
                classroomId: { in: [classroomA.id, classroomB.id] },
                date: new Date(`${MONDAY}T00:00:00.000Z`),
            },
        });
        expect(sessions).toHaveLength(2);
        for (const s of sessions) {
            expect(s.status).toBe('SUSPENDED');
            expect(s.suspendedReason).toBe('Evento: Acto cívico');
            expect(s.suspendedByEventId).toBe(eventId);
        }

        const manual = await prisma.classSession.findFirst({ where: { classroomId: classroomC.id } });
        expect(manual?.suspendedReason).toBe('Reposo médico');
        expect(manual?.suspendedByEventId).toBeNull();
    }, 60000);

    it('4. el evento aparece en su día con el número de clases que suspendió', async () => {
        // 1er año A tiene otra clase a las 09:30 de la misma materia. La sesión
        // es por día, así que el día de esa materia ya está suspendido: esto es
        // una limitación documentada del modelo de sesiones.
        const day = await auth(
            request(server.server).get(`/api/events/day?date=${MONDAY}&academicYearId=${yearId}`)
        );
        expect(day.body.events).toHaveLength(1);
        expect(day.body.events[0].title).toBe('Acto cívico');
        expect(day.body.events[0].suspendedCount).toBe(2);
    }, 60000);

    it('4b. el historial de Clase en Vivo muestra la clase como suspendida, no como dada', async () => {
        // Antes, el historial marcaba isRecorded solo porque existía la sesión,
        // y pintaba en verde como "registradas" las clases que suspendió un evento.
        const res = await auth(
            request(server.server).get(`/api/schedules/classroom/${classroomA.id}/history?date=${MONDAY}`)
        );
        expect(res.status).toBe(200);
        // El endpoint devuelve el array plano de bloques del día
        expect(Array.isArray(res.body)).toBe(true);

        const history = res.body;
        // Si esto falla con "no hay bloque a las 07:00", mirar el día de la semana:
        // antes se calculaba con getDay() en hora local y en America/Caracas el
        // lunes daba domingo (horario vacío).
        const at7 = history.find((h: any) => h.startTime === '07:00');
        expect(at7).toBeDefined();
        expect(at7.isSuspended).toBe(true);
        expect(at7.isRecorded).toBe(false);
        expect(at7.suspendedReason).toBe('Evento: Acto cívico');

        // Limitación documentada: la sesión es por materia y DÍA, así que el
        // bloque de las 09:30 de la misma materia también sale suspendido
        // aunque el evento solo cubra las 07:00.
        const at930 = history.find((h: any) => h.startTime === '09:30');
        expect(at930.isSuspended).toBe(true);
    }, 60000);

    it('5. borrar el evento deshace sus suspensiones y solo las suyas', async () => {
        // A 1er año A le había dado tiempo de registrar el tema: esa sesión
        // tiene contenido y debe volver a ACTIVE, no borrarse
        await prisma.classSession.updateMany({
            where: { classroomId: classroomA.id, suspendedByEventId: eventId },
            data: { topic: 'Lectura comprensiva' },
        });

        const res = await auth(request(server.server).delete(`/api/events/${eventId}`));
        expect(res.status).toBe(200);
        expect(res.body.revertedSessions).toBe(2);

        const a = await prisma.classSession.findFirst({ where: { classroomId: classroomA.id } });
        expect(a?.status).toBe('ACTIVE');
        expect(a?.suspendedReason).toBeNull();
        expect(a?.topic).toBe('Lectura comprensiva');

        // La de 1er año B no tenía nada: equivale a una clase no abierta, se borra
        const b = await prisma.classSession.findFirst({ where: { classroomId: classroomB.id } });
        expect(b).toBeNull();

        // La del profesor sigue suspendida con su motivo
        const c = await prisma.classSession.findFirst({ where: { classroomId: classroomC.id } });
        expect(c?.status).toBe('SUSPENDED');
        expect(c?.suspendedReason).toBe('Reposo médico');
    }, 60000);

    it('6. validación: fecha inexistente y alcance incompleto', async () => {
        const badDate = await auth(request(server.server).post('/api/events')).send({
            title: 'X',
            date: '2026-02-31',
            startTime: '07:00',
            endTime: '07:45',
            scope: 'INSTITUTE',
            academicYearId: yearId,
        });
        expect(badDate.status).toBe(400);
        expect(badDate.body.code).toBe('INVALID_DATE');

        const noGrades = await auth(request(server.server).post('/api/events')).send({
            title: 'X',
            date: MONDAY,
            startTime: '07:00',
            endTime: '07:45',
            scope: 'GRADES',
            grades: [],
            academicYearId: yearId,
        });
        expect(noGrades.status).toBe(400);
        expect(noGrades.body.code).toBe('MISSING_GRADES');
    }, 60000);

    it('7. un profesor no puede crear eventos', async () => {
        const res = await auth(request(server.server).post('/api/events'), teacherToken).send({
            title: 'Intento',
            date: MONDAY,
            startTime: '07:00',
            endTime: '07:45',
            scope: 'INSTITUTE',
            academicYearId: yearId,
        });
        expect(res.status).toBe(403);
    }, 60000);
});
