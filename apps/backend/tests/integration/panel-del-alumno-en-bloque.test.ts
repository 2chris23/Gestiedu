process.env.CONTAR_CONSULTAS = '1';

import { FastifyInstance } from 'fastify';
import request = require('supertest');
import { PrismaClient } from '@prisma/client';
import { createId } from '@paralleldrive/cuid2';
import { UserRole } from '../../src/utils/prisma-enums';
import { gradesService } from '../../src/services/grades.service';
import { consultasALaBase, invalidateTenantCache } from '../../src/config/database';
import {
    createTestServer,
    createTestPrismaClient,
    createTestUser,
    createTestSubject,
    generateTestToken,
} from '../helpers';

/**
 * EL PANEL DEL ALUMNO, EN BLOQUE
 *
 * Es la pantalla que más se abre del sistema (cada alumno, cada vez que entra)
 * y la que peor aguantaba: con 500 personas a la vez, su p99 llegó a 13 s. El
 * motivo: calculaba el promedio materia por materia y lapso por lapso, cada uno
 * con sus propias consultas, así que el número de consultas crecía con las
 * materias —unas 180 en un alumno normal— y todas peleaban por las mismas
 * conexiones.
 *
 * Ahora usa `bulkSubjectAverages`, el mismo cálculo en bloque que ya usaba el
 * listado de una sección. Esta prueba comprueba las dos cosas que importan:
 * que las consultas NO crecen con las materias, y que los números son
 * exactamente los mismos que daba el cálculo de siempre.
 */

const SLUG = 'test-institute';
const gId = () => `c${createId()}`;

describe('El panel del alumno, en bloque', () => {
    let server: FastifyInstance;
    let prisma: PrismaClient;
    let profesor: any;
    let year: any;
    let lapsos: any[] = [];

    async function alumnoCon(materias: number, conPlanEn: number[] = []) {
        const est = (await createTestUser(prisma, UserRole.STUDENT)).user;
        const aula = await prisma.classroom.create({
            data: { id: gId(), name: `Aula ${materias}`, slug: `aula-${gId()}`, grade: 1, section: 'A', capacity: 30, academicYearId: year.id, instituteId: 'institute' },
        });
        await prisma.studentClassroom.create({ data: { studentId: est.id, classroomId: aula.id, academicYearId: year.id, isActive: true } });

        const ids: string[] = [];
        for (let m = 0; m < materias; m++) {
            const materia = await createTestSubject(prisma, 'institute');
            ids.push(materia.id);
            await prisma.classroomSubject.create({ data: { classroomId: aula.id, subjectId: materia.id, teacherId: profesor.id } });

            for (const [i, lapso] of lapsos.entries()) {
                // Dos evaluaciones por lapso; en algunas materias, con plan.
                for (let e = 0; e < 2; e++) {
                    const act = await prisma.activity.create({
                        data: { id: gId(), title: `E${e}`, type: 'EXAM', scope: 'CLASSROOM', startDate: new Date(), createdBy: profesor.id, classroomId: aula.id, subjectId: materia.id, periodId: lapso.id, lapso: String(i + 1) },
                    });
                    await prisma.grade.create({
                        data: { id: gId(), studentId: est.id, activityId: act.id, periodId: lapso.id, subjectId: materia.id, teacherId: profesor.id, score: 8 + ((m * 3 + i * 2 + e * 5) % 12) },
                    });
                    if (conPlanEn.includes(m)) {
                        await prisma.evaluationPlanRow.create({
                            data: { classroomId: aula.id, subjectId: materia.id, lapso: String(i + 1), rowType: 'EVALUATION', weekNumber: e + 1, puntos: e === 0 ? 12 : 8, activityId: act.id },
                        });
                    }
                }
            }
            // Una nota de Clase en Vivo suelta en la primera materia.
            if (m === 0) {
                await prisma.classActivity.create({
                    data: { title: 'En vivo', classroomId: aula.id, subjectId: materia.id, maxScore: 10, scores: { [est.id]: 9 } },
                });
            }
        }
        return { est, aula, materias: ids };
    }

    async function panel(est: any) {
        const token = generateTestToken(est.id, UserRole.STUDENT, 'institute');
        const antes = consultasALaBase();
        const res = await request(server.server)
            .get('/api/dashboard/student')
            .set('Authorization', `Bearer ${token}`)
            .set('X-Institute-Slug', SLUG);
        expect(res.status).toBe(200);
        return { datos: res.body.data, consultas: consultasALaBase() - antes };
    }

    beforeAll(async () => {
        server = await createTestServer();
        await invalidateTenantCache('institute'); // que el cliente nazca contando
        prisma = await createTestPrismaClient();
        profesor = (await createTestUser(prisma, UserRole.TEACHER)).user;
        year = await prisma.academicYear.create({
            data: { id: gId(), name: `2026-${gId()}`, startDate: new Date('2026-09-01'), endDate: new Date('2027-07-15'), isActive: true, status: 'ACTIVE', instituteId: 'institute' },
        });
        lapsos = [];
        for (const [i, nombre] of ['Primer Lapso', 'Segundo Lapso', 'Tercer Lapso'].entries()) {
            lapsos.push(await prisma.period.create({
                data: { id: gId(), name: nombre, academicYearId: year.id, startDate: new Date(2026, 8 + i * 4, 1), endDate: new Date(2026, 11 + i * 4, 1), isActive: i === 0 },
            }));
        }
    }, 240000);

    afterAll(async () => {
        await prisma.$disconnect();
        await server.close();
    }, 120000);

    it('PANEL-01: las consultas no crecen con las materias', async () => {
        const pocas = await alumnoCon(2);
        const muchas = await alumnoCon(8);

        const a = await panel(pocas.est);
        const b = await panel(muchas.est);

        // Mismo trabajo con 2 materias que con 8: la firma de que es en bloque.
        expect(b.consultas - a.consultas).toBeLessThanOrEqual(2);
        expect(b.consultas).toBeLessThan(40);
    }, 240000);

    it('PANEL-02: los promedios son exactamente los de siempre, materia por materia y lapso por lapso', async () => {
        const { est, materias } = await alumnoCon(5, [1, 3]);
        const { datos } = await panel(est);

        const lapsosDelCiclo = lapsos.map((l) => l.id);
        for (const id of materias) {
            const deSiempre = await gradesService.calculateWeightedSubjectAverage(prisma as any, est.id, id, undefined, lapsosDelCiclo);
            const enElPanel = datos.subjects.find((s: any) => s.id === id)?.average ?? 0;
            expect(enElPanel).toBeCloseTo(parseFloat(Number(deSiempre).toFixed(1)), 5);
        }

        for (const lapso of lapsos) {
            const promedios: number[] = [];
            for (const id of materias) {
                const p = await gradesService.calculateWeightedSubjectAverage(prisma as any, est.id, id, lapso.id);
                if (p > 0) promedios.push(p);
            }
            const deSiempre = promedios.length ? Math.round((promedios.reduce((x, y) => x + y, 0) / promedios.length) * 10) / 10 : 0;
            const enElPanel = datos.periodAverages.find((p: any) => p.periodId === lapso.id)?.average;
            expect(enElPanel).toBe(deSiempre);
        }
    }, 240000);
});
