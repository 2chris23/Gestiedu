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
    createTestSubject,
    generateTestToken,
} from '../helpers';
import { todayInTimezone } from '../../src/utils/school-time';

/**
 * GUARDAR LA CLASE NO PISA LA ASISTENCIA QUE PUSO OTRA PANTALLA
 *
 * La clase en vivo se guarda sola. Para los alumnos que esa pantalla NO tocó
 * y que aún no tienen asistencia ese día, manda «presente» (lo que se ve por
 * defecto) con `soloSiNoHay`: se crea si no hay nada, pero si otra pantalla ya
 * lo marcó, se respeta. Lo que la pantalla sí tocó se escribe siempre.
 *
 *   SOLO-01  con `soloSiNoHay`, un ausente puesto por otra pantalla se queda ausente;
 *   SOLO-02  con `soloSiNoHay` y sin nada guardado, se crea como viene;
 *   SOLO-03  sin `soloSiNoHay` (lo tocado), se corrige como siempre.
 */

const SLUG = 'test-institute';
const gId = () => `c${createId()}`;

describe('Guardar la clase no pisa la asistencia de otra pantalla (SOLO-01…03)', () => {
    let server: FastifyInstance;
    let prisma: PrismaClient;
    let token: string;
    let classroom: any;
    let subject: any;
    let alumno: any;
    const HOY = todayInTimezone();

    beforeAll(async () => {
        server = await createTestServer();
        prisma = await createTestPrismaClient();
        const profesor = (await createTestUser(prisma, UserRole.TEACHER)).user;
        token = generateTestToken(profesor.id, UserRole.TEACHER, 'institute');
        const year = await createTestAcademicYear(prisma, 'institute');
        classroom = await prisma.classroom.create({
            data: { id: gId(), name: 'Sección SOLO', slug: `solo-${Date.now()}`, grade: 1, section: 'A', capacity: 30, academicYearId: year.id, instituteId: 'institute', teacherId: profesor.id } as any,
        });
        subject = await createTestSubject(prisma, 'institute');
        await prisma.classroomSubject.create({ data: { classroomId: classroom.id, subjectId: subject.id, teacherId: profesor.id, weeklyBlocks: 3 } });
        alumno = (await createTestUser(prisma, UserRole.STUDENT)).user;
        await prisma.studentClassroom.create({ data: { studentId: alumno.id, classroomId: classroom.id, academicYearId: year.id, isActive: true } });
    }, 180000);

    afterAll(async () => {
        await prisma.$disconnect();
        await server.close();
    });

    const guardar = (attendances: any[]) =>
        request(server.server)
            .post('/api/sessions/live-save')
            .set('Authorization', `Bearer ${token}`)
            .set('X-Institute-Slug', SLUG)
            .send({ classroomId: classroom.id, subjectId: subject.id, date: HOY, attendances });

    const suAsistencia = async () =>
        (await prisma.dailyAttendance.findFirst({ where: { studentId: alumno.id, date: new Date(`${HOY}T00:00:00.000Z`) } }))?.status;

    it('SOLO-02: con soloSiNoHay y sin nada guardado, se crea como viene', async () => {
        await prisma.dailyAttendance.deleteMany({ where: { studentId: alumno.id } });
        const res = await guardar([{ studentId: alumno.id, status: 'PRESENT', soloSiNoHay: true }]);
        expect(res.status).toBe(200);
        expect(await suAsistencia()).toBe('PRESENT');
    });

    it('SOLO-01: con soloSiNoHay, el ausente que puso otra pantalla se queda ausente', async () => {
        // Otra pantalla lo marcó ausente.
        expect((await guardar([{ studentId: alumno.id, status: 'ABSENT' }])).status).toBe(200);
        expect(await suAsistencia()).toBe('ABSENT');
        // Esta pantalla no lo tocó y lo manda «como se ve», solo si no hay nada.
        expect((await guardar([{ studentId: alumno.id, status: 'PRESENT', soloSiNoHay: true }])).status).toBe(200);
        expect(await suAsistencia()).toBe('ABSENT');
    });

    it('SOLO-03: lo que la pantalla tocó (sin soloSiNoHay) se corrige como siempre', async () => {
        expect((await guardar([{ studentId: alumno.id, status: 'LATE' }])).status).toBe(200);
        expect(await suAsistencia()).toBe('LATE');
    });
});
