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
 * PUERTAS POR DONDE ENTRABAN CHOQUES DE PROFESOR
 *
 * La validación del horario al guardar no bastaba: había tres caminos que
 * dejaban a un profesor en dos sitios a la vez sin pasar por ella. Así se
 * crearon los 50 choques del instituto de pruebas.
 *
 *   1. Asignar un profesor a una materia que ya tiene bloques colocados.
 *   2. Asignar una materia con profesor a todo un año (en bloque).
 *   3. El generador automático: relajaba la regla de profesor si no encontraba
 *      hueco, y no veía las horas PERSONALES.
 */

describe('Puertas de choques de profesor', () => {
    let server: FastifyInstance;
    let prisma: PrismaClient;
    let adminToken: string;
    let yearId: string;
    const classroomIds: string[] = [];
    const teacherIds: string[] = [];

    let busyTeacher: any; // da clase en la sección A el lunes 07:00
    let freeTeacher: any;
    let subject: any;
    let classroomA: any;
    let classroomB: any;
    let csA: any;
    let csB: any;

    const auth = (req: request.Test) =>
        req.set('Authorization', `Bearer ${adminToken}`).set('X-Institute-Slug', 'test-institute');

    const mkClassroom = async (suffix: string, name: string, grade: number, section: string) => {
        const c = await prisma.classroom.create({
            data: {
                id: `dr${suffix}${Date.now()}`.substring(0, 24),
                name,
                slug: `dr-${suffix}-${Date.now()}`,
                grade,
                section,
                capacity: 30,
                academicYearId: yearId,
                instituteId: 'institute',
            },
        });
        classroomIds.push(c.id);
        return c;
    };

    const mkBlock = (classroomId: string, classroomSubjectId: string, dayOfWeek: number, startTime: string, endTime: string) =>
        prisma.scheduleBlock.create({
            data: { classroomId, classroomSubjectId, dayOfWeek, startTime, endTime, blockType: 'CLASS' },
        });

    /** Franjas (día|hora) en las que un profesor tiene más de un bloque. */
    const doubleBooked = async (teacherId: string) => {
        const blocks = await prisma.scheduleBlock.findMany({
            where: { OR: [{ classroomSubject: { teacherId } }, { teacherId }] },
            select: { dayOfWeek: true, startTime: true },
        });
        const seen = new Map<string, number>();
        for (const b of blocks) {
            const k = `${b.dayOfWeek}|${b.startTime}`;
            seen.set(k, (seen.get(k) ?? 0) + 1);
        }
        return Array.from(seen.entries()).filter(([, n]) => n > 1).map(([k]) => k);
    };

    beforeAll(async () => {
        server = await createTestServer();
        prisma = await createTestPrismaClient();

        const admin = await createTestUser(prisma, UserRole.ADMIN);
        adminToken = generateTestToken(admin.user.id, UserRole.ADMIN, 'institute');

        busyTeacher = (await createTestUser(prisma, UserRole.TEACHER)).user;
        freeTeacher = (await createTestUser(prisma, UserRole.TEACHER)).user;
        teacherIds.push(busyTeacher.id, freeTeacher.id);

        const year = await createTestAcademicYear(prisma, 'institute');
        yearId = year.id;
        subject = await createTestSubject(prisma, 'institute');

        // Dos secciones de 4to año con la misma materia a la misma hora (lunes 07:00)
        classroomA = await mkClassroom('a', '4to Año A', 4, 'A');
        classroomB = await mkClassroom('b', '4to Año B', 4, 'B');
        csA = await prisma.classroomSubject.create({
            data: { classroomId: classroomA.id, subjectId: subject.id, teacherId: busyTeacher.id, weeklyBlocks: 2 },
        });
        csB = await prisma.classroomSubject.create({
            data: { classroomId: classroomB.id, subjectId: subject.id, weeklyBlocks: 2 },
        });
        await mkBlock(classroomA.id, csA.id, 1, '07:00', '07:45');
        await mkBlock(classroomB.id, csB.id, 1, '07:00', '07:45');
        await mkBlock(classroomB.id, csB.id, 2, '07:00', '07:45');
    }, 120000);

    afterAll(async () => {
        await prisma.scheduleBlock
            .deleteMany({ where: { OR: [{ classroomId: { in: classroomIds } }, { teacherId: { in: teacherIds } }] } })
            .catch(() => {});
        await prisma.classroomSubject.deleteMany({ where: { classroomId: { in: classroomIds } } }).catch(() => {});
        await prisma.subjectTeacherHistory.deleteMany({ where: { teacherId: { in: teacherIds } } }).catch(() => {});
        await prisma.classroom.deleteMany({ where: { id: { in: classroomIds } } }).catch(() => {});
        await prisma.$disconnect();
        await server.close();
    }, 120000);

    it('1. asignar un profesor ocupado a esa hora → 409 y no cambia nada', async () => {
        const res = await auth(
            request(server.server).patch(`/api/classrooms/${classroomB.id}/subjects/${subject.id}/teacher`)
        ).send({ teacherId: busyTeacher.id });

        expect(res.status).toBe(409);
        expect(res.body.code).toBe('SCHEDULE_CONFLICT');
        expect(res.body.conflicts[0].type).toBe('TEACHER_BUSY');
        // El mensaje dice qué choca, para que el admin sepa qué mover
        expect(res.body.error).toContain('Lunes');

        const cs = await prisma.classroomSubject.findUnique({ where: { id: csB.id } });
        expect(cs?.teacherId).toBeNull();
    }, 60000);

    it('2. asignar un profesor libre sí se permite', async () => {
        const res = await auth(
            request(server.server).patch(`/api/classrooms/${classroomB.id}/subjects/${subject.id}/teacher`)
        ).send({ teacherId: freeTeacher.id });

        expect(res.status).toBe(200);
        const cs = await prisma.classroomSubject.findUnique({ where: { id: csB.id } });
        expect(cs?.teacherId).toBe(freeTeacher.id);
    }, 60000);

    it('3. asignar la materia a todo el año con un profesor ocupado → rechaza sin dejarla a medias', async () => {
        const res = await auth(request(server.server).post('/api/subjects/grade/4/assign')).send({
            subjectId: subject.id,
            teacherId: busyTeacher.id,
            academicYearId: yearId,
        });

        expect(res.status).toBe(409);
        expect(res.body.code).toBe('SCHEDULE_CONFLICT');
        expect(res.body.error).toContain('Lunes');

        // Ninguna sección cambió de profesor: la comprobación va antes de tocar nada
        const cs = await prisma.classroomSubject.findUnique({ where: { id: csB.id } });
        expect(cs?.teacherId).toBe(freeTeacher.id);
        expect(await doubleBooked(busyTeacher.id)).toEqual([]);
    }, 60000);

    it('4. el generador deja huecos antes que poner al profesor en dos sitios', async () => {
        // freeTeacher ya da clase en 4to B el lunes y el martes a las 07:00.
        // Sección nueva con 5 bloques de otra materia de ese mismo profesor:
        // el generador reparte lunes a viernes a las 07:00, así que lunes y
        // martes no tienen solución. Antes el "fallback" los colocaba igual.
        const room = await mkClassroom('c', '5to Año A', 5, 'A');
        const other = await createTestSubject(prisma, 'institute');
        await prisma.classroomSubject.create({
            data: { classroomId: room.id, subjectId: other.id, teacherId: freeTeacher.id, weeklyBlocks: 5 },
        });

        const res = await auth(
            request(server.server).post(`/api/schedules/classroom/${room.id}/auto-generate`)
        ).send({});

        expect(res.status).toBe(200);
        expect(res.body.unplaced).toHaveLength(2);
        expect(res.body.scheduleBlocks).toHaveLength(3);
        expect(await doubleBooked(freeTeacher.id)).toEqual([]);
    }, 60000);

    it('5. el generador respeta las horas personales del profesor', async () => {
        const teacher = (await createTestUser(prisma, UserRole.TEACHER)).user;
        teacherIds.push(teacher.id);

        // Su única hora ocupada es PERSONAL (no tiene sección): antes el
        // generador no la veía y ponía una clase encima.
        await prisma.scheduleBlock.create({
            data: {
                teacherId: teacher.id,
                dayOfWeek: 1,
                startTime: '07:00',
                endTime: '07:45',
                blockType: 'PERSONAL',
                title: 'Planificación',
            },
        });

        const room = await mkClassroom('d', '5to Año B', 5, 'B');
        const other = await createTestSubject(prisma, 'institute');
        await prisma.classroomSubject.create({
            data: { classroomId: room.id, subjectId: other.id, teacherId: teacher.id, weeklyBlocks: 5 },
        });

        const res = await auth(
            request(server.server).post(`/api/schedules/classroom/${room.id}/auto-generate`)
        ).send({});

        expect(res.status).toBe(200);
        expect(res.body.unplaced).toHaveLength(1);
        const monday7 = res.body.scheduleBlocks.find((b: any) => b.dayOfWeek === 1 && b.startTime === '07:00');
        expect(monday7).toBeUndefined();
        expect(await doubleBooked(teacher.id)).toEqual([]);
    }, 60000);
});
