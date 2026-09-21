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
 * LA LISTA DE SECCIONES NO ES LA MISMA PARA TODOS
 *
 * `GET /api/classrooms` devolvía TODAS las secciones del liceo a cualquiera con
 * sesión. Parecía inofensivo —solo nombres— y no lo era: el calendario abre la
 * PRIMERA sección de esa lista, así que al profesor le tocaba una que no es
 * suya y el servidor, que sí comprueba de quién es, respondía 403. Al liceo le
 * llegaba como «el calendario del profesor sale roto».
 *
 * Suyas son las que guía y aquellas donde imparte alguna materia: lo mismo que
 * mira `canSeeClassroom`. Al administrador no le cambia nada.
 */

const SLUG = 'test-institute';

describe('Las secciones que me tocan', () => {
    let server: FastifyInstance;
    let prisma: PrismaClient;

    let year: any;
    let laQueGuia: any;
    let dondeDaClase: any;
    let ajena: any;

    const tk: Record<string, string> = {};
    const cab = (token: string) => ({ Authorization: `Bearer ${token}`, 'X-Institute-Slug': SLUG });

    beforeAll(async () => {
        server = await createTestServer();
        prisma = await createTestPrismaClient();

        year = await createTestAcademicYear(prisma, 'institute');
        dondeDaClase = await createTestClassroom(prisma, year.id, 'institute');

        const admin = (await createTestUser(prisma, UserRole.ADMIN)).user;
        const profe = (await createTestUser(prisma, UserRole.TEACHER)).user;

        const otraSeccion = async (nombre: string, letra: string, guia?: string) =>
            prisma.classroom.create({
                data: {
                    id: `c${createId()}`,
                    name: nombre,
                    slug: `aula-${letra}-${createId()}`,
                    grade: 1,
                    section: letra,
                    capacity: 30,
                    academicYearId: year.id,
                    instituteId: 'institute',
                    teacherId: guia,
                },
            });

        laQueGuia = await otraSeccion('1er Grado B', 'B', profe.id);
        ajena = await otraSeccion('1er Grado C', 'C');

        const materia = await createTestSubject(prisma, 'institute');
        await prisma.classroomSubject.create({
            data: { classroomId: dondeDaClase.id, subjectId: materia.id, teacherId: profe.id },
        });

        tk.admin = generateTestToken(admin.id, UserRole.ADMIN, 'institute');
        tk.profe = generateTestToken(profe.id, UserRole.TEACHER, 'institute');
    });

    afterAll(async () => {
        await prisma.$disconnect();
        await server.close();
    });

    const lista = (token: string) =>
        request(server.server).get('/api/classrooms').query({ academicYearId: year.id }).set(cab(token));

    it('SECC-01: el profesor recibe la que guía y donde imparte, y ninguna más', async () => {
        const res = await lista(tk.profe).expect(200);
        const ids = (res.body as any[]).map((c) => c.id);

        expect(ids).toContain(laQueGuia.id);
        expect(ids).toContain(dondeDaClase.id);
        expect(ids).not.toContain(ajena.id);
    });

    it('SECC-02: el administrador las recibe todas', async () => {
        const res = await lista(tk.admin).expect(200);
        const ids = (res.body as any[]).map((c) => c.id);

        expect(ids).toContain(laQueGuia.id);
        expect(ids).toContain(dondeDaClase.id);
        expect(ids).toContain(ajena.id);
    });
});
