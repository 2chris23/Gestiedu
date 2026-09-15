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
 * CHOQUES HEREDADOS
 *
 * La regla "un profesor no puede estar en dos sitios a la vez" llegó cuando ya
 * había datos que la incumplían. Aplicarla a TODO lo que se envía al guardar
 * dejó sin poder guardar cualquier sección con un choque antiguo — en el
 * instituto de pruebas, las 20 secciones de 2026-2027 — aunque nadie tocara
 * ese bloque.
 *
 * Contrato que fijan estos tests:
 *   - Un choque HEREDADO (bloques que el guardado no toca) avisa, no bloquea.
 *   - Un choque que el guardado CREA sigue bloqueando (409).
 *   - Mover uno de los bloques del choque heredado lo resuelve.
 */

describe('Choques heredados: avisan pero no bloquean', () => {
    let server: FastifyInstance;
    let prisma: PrismaClient;
    let adminToken: string;
    let teacherId: string;
    let classroomA: any;
    let classroomB: any;
    let csA: any;
    let csB: any;
    let blockA1: any; // jueves 08:30, sección A  ┐ choque heredado:
    let blockB1: any; // jueves 08:30, sección B  ┘ mismo profesor a la vez
    let blockA2: any; // lunes 07:00, sección A (limpio)
    let blockB2: any; // martes 07:00, sección B (limpio)

    const auth = (req: request.Test) =>
        req.set('Authorization', `Bearer ${adminToken}`).set('X-Institute-Slug', 'test-institute');

    const payload = (b: any, changes: Partial<{ dayOfWeek: number; startTime: string; endTime: string }> = {}) => ({
        id: b.id,
        classroomSubjectId: b.classroomSubjectId,
        dayOfWeek: changes.dayOfWeek ?? b.dayOfWeek,
        startTime: changes.startTime ?? b.startTime,
        endTime: changes.endTime ?? b.endTime,
    });

    beforeAll(async () => {
        server = await createTestServer();
        prisma = await createTestPrismaClient();

        const admin = await createTestUser(prisma, UserRole.ADMIN);
        adminToken = generateTestToken(admin.user.id, UserRole.ADMIN, 'institute');
        const teacher = await createTestUser(prisma, UserRole.TEACHER);
        teacherId = teacher.user.id;

        const year = await createTestAcademicYear(prisma, 'institute');
        const mk = (suffix: string, name: string, section: string) =>
            prisma.classroom.create({
                data: {
                    id: `lg${suffix}${Date.now()}`.substring(0, 24),
                    name,
                    slug: `lg-${suffix}-${Date.now()}`,
                    grade: 3,
                    section,
                    capacity: 30,
                    academicYearId: year.id,
                    instituteId: 'institute',
                },
            });
        classroomA = await mk('a', '3er Año A', 'A');
        classroomB = await mk('b', '4to Año C', 'C');

        const subject = await createTestSubject(prisma, 'institute');
        csA = await prisma.classroomSubject.create({
            data: { classroomId: classroomA.id, subjectId: subject.id, teacherId, weeklyBlocks: 4 },
        });
        csB = await prisma.classroomSubject.create({
            data: { classroomId: classroomB.id, subjectId: subject.id, teacherId, weeklyBlocks: 4 },
        });

        // Insertados directamente, saltándose la validación: así llegaron los 50
        // choques del instituto de pruebas (generador en modo "relajado" o un
        // profesor asignado a una materia que ya tenía bloques).
        const mkBlock = (classroomId: string, classroomSubjectId: string, dayOfWeek: number, startTime: string, endTime: string) =>
            prisma.scheduleBlock.create({
                data: { classroomId, classroomSubjectId, dayOfWeek, startTime, endTime, blockType: 'CLASS' },
            });
        blockA1 = await mkBlock(classroomA.id, csA.id, 4, '08:30', '09:15');
        blockB1 = await mkBlock(classroomB.id, csB.id, 4, '08:30', '09:15');
        blockA2 = await mkBlock(classroomA.id, csA.id, 1, '07:00', '07:45');
        blockB2 = await mkBlock(classroomB.id, csB.id, 2, '07:00', '07:45');
    }, 120000);

    afterAll(async () => {
        const ids = [classroomA.id, classroomB.id];
        await prisma.scheduleBlock.deleteMany({ where: { classroomId: { in: ids } } }).catch(() => {});
        await prisma.classroomSubject.deleteMany({ where: { classroomId: { in: ids } } }).catch(() => {});
        await prisma.classroom.deleteMany({ where: { id: { in: ids } } }).catch(() => {});
        await prisma.$disconnect();
        await server.close();
    }, 120000);

    it('1. guardar la sección sin tocar el bloque del choque heredado: 200 con aviso', async () => {
        const res = await auth(request(server.server).post(`/api/schedules/classroom/${classroomA.id}/bulk`)).send({
            blocks: [payload(blockA1), payload(blockA2)],
            deleteIds: [],
        });

        expect(res.status).toBe(200);
        // El choque heredado se informa, no se esconde
        expect(res.body.warnings.length).toBeGreaterThan(0);
        expect(res.body.warnings.join(' ')).toContain('Jueves');
        expect(res.body.preexistingConflicts[0].type).toBe('TEACHER_BUSY');
    }, 60000);

    it('2. un choque NUEVO sigue bloqueando aunque la sección arrastre uno heredado', async () => {
        // Mover el bloque limpio del lunes al martes 07:00, donde el profesor
        // ya está en la otra sección
        const res = await auth(request(server.server).post(`/api/schedules/classroom/${classroomA.id}/bulk`)).send({
            blocks: [payload(blockA1), payload(blockA2, { dayOfWeek: 2 })],
            deleteIds: [],
        });

        expect(res.status).toBe(409);
        expect(res.body.code).toBe('SCHEDULE_CONFLICT');
        // Solo el choque nuevo bloquea; el heredado del jueves no aparece como bloqueante
        expect(res.body.conflicts.every((c: any) => c.dayOfWeek === 2)).toBe(true);

        const still = await prisma.scheduleBlock.findUnique({ where: { id: blockA2.id } });
        expect(still?.dayOfWeek).toBe(1);
    }, 60000);

    it('3. el editor del profesor también puede guardar con el choque heredado a la vista', async () => {
        const res = await auth(request(server.server).post(`/api/schedules/teacher/${teacherId}/bulk`)).send({
            blocks: [payload(blockA1), payload(blockB1), payload(blockA2), payload(blockB2)],
            deleteIds: [],
        });

        expect(res.status).toBe(200);
        expect(res.body.warnings.length).toBeGreaterThan(0);
    }, 60000);

    it('4. mover uno de los dos bloques del choque lo resuelve y desaparece el aviso', async () => {
        const res = await auth(request(server.server).post(`/api/schedules/teacher/${teacherId}/bulk`)).send({
            blocks: [payload(blockA1, { dayOfWeek: 3 }), payload(blockB1), payload(blockA2), payload(blockB2)],
            deleteIds: [],
        });

        expect(res.status).toBe(200);
        expect(res.body.warnings).toEqual([]);

        const section = await auth(request(server.server).post(`/api/schedules/classroom/${classroomA.id}/bulk`)).send({
            blocks: [payload({ ...blockA1, dayOfWeek: 3 }), payload(blockA2)],
            deleteIds: [],
        });
        expect(section.status).toBe(200);
        expect(section.body.warnings).toEqual([]);
    }, 60000);
});
