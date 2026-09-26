import { FastifyInstance } from 'fastify';
import request = require('supertest');
import { PrismaClient } from '@prisma/client';
import { UserRole } from '../../src/utils/prisma-enums';
import {
    createTestServer,
    createTestPrismaClient,
    createTestUser,
    createTestClassroom,
    createTestSubject,
    generateTestToken,
} from '../helpers';

/**
 * CUÁNDO EMPIEZA EL PLAN EN CADA LAPSO
 *
 * Muchos liceos dejan una o dos semanas al empezar el lapso (diagnóstico,
 * adaptación) y el plan de evaluación empieza después. El admin lo pone en el
 * editor del ciclo, por lapso, libre. Aquí se comprueba que:
 *
 *   - se guarda y se rechaza fuera del lapso;
 *   - antes de esa fecha el horario en vivo dice «Diagnóstico» y no enseña tema;
 *   - la «Semana N» de la clase en vivo es la misma que la de la rejilla, también
 *     en el 2º lapso (antes la clase contaba desde el inicio del AÑO).
 */

const SLUG = 'test-institute';

describe('Inicio del plan por lapso', () => {
    let server: FastifyInstance;
    let prisma: PrismaClient;
    let tkAdmin: string;
    let tkProfe: string;
    let year: any;
    let seccion: any;
    let materia: any;
    let lapsos: any[];

    const cab = (t: string) => ({ Authorization: `Bearer ${t}`, 'X-Institute-Slug': SLUG });

    beforeAll(async () => {
        server = await createTestServer();
        prisma = await createTestPrismaClient();

        const admin = (await createTestUser(prisma, UserRole.ADMIN)).user;
        const profe = (await createTestUser(prisma, UserRole.TEACHER)).user;
        tkAdmin = generateTestToken(admin.id, UserRole.ADMIN, 'institute');
        tkProfe = generateTestToken(profe.id, UserRole.TEACHER, 'institute');

        year = await prisma.academicYear.create({
            data: {
                name: '2026-2027 plan',
                startDate: new Date('2026-09-14'),
                endDate: new Date('2027-07-16'),
                status: 'ACTIVE',
                instituteId: 'institute',
                periods: {
                    create: [
                        { name: 'Primer Lapso', startDate: new Date('2026-09-14'), endDate: new Date('2026-12-15') },
                        { name: 'Segundo Lapso', startDate: new Date('2027-01-11'), endDate: new Date('2027-04-02') },
                        { name: 'Tercer Lapso', startDate: new Date('2027-04-12'), endDate: new Date('2027-07-16') },
                    ],
                },
            } as any,
            include: { periods: { orderBy: { startDate: 'asc' } } },
        });
        lapsos = (year as any).periods;
        seccion = await createTestClassroom(prisma, year.id, 'institute');
        materia = await createTestSubject(prisma, 'institute');
        await prisma.classroomSubject.create({ data: { classroomId: seccion.id, subjectId: materia.id, teacherId: profe.id } });

        // Plan del 1er lapso (semana 1) y del 2º (semana 2).
        for (const [lapso, semana, tema] of [
            ['1', 1, 'Tema del primer lapso'],
            ['2', 2, 'Tema de la semana 2 del segundo lapso'],
        ] as const) {
            await prisma.evaluationPlanMetadata.create({ data: { classroomId: seccion.id, subjectId: materia.id, lapso } });
            await prisma.evaluationPlanRow.create({
                data: { classroomId: seccion.id, subjectId: materia.id, lapso, weekNumber: semana, orderIndex: 0, rowType: 'HEADER', title: tema },
            });
        }
    }, 120000);

    afterAll(async () => {
        await prisma?.$disconnect();
        await server?.close();
    });

    const resumen = (fecha: string) =>
        request(server.server).get('/api/sessions/live-overview').query({ classroomId: seccion.id, date: fecha }).set(cab(tkProfe));

    it('PLANINI-01: el admin pone que el plan del 1er lapso empieza el 28/09 y cómo se llaman las semanas de antes', async () => {
        const res = await request(server.server)
            .put(`/api/academic-years/${year.id}`)
            .set(cab(tkAdmin))
            .send({
                name: year.name,
                startDate: '2026-09-14',
                endDate: '2027-07-16',
                periods: lapsos.map((l, i) => ({
                    id: l.id,
                    name: l.name,
                    startDate: l.startDate.toISOString().slice(0, 10),
                    endDate: l.endDate.toISOString().slice(0, 10),
                    ...(i === 0 ? { inicioDelPlan: '2026-09-28', nombreAntesDelPlan: 'Adaptación' } : {}),
                })),
            });
        expect(res.status).toBe(200);
        const primero = await prisma.period.findUnique({ where: { id: lapsos[0].id } });
        expect(primero?.inicioDelPlan?.toISOString().slice(0, 10)).toBe('2026-09-28');
        expect(primero?.nombreAntesDelPlan).toBe('Adaptación');
    });

    it('PLANINI-02: un inicio del plan fuera del lapso no se acepta', async () => {
        const res = await request(server.server)
            .put(`/api/academic-years/${year.id}`)
            .set(cab(tkAdmin))
            .send({
                name: year.name,
                startDate: '2026-09-14',
                endDate: '2027-07-16',
                periods: [{ id: lapsos[0].id, name: lapsos[0].name, startDate: '2026-09-14', endDate: '2026-12-15', inicioDelPlan: '2027-01-20' }],
            });
        expect(res.status).toBe(400);
    });

    it('PLANINI-03: antes del inicio del plan, el horario en vivo dice «Adaptación» y no enseña tema', async () => {
        const res = await resumen('2026-09-15');
        expect(res.status).toBe(200);
        const m = res.body.overview[materia.id];
        expect(m.antesDelPlan).toBe(true);
        expect(m.nombreAntesDelPlan).toBe('Adaptación');
        expect(m.temaGenerador).toBeUndefined();
    });

    it('PLANINI-04: la semana del 28/09 es la Semana 1 del plan, con su tema', async () => {
        const res = await resumen('2026-09-28');
        const m = res.body.overview[materia.id];
        expect(m.antesDelPlan).toBe(false);
        expect(m.weekNumber).toBe(1);
        expect(m.temaGenerador).toBe('Tema del primer lapso');
    });

    it('PLANINI-05: en el 2º lapso, la semana se cuenta desde el 2º lapso y sale SU tema (no el del 1º)', async () => {
        const res = await resumen('2027-01-18');
        const m = res.body.overview[materia.id];
        expect(m.weekNumber).toBe(2);
        expect(m.temaGenerador).toBe('Tema de la semana 2 del segundo lapso');

        const detalle = await request(server.server)
            .get('/api/sessions/live-detail')
            .query({ classroomId: seccion.id, subjectId: materia.id, date: '2027-01-18' })
            .set(cab(tkProfe));
        expect(detalle.status).toBe(200);
        expect(detalle.body.weekNumber).toBe(2);
        expect(detalle.body.planLapso).toBe('2');
    });

    it('PLANINI-06: la rejilla del plan cuenta sus semanas desde el inicio del plan', async () => {
        const res = await request(server.server)
            .get('/api/evaluation-plan/metadata')
            .query({ classroomId: seccion.id, subjectId: materia.id, lapso: '1' })
            .set(cab(tkProfe));
        expect(res.status).toBe(200);
        const auto = res.body.autoPopulated ?? res.body.data?.autoPopulated;
        expect(String(auto.lapsoStartDate).slice(0, 10)).toBe('2026-09-28');
        expect(auto.nombreAntesDelPlan).toBe('Adaptación');
    });
});
