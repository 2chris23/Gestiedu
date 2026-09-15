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
 * HORAS PERSONALES DEL PROFESOR (bloques PERSONAL)
 *
 * Un profesor tiene horas que no son clase (planificación, guardia…). Las crea
 * el admin desde el horario del profesor, con título y descripción.
 *
 * Viven en la MISMA tabla que las clases a propósito: así la pregunta "¿está
 * ocupada esta hora de este profesor?" se responde con una sola consulta y no
 * hay forma de colocar una clase encima de una hora personal por haberse
 * olvidado de mirar una segunda tabla.
 */

describe('Horas personales del profesor', () => {
    let server: FastifyInstance;
    let prisma: PrismaClient;
    let adminToken: string;
    let teacherId: string;
    let classroom: any;
    let cs: any;

    const auth = (req: request.Test) =>
        req.set('Authorization', `Bearer ${adminToken}`).set('X-Institute-Slug', 'test-institute');

    beforeAll(async () => {
        server = await createTestServer();
        prisma = await createTestPrismaClient();

        const admin = await createTestUser(prisma, UserRole.ADMIN);
        adminToken = generateTestToken(admin.user.id, UserRole.ADMIN, 'institute');

        const teacher = await createTestUser(prisma, UserRole.TEACHER);
        teacherId = teacher.user.id;

        const year = await createTestAcademicYear(prisma, 'institute');
        classroom = await prisma.classroom.create({
            data: {
                id: `pers${Date.now()}`.substring(0, 24),
                name: '2do Año A',
                slug: `2do-ano-a-${Date.now()}`,
                grade: 2,
                section: 'A',
                capacity: 30,
                academicYearId: year.id,
                instituteId: 'institute',
            },
        });
        const subject = await createTestSubject(prisma, 'institute');
        cs = await prisma.classroomSubject.create({
            data: { classroomId: classroom.id, subjectId: subject.id, teacherId, weeklyBlocks: 3, hoursPerWeek: 2 },
        });
    }, 120000);

    afterAll(async () => {
        await prisma.scheduleBlock.deleteMany({ where: { OR: [{ classroomId: classroom.id }, { teacherId }] } }).catch(() => {});
        await prisma.classroomSubject.deleteMany({ where: { classroomId: classroom.id } }).catch(() => {});
        await prisma.classroom.deleteMany({ where: { id: classroom.id } }).catch(() => {});
        await prisma.$disconnect();
        await server.close();
    }, 120000);

    it('1. el admin crea una hora personal con título y descripción', async () => {
        const res = await auth(
            request(server.server).post(`/api/schedules/teacher/${teacherId}/personal-blocks`)
        ).send({
            dayOfWeek: 2,
            startTime: '09:30',
            endTime: '10:15',
            title: 'Planificación',
            notes: 'Preparar el plan de evaluación del segundo lapso',
        });

        expect(res.status).toBe(201);
        expect(res.body.scheduleBlock.blockType).toBe('PERSONAL');
        expect(res.body.scheduleBlock.title).toBe('Planificación');
        expect(res.body.scheduleBlock.classroomId).toBeNull();
        expect(res.body.scheduleBlock.teacherId).toBe(teacherId);
    }, 60000);

    it('2. la hora personal sale en el horario del profesor junto a sus clases', async () => {
        const res = await auth(request(server.server).get(`/api/schedules/teacher/${teacherId}/blocks`));

        expect(res.status).toBe(200);
        const personal = res.body.scheduleBlocks.find((b: any) => b.blockType === 'PERSONAL');
        expect(personal).toBeTruthy();
        expect(personal.title).toBe('Planificación');
        expect(personal.notes).toContain('plan de evaluación');
    }, 60000);

    it('3. una clase NO puede colocarse encima de una hora personal', async () => {
        const res = await auth(
            request(server.server).post(`/api/schedules/classroom/${classroom.id}/bulk`)
        ).send({
            blocks: [{ classroomSubjectId: cs.id, dayOfWeek: 2, startTime: '09:30', endTime: '10:15' }],
        });

        expect(res.status).toBe(409);
        expect(res.body.code).toBe('SCHEDULE_CONFLICT');
        expect(res.body.conflicts[0].type).toBe('TEACHER_BUSY');
        // El mensaje nombra la hora reservada, no una clase inexistente
        expect(res.body.conflicts[0].message).toContain('Planificación');

        const section = await auth(request(server.server).get(`/api/schedules/classroom/${classroom.id}`));
        expect(section.body.scheduleBlocks).toHaveLength(0);
    }, 60000);

    it('4. una hora personal NO puede crearse encima de una clase', async () => {
        // Primero una clase real, en otro hueco
        const saved = await auth(
            request(server.server).post(`/api/schedules/classroom/${classroom.id}/bulk`)
        ).send({
            blocks: [{ classroomSubjectId: cs.id, dayOfWeek: 3, startTime: '07:00', endTime: '07:45' }],
        });
        expect(saved.status).toBe(200);

        const res = await auth(
            request(server.server).post(`/api/schedules/teacher/${teacherId}/personal-blocks`)
        ).send({ dayOfWeek: 3, startTime: '07:00', endTime: '07:45', title: 'Guardia' });

        expect(res.status).toBe(409);
        expect(res.body.code).toBe('SCHEDULE_CONFLICT');
    }, 60000);

    it('5. sin título no se crea', async () => {
        const res = await auth(
            request(server.server).post(`/api/schedules/teacher/${teacherId}/personal-blocks`)
        ).send({ dayOfWeek: 5, startTime: '07:00', endTime: '07:45', title: '   ' });

        expect(res.status).toBe(400);
        expect(res.body.code).toBe('MISSING_TITLE');
    }, 60000);

    it('6. se puede mover y renombrar, y se elimina', async () => {
        const blocks = await auth(request(server.server).get(`/api/schedules/teacher/${teacherId}/blocks`));
        const personal = blocks.body.scheduleBlocks.find((b: any) => b.blockType === 'PERSONAL');

        const updated = await auth(
            request(server.server).put(`/api/schedules/personal-blocks/${personal.id}`)
        ).send({ title: 'Planificación y guardia', dayOfWeek: 5, startTime: '11:45', endTime: '12:30' });

        expect(updated.status).toBe(200);
        expect(updated.body.scheduleBlock.title).toBe('Planificación y guardia');
        expect(updated.body.scheduleBlock.dayOfWeek).toBe(5);

        const removed = await auth(
            request(server.server).delete(`/api/schedules/personal-blocks/${personal.id}`)
        );
        expect(removed.status).toBe(200);

        const after = await auth(request(server.server).get(`/api/schedules/teacher/${teacherId}/blocks`));
        expect(after.body.scheduleBlocks.find((b: any) => b.blockType === 'PERSONAL')).toBeUndefined();
    }, 60000);

    it('7. la base de datos rechaza un bloque huérfano (sin sección y sin profesor)', async () => {
        // Es el riesgo de tener las dos formas en la misma tabla, así que la
        // restricción vive en la base, no solo en el código de la aplicación.
        await expect(
            prisma.$executeRawUnsafe(
                `INSERT INTO "schedule_blocks" ("id", "dayOfWeek", "startTime", "endTime", "blockType", "updatedAt")
                 VALUES ('huerfano-test', 1, '07:00', '07:45', 'PERSONAL', NOW())`
            )
        ).rejects.toThrow();
    }, 60000);
});
