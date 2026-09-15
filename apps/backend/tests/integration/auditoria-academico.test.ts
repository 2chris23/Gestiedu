import { FastifyInstance } from 'fastify';
import request = require('supertest');
import { PrismaClient } from '@prisma/client';
import { UserRole } from '../../src/utils/prisma-enums';
import {
    createTestServer,
    createTestPrismaClient,
    createTestUser,
    createTestUserWithPassword,
    createTestAcademicYear,
    generateTestToken,
} from '../helpers';

/**
 * AUDITORÍA — MATERIAS, SECCIONES, PROFESOR GUÍA Y PLAN DE EVALUACIÓN
 *
 * El recorrido que hace un administrador al montar un año escolar: crear una
 * materia, crear una sección, ponerle profesor guía, meter estudiantes,
 * cargar el plan de evaluación y deshacerlo todo. Se comprueba el efecto real
 * en los datos, no solo el código de respuesta.
 */

const SLUG = 'test-institute';
const ADMIN_PASSWORD = 'AdminAudit123!';

describe('Auditoría — montar un año escolar', () => {
    let server: FastifyInstance;
    let prisma: PrismaClient;
    let adminToken: string;
    let teacherToken: string;
    let teacherId: string;
    let year: any;

    const idsMateria: string[] = [];
    const idsSeccion: string[] = [];
    const idsUsuario: string[] = [];

    const auth = (token: string) => (req: request.Test) =>
        req.set('Authorization', `Bearer ${token}`).set('X-Institute-Slug', SLUG);
    const comoAdmin = (req: request.Test) => auth(adminToken)(req);

    // El código de materia admite 10 caracteres, así que el sufijo va corto
    const sufijo = () => `${Date.now()}${Math.floor(Math.random() * 100)}`.slice(-5);

    beforeAll(async () => {
        server = await createTestServer();
        prisma = await createTestPrismaClient();

        // Con contraseña conocida: sacar a un estudiante de una sección la pide
        const admin = await createTestUserWithPassword(prisma, UserRole.ADMIN, ADMIN_PASSWORD);
        adminToken = generateTestToken(admin.user.id, UserRole.ADMIN, 'institute');
        const teacher = await createTestUser(prisma, UserRole.TEACHER);
        teacherId = teacher.user.id;
        teacherToken = generateTestToken(teacherId, UserRole.TEACHER, 'institute');
        idsUsuario.push(admin.user.id, teacherId);

        year = await createTestAcademicYear(prisma, 'institute');
    }, 120000);

    afterAll(async () => {
        await prisma.evaluationPlanRow.deleteMany({ where: { classroomId: { in: idsSeccion } } }).catch(() => {});
        await prisma.classroomSubject.deleteMany({ where: { classroomId: { in: idsSeccion } } }).catch(() => {});
        await prisma.studentClassroom.deleteMany({ where: { classroomId: { in: idsSeccion } } }).catch(() => {});
        await prisma.classroom.deleteMany({ where: { id: { in: idsSeccion } } }).catch(() => {});
        await prisma.subject.deleteMany({ where: { id: { in: idsMateria } } }).catch(() => {});
        await prisma.user.deleteMany({ where: { id: { in: idsUsuario } } }).catch(() => {});
        await prisma.$disconnect();
        await server.close();
    }, 120000);

    describe('materias', () => {
        let materiaId: string;

        it('se crea con nombre, código y color', async () => {
            const datos = { name: `Física ${sufijo()}`, code: `FIS${sufijo()}`, color: '#3366FF' };
            const res = await comoAdmin(request(server.server).post('/api/subjects')).send(datos);

            expect([200, 201]).toContain(res.status);
            materiaId = res.body.subject?.id ?? res.body.data?.id ?? res.body.id;
            idsMateria.push(materiaId);

            const enBD = await prisma.subject.findUnique({ where: { id: materiaId } });
            expect(enBD!.name).toBe(datos.name);
            expect(enBD!.color).toBe(datos.color);
        }, 60000);

        it('aparece en el listado', async () => {
            const res = await comoAdmin(request(server.server).get('/api/subjects').query({ limit: 100 }));
            expect(res.status).toBe(200);
            const lista = res.body.data?.items ?? res.body.subjects ?? res.body.data ?? [];
            expect(lista.some((m: any) => m.id === materiaId)).toBe(true);
        }, 60000);

        it('se edita el nombre y el color', async () => {
            const res = await comoAdmin(request(server.server).put(`/api/subjects/${materiaId}`)).send({
                name: 'Física Renombrada',
                color: '#FF0000',
            });
            expect(res.status).toBe(200);

            const enBD = await prisma.subject.findUnique({ where: { id: materiaId } });
            expect(enBD!.name).toBe('Física Renombrada');
            expect(enBD!.color).toBe('#FF0000');
        }, 60000);

        it('un color inválido se rechaza', async () => {
            const res = await comoAdmin(request(server.server).put(`/api/subjects/${materiaId}`)).send({
                color: 'rojo',
            });
            expect(res.status).toBe(400);
            expect((await prisma.subject.findUnique({ where: { id: materiaId } }))!.color).toBe('#FF0000');
        }, 60000);

        it('un profesor no puede crear materias', async () => {
            const res = await auth(teacherToken)(request(server.server).post('/api/subjects')).send({
                name: 'Materia del profesor',
                code: `PRF${sufijo()}`,
            });
            expect([401, 403]).toContain(res.status);
        }, 60000);

        it('se borra y desaparece', async () => {
            const temporal = await comoAdmin(request(server.server).post('/api/subjects')).send({
                name: `Temporal ${sufijo()}`,
                code: `TMP${sufijo()}`,
            });
            const tmpId = temporal.body.subject?.id ?? temporal.body.data?.id ?? temporal.body.id;

            const res = await comoAdmin(request(server.server).delete(`/api/subjects/${tmpId}`));
            expect([200, 204]).toContain(res.status);
            expect(await prisma.subject.findUnique({ where: { id: tmpId } })).toBeNull();
        }, 60000);
    });

    describe('secciones y profesor guía', () => {
        let seccionId: string;
        let estudianteId: string;

        it('se crea la sección del año escolar', async () => {
            const res = await comoAdmin(request(server.server).post('/api/classrooms')).send({
                academicYearId: year.id,
                grade: 3,
                section: 'A',
                capacity: 30,
            });

            expect([200, 201]).toContain(res.status);
            seccionId = res.body.classroom?.id ?? res.body.data?.id ?? res.body.id;
            idsSeccion.push(seccionId);

            const enBD = await prisma.classroom.findUnique({ where: { id: seccionId } });
            expect(enBD!.grade).toBe(3);
            expect(enBD!.section).toBe('A');
            expect(enBD!.academicYearId).toBe(year.id);
        }, 60000);

        it('no deja repetir grado y sección en el mismo año', async () => {
            const res = await comoAdmin(request(server.server).post('/api/classrooms')).send({
                academicYearId: year.id,
                grade: 3,
                section: 'A',
                capacity: 30,
            });

            expect([400, 409]).toContain(res.status);
            expect(JSON.stringify(res.body)).not.toMatch(/prisma|P2002|node_modules/i);
        }, 60000);

        it('se le asigna profesor guía y queda registrado', async () => {
            const res = await comoAdmin(request(server.server).patch(`/api/classrooms/${seccionId}/teacher`)).send({
                teacherId,
            });
            expect(res.status).toBe(200);

            const enBD = await prisma.classroom.findUnique({ where: { id: seccionId } });
            expect(enBD!.teacherId).toBe(teacherId);
        }, 60000);

        it('no acepta como profesor guía a alguien que no existe', async () => {
            const res = await comoAdmin(request(server.server).patch(`/api/classrooms/${seccionId}/teacher`)).send({
                teacherId: 'V00000000',
            });
            expect([400, 404]).toContain(res.status);
            // El profesor anterior sigue puesto
            expect((await prisma.classroom.findUnique({ where: { id: seccionId } }))!.teacherId).toBe(teacherId);
        }, 60000);

        it('se le inscribe un estudiante y aparece en la sección', async () => {
            const estudiante = await createTestUser(prisma, UserRole.STUDENT);
            estudianteId = estudiante.user.id;
            idsUsuario.push(estudianteId);

            const res = await comoAdmin(request(server.server).post(`/api/classrooms/${seccionId}/students`)).send({
                studentId: estudianteId,
            });
            expect([200, 201]).toContain(res.status);

            const inscripcion = await prisma.studentClassroom.findFirst({
                where: { studentId: estudianteId, classroomId: seccionId },
            });
            expect(inscripcion).not.toBeNull();
            expect(inscripcion!.isActive).toBe(true);

            const lista = await comoAdmin(request(server.server).get('/api/students').query({ classroomId: seccionId }));
            expect(lista.status).toBe(200);
            expect((lista.body.students as any[]).some((e) => e.id === estudianteId)).toBe(true);
        }, 60000);

        it('se le saca de la sección', async () => {
            // Sacar a alguien de una sección pide la contraseña de quien lo hace
            const sinClave = await comoAdmin(
                request(server.server).delete(`/api/classrooms/${seccionId}/students/${estudianteId}`)
            );
            expect(sinClave.status).toBe(400);
            expect(sinClave.body.code).toBe('PASSWORD_REQUIRED');

            const res = await comoAdmin(
                request(server.server).delete(`/api/classrooms/${seccionId}/students/${estudianteId}`)
            ).send({ password: ADMIN_PASSWORD });
            expect([200, 204]).toContain(res.status);

            const lista = await comoAdmin(request(server.server).get('/api/students').query({ classroomId: seccionId }));
            expect((lista.body.students as any[]).some((e) => e.id === estudianteId)).toBe(false);
        }, 60000);

        it('se edita la capacidad', async () => {
            const res = await comoAdmin(request(server.server).put(`/api/classrooms/${seccionId}`)).send({
                capacity: 40,
            });
            expect(res.status).toBe(200);
            expect((await prisma.classroom.findUnique({ where: { id: seccionId } }))!.capacity).toBe(40);
        }, 60000);

        it('se borra la sección', async () => {
            const temporal = await comoAdmin(request(server.server).post('/api/classrooms')).send({
                academicYearId: year.id,
                grade: 4,
                section: 'Z',
                capacity: 20,
            });
            const tmpId = temporal.body.classroom?.id ?? temporal.body.data?.id ?? temporal.body.id;

            const res = await comoAdmin(request(server.server).delete(`/api/classrooms/${tmpId}`));
            expect([200, 204]).toContain(res.status);
            expect(await prisma.classroom.findUnique({ where: { id: tmpId } })).toBeNull();
        }, 60000);
    });

    describe('plan de evaluación', () => {
        let seccionId: string;
        let materiaId: string;

        beforeAll(async () => {
            const sec = await comoAdmin(request(server.server).post('/api/classrooms')).send({
                academicYearId: year.id,
                grade: 5,
                section: 'B',
                capacity: 25,
            });
            seccionId = sec.body.classroom?.id ?? sec.body.data?.id ?? sec.body.id;
            idsSeccion.push(seccionId);

            const mat = await comoAdmin(request(server.server).post('/api/subjects')).send({
                name: `Química ${sufijo()}`,
                code: `QUI${sufijo()}`,
            });
            materiaId = mat.body.subject?.id ?? mat.body.data?.id ?? mat.body.id;
            idsMateria.push(materiaId);

            // El plan lo arma quien imparte la materia en esa sección: sin esa
            // asignación, el sistema lo rechaza (y hace bien).
            await prisma.classroomSubject.create({
                data: { classroomId: seccionId, subjectId: materiaId, teacherId, weeklyBlocks: 4 },
            });
        }, 120000);

        const filas = (puntos: number[]) =>
            puntos.map((p, i) => ({
                rowType: 'EVALUATION',
                weekNumber: i + 1,
                orderIndex: i,
                actividadEval: `Criterio ${i + 1}`,
                puntos: p,
            }));

        it('rechaza un plan cuyos criterios no suman 20 puntos', async () => {
            const res = await auth(teacherToken)(request(server.server).post('/api/evaluation-plan/rows/batch')).send({
                classroomId: seccionId,
                subjectId: materiaId,
                lapso: '1',
                rows: filas([5, 5, 5]), // 15
            });

            expect(res.status).toBe(400);
            expect(res.body.code).toBe('PLAN_PUNTOS_NOT_20');
            // No se guardó nada a medias
            expect(
                await prisma.evaluationPlanRow.count({ where: { classroomId: seccionId, subjectId: materiaId } })
            ).toBe(0);
        }, 60000);

        it('guarda el plan cuando suman exactamente 20', async () => {
            const res = await auth(teacherToken)(request(server.server).post('/api/evaluation-plan/rows/batch')).send({
                classroomId: seccionId,
                subjectId: materiaId,
                lapso: '1',
                rows: filas([8, 7, 5]),
            });

            expect(res.status).toBe(200);
            const guardadas = await prisma.evaluationPlanRow.findMany({
                where: { classroomId: seccionId, subjectId: materiaId, lapso: '1', rowType: 'EVALUATION' },
                orderBy: { orderIndex: 'asc' },
            });
            expect(guardadas.map((f) => f.puntos)).toEqual([8, 7, 5]);
        }, 60000);

        it('se vuelve a leer tal cual se guardó', async () => {
            const res = await auth(teacherToken)(
                request(server.server)
                    .get('/api/evaluation-plan/rows')
                    .query({ classroomId: seccionId, subjectId: materiaId, lapso: '1' })
            );

            expect(res.status).toBe(200);
            const criterios = (res.body.rows ?? res.body.data ?? []).filter((f: any) => f.rowType === 'EVALUATION');
            expect(criterios).toHaveLength(3);
            expect(criterios.reduce((s: number, f: any) => s + (f.puntos || 0), 0)).toBe(20);
        }, 60000);

        it('se reemplaza por otro reparto que también suma 20', async () => {
            const res = await auth(teacherToken)(request(server.server).post('/api/evaluation-plan/rows/batch')).send({
                classroomId: seccionId,
                subjectId: materiaId,
                lapso: '1',
                rows: filas([10, 10]),
            });
            expect(res.status).toBe(200);

            const guardadas = await prisma.evaluationPlanRow.findMany({
                where: { classroomId: seccionId, subjectId: materiaId, lapso: '1', rowType: 'EVALUATION' },
            });
            expect(guardadas).toHaveLength(2);
            expect(guardadas.reduce((s, f) => s + (f.puntos || 0), 0)).toBe(20);
        }, 60000);

        it('sin token no se puede tocar el plan', async () => {
            const res = await request(server.server)
                .post('/api/evaluation-plan/rows/batch')
                .set('X-Institute-Slug', SLUG)
                .send({ classroomId: seccionId, subjectId: materiaId, lapso: '1', rows: filas([20]) });
            expect(res.status).toBe(401);
        }, 60000);
    });
});
