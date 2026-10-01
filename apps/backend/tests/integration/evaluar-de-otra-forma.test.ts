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
 * EVALUAR A UN ALUMNO DE OTRA FORMA EN UNA ACTIVIDAD
 *
 * «Imagina que un estudiante no pueda hacer deporte: a ese estudiante se le va
 * a evaluar con el cuaderno.» El profesor lo anota en la actividad, alumno por
 * alumno; la nota se pone igual y cuenta igual. El alumno y su representante lo
 * ven; los compañeros, no.
 */

const SLUG = 'test-institute';

describe('Evaluar de otra forma', () => {
    let server: FastifyInstance;
    let prisma: PrismaClient;
    let seccion: any;
    let otraSeccion: any;
    let materia: any;
    let actividad: any;
    let ana: any;
    let beto: any;
    let luis: any; // de otra sección
    const tk: Record<string, string> = {};

    const cab = (t: string) => ({ Authorization: `Bearer ${t}`, 'X-Institute-Slug': SLUG });
    const anotar = (t: string, alumnoId: string, cuerpo: Record<string, unknown>) =>
        request(server.server).put(`/api/sessions/activities/${actividad.id}/otra-forma/${alumnoId}`).set(cab(t)).send(cuerpo);

    beforeAll(async () => {
        server = await createTestServer();
        prisma = await createTestPrismaClient();

        const year = await createTestAcademicYear(prisma, 'institute');
        seccion = await createTestClassroom(prisma, year.id, 'institute');
        otraSeccion = await prisma.classroom.create({
            data: {
                id: `c${createId()}`,
                name: '1er Grado B',
                slug: `aula-b-${createId()}`,
                grade: 1,
                section: 'B',
                capacity: 30,
                academicYearId: year.id,
                instituteId: 'institute',
            },
        });
        materia = await createTestSubject(prisma, 'institute');

        const profe = (await createTestUser(prisma, UserRole.TEACHER)).user;
        const profeAjeno = (await createTestUser(prisma, UserRole.TEACHER)).user;
        ana = (await createTestUser(prisma, UserRole.STUDENT)).user;
        beto = (await createTestUser(prisma, UserRole.STUDENT)).user;
        luis = (await createTestUser(prisma, UserRole.STUDENT)).user;

        await prisma.classroomSubject.create({ data: { classroomId: seccion.id, subjectId: materia.id, teacherId: profe.id } });
        for (const [a, s] of [[ana, seccion], [beto, seccion], [luis, otraSeccion]] as const) {
            await prisma.studentClassroom.create({ data: { studentId: a.id, classroomId: s.id, academicYearId: year.id, isActive: true } });
        }
        actividad = await prisma.classActivity.create({
            data: {
                classroomId: seccion.id,
                subjectId: materia.id,
                title: 'Circuito de resistencia',
                type: 'ACTIVIDAD',
                maxScore: 20,
                scores: { [ana.id]: 17, [beto.id]: 14 },
            },
        });

        tk.profe = generateTestToken(profe.id, UserRole.TEACHER, 'institute');
        tk.profeAjeno = generateTestToken(profeAjeno.id, UserRole.TEACHER, 'institute');
        tk.ana = generateTestToken(ana.id, UserRole.STUDENT, 'institute');
        tk.beto = generateTestToken(beto.id, UserRole.STUDENT, 'institute');
    }, 120000);

    afterAll(async () => {
        await prisma?.$disconnect();
        await server?.close();
    });

    it('OTRA-01: el profesor anota que a Ana se le evalúa con el cuaderno, y por qué', async () => {
        const res = await anotar(tk.profe, ana.id, { metodo: 'Cuaderno', motivo: 'Reposo médico' });
        expect(res.status).toBe(200);
        expect(res.body.activity.evaluadoDeOtraForma).toEqual({ [ana.id]: { metodo: 'Cuaderno', motivo: 'Reposo médico' } });
        // La nota no se toca: cuenta igual.
        expect(res.body.activity.scores).toEqual({ [ana.id]: 17, [beto.id]: 14 });
    });

    it('OTRA-02: un profesor que no da esa clase no puede; un alumno, tampoco', async () => {
        expect((await anotar(tk.profeAjeno, beto.id, { metodo: 'Trabajo escrito' })).status).toBe(403);
        expect((await anotar(tk.ana, beto.id, { metodo: 'Trabajo escrito' })).status).toBe(403);
    });

    it('OTRA-03: no se anota a un alumno de otra sección', async () => {
        const res = await anotar(tk.profe, luis.id, { metodo: 'Cuaderno' });
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('ALUMNO_AJENO');
    });

    it('OTRA-04: Ana lo ve en «Mi clase»; Beto no ve lo de Ana', async () => {
        const suya = await request(server.server).get(`/api/students/${ana.id}/materias/${materia.id}/clase`).set(cab(tk.ana));
        expect(suya.status).toBe(200);
        expect(suya.body.actividades[0].otraForma).toEqual({ metodo: 'Cuaderno', motivo: 'Reposo médico' });

        const deBeto = await request(server.server).get(`/api/students/${beto.id}/materias/${materia.id}/clase`).set(cab(tk.beto));
        expect(deBeto.body.actividades[0].otraForma).toBeNull();
        expect(JSON.stringify(deBeto.body)).not.toContain('Reposo médico');
    });

    it('OTRA-05: anotar a otro no borra el de Ana; quitarlo vuelve a como los demás', async () => {
        await anotar(tk.profe, beto.id, { metodo: 'Exposición' });
        let guardada = await prisma.classActivity.findUnique({ where: { id: actividad.id } });
        expect(Object.keys(guardada!.evaluadoDeOtraForma as any).sort()).toEqual([ana.id, beto.id].sort());

        const quitar = await request(server.server)
            .delete(`/api/sessions/activities/${actividad.id}/otra-forma/${ana.id}`)
            .set(cab(tk.profe));
        expect(quitar.status).toBe(200);
        guardada = await prisma.classActivity.findUnique({ where: { id: actividad.id } });
        expect(guardada!.evaluadoDeOtraForma).toEqual({ [beto.id]: { metodo: 'Exposición' } });
    });
});
