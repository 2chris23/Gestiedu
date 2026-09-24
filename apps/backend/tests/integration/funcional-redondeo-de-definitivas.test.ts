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
 * EL REDONDEO DE LAS NOTAS DEFINITIVAS
 *
 * El Reglamento General de la Ley Orgánica de Educación (Venezuela) manda que,
 * al efectuar los cálculos, una fracción de 0,50 o más sube al entero
 * inmediato superior, y la nota mínima aprobatoria es 10. En la boleta, la
 * nota de cada lapso es un entero, y la definitiva de la materia sale de esas.
 *
 * Gestiedu no redondeaba al cerrar el ciclo: un 9,5 quedaba como materia
 * pendiente cuando, con la regla del MPPE, es un 10 aprobado.
 *
 * Como toda regla, es del liceo: lo del MPPE es el valor por defecto y el
 * liceo puede elegir no redondear (`redondeoDeDefinitivas: 'NINGUNO'`).
 *
 *   RED-01  por defecto (MPPE), un 9,5 es un 10: aprobada, sin pendiente;
 *   RED-02  por defecto, un 9,4 es un 9: pendiente;
 *   RED-03  cada lapso se redondea antes de promediar: 9,4 y 10,4 → 9 y 10 → 9,5 → 10;
 *   RED-04  un liceo que no redondea: el 9,5 sigue siendo pendiente;
 *   RED-05  la regla se guarda desde la configuración académica y se valida.
 */

const SLUG = 'test-institute';
const gId = () => `c${createId()}`;

describe('Redondeo de las definitivas (RED-01…05)', () => {
    let server: FastifyInstance;
    let prisma: PrismaClient;
    let tokenAdmin: string;
    let profe: any;
    let year: any;
    let lapsos: any[];
    let seccion: any;
    let mate: any;
    let alumno: any;

    const auth = () => ({ Authorization: `Bearer ${tokenAdmin}`, 'X-Institute-Slug': SLUG });
    const configurar = (academicConfig: Record<string, unknown>) =>
        platformPrisma.institute.update({ where: { id: 'institute' }, data: { academicConfig: academicConfig as any } });

    beforeAll(async () => {
        server = await createTestServer();
        prisma = await createTestPrismaClient();
    }, 120000);

    afterAll(async () => {
        await configurar({}).catch(() => undefined);
        await prisma.$disconnect();
        await server.close();
    });

    beforeEach(async () => {
        await cleanTestDatabase(prisma);
        await RedisCache.clearPattern('*').catch(() => undefined);
        await configurar({ notaMinimaAprobatoria: 10 });
        const admin = (await createTestUser(prisma, UserRole.ADMIN)).user;
        profe = (await createTestUser(prisma, UserRole.TEACHER)).user;
        tokenAdmin = generateTestToken(admin.id, UserRole.ADMIN, 'institute');
        const hoy = Date.now();
        year = await prisma.academicYear.create({
            data: { id: gId(), name: `Ciclo-${gId().slice(0, 6)}`, startDate: new Date(hoy - 200 * 864e5), endDate: new Date(hoy + 30 * 864e5), isActive: true, status: 'ACTIVE', instituteId: 'institute' } as any,
        });
        lapsos = [];
        for (const [i, nombre] of ['Primer Lapso', 'Segundo Lapso', 'Tercer Lapso'].entries()) {
            lapsos.push(await prisma.period.create({
                data: { id: gId(), name: nombre, startDate: new Date(hoy - (200 - i * 70) * 864e5), endDate: new Date(hoy - (131 - i * 70) * 864e5), isActive: i === 2, academicYearId: year.id },
            }));
        }
        seccion = await prisma.classroom.create({
            data: { id: gId(), name: '1er Año A', slug: `aula-${gId()}`, grade: 1, section: 'A', capacity: 30, academicYearId: year.id, instituteId: 'institute' } as any,
        });
        mate = await prisma.subject.create({
            data: { id: gId(), name: 'Matemática', code: `MAT-${gId().slice(0, 6).toUpperCase()}`, slug: `mate-${gId()}`, instituteId: 'institute' } as any,
        });
        await prisma.classroomSubject.create({ data: { classroomId: seccion.id, subjectId: mate.id, teacherId: profe.id } });
        alumno = (await createTestUser(prisma, UserRole.STUDENT)).user;
        await prisma.studentClassroom.create({
            data: { id: gId(), studentId: alumno.id, classroomId: seccion.id, academicYearId: year.id, isActive: true },
        });
    }, 180000);

    const ponerNota = async (lapso: any, score: number) => {
        const act = await prisma.activity.create({
            data: {
                id: gId(), title: `Evaluación ${gId().slice(0, 5)}`, description: 'x', type: 'TAREA' as any, scope: 'CLASSROOM' as any,
                classroomId: seccion.id, subjectId: mate.id, periodId: lapso.id, createdBy: profe.id, maxGrade: 20, weight: 1,
                startDate: new Date(), endDate: new Date(), dueDate: new Date(),
            } as any,
        });
        await prisma.grade.create({ data: { id: gId(), score, studentId: alumno.id, activityId: act.id, periodId: lapso.id, subjectId: mate.id, teacherId: profe.id } });
    };

    const suSugerencia = async () => {
        const res = await request(server.server).post(`/api/academic-years/${year.id}/close/prepare`).set(auth()).expect(200);
        return res.body.suggestions.find((s: any) => s.studentId === alumno.id);
    };

    it('RED-01: por defecto (MPPE) un 9,5 es un 10 y la materia queda aprobada', async () => {
        await ponerNota(lapsos[0], 9.5);
        const s = await suSugerencia();
        expect(s.subjectGrades[0].average).toBe(10);
        expect(s.pendingCount).toBe(0);
        expect(s.suggestedStatus).toBe('PROMOVIDO');
    }, 60000);

    it('RED-02: por defecto un 9,4 es un 9 y queda pendiente', async () => {
        await ponerNota(lapsos[0], 9.4);
        const s = await suSugerencia();
        expect(s.subjectGrades[0].average).toBe(9);
        expect(s.pendingCount).toBe(1);
    }, 60000);

    it('RED-03: cada lapso se redondea antes de promediar (9,4 y 10,4 → 9 y 10 → 9,5 → 10)', async () => {
        await ponerNota(lapsos[0], 9.4);
        await ponerNota(lapsos[1], 10.4);
        const s = await suSugerencia();
        expect(s.subjectGrades[0].average).toBe(10);
        expect(s.pendingCount).toBe(0);
    }, 60000);

    it('RED-04: un liceo que elige no redondear sigue viendo el 9,5 como pendiente', async () => {
        await configurar({ notaMinimaAprobatoria: 10, redondeoDeDefinitivas: 'NINGUNO' });
        await ponerNota(lapsos[0], 9.5);
        const s = await suSugerencia();
        expect(s.subjectGrades[0].average).toBe(9.5);
        expect(s.pendingCount).toBe(1);
    }, 60000);

    it('RED-05: la regla se guarda desde la configuración académica, y un valor raro no', async () => {
        const antes = await request(server.server).get('/api/institutes/current/academic-config').set(auth()).expect(200);
        expect(antes.body.data.redondeoDeDefinitivas).toBe('MPPE');

        const cambio = await request(server.server)
            .put('/api/institutes/current/academic-config')
            .set(auth())
            .send({ redondeoDeDefinitivas: 'NINGUNO' })
            .expect(200);
        expect(cambio.body.data.redondeoDeDefinitivas).toBe('NINGUNO');

        const raro = await request(server.server)
            .put('/api/institutes/current/academic-config')
            .set(auth())
            .send({ redondeoDeDefinitivas: 'LO-QUE-SEA' })
            .expect(200);
        expect(raro.body.data.redondeoDeDefinitivas).toBe('NINGUNO');
    }, 60000);
});
