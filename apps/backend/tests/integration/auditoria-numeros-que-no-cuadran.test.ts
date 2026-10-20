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
    createTestAcademicYear,
    createTestSubject,
} from '../helpers';
import { platformPrisma } from '../../src/config/database';

/**
 * LOS NÚMEROS TIENEN QUE CUADRAR ENTRE PANTALLAS
 *
 * Un promedio que dice 9,7 "aprobado" en una pantalla y 9,7 "reprobado" en otra
 * no es un detalle: es el liceo dándole dos respuestas distintas a la misma
 * familia.
 *
 * Aquí se comprueba contra `docs/MAPA_DE_CALCULOS.md`, que es lo acordado:
 *  - sección 3: la nota mínima para aprobar es la del instituto
 *    (`notaMinimaAprobatoria`), con 10 solo como valor por defecto;
 *  - sección 4: los días en que nadie pasó asistencia no bajan el porcentaje.
 */

const SLUG = 'test-institute';

function gId(): string {
    // Siempre la 'c' delante: ver la nota de `tests/helpers.ts`.
    return `c${createId()}`;
}

describe('Números que tienen que cuadrar', () => {
    let server: FastifyInstance;
    let prisma: PrismaClient;

    let year: any;
    let lapso: any;
    let seccion: any;
    let materia: any;
    let profe: any;
    let admin: any;
    let alumno: any;
    let tokenAdmin: string;
    let tokenProfe: string;

    const auth = (token: string) => ({
        Authorization: `Bearer ${token}`,
        'X-Institute-Slug': SLUG,
    });

    beforeAll(async () => {
        server = await createTestServer();
        prisma = await createTestPrismaClient();
    });

    afterAll(async () => {
        // La configuración del instituto vive en la base de plataforma, que es
        // compartida: se deja como estaba para no contaminar a los demás.
        await platformPrisma.institute
            .update({ where: { id: 'institute' }, data: { academicConfig: {} } })
            .catch(() => {});
        await prisma.$disconnect();
        await server.close();
    });

    beforeEach(async () => {
        await cleanTestDatabase(prisma);
        await prisma.institute.upsert({
            where: { id: 'institute' },
            update: {},
            create: {
                id: 'institute',
                code: 'TEST_INST',
                slug: SLUG,
                name: 'Test Institute',
                email: 'test@institute.com',
            },
        });

        year = await createTestAcademicYear(prisma, 'institute');
        materia = await createTestSubject(prisma, 'institute');
        seccion = await prisma.classroom.create({
            data: {
                id: gId(),
                name: '1er Grado A',
                slug: `aula-${gId()}`,
                grade: 1,
                section: 'A',
                capacity: 30,
                academicYearId: year.id,
                instituteId: 'institute',
            },
        });
        lapso = await prisma.period.create({
            data: {
                id: gId(),
                name: 'Primer Lapso',
                startDate: new Date('2024-01-01'),
                endDate: new Date('2024-04-30'),
                isActive: true,
                academicYearId: year.id,
            },
        });

        profe = (await createTestUser(prisma, UserRole.TEACHER)).user;
        admin = (await createTestUser(prisma, UserRole.ADMIN)).user;
        alumno = (await createTestUser(prisma, UserRole.STUDENT)).user;

        await prisma.classroomSubject.create({
            data: { classroomId: seccion.id, subjectId: materia.id, teacherId: profe.id },
        });
        await prisma.classroom.update({
            where: { id: seccion.id },
            data: { teacherId: profe.id },
        });
        await prisma.studentClassroom.create({
            data: {
                studentId: alumno.id,
                classroomId: seccion.id,
                academicYearId: year.id,
                isActive: true,
            },
        });

        tokenAdmin = generateTestToken(admin.id, UserRole.ADMIN, 'institute');
        tokenProfe = generateTestToken(profe.id, UserRole.TEACHER, 'institute');
    });

    async function ponerNota(score: number) {
        const actividad = await prisma.activity.create({
            data: {
                id: gId(),
                title: `Actividad ${score}`,
                type: 'EXAM',
                scope: 'CLASSROOM',
                startDate: new Date('2024-03-01'),
                maxGrade: 20,
                classroomId: seccion.id,
                subjectId: materia.id,
                periodId: lapso.id,
                createdBy: profe.id,
                isActive: true,
            },
        });
        return prisma.grade.create({
            data: {
                id: gId(),
                score,
                studentId: alumno.id,
                activityId: actividad.id,
                periodId: lapso.id,
                subjectId: materia.id,
                teacherId: profe.id,
            },
        });
    }

    /** La fila de nuestra sección en la pantalla de la materia. */
    const enLaSeccion = (res: any) => {
        const secciones = (res.body.data ?? res.body).sections ?? [];
        const fila = secciones.find((x: any) => x.id === seccion.id);
        if (!fila) throw new Error('La materia no enseña nuestra sección');
        return fila;
    };

    const configurarNotaMinima = (valor: number) =>
        platformPrisma.institute.update({
            where: { id: 'institute' },
            data: { academicConfig: { notaMinimaAprobatoria: valor } },
        });

    // ─────────────────────────────────────────────────────────────────────────
    // LA NOTA MÍNIMA PARA APROBAR ES LA DEL LICEO
    // ─────────────────────────────────────────────────────────────────────────

    it('CAL-01: con la nota mínima por defecto (10), un 9,4 está reprobado (9,5 sube a 10 con el redondeo del MPPE)', async () => {
        await configurarNotaMinima(10);
        await ponerNota(9.4);

        const res = await request(server.server)
            .get(`/api/subjects/${materia.id}`)
            .set(auth(tokenAdmin))
            .expect(200);

        // La pantalla de la materia (Materias → una): su fila de la sección.
        expect(enLaSeccion(res).riskCount).toBe(1);
    });

    it('CAL-02: si el liceo pone la mínima en 12, un 11 está reprobado', async () => {
        await configurarNotaMinima(12);
        await ponerNota(11);

        const res = await request(server.server)
            .get(`/api/subjects/${materia.id}`)
            .set(auth(tokenAdmin))
            .expect(200);

        expect(enLaSeccion(res).riskCount).toBe(1);
    });

    it('CAL-03: si el liceo pone la mínima en 8, un 9 está aprobado', async () => {
        await configurarNotaMinima(8);
        await ponerNota(9);

        const res = await request(server.server)
            .get(`/api/subjects/${materia.id}`)
            .set(auth(tokenAdmin))
            .expect(200);

        expect(enLaSeccion(res).riskCount).toBe(0);
    });

    it('CAL-04: la sección usa la misma nota mínima que la materia', async () => {
        await configurarNotaMinima(10);
        await ponerNota(9.4);

        const res = await request(server.server)
            .get(`/api/classrooms/${seccion.id}/stats`)
            .set(auth(tokenAdmin))
            .expect(200);

        // El resumen de la sección (la cabecera de la sección).
        expect(res.body.riskCount).toBe(1);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // LOS DÍAS SIN TOMAR ASISTENCIA NO BAJAN EL PORCENTAJE
    // ─────────────────────────────────────────────────────────────────────────

    it('CAL-05: sin ningún registro de asistencia, la sección no inventa un porcentaje', async () => {
        await configurarNotaMinima(10);
        await ponerNota(15);

        const res = await request(server.server)
            .get(`/api/classrooms/${seccion.id}/stats`)
            .set(auth(tokenAdmin))
            .expect(200);

        // Nadie ha pasado lista todavía. Decir un porcentaje (un 0 %) es
        // inventarse un dato que no existe (MAPA_DE_CALCULOS, sección 4).
        expect(res.body.attendance).toBeNull();
    });

    // CAL-06 (`/api/attendance/summary/student`) se quitó con esa ruta el
    // 19-oct-2026: ninguna pantalla la usaba. La asistencia del alumno la
    // vigilan LISTA-03 y CIFRAS-01.
});
