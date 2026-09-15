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
 * HORARIO POR PROFESOR — fuente única y choques
 *
 * El horario de una sección y el de un profesor son la MISMA tabla
 * (`ScheduleBlock` → `ClassroomSubject`) vista desde dos lados. Estos tests
 * fijan las dos consecuencias de eso:
 *
 *   1. Lo que el admin asigna a la sección (materia + profesor + bloques)
 *      aparece solo en el horario del profesor, sin registrarlo aparte.
 *   2. Mover un bloque desde la vista del profesor lo mueve para la sección,
 *      y ninguna de las dos vistas puede dejar al profesor en dos secciones a
 *      la vez.
 *
 * El punto 2 cubre además el bug reportado por QA: la colisión de profesor se
 * comprobaba DESPUÉS de commitear la transacción y solo dejaba un warning, así
 * que el horario en conflicto se guardaba igual.
 */

describe('Horario por profesor — fuente única y choques', () => {
    let server: FastifyInstance;
    let prisma: PrismaClient;
    let adminToken: string;

    let teacherId: string;
    let otherTeacherId: string;
    let classroomA: any;
    let classroomB: any;
    let subject: any;
    let csA: any; // ClassroomSubject: sección A + materia + profesor
    let csB: any; // ClassroomSubject: sección B + materia + mismo profesor

    const auth = (req: request.Test) =>
        req.set('Authorization', `Bearer ${adminToken}`).set('X-Institute-Slug', 'test-institute');

    beforeAll(async () => {
        server = await createTestServer();
        prisma = await createTestPrismaClient();

        const admin = await createTestUser(prisma, UserRole.ADMIN);
        adminToken = generateTestToken(admin.user.id, UserRole.ADMIN, 'institute');

        const teacher = await createTestUser(prisma, UserRole.TEACHER);
        teacherId = teacher.user.id;
        const other = await createTestUser(prisma, UserRole.TEACHER);
        otherTeacherId = other.user.id;

        const year = await createTestAcademicYear(prisma, 'institute');
        classroomA = await prisma.classroom.create({
            data: {
                id: `claA${Date.now()}`.substring(0, 24),
                name: '1er Año A',
                slug: `1er-ano-a-${Date.now()}`,
                grade: 1,
                section: 'A',
                capacity: 30,
                academicYearId: year.id,
                instituteId: 'institute',
            },
        });
        classroomB = await prisma.classroom.create({
            data: {
                id: `claB${Date.now()}`.substring(0, 24),
                name: '1er Año B',
                slug: `1er-ano-b-${Date.now()}`,
                grade: 1,
                section: 'B',
                capacity: 30,
                academicYearId: year.id,
                instituteId: 'institute',
            },
        });
        subject = await createTestSubject(prisma, 'institute');

        // Esto es lo que hace el admin: asignar la materia a cada sección con
        // este profesor y un número de bloques semanales.
        csA = await prisma.classroomSubject.create({
            data: { classroomId: classroomA.id, subjectId: subject.id, teacherId, weeklyBlocks: 4, hoursPerWeek: 3 },
        });
        csB = await prisma.classroomSubject.create({
            data: { classroomId: classroomB.id, subjectId: subject.id, teacherId, weeklyBlocks: 2, hoursPerWeek: 1.5 },
        });
    }, 120000);

    afterAll(async () => {
        await prisma.scheduleBlock.deleteMany({ where: { classroomId: { in: [classroomA.id, classroomB.id] } } }).catch(() => {});
        await prisma.classroomSubject.deleteMany({ where: { classroomId: { in: [classroomA.id, classroomB.id] } } }).catch(() => {});
        await prisma.classroom.deleteMany({ where: { id: { in: [classroomA.id, classroomB.id] } } }).catch(() => {});
        await prisma.$disconnect();
        await server.close();
    }, 120000);

    it('1. lo que el admin asignó a la sección aparece en el horario del profesor', async () => {
        // Se coloca el bloque desde la vista de SECCIÓN
        const saved = await auth(
            request(server.server).post(`/api/schedules/classroom/${classroomA.id}/bulk`)
        ).send({
            blocks: [
                { classroomSubjectId: csA.id, dayOfWeek: 1, startTime: '07:00', endTime: '07:45' },
            ],
        });
        expect(saved.status).toBe(200);

        // …y se lee desde la vista de PROFESOR, sin haberlo registrado aparte
        const res = await auth(request(server.server).get(`/api/schedules/teacher/${teacherId}/blocks`));
        expect(res.status).toBe(200);
        expect(res.body.scheduleBlocks).toHaveLength(1);

        const block = res.body.scheduleBlocks[0];
        expect(block.classroomSubject.classroom.name).toBe('1er Año A');
        expect(block.classroomSubject.subject.name).toBe(subject.name);
        expect(block.dayOfWeek).toBe(1);
        expect(block.startTime).toBe('07:00');
    }, 60000);

    it('2. mover el bloque desde el horario del profesor lo mueve para la sección', async () => {
        const before = await auth(request(server.server).get(`/api/schedules/teacher/${teacherId}/blocks`));
        const blockId = before.body.scheduleBlocks[0].id;

        const moved = await auth(
            request(server.server).post(`/api/schedules/teacher/${teacherId}/bulk`)
        ).send({
            blocks: [{ id: blockId, classroomSubjectId: csA.id, dayOfWeek: 3, startTime: '09:30', endTime: '10:15' }],
        });
        expect(moved.status).toBe(200);

        // La vista de la SECCIÓN refleja el movimiento: es el mismo registro
        const section = await auth(
            request(server.server).get(`/api/schedules/classroom/${classroomA.id}`)
        );
        expect(section.status).toBe(200);
        const sectionBlock = section.body.scheduleBlocks.find((b: any) => b.id === blockId);
        expect(sectionBlock.dayOfWeek).toBe(3);
        expect(sectionBlock.startTime).toBe('09:30');
    }, 60000);

    it('3. no se puede dejar al profesor en dos secciones a la vez (desde su horario)', async () => {
        // La sección B recibe una clase del mismo profesor el jueves a las 07:00
        const savedB = await auth(
            request(server.server).post(`/api/schedules/classroom/${classroomB.id}/bulk`)
        ).send({
            blocks: [{ classroomSubjectId: csB.id, dayOfWeek: 4, startTime: '07:00', endTime: '07:45' }],
        });
        expect(savedB.status).toBe(200);

        const blocks = await auth(request(server.server).get(`/api/schedules/teacher/${teacherId}/blocks`));
        const blockA = blocks.body.scheduleBlocks.find(
            (b: any) => b.classroomSubject.classroom.id === classroomA.id
        );

        // Se intenta mover la clase de la sección A justo encima de la de B
        const res = await auth(
            request(server.server).post(`/api/schedules/teacher/${teacherId}/bulk`)
        ).send({
            blocks: [{ id: blockA.id, classroomSubjectId: csA.id, dayOfWeek: 4, startTime: '07:00', endTime: '07:45' }],
        });

        expect(res.status).toBe(409);
        expect(res.body.code).toBe('SCHEDULE_CONFLICT');
        expect(res.body.conflicts[0].type).toBe('TEACHER_BUSY');

        // Y NO se guardó: el bloque sigue donde estaba
        const after = await auth(request(server.server).get(`/api/schedules/teacher/${teacherId}/blocks`));
        const stillThere = after.body.scheduleBlocks.find((b: any) => b.id === blockA.id);
        expect(stillThere.dayOfWeek).toBe(3);
        expect(stillThere.startTime).toBe('09:30');
    }, 60000);

    it('4. REGRESIÓN QA: el guardado por sección también rechaza la colisión de profesor', async () => {
        // Antes esto se comprobaba tras commitear y solo se logueaba un warning:
        // el horario con el profesor duplicado se guardaba igual.
        const res = await auth(
            request(server.server).post(`/api/schedules/classroom/${classroomA.id}/bulk`)
        ).send({
            blocks: [
                // choca con la clase de la sección B (jueves 07:00, mismo profesor)
                { classroomSubjectId: csA.id, dayOfWeek: 4, startTime: '07:00', endTime: '07:45' },
            ],
        });

        expect(res.status).toBe(409);
        expect(res.body.code).toBe('SCHEDULE_CONFLICT');
        expect(res.body.conflicts.some((c: any) => c.type === 'TEACHER_BUSY')).toBe(true);

        // La sección A no ganó un bloque el jueves
        const section = await auth(request(server.server).get(`/api/schedules/classroom/${classroomA.id}`));
        const thursday = section.body.scheduleBlocks.filter((b: any) => b.dayOfWeek === 4);
        expect(thursday).toHaveLength(0);
    }, 60000);

    it('5. el horario de un profesor no se puede editar desde la ruta de otro', async () => {
        const blocks = await auth(request(server.server).get(`/api/schedules/teacher/${teacherId}/blocks`));
        const someBlockId = blocks.body.scheduleBlocks[0].id;

        const res = await auth(
            request(server.server).post(`/api/schedules/teacher/${otherTeacherId}/bulk`)
        ).send({
            blocks: [{ id: someBlockId, classroomSubjectId: csA.id, dayOfWeek: 2, startTime: '07:00', endTime: '07:45' }],
        });

        expect(res.status).toBe(403);
        // La asignación se comprueba antes que el bloque, así que puede saltar
        // cualquiera de las dos guardas de pertenencia.
        expect(res.body.code).toMatch(/NOT_(OWNED_BY|ASSIGNED_TO)_TEACHER/);
    }, 60000);
    it('6. la barra lateral sabe cuántos bloques quedan por colocar', async () => {
        const res = await auth(request(server.server).get(`/api/schedules/teacher/${teacherId}/subjects`));

        expect(res.status).toBe(200);
        const asigA = res.body.classroomSubjects.find((cs: any) => cs.id === csA.id);
        expect(asigA.classroom.name).toBe('1er Año A');
        expect(asigA.weeklyBlocks).toBe(4);
        // Es lo que el editor resta para pintar "Restantes: 3 / 4"
        expect(asigA.assignedBlocks).toBe(1);
    }, 60000);

    it('7. arrastrar desde la barra lateral crea el bloque y la sección lo ve', async () => {
        // El editor manda SIEMPRE el estado completo de la cuadrícula: los
        // bloques que ya existen con su id, y los recién arrastrados sin id.
        // (Mandar uno existente sin id lo trataría como nuevo y chocaría
        // consigo mismo — de ahí que el id importe.)
        const current = await auth(request(server.server).get(`/api/schedules/teacher/${teacherId}/blocks`));
        const existingA = current.body.scheduleBlocks.find(
            (b: any) => b.classroomSubject.classroom.id === classroomA.id
        );

        const res = await auth(
            request(server.server).post(`/api/schedules/teacher/${teacherId}/bulk`)
        ).send({
            blocks: [
                // el que ya existía, en su sitio, con su id
                { id: existingA.id, classroomSubjectId: csA.id, dayOfWeek: 3, startTime: '09:30', endTime: '10:15' },
                // uno nuevo, sin id: es el que se acaba de arrastrar
                { classroomSubjectId: csA.id, dayOfWeek: 2, startTime: '07:00', endTime: '07:45' },
            ],
            deleteIds: [],
        });
        expect(res.status).toBe(200);

        const section = await auth(request(server.server).get(`/api/schedules/classroom/${classroomA.id}`));
        const tuesday = section.body.scheduleBlocks.filter((b: any) => b.dayOfWeek === 2);
        expect(tuesday).toHaveLength(1);
        expect(tuesday[0].startTime).toBe('07:00');
    }, 60000);

    it('8. no se pueden colocar más bloques de los que el admin asignó', async () => {
        // csB tiene weeklyBlocks = 2; se intentan colocar 3
        const res = await auth(
            request(server.server).post(`/api/schedules/teacher/${teacherId}/bulk`)
        ).send({
            blocks: [
                { classroomSubjectId: csB.id, dayOfWeek: 1, startTime: '07:00', endTime: '07:45' },
                { classroomSubjectId: csB.id, dayOfWeek: 1, startTime: '07:45', endTime: '08:30' },
                { classroomSubjectId: csB.id, dayOfWeek: 1, startTime: '08:30', endTime: '09:15' },
            ],
        });

        expect(res.status).toBe(400);
        expect(res.body.code).toBe('WEEKLY_BLOCKS_LIMIT_EXCEEDED');
    }, 60000);
    it('9. colocar al azar reparte los pendientes sin dejar choques', async () => {
        const periods = [
            { startTime: '07:00', endTime: '07:45' },
            { startTime: '07:45', endTime: '08:30' },
            { startTime: '08:30', endTime: '09:15' },
            { startTime: '09:30', endTime: '10:15' },
            { startTime: '10:15', endTime: '11:00' },
            { startTime: '11:00', endTime: '11:45' },
            { startTime: '11:45', endTime: '12:30' },
        ];

        const res = await auth(
            request(server.server).post(`/api/schedules/teacher/${teacherId}/auto-fill`)
        ).send({ periods, days: [1, 2, 3, 4, 5] });

        expect(res.status).toBe(200);
        expect(res.body.placed).toBeGreaterThan(0);

        const after = await auth(request(server.server).get(`/api/schedules/teacher/${teacherId}/blocks`));
        const all = after.body.scheduleBlocks;

        // El profesor no puede quedar en dos sitios a la vez
        const slots = all.map((b: any) => b.dayOfWeek + '|' + b.startTime);
        expect(new Set(slots).size).toBe(slots.length);

        // Y no se pasa de los bloques que el admin asignó
        const asig = await auth(request(server.server).get(`/api/schedules/teacher/${teacherId}/subjects`));
        for (const cs of asig.body.classroomSubjects) {
            expect(cs.assignedBlocks).toBeLessThanOrEqual(cs.weeklyBlocks);
        }

        // Tampoco pisa clases de otros profesores en las secciones destino
        const sectionA = await auth(request(server.server).get(`/api/schedules/classroom/${classroomA.id}`));
        const aSlots = sectionA.body.scheduleBlocks.map((b: any) => b.dayOfWeek + '|' + b.startTime);
        expect(new Set(aSlots).size).toBe(aSlots.length);
    }, 60000);
});