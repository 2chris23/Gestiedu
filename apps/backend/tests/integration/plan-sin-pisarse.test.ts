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
 * EL PLAN DE EVALUACIÓN NO SE PISA
 *
 * Guardar el plan manda el plan entero y lo que no viene se borra. Con el plan
 * abierto en dos pestañas, guardar desde la vieja borraba lo añadido en la
 * nueva. Ahora el plan lleva versión: quien guarda sobre una versión que ya no
 * es la de la base recibe 409 y no se toca nada. Ver `utils/version-del-plan.ts`.
 */

const SLUG = 'test-institute';
const LAPSO = '1';
const gId = () => `c${createId()}`;

describe('El plan de evaluación no se pisa', () => {
    let server: FastifyInstance;
    let prisma: PrismaClient;
    let token: string;
    let classroom: any;
    let subject: any;

    const comoProfesor = (req: request.Test) =>
        req.set('Authorization', `Bearer ${token}`).set('X-Institute-Slug', SLUG);

    const criterio = (semana: number, titulo: string, puntos: number) => ({
        id: `new_${semana}_${titulo}`,
        rowType: 'EVALUATION',
        weekNumber: semana,
        actividadEval: titulo,
        puntos,
    });

    async function leer() {
        const res = await comoProfesor(request(server.server).get('/api/evaluation-plan/rows')).query({
            classroomId: classroom.id,
            subjectId: subject.id,
            lapso: LAPSO,
        });
        expect(res.status).toBe(200);
        return res.body as { rows: any[]; version: string };
    }

    function guardar(rows: any[], version?: string) {
        return comoProfesor(request(server.server).post('/api/evaluation-plan/rows/batch')).send({
            classroomId: classroom.id,
            subjectId: subject.id,
            lapso: LAPSO,
            rows,
            ...(version !== undefined && { version }),
        });
    }

    /** Lo guardado, como lo mandaría la pantalla al volver a guardarlo. */
    const comoLoMandaLaPantalla = (rows: any[]) =>
        rows.map((r) => ({ id: r.id, rowType: r.rowType, weekNumber: r.weekNumber, actividadEval: r.actividadEval, puntos: r.puntos }));

    beforeAll(async () => {
        server = await createTestServer();
        prisma = await createTestPrismaClient();

        const profesor = (await createTestUser(prisma, UserRole.TEACHER)).user;
        token = generateTestToken(profesor.id, UserRole.TEACHER, 'institute');

        const year = await createTestAcademicYear(prisma, 'institute');
        classroom = await prisma.classroom.create({
            data: {
                id: gId(),
                name: 'Plan sin pisarse',
                slug: `plan-${Date.now()}`,
                grade: 1,
                section: 'A',
                capacity: 30,
                academicYearId: year.id,
                instituteId: 'institute',
                teacherId: profesor.id,
            },
        });
        subject = await createTestSubject(prisma, 'institute');
        await prisma.classroomSubject.create({
            data: { classroomId: classroom.id, subjectId: subject.id, teacherId: profesor.id, weeklyBlocks: 3 },
        });
    }, 180000);

    afterAll(async () => {
        await prisma.$disconnect();
        await server.close();
    }, 120000);

    it('PLANV-01: leer da la versión, y guardar con ella devuelve la nueva', async () => {
        const vacio = await leer();
        expect(typeof vacio.version).toBe('string');

        const res = await guardar([criterio(1, 'Prueba corta', 10), criterio(2, 'Taller', 10)], vacio.version);
        expect(res.status).toBe(200);
        expect(res.body.version).toBeTruthy();
        expect(res.body.version).not.toBe(vacio.version);

        const ahora = await leer();
        expect(ahora.rows).toHaveLength(2);
        expect(ahora.version).toBe(res.body.version);
    }, 60000);

    it('PLANV-02: guardar desde una pestaña vieja da 409 y no borra lo que añadió la nueva', async () => {
        const inicio = await leer();

        // Pestaña A: añade una semana y guarda.
        const conTercera = [
            ...comoLoMandaLaPantalla(inicio.rows).map((r) => ({ ...r, puntos: r.weekNumber === 1 ? 5 : r.puntos })),
            criterio(3, 'Exposición', 5),
        ];
        const a = await guardar(conTercera, inicio.version);
        expect(a.status).toBe(200);

        // Pestaña B: seguía con el plan de antes y guarda un cambio suyo.
        const b = await guardar(
            comoLoMandaLaPantalla(inicio.rows).map((r) => ({ ...r, actividadEval: `${r.actividadEval} (B)` })),
            inicio.version
        );
        expect(b.status).toBe(409);
        expect(b.body.code).toBe('PLAN_CAMBIADO_EN_OTRO_SITIO');

        // La semana 3 sigue ahí, y nada de B se coló.
        const final = await leer();
        expect(final.rows.map((r) => r.actividadEval).sort()).toEqual(['Exposición', 'Prueba corta', 'Taller']);
    }, 60000);

    it('PLANV-03: dos guardados a la vez sobre la misma versión: uno entra y el otro recibe 409', async () => {
        const inicio = await leer();
        const base = comoLoMandaLaPantalla(inicio.rows);

        const [x, y] = await Promise.all([
            guardar(base.map((r) => ({ ...r, actividadEval: `${r.actividadEval} X` })), inicio.version),
            guardar(base.map((r) => ({ ...r, actividadEval: `${r.actividadEval} Y` })), inicio.version),
        ]);
        expect([x.status, y.status].sort()).toEqual([200, 409]);

        const final = await leer();
        const sufijos = new Set(final.rows.map((r) => r.actividadEval.slice(-1)));
        expect(sufijos.size).toBe(1); // o todas X o todas Y, nunca mezcladas
    }, 60000);

    it('PLANV-04: guardar sin cambiar nada no reescribe filas ni mueve la fecha de sus actividades', async () => {
        const inicio = await leer();
        const actividadesAntes = await prisma.activity.findMany({
            where: { classroomId: classroom.id, subjectId: subject.id },
            select: { id: true, startDate: true, updatedAt: true },
            orderBy: { id: 'asc' },
        });

        const res = await guardar(comoLoMandaLaPantalla(inicio.rows), inicio.version);
        expect(res.status).toBe(200);
        expect(res.body.version).toBe(inicio.version);

        const actividadesDespues = await prisma.activity.findMany({
            where: { classroomId: classroom.id, subjectId: subject.id },
            select: { id: true, startDate: true, updatedAt: true },
            orderBy: { id: 'asc' },
        });
        expect(actividadesDespues).toEqual(actividadesAntes);
    }, 60000);

    it('PLANV-05: quien guarda sin versión (otra pantalla, otra versión de la app) sigue pudiendo', async () => {
        const inicio = await leer();
        const res = await guardar(comoLoMandaLaPantalla(inicio.rows));
        expect(res.status).toBe(200);
    }, 60000);
});
