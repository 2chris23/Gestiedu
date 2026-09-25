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
 * DAR DE BAJA A UN PROFESOR NO SE LLEVA SUS NOTAS
 *
 * Cuando el admin borra a un profesor, lo que ese profesor hizo se queda en el
 * liceo: sus notas, las asistencias que tomó y las actividades que creó pasan
 * al admin, y en cada una queda escrito quién la hizo de verdad.
 *
 * Eso se hacía fila a fila dentro de una transacción de 30 s. Con los años de
 * trabajo de un profesor de verdad (decenas de miles de notas) no cabía: la
 * transacción se deshacía y el profesor no se podía dar de baja. Ahora son tres
 * escrituras. Esta prueba comprueba que el resultado, fila por fila, es el
 * mismo que antes.
 */

const SLUG = 'test-institute';
const gId = () => `c${createId()}`;

describe('Dar de baja a un profesor', () => {
    let server: FastifyInstance;
    let prisma: PrismaClient;

    beforeAll(async () => {
        server = await createTestServer();
        prisma = await createTestPrismaClient();
    }, 180000);

    afterAll(async () => {
        await prisma.$disconnect();
        await server.close();
    }, 120000);

    it('BAJA-01: sus notas, asistencias y actividades pasan al admin, con su nombre apuntado', async () => {
        const admin = (await createTestUser(prisma, UserRole.ADMIN)).user;
        const profe = (await createTestUser(prisma, UserRole.TEACHER)).user;
        const alumnos = [];
        for (let i = 0; i < 3; i++) alumnos.push((await createTestUser(prisma, UserRole.STUDENT)).user);

        const year = await createTestAcademicYear(prisma, 'institute');
        const period = await prisma.period.create({
            data: { id: gId(), name: 'Primer Lapso', academicYearId: year.id, startDate: new Date('2026-09-01'), endDate: new Date('2026-12-15'), isActive: true },
        });
        const classroom = await createTestClassroom(prisma, year.id, 'institute');
        const subject = await createTestSubject(prisma, 'institute');

        const conDescripcion = await prisma.activity.create({
            data: { id: gId(), title: 'Examen', description: 'Tema 1', type: 'EXAM', scope: 'CLASSROOM', startDate: new Date(), createdBy: profe.id, classroomId: classroom.id, subjectId: subject.id, periodId: period.id },
        });
        const sinDescripcion = await prisma.activity.create({
            data: { id: gId(), title: 'Taller', type: 'OTHER', scope: 'CLASSROOM', startDate: new Date(), createdBy: profe.id, classroomId: classroom.id, subjectId: subject.id, periodId: period.id },
        });

        for (const [i, est] of alumnos.entries()) {
            await prisma.grade.create({
                data: {
                    id: gId(), studentId: est.id, subjectId: subject.id, periodId: period.id, activityId: conDescripcion.id,
                    teacherId: profe.id, score: 10 + i,
                    ...(i === 0 && { metadata: { feedback: 'Muy bien' } }),
                } as any,
            });
            await prisma.dailyAttendance.create({
                data: {
                    id: gId(), studentId: est.id, classroomId: classroom.id, teacherId: profe.id,
                    date: new Date(`2026-09-1${i}`), status: 'PRESENT',
                    ...(i === 0 && { comments: 'Llegó con el uniforme' }),
                } as any,
            });
        }

        const token = generateTestToken(admin.id, UserRole.ADMIN, 'institute');
        const res = await request(server.server)
            .delete(`/api/users/${profe.id}`)
            .set('Authorization', `Bearer ${token}`)
            .set('X-Institute-Slug', SLUG);
        expect(res.status).toBe(200);

        const nombre = `${profe.firstName} ${profe.lastName}`.trim();

        const notas = await prisma.grade.findMany({ where: { activityId: conDescripcion.id }, orderBy: { score: 'asc' } });
        expect(notas).toHaveLength(3);
        for (const n of notas) {
            expect(n.teacherId).toBe(admin.id);
            expect((n.metadata as any).historicalTeacherName).toBe(nombre);
            expect((n.metadata as any).historicalTeacherId).toBe(profe.id);
        }
        // Lo que ya había en la metadata se conserva.
        expect((notas[0].metadata as any).feedback).toBe('Muy bien');

        const asistencias = await prisma.dailyAttendance.findMany({ where: { classroomId: classroom.id }, orderBy: { date: 'asc' } });
        expect(asistencias).toHaveLength(3);
        expect(asistencias.every((a) => a.teacherId === admin.id)).toBe(true);
        expect(asistencias[0].comments).toBe(`Llegó con el uniforme [Tomada por: ${nombre}]`);
        expect(asistencias[1].comments).toBe(`[Tomada por: ${nombre}]`);

        const actividades = await prisma.activity.findMany({ where: { id: { in: [conDescripcion.id, sinDescripcion.id] } } });
        const porId = new Map(actividades.map((a) => [a.id, a]));
        expect(porId.get(conDescripcion.id)!.createdBy).toBe(admin.id);
        expect(porId.get(conDescripcion.id)!.description).toBe(`Tema 1 [Profesor histórico: ${nombre}]`);
        expect(porId.get(sinDescripcion.id)!.description).toBe(`[Profesor histórico: ${nombre}]`);

        expect(await prisma.user.findUnique({ where: { id: profe.id } })).toBeNull();
    }, 120000);
});
