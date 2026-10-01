import { FastifyInstance } from 'fastify';
import request = require('supertest');
import { PrismaClient } from '@prisma/client';
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
 * «MI CLASE»: EL ALUMNO VE SU MATERIA, Y SOLO LO SUYO
 *
 * Al tocar una clase de su horario, el alumno (o su representante) ve el plan
 * de evaluación, sus actividades con SU nota y SUS observaciones. Las notas de
 * toda la sección viven juntas en `ClassActivity.scores`; si se colara el mapa
 * entero, cada alumno vería las de sus compañeros.
 */

const SLUG = 'test-institute';
const NOTA_DE_ANA = 18.5;
const NOTA_DE_BETO = 11.25; // un valor raro, para buscarlo en la respuesta

describe('Mi clase (alumno y representante)', () => {
    let server: FastifyInstance;
    let prisma: PrismaClient;

    let seccion: any;
    let materia: any;
    let materiaAjena: any;
    let profe: any;
    let ana: any;
    let beto: any; // compañero de sección
    let madre: any;
    let otroTutor: any;
    const tk: Record<string, string> = {};

    const cab = (token: string) => ({ Authorization: `Bearer ${token}`, 'X-Institute-Slug': SLUG });
    const miClase = (token: string, alumnoId: string, subjectId: string) =>
        request(server.server).get(`/api/students/${alumnoId}/materias/${subjectId}/clase`).set(cab(token));

    beforeAll(async () => {
        server = await createTestServer();
        prisma = await createTestPrismaClient();

        const year = await createTestAcademicYear(prisma, 'institute');
        seccion = await createTestClassroom(prisma, year.id, 'institute');
        materia = await createTestSubject(prisma, 'institute');
        materiaAjena = await createTestSubject(prisma, 'institute');

        const admin = (await createTestUser(prisma, UserRole.ADMIN)).user;
        profe = (await createTestUser(prisma, UserRole.TEACHER)).user;
        ana = (await createTestUser(prisma, UserRole.STUDENT)).user;
        beto = (await createTestUser(prisma, UserRole.STUDENT)).user;
        madre = (await createTestUser(prisma, UserRole.TUTOR)).user;
        otroTutor = (await createTestUser(prisma, UserRole.TUTOR)).user;

        await prisma.classroomSubject.create({
            data: { classroomId: seccion.id, subjectId: materia.id, teacherId: profe.id },
        });
        for (const a of [ana, beto]) {
            await prisma.studentClassroom.create({
                data: { studentId: a.id, classroomId: seccion.id, academicYearId: year.id, isActive: true },
            });
        }
        await prisma.studentTutor.create({ data: { studentId: ana.id, tutorId: madre.id, relationship: 'Madre' } });

        await prisma.evaluationPlanMetadata.create({
            data: {
                classroomId: seccion.id,
                subjectId: materia.id,
                lapso: '1',
                nombreDocente: 'Prof. Rivas',
                cedulaDocente: 'V-12345678',
                telefonoDocente: '0414-5550000',
                correoDocente: 'rivas@liceo.test',
                peic: 'Cuidemos el agua',
            },
        });
        await prisma.evaluationPlanRow.create({
            data: {
                classroomId: seccion.id,
                subjectId: materia.id,
                lapso: '1',
                weekNumber: 1,
                orderIndex: 0,
                rowType: 'EVALUATION',
                actividadEval: 'Prueba escrita',
                ponderacion: 20,
            },
        });
        await prisma.classActivity.create({
            data: {
                classroomId: seccion.id,
                subjectId: materia.id,
                title: 'Taller de hidrografía',
                type: 'ACTIVIDAD',
                maxScore: 20,
                scores: { [ana.id]: NOTA_DE_ANA, [beto.id]: NOTA_DE_BETO },
            },
        });

        // Una observación de grupo: Ana y Beto en la misma.
        for (const a of [ana, beto]) {
            await prisma.observation.create({
                data: {
                    title: 'Trabajo en equipo',
                    studentId: a.id,
                    createdById: profe.id,
                    classroomId: seccion.id,
                    subjectId: materia.id,
                    groupId: 'grupo-1',
                },
            });
        }

        tk.admin = generateTestToken(admin.id, UserRole.ADMIN, 'institute');
        tk.ana = generateTestToken(ana.id, UserRole.STUDENT, 'institute');
        tk.beto = generateTestToken(beto.id, UserRole.STUDENT, 'institute');
        tk.madre = generateTestToken(madre.id, UserRole.TUTOR, 'institute');
        tk.otroTutor = generateTestToken(otroTutor.id, UserRole.TUTOR, 'institute');
    }, 90000);

    afterAll(async () => {
        await prisma?.$disconnect();
        await server?.close();
    });

    it('MICLASE-01: el alumno ve el plan, su actividad con SU nota y su observación', async () => {
        const res = await miClase(tk.ana, ana.id, materia.id);
        expect(res.status).toBe(200);
        expect(res.body.materia.id).toBe(materia.id);
        expect(res.body.plan.filas.map((f: any) => f.actividadEval)).toContain('Prueba escrita');
        expect(res.body.plan.membrete.peic).toBe('Cuidemos el agua');
        expect(res.body.actividades).toHaveLength(1);
        expect(res.body.actividades[0].nota).toBe(NOTA_DE_ANA);
        expect(res.body.actividades[0].estado).toBe('EVALUADA');
        expect(res.body.observaciones).toHaveLength(1);
    }, 60000);

    it('MICLASE-02: en la respuesta no hay nada del compañero (ni su nota ni su id)', async () => {
        const res = await miClase(tk.ana, ana.id, materia.id);
        const texto = JSON.stringify(res.body);
        expect(texto).not.toContain(beto.id);
        expect(texto).not.toContain(String(NOTA_DE_BETO));
        expect(res.body.actividades[0]).not.toHaveProperty('scores');
    }, 60000);

    it('MICLASE-03: del membrete no salen la cédula, el teléfono ni el correo del profesor', async () => {
        const res = await miClase(tk.ana, ana.id, materia.id);
        const texto = JSON.stringify(res.body);
        expect(texto).not.toContain('V-12345678');
        expect(texto).not.toContain('0414-5550000');
        expect(texto).not.toContain('rivas@liceo.test');
    }, 60000);

    it('MICLASE-04: el representante ve la de su representada; otro representante y otro alumno, no', async () => {
        expect((await miClase(tk.madre, ana.id, materia.id)).status).toBe(200);
        expect((await miClase(tk.otroTutor, ana.id, materia.id)).status).toBe(403);
        expect((await miClase(tk.beto, ana.id, materia.id)).status).toBe(403);
    }, 60000);

    it('MICLASE-05: una materia que no es de su sección no se abre', async () => {
        const res = await miClase(tk.ana, ana.id, materiaAjena.id);
        expect(res.status).toBe(404);
    }, 60000);

    it('MICLASE-06: el representante ve la lista de materias de su representada; otro, no', async () => {
        const suya = await request(server.server).get(`/api/students/${ana.id}/materias`).set(cab(tk.madre));
        expect(suya.status).toBe(200);
        expect(suya.body.materias.map((m: any) => m.id)).toEqual([materia.id]);
        const ajena = await request(server.server).get(`/api/students/${ana.id}/materias`).set(cab(tk.otroTutor));
        expect(ajena.status).toBe(403);
    }, 60000);

    it('OBS-GRUPO-01: en sus observaciones, el alumno no ve a los compañeros del grupo; el admin sí', async () => {
        const suya = await request(server.server).get(`/api/observations/student/${ana.id}`).set(cab(tk.ana));
        expect(suya.status).toBe(200);
        expect(JSON.stringify(suya.body)).not.toContain(beto.id);

        const delAdmin = await request(server.server).get(`/api/observations/student/${ana.id}`).set(cab(tk.admin));
        expect(delAdmin.status).toBe(200);
        expect(JSON.stringify(delAdmin.body)).toContain(beto.id);
    }, 60000);
});
