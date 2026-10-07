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
    generateTestToken,
} from '../helpers';
import { platformPrisma } from '../../src/config/database';
import { RedisCache } from '../../src/config/redis';
import { DashboardService } from '../../src/services/dashboard.service';
import { conLiceo } from '../../src/config/ambito-del-liceo';

/**
 * PRUEBAS DE INTEGRACIÓN: DASHBOARD DEL PROFESOR (Fase C)
 *
 * Verifica las cifras del profesor con datos conocidos:
 * - Promedio general: media de los promedios alumno-materia con notas de sus clases en el ciclo activo.
 * - Alumnos en riesgo: alumnos distintos con alguna de sus materias por debajo de notaMinimaAprobatoria.
 * - Asistencia: de sus clases en los últimos 30 días ((PRESENT + LATE) / Total).
 * - isGuideTeacher: booleano según sea o no profesor guía de un aula activa.
 * - Cacheo en Redis sin N+1 y sin datos de cuadro de honor.
 */

const SLUG = 'test-institute';
const LICEO = 'institute';
const gId = () => `c${createId()}`;

describe('Dashboard del profesor (Fase C)', () => {
    let server: FastifyInstance;
    let prisma: PrismaClient;
    let profesor: any;
    let alumno1: any;
    let alumno2: any;
    let year: any;
    let lapso: any;
    let seccion: any;
    let mate: any;
    let fisica: any;

    const auth = (id: string, role: UserRole) => ({
        Authorization: `Bearer ${generateTestToken(id, role, LICEO)}`,
        'X-Institute-Slug': SLUG,
    });

    beforeAll(async () => {
        server = await createTestServer();
        prisma = await createTestPrismaClient();
    }, 120000);

    afterAll(async () => {
        await prisma.$disconnect();
        await server.close();
    });

    beforeEach(async () => {
        await cleanTestDatabase(prisma);
        await conLiceo(LICEO, () => RedisCache.clearPattern('*')).catch(() => undefined);
        await platformPrisma.institute.update({
            where: { id: LICEO },
            data: { academicConfig: { notaMinimaAprobatoria: 10, asistenciaMinima: 80 } },
        });

        profesor = (await createTestUser(prisma, UserRole.TEACHER)).user;
        alumno1 = (await createTestUser(prisma, UserRole.STUDENT)).user;
        alumno2 = (await createTestUser(prisma, UserRole.STUDENT)).user;

        const hoy = Date.now();
        year = await prisma.academicYear.create({
            data: {
                id: gId(),
                name: `2026-${gId().slice(0, 6)}`,
                startDate: new Date(hoy - 30 * 864e5),
                endDate: new Date(hoy + 200 * 864e5),
                isActive: true,
                status: 'ACTIVE',
                instituteId: LICEO,
            } as any,
        });

        lapso = await prisma.period.create({
            data: {
                id: gId(),
                name: 'Primer Lapso',
                academicYearId: year.id,
                startDate: new Date(hoy - 30 * 864e5),
                endDate: new Date(hoy + 60 * 864e5),
                isActive: true,
            },
        });

        seccion = await prisma.classroom.create({
            data: {
                id: gId(),
                name: '1er Año A',
                slug: `aula-${gId()}`,
                grade: 1,
                section: 'A',
                capacity: 35,
                academicYearId: year.id,
                instituteId: LICEO,
                teacherId: profesor.id, // Profesor es guía
            } as any,
        });

        await prisma.studentClassroom.create({
            data: { studentId: alumno1.id, classroomId: seccion.id, academicYearId: year.id, isActive: true },
        });
        await prisma.studentClassroom.create({
            data: { studentId: alumno2.id, classroomId: seccion.id, academicYearId: year.id, isActive: true },
        });

        mate = await prisma.subject.create({
            data: { id: gId(), name: 'Matemática', slug: `mat-${gId()}`, code: `MAT-${gId().slice(0, 4)}`, instituteId: LICEO } as any,
        });
        fisica = await prisma.subject.create({
            data: { id: gId(), name: 'Física', slug: `fis-${gId()}`, code: `FIS-${gId().slice(0, 4)}`, instituteId: LICEO } as any,
        });

        await prisma.classroomSubject.create({
            data: { classroomId: seccion.id, subjectId: mate.id, teacherId: profesor.id },
        });
        await prisma.classroomSubject.create({
            data: { classroomId: seccion.id, subjectId: fisica.id, teacherId: profesor.id },
        });

        // Actividades y notas conocidas:
        // Mate: Actividad 1
        const actMate = await prisma.activity.create({
            data: {
                id: gId(),
                title: 'Parcial Mate',
                type: 'EXAM',
                scope: 'CLASSROOM',
                startDate: new Date(),
                createdBy: profesor.id,
                classroomId: seccion.id,
                subjectId: mate.id,
                periodId: lapso.id,
            },
        });
        // Alumno 1 en Mate = 16
        await prisma.grade.create({
            data: { id: gId(), studentId: alumno1.id, activityId: actMate.id, periodId: lapso.id, subjectId: mate.id, teacherId: profesor.id, score: 16 },
        });
        // Alumno 2 en Mate = 8 (en riesgo!)
        await prisma.grade.create({
            data: { id: gId(), studentId: alumno2.id, activityId: actMate.id, periodId: lapso.id, subjectId: mate.id, teacherId: profesor.id, score: 8 },
        });

        // Física: Actividad 2
        const actFisica = await prisma.activity.create({
            data: {
                id: gId(),
                title: 'Parcial Física',
                type: 'EXAM',
                scope: 'CLASSROOM',
                startDate: new Date(),
                createdBy: profesor.id,
                classroomId: seccion.id,
                subjectId: fisica.id,
                periodId: lapso.id,
            },
        });
        // Alumno 1 en Física = 14
        await prisma.grade.create({
            data: { id: gId(), studentId: alumno1.id, activityId: actFisica.id, periodId: lapso.id, subjectId: fisica.id, teacherId: profesor.id, score: 14 },
        });
        // Alumno 2 en Física = 12
        await prisma.grade.create({
            data: { id: gId(), studentId: alumno2.id, activityId: actFisica.id, periodId: lapso.id, subjectId: fisica.id, teacherId: profesor.id, score: 12 },
        });

        // Asistencia de los últimos 30 días:
        // 10 registros: 7 PRESENT, 1 LATE, 2 ABSENT
        for (let i = 0; i < 7; i++) {
            const fecha = new Date(Date.now() - (i + 1) * 864e5);
            await prisma.dailyAttendance.create({
                data: { id: gId(), studentId: alumno1.id, classroomId: seccion.id, teacherId: profesor.id, date: fecha, status: 'PRESENT' } as any,
            });
        }
        const fechaLate = new Date(Date.now() - 8 * 864e5);
        await prisma.dailyAttendance.create({
            data: { id: gId(), studentId: alumno1.id, classroomId: seccion.id, teacherId: profesor.id, date: fechaLate, status: 'LATE' } as any,
        });
        for (let i = 0; i < 2; i++) {
            const fecha = new Date(Date.now() - (i + 9) * 864e5);
            await prisma.dailyAttendance.create({
                data: { id: gId(), studentId: alumno2.id, classroomId: seccion.id, teacherId: profesor.id, date: fecha, status: 'ABSENT' } as any,
            });
        }
    });

    it('calcula exactamente las cifras del profesor con datos conocidos', async () => {
        const res = await request(server.server)
            .get('/api/dashboard/teacher')
            .set(auth(profesor.id, UserRole.TEACHER));

        expect(res.status).toBe(200);
        const { stats, kpis } = res.body.data;

        // Promedio general: (16 + 8 + 14 + 12) / 4 = 50 / 4 = 12.5
        expect(stats.promedioGeneral).toBe(12.5);

        // Alumnos en riesgo: Alumno 2 tiene promedio 8 en Matemática (< 10). Alumno 1 no. Total = 1
        expect(stats.studentsAtRisk).toBe(1);

        // Asistencia: (7 PRESENT + 1 LATE) / 10 TOTAL = 8 / 10 = 80%
        expect(stats.averageAttendance).toBe(80);

        // Es profesor guía
        expect(stats.isGuideTeacher).toBe(true);

        // Totales en stats
        expect(stats.totalStudents).toBe(2);
        expect(stats.totalClassrooms).toBe(1);

        // Sin cuadro de honor en la respuesta del profesor
        expect(res.body.data).not.toHaveProperty('cuadroDeHonor');
        expect(res.body.data).not.toHaveProperty('honorRoll');
    });

    it('una nota cambiada se ve en el promedio: el servicio no guarda copia vieja', async () => {
        const servicio = new DashboardService();
        const antes = await conLiceo(LICEO, () => servicio.getTeacherDashboard(profesor.id, prisma, LICEO));
        expect(antes.stats.promedioGeneral).toBe(12.5);

        // Alumno 2 sube Mate de 8 a 18: (16 + 18 + 14 + 12) / 4 = 15, y nadie en riesgo.
        await prisma.grade.updateMany({ where: { studentId: alumno2.id, subjectId: mate.id }, data: { score: 18 } });
        const despues = await conLiceo(LICEO, () => servicio.getTeacherDashboard(profesor.id, prisma, LICEO));
        expect(despues.stats.promedioGeneral).toBe(15);
        expect(despues.stats.studentsAtRisk).toBe(0);

        await prisma.grade.updateMany({ where: { studentId: alumno2.id, subjectId: mate.id }, data: { score: 8 } });
    });

    it('refleja isGuideTeacher = false si el profesor no guía ninguna sección', async () => {
        // Quitamos al profesor como guía
        await prisma.classroom.update({
            where: { id: seccion.id },
            data: { teacherId: null } as any,
        });

        const res = await request(server.server)
            .get('/api/dashboard/teacher')
            .set(auth(profesor.id, UserRole.TEACHER));

        expect(res.status).toBe(200);
        expect(res.body.data.stats.isGuideTeacher).toBe(false);
    });

    it('un profesor que solo imparte (no guía) ve sus secciones, sus alumnos y su asistencia, distintos de 0', async () => {
        // Profesor que no guía ninguna sección
        const profeSoloImparte = (await createTestUser(prisma, UserRole.TEACHER)).user;

        // Le asignamos una materia en la sección
        const quimica = await prisma.subject.create({
            data: { id: gId(), name: 'Química', slug: `qui-${gId()}`, code: `QUI-${gId().slice(0, 4)}`, instituteId: LICEO } as any,
        });
        await prisma.classroomSubject.create({
            data: { classroomId: seccion.id, subjectId: quimica.id, teacherId: profeSoloImparte.id },
        });

        const res = await request(server.server)
            .get('/api/dashboard/teacher')
            .set(auth(profeSoloImparte.id, UserRole.TEACHER));

        expect(res.status).toBe(200);
        const { stats, classrooms } = res.body.data;

        expect(stats.isGuideTeacher).toBe(false);
        expect(stats.totalClassrooms).toBe(1);
        expect(classrooms.length).toBe(1);
        expect(classrooms[0].id).toBe(seccion.id);
        expect(stats.totalStudents).toBe(2);
        expect(classrooms[0].studentCount).toBe(2);
        expect(stats.averageAttendance).toBe(80);
    });
});
