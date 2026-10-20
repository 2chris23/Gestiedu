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

/**
 * AUDITORÍA — "LO MÍO"
 *
 * Las pantallas que cada quien abre todos los días: mis notas, mi asistencia,
 * mis actividades, mis notificaciones, mis materias, mis secciones.
 *
 * Dos cosas se comprueban en cada una, y la segunda es la que importa:
 *
 *   1. que traiga lo que dice que trae;
 *   2. que traiga **solo lo de quien pregunta**. Una pantalla de "lo mío" que
 *      se cuela en lo de otro es una fuga, aunque se vea bien.
 */

const SLUG = 'test-institute';
const gId = () => {
    // Siempre la 'c' delante: ver la nota de `tests/helpers.ts`.
    return `c${createId()}`;
};

describe('Auditoría — lo que ve cada quien de sí mismo', () => {
    let server: FastifyInstance;
    let prisma: PrismaClient;

    let profesor: any;
    let otroProfesor: any;
    let alumno: any;
    let otroAlumno: any;
    let admin: any;
    const tokens: Record<string, string> = {};

    let year: any;
    let period: any;
    let classroom: any;
    let otraSeccion: any;
    let subject: any;
    let otraMateria: any;
    let actividad: any;

    const auth = (token: string) => (req: request.Test) =>
        req.set('Authorization', `Bearer ${token}`).set('X-Institute-Slug', SLUG);
    const comoAlumno = (req: request.Test) => auth(tokens.alumno)(req);
    const comoProfesor = (req: request.Test) => auth(tokens.profesor)(req);

    beforeAll(async () => {
        server = await createTestServer();
        prisma = await createTestPrismaClient();

        profesor = (await createTestUser(prisma, UserRole.TEACHER)).user;
        otroProfesor = (await createTestUser(prisma, UserRole.TEACHER)).user;
        alumno = (await createTestUser(prisma, UserRole.STUDENT)).user;
        otroAlumno = (await createTestUser(prisma, UserRole.STUDENT)).user;
        admin = (await createTestUser(prisma, UserRole.ADMIN)).user;

        tokens.profesor = generateTestToken(profesor.id, UserRole.TEACHER, 'institute');
        tokens.otroProfesor = generateTestToken(otroProfesor.id, UserRole.TEACHER, 'institute');
        tokens.alumno = generateTestToken(alumno.id, UserRole.STUDENT, 'institute');
        tokens.otroAlumno = generateTestToken(otroAlumno.id, UserRole.STUDENT, 'institute');
        tokens.admin = generateTestToken(admin.id, UserRole.ADMIN, 'institute');

        year = await createTestAcademicYear(prisma, 'institute');
        period = await prisma.period.create({
            data: {
                id: gId(),
                name: 'Primer Lapso',
                academicYearId: year.id,
                startDate: new Date('2026-09-01'),
                endDate: new Date('2026-12-15'),
                isActive: true,
            },
        });

        const nuevaSeccion = (nombre: string, seccion: string, guia: string) =>
            prisma.classroom.create({
                data: {
                    id: gId(),
                    name: nombre,
                    slug: `${seccion.toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                    grade: 1,
                    section: seccion,
                    capacity: 30,
                    academicYearId: year.id,
                    instituteId: 'institute',
                    teacherId: guia,
                },
            });

        classroom = await nuevaSeccion('Mis Cosas A', 'A', profesor.id);
        otraSeccion = await nuevaSeccion('Mis Cosas B', 'B', otroProfesor.id);

        subject = await createTestSubject(prisma, 'institute');
        otraMateria = await createTestSubject(prisma, 'institute');

        await prisma.classroomSubject.create({
            data: { classroomId: classroom.id, subjectId: subject.id, teacherId: profesor.id, weeklyBlocks: 3 },
        });
        await prisma.classroomSubject.create({
            data: { classroomId: otraSeccion.id, subjectId: otraMateria.id, teacherId: otroProfesor.id, weeklyBlocks: 2 },
        });

        await prisma.studentClassroom.create({
            data: { studentId: alumno.id, classroomId: classroom.id, academicYearId: year.id, isActive: true },
        });
        await prisma.studentClassroom.create({
            data: { studentId: otroAlumno.id, classroomId: otraSeccion.id, academicYearId: year.id, isActive: true },
        });

        actividad = await prisma.activity.create({
            data: {
                title: 'Prueba de lapso',
                type: 'SUMATIVA',
                scope: 'CLASSROOM',
                startDate: new Date('2026-09-10'),
                maxGrade: 20,
                weight: 1,
                classroomId: classroom.id,
                subjectId: subject.id,
                periodId: period.id,
                lapso: '1',
                createdBy: profesor.id,
                instituteId: 'institute',
            },
        });

        const actividadDeLaOtra = await prisma.activity.create({
            data: {
                title: 'Actividad de la otra sección',
                type: 'SUMATIVA',
                scope: 'CLASSROOM',
                startDate: new Date('2026-09-10'),
                maxGrade: 20,
                weight: 1,
                classroomId: otraSeccion.id,
                subjectId: otraMateria.id,
                periodId: period.id,
                lapso: '1',
                createdBy: otroProfesor.id,
                instituteId: 'institute',
            },
        });

        // Una nota para cada alumno, cada uno en lo suyo
        await prisma.grade.create({
            data: {
                score: 17,
                studentId: alumno.id,
                activityId: actividad.id,
                periodId: period.id,
                subjectId: subject.id,
                teacherId: profesor.id,
            },
        });
        await prisma.grade.create({
            data: {
                score: 8,
                studentId: otroAlumno.id,
                activityId: actividadDeLaOtra.id,
                periodId: period.id,
                subjectId: otraMateria.id,
                teacherId: otroProfesor.id,
            },
        });

        // Asistencia de cada uno
        await prisma.dailyAttendance.create({
            data: {
                studentId: alumno.id,
                classroomId: classroom.id,
                teacherId: profesor.id,
                date: new Date('2026-09-09'),
                status: 'PRESENT',
            },
        });
        await prisma.dailyAttendance.create({
            data: {
                studentId: otroAlumno.id,
                classroomId: otraSeccion.id,
                teacherId: otroProfesor.id,
                date: new Date('2026-09-09'),
                status: 'ABSENT',
            },
        });

        // Notificaciones: dos para el alumno (una leída), una para el otro
        await prisma.notification.create({
            data: {
                title: 'Tienes una actividad nueva',
                message: 'Prueba de lapso el 10',
                type: 'ACTIVITY',
                priority: 'NORMAL',
                recipientId: alumno.id,
                instituteId: 'institute',
            },
        });
        await prisma.notification.create({
            data: {
                title: 'Ya leída',
                message: 'Esta ya la vio',
                type: 'GENERAL',
                priority: 'LOW',
                recipientId: alumno.id,
                instituteId: 'institute',
                readAt: new Date('2026-09-08'),
            },
        });
        await prisma.notification.create({
            data: {
                title: 'Del otro alumno',
                message: 'Esta no la puede ver nadie más',
                type: 'GENERAL',
                priority: 'NORMAL',
                recipientId: otroAlumno.id,
                instituteId: 'institute',
            },
        });
    }, 180000);

    afterAll(async () => {
        await prisma.$disconnect();
        await server.close();
    }, 120000);

    const cuerpoDe = (body: any): any[] => {
        if (Array.isArray(body)) return body;
        for (const campo of ['data', 'items', 'grades', 'notifications', 'activities', 'attendances', 'attendance', 'subjects', 'classrooms', 'results']) {
            const v = body?.[campo];
            if (Array.isArray(v)) return v;
            if (Array.isArray(v?.items)) return v.items;
        }
        return [];
    };

    describe('el alumno', () => {


        it('MIS-03: "mis actividades" trae las de su sección', async () => {
            const res = await comoAlumno(request(server.server).get('/api/activities/student/my-activities'));

            expect(res.status).toBe(200);
            const texto = JSON.stringify(res.body);
            expect(texto).not.toContain('Actividad de la otra sección');
        }, 60000);



        it('MIS-06: no puede leer la notificación de otro alumno', async () => {
            const ajena = await prisma.notification.findFirst({ where: { recipientId: otroAlumno.id } });

            const res = await comoAlumno(request(server.server).patch(`/api/notifications/${ajena!.id}/read`)).send({});
            expect([403, 404]).toContain(res.status);

            const enBD = await prisma.notification.findUnique({ where: { id: ajena!.id } });
            expect(enBD!.readAt).toBeNull();
        }, 60000);
    });

    describe('el profesor', () => {




    });
});
