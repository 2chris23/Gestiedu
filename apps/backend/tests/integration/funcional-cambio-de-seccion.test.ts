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
import { gradesService } from '../../src/services/grades.service';
import { bulkSubjectAverages } from '../../src/services/bulk-averages.service';
import { RedisCache } from '../../src/config/redis';

/**
 * CAMBIAR A UN ALUMNO DE SECCIÓN A MITAD DE LAPSO
 *
 * Es una de las quejas más repetidas de los sistemas escolares (PowerSchool,
 * Schoology): el alumno se cambia de sección y sus notas de la anterior se
 * quedan por el camino, o el sistema no deja cambiarlo. Aquí se prueba:
 *
 *   SEC-01  inscribir en otra sección a quien ya está en una, lo cambia (no 500);
 *   SEC-02  el cambio respeta el cupo de la sección de destino;
 *   SEC-03  quien quedó con una inscripción inactiva se puede inscribir en otra;
 *   SEC-04  las notas puestas en la sección anterior siguen contando en su promedio;
 *   SEC-05  el cálculo en bloque (listas, paneles) da el mismo número.
 */

const SLUG = 'test-institute';
const gId = () => `c${createId()}`;

describe('Cambio de sección (SEC-01…05)', () => {
    let server: FastifyInstance;
    let prisma: PrismaClient;
    let tokenAdmin: string;
    let profe: any;
    let year: any;
    let lapso: any;
    let seccionA: any;
    let seccionB: any;
    let mate: any;
    let alumno: any;

    const auth = (token: string) => ({ Authorization: `Bearer ${token}`, 'X-Institute-Slug': SLUG });

    beforeAll(async () => {
        server = await createTestServer();
        prisma = await createTestPrismaClient();
    }, 120000);

    afterAll(async () => {
        await platformPrisma.institute.update({ where: { id: 'institute' }, data: { academicConfig: {} } }).catch(() => undefined);
        await prisma.$disconnect();
        await server.close();
    });

    const crearSeccion = (letra: string, capacity = 30) =>
        prisma.classroom.create({
            data: { id: gId(), name: `1er Año ${letra}`, slug: `aula-${gId()}`, grade: 1, section: letra, capacity, academicYearId: year.id, instituteId: 'institute' } as any,
        });

    beforeEach(async () => {
        await cleanTestDatabase(prisma);
        await RedisCache.clearPattern('*').catch(() => undefined);
        await platformPrisma.institute.update({ where: { id: 'institute' }, data: { academicConfig: { notaMinimaAprobatoria: 10 } } });

        const admin = (await createTestUser(prisma, UserRole.ADMIN)).user;
        profe = (await createTestUser(prisma, UserRole.TEACHER)).user;
        tokenAdmin = generateTestToken(admin.id, UserRole.ADMIN, 'institute');

        const hoy = Date.now();
        year = await prisma.academicYear.create({
            data: { id: gId(), name: `Ciclo-${gId().slice(0, 6)}`, startDate: new Date(hoy - 60 * 864e5), endDate: new Date(hoy + 200 * 864e5), isActive: true, status: 'ACTIVE', instituteId: 'institute' } as any,
        });
        lapso = await prisma.period.create({
            data: { id: gId(), name: 'Primer Lapso', startDate: new Date(hoy - 60 * 864e5), endDate: new Date(hoy + 30 * 864e5), isActive: true, academicYearId: year.id },
        });
        seccionA = await crearSeccion('A');
        seccionB = await crearSeccion('B');
        mate = await prisma.subject.create({
            data: { id: gId(), name: `Matemática-${gId().slice(0, 5)}`, code: `MAT-${gId().slice(0, 6).toUpperCase()}`, slug: `mate-${gId()}`, instituteId: 'institute' } as any,
        });
        for (const s of [seccionA, seccionB]) {
            await prisma.classroomSubject.create({ data: { classroomId: s.id, subjectId: mate.id, teacherId: profe.id } });
        }
        alumno = (await createTestUser(prisma, UserRole.STUDENT)).user;
        await prisma.studentClassroom.create({
            data: { id: gId(), studentId: alumno.id, classroomId: seccionA.id, academicYearId: year.id, isActive: true },
        });
    }, 180000);

    const inscribirEn = (seccionId: string) =>
        request(server.server)
            .post(`/api/classrooms/${seccionId}/students`)
            .set(auth(tokenAdmin))
            .send({ studentId: alumno.id });

    it('SEC-01: inscribirlo en otra sección del mismo ciclo lo CAMBIA de sección', async () => {
        const res = await inscribirEn(seccionB.id);
        expect(res.status).toBe(200);

        const suyas = await prisma.studentClassroom.findMany({ where: { studentId: alumno.id, academicYearId: year.id } });
        const activas = suyas.filter((i) => i.isActive);
        expect(activas).toHaveLength(1);
        expect(activas[0].classroomId).toBe(seccionB.id);
    });

    it('SEC-02: el cambio respeta el cupo de la sección de destino', async () => {
        const llena = await crearSeccion('C', 1);
        const { user: otro } = await createTestUser(prisma, UserRole.STUDENT);
        await prisma.studentClassroom.create({
            data: { id: gId(), studentId: otro.id, classroomId: llena.id, academicYearId: year.id, isActive: true },
        });

        const res = await inscribirEn(llena.id);
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('CLASSROOM_FULL');
        // Y sigue donde estaba.
        const suya = await prisma.studentClassroom.findFirst({ where: { studentId: alumno.id, academicYearId: year.id } });
        expect(suya?.classroomId).toBe(seccionA.id);
        expect(suya?.isActive).toBe(true);
    });

    it('SEC-03: con la inscripción de la sección A inactiva, se le puede inscribir en la B', async () => {
        await prisma.studentClassroom.updateMany({ where: { studentId: alumno.id }, data: { isActive: false } });

        const res = await inscribirEn(seccionB.id);
        expect([200, 201]).toContain(res.status);
        const suya = await prisma.studentClassroom.findFirst({ where: { studentId: alumno.id, academicYearId: year.id } });
        expect(suya?.classroomId).toBe(seccionB.id);
        expect(suya?.isActive).toBe(true);
    });

    /**
     * En la A tenía el plan con dos criterios de 10 puntos y sacó 18 en el
     * primero. Se cambia a la B, cuyo plan tiene otros dos de 10, y saca 10 en
     * el segundo. Lo calificado son 20 puntos: 18/20×10 + 10/20×10 = 9 + 5 = 14.
     * Si se pierde lo de la A, sale 10 (solo el 10 de la B).
     */
    const montarNotasEnLasDosSecciones = async () => {
        const fila = (classroomId: string, semana: number) =>
            prisma.evaluationPlanRow.create({
                data: { id: gId(), classroomId, subjectId: mate.id, lapso: '1', rowType: 'EVALUATION', weekNumber: semana, puntos: 10, ponderacion: 50, actividadEval: `Criterio ${semana}` } as any,
            });
        const a1 = await fila(seccionA.id, 1);
        await fila(seccionA.id, 2);
        await fila(seccionB.id, 1);
        const b2 = await fila(seccionB.id, 2);

        await prisma.classActivity.create({
            data: { id: gId(), title: 'Examen en la A', classroomId: seccionA.id, subjectId: mate.id, planRowId: a1.id, maxScore: 20, scores: { [alumno.id]: 18 } } as any,
        });

        // Se cambia de sección a mitad de lapso.
        await prisma.studentClassroom.updateMany({
            where: { studentId: alumno.id, academicYearId: year.id },
            data: { classroomId: seccionB.id },
        });

        await prisma.classActivity.create({
            data: { id: gId(), title: 'Taller en la B', classroomId: seccionB.id, subjectId: mate.id, planRowId: b2.id, maxScore: 20, scores: { [alumno.id]: 10 } } as any,
        });
    };

    it('SEC-04: las notas de la sección anterior siguen contando en su promedio del lapso', async () => {
        await montarNotasEnLasDosSecciones();
        const promedio = await gradesService.calculateWeightedSubjectAverage(prisma, alumno.id, mate.id, lapso.id);
        expect(promedio).toBe(14);
    });

    it('SEC-05: el cálculo en bloque de la sección nueva da lo mismo (14)', async () => {
        await montarNotasEnLasDosSecciones();
        const enBloque = await bulkSubjectAverages(prisma, {
            classroomId: seccionB.id,
            studentIds: [alumno.id],
            subjectIds: [mate.id],
            periodId: lapso.id,
        });
        expect(enBloque.get(alumno.id)!.get(mate.id)).toBe(14);
    });
});
