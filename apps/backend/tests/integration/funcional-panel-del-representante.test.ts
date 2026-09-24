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

/**
 * LO QUE VE EL REPRESENTANTE ES LO MISMO QUE VE SU HIJO
 *
 * Una queja clásica de los portales de padres (PowerSchool, Infinite Campus):
 * el número del portal no coincide con el del profesor o el del alumno. Aquí
 * el panel del representante calculaba el promedio con la tabla de notas
 * antigua, a pelo: sin las notas de Clase en Vivo (que es donde se ponen casi
 * todas) y sin los puntos del plan de evaluación.
 *
 *   REP-01  el promedio del hijo en el panel del representante es el mismo
 *           que el alumno ve en su propio panel;
 *   REP-02  sin ningún registro de asistencia en el lapso (el primer día) no se
 *           avisa «Asistencia baja: 0%»: no hay dato que juzgar.
 */

const SLUG = 'test-institute';
const gId = () => `c${createId()}`;

describe('Panel del representante (REP-01…02)', () => {
    let server: FastifyInstance;
    let prisma: PrismaClient;
    let profe: any;
    let hijo: any;
    let tutor: any;
    let seccion: any;
    let mate: any;
    let caste: any;
    let year: any;

    const auth = (id: string, role: UserRole) => ({
        Authorization: `Bearer ${generateTestToken(id, role, 'institute')}`,
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
        await RedisCache.clearPattern('*').catch(() => undefined);
        await platformPrisma.institute.update({
            where: { id: 'institute' },
            data: { academicConfig: { notaMinimaAprobatoria: 10, asistenciaMinima: 80 } },
        });
        profe = (await createTestUser(prisma, UserRole.TEACHER)).user;
        const hoy = Date.now();
        year = await prisma.academicYear.create({
            data: { id: gId(), name: `Ciclo-${gId().slice(0, 6)}`, startDate: new Date(hoy - 60 * 864e5), endDate: new Date(hoy + 200 * 864e5), isActive: true, status: 'ACTIVE', instituteId: 'institute' } as any,
        });
        // El lapso en curso acaba de empezar.
        await prisma.period.create({
            data: { id: gId(), name: 'Segundo Lapso', startDate: new Date(hoy - 1 * 864e5), endDate: new Date(hoy + 80 * 864e5), isActive: true, academicYearId: year.id },
        });
        seccion = await prisma.classroom.create({
            data: { id: gId(), name: '1er Año A', slug: `aula-${gId()}`, grade: 1, section: 'A', capacity: 30, academicYearId: year.id, instituteId: 'institute' } as any,
        });
        mate = await prisma.subject.create({
            data: { id: gId(), name: 'Matemática', code: `MAT-${gId().slice(0, 6).toUpperCase()}`, slug: `mate-${gId()}`, instituteId: 'institute' } as any,
        });
        caste = await prisma.subject.create({
            data: { id: gId(), name: 'Castellano', code: `CAS-${gId().slice(0, 6).toUpperCase()}`, slug: `caste-${gId()}`, instituteId: 'institute' } as any,
        });
        for (const m of [mate, caste]) {
            await prisma.classroomSubject.create({ data: { classroomId: seccion.id, subjectId: m.id, teacherId: profe.id } });
        }
        hijo = (await createTestUser(prisma, UserRole.STUDENT)).user;
        await prisma.studentClassroom.create({
            data: { id: gId(), studentId: hijo.id, classroomId: seccion.id, academicYearId: year.id, isActive: true },
        });
        tutor = (await createTestUser(prisma, UserRole.TUTOR)).user;
        await prisma.studentTutor.create({ data: { studentId: hijo.id, tutorId: tutor.id, relationship: 'Padre' } });
    }, 180000);

    it('REP-01: el promedio del hijo en el panel del representante es el que el alumno ve en el suyo', async () => {
        // Todas las notas, en Clase en Vivo, como se ponen en el día a día.
        const nota = (subjectId: string, score: number) =>
            prisma.classActivity.create({
                data: { id: gId(), title: `Act ${gId().slice(0, 5)}`, classroomId: seccion.id, subjectId, maxScore: 20, scores: { [hijo.id]: score } } as any,
            });
        await nota(mate.id, 6);
        await nota(mate.id, 8);
        await nota(caste.id, 9);

        const delAlumno = await request(server.server).get('/api/students/my-dashboard').set(auth(hijo.id, UserRole.STUDENT)).expect(200);
        const suyo = (delAlumno.body.data ?? delAlumno.body).kpis.globalAverage;
        // Matemática (6+8)/2 = 7, Castellano 9 → (7 + 9) / 2 = 8.
        expect(suyo).toBe(8);

        const delRepresentante = await request(server.server).get('/api/dashboard/tutor').set(auth(tutor.id, UserRole.TUTOR)).expect(200);
        const datos = delRepresentante.body.data ?? delRepresentante.body;
        const suHijo = datos.children.find((c: any) => c.id === hijo.id);
        expect(suHijo.average).toBe(suyo);
        // Y con 8 de promedio, el aviso de promedio bajo.
        expect(datos.alerts.some((a: any) => a.studentId === hijo.id && a.type === 'ACADEMIC')).toBe(true);
    }, 60000);

    it('REP-02: sin ningún registro de asistencia en el lapso no se avisa de asistencia baja', async () => {
        const res = await request(server.server).get('/api/dashboard/tutor').set(auth(tutor.id, UserRole.TUTOR)).expect(200);
        const datos = res.body.data ?? res.body;
        expect(datos.alerts.filter((a: any) => a.studentId === hijo.id && a.type === 'ATTENDANCE')).toHaveLength(0);
    }, 60000);
});
