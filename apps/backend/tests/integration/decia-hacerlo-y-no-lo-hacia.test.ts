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
import { RedisCache } from '../../src/config/redis';
import { conLiceo } from '../../src/config/ambito-del-liceo';
import { cycleStatisticsService } from '../../src/services/cycle-statistics.service';

/**
 * COSAS QUE DECÍAN HACERSE Y NO SE HACÍAN
 *
 * Dos de la misma familia, encontradas leyendo el código: nada falla, nadie ve
 * un error, y lo que sale por pantalla no es lo que dice ser.
 *
 * ─── 1. EL PROMEDIO DEL LAPSO DEL ALUMNO ─────────────────────────────────────
 *
 * El panel del alumno recorría **las filas de notas** para armar el promedio de
 * cada lapso: por cada nota pedía el promedio de esa materia y lo metía en la
 * lista. Una materia con cinco notas metía cinco veces el mismo número; una con
 * una, solo una. La media de esa lista da más peso a las materias con más
 * evaluaciones.
 *
 * La regla, escrita en `docs/MAPA_DE_CALCULOS.md`, es que cada nivel es la
 * media de las **entidades** del de abajo: una materia, una vez.
 *
 * ─── 2. EL BOTÓN DE LIMPIAR LA CACHÉ DE ESTADÍSTICAS ─────────────────────────
 *
 * Borraba `stats:section:<id>:global`. Lo que se guarda es
 * `stats:section:<id>:global:min10:asis80`. No coincidía ninguna: el botón
 * respondía «listo» y no limpiaba nada, y la sección seguía enseñando los
 * números viejos hasta que caducaban solos.
 */

const SLUG = 'test-institute';
const gId = () => `c${createId()}`;

describe('Cosas que decían hacerse y no se hacían', () => {
    let server: FastifyInstance;
    let prisma: PrismaClient;

    let profe: any;
    let alumno: any;
    let tokenAlumno: string;
    let year: any;
    let lapso: any;
    let seccion: any;

    const auth = (token: string) => (req: request.Test) =>
        req.set('Authorization', `Bearer ${token}`).set('X-Institute-Slug', SLUG);

    beforeAll(async () => {
        server = await createTestServer();
        prisma = await createTestPrismaClient();

        profe = (await createTestUser(prisma, UserRole.TEACHER)).user;
        alumno = (await createTestUser(prisma, UserRole.STUDENT)).user;
        tokenAlumno = generateTestToken(alumno.id, UserRole.STUDENT, 'institute');

        year = await createTestAcademicYear(prisma, 'institute');
        // El panel del alumno solo mira el año en curso.
        year = await prisma.academicYear.update({
            where: { id: year.id },
            data: { status: 'ACTIVE' as never },
        });
        lapso = await prisma.period.create({
            data: {
                id: gId(),
                name: 'Primer Lapso',
                academicYearId: year.id,
                startDate: new Date('2026-09-01'),
                endDate: new Date('2026-12-15'),
                isActive: true,
            },
        });

        seccion = await prisma.classroom.create({
            data: {
                id: gId(),
                name: 'Números A',
                slug: `numeros-${gId()}`,
                grade: 1,
                section: 'A',
                capacity: 30,
                academicYearId: year.id,
                instituteId: 'institute',
                teacherId: profe.id,
            },
        });

        await prisma.studentClassroom.create({
            data: { studentId: alumno.id, classroomId: seccion.id, academicYearId: year.id, isActive: true },
        });
    }, 180000);

    afterAll(async () => {
        await prisma.$disconnect();
        await server.close();
    }, 120000);

    /** Una materia con N notas, todas del mismo valor. */
    async function materiaCon(notas: number[]) {
        const materia = await createTestSubject(prisma, 'institute');
        await prisma.classroomSubject.create({
            data: { classroomId: seccion.id, subjectId: materia.id, teacherId: profe.id, weeklyBlocks: 2 },
        });

        for (const valor of notas) {
            const actividad = await prisma.activity.create({
                data: {
                    title: `Evaluación ${valor}-${gId().slice(0, 6)}`,
                    type: 'SUMATIVA',
                    scope: 'CLASSROOM',
                    startDate: new Date('2026-09-10'),
                    maxGrade: 20,
                    weight: 1,
                    classroomId: seccion.id,
                    subjectId: materia.id,
                    periodId: lapso.id,
                    lapso: '1',
                    createdBy: profe.id,
                    instituteId: 'institute',
                },
            });
            await prisma.grade.create({
                data: {
                    id: gId(),
                    score: valor,
                    studentId: alumno.id,
                    activityId: actividad.id,
                    subjectId: materia.id,
                    periodId: lapso.id,
                    teacherId: profe.id,
                },
            });
        }
        return materia;
    }

    // ═════════════════════════════════════════════════════════════════════════

    it('NUM-01: el promedio del lapso es la media de las MATERIAS, no de las notas', async () => {
        // Lengua: tres veintes → su promedio es 20.
        // Matemática: un diez → su promedio es 10.
        //
        //   Bien:  (20 + 10) / 2      = 15
        //   Mal:   (20+20+20+10) / 4  = 17,5   ← lo que salía antes
        await materiaCon([20, 20, 20]);
        await materiaCon([10]);

        const res = await auth(tokenAlumno)(request(server.server).get('/api/dashboard/student'));
        expect(res.status).toBe(200);

        const lapsos = (res.body?.data ?? res.body)?.periodAverages as Array<any>;
        expect(Array.isArray(lapsos)).toBe(true);

        const elNuestro = lapsos.find((p) => p.periodId === lapso.id);
        expect(elNuestro).toBeDefined();
        expect(elNuestro.average).toBeCloseTo(15, 1);
        expect(elNuestro.average).not.toBeCloseTo(17.5, 1);
    }, 120000);

    // ═════════════════════════════════════════════════════════════════════════

    it('NUM-02: limpiar la caché de la sección borra lo que de verdad hay guardado', async () => {
        // Se guarda con la clave REAL, la que lleva la nota mínima pegada.
        const claveReal = `stats:section:${seccion.id}:global:min10:asis80`;
        await conLiceo('institute', () => RedisCache.set(claveReal, { promedio: 'viejo' }, 600));
        expect(await conLiceo('institute', () => RedisCache.get(claveReal))).not.toBeNull();

        await conLiceo('institute', () =>
            cycleStatisticsService.clearSectionCache(prisma as any, seccion.id)
        );

        expect(await conLiceo('institute', () => RedisCache.get(claveReal))).toBeNull();
    }, 120000);

    it('NUM-03: limpiar la del ciclo alcanza a TODOS los años, no solo del 1 al 5', async () => {
        // Un liceo con sexto año existía y su caché no se limpiaba nunca: el
        // bucle iba del 1 al 5 a mano.
        const claveDelSexto = `stats:grade:${year.id}:6:min10`;
        const claveDelCiclo = `stats:cycle:${year.id}:global:min10`;
        await conLiceo('institute', async () => {
            await RedisCache.set(claveDelSexto, { promedio: 'viejo' }, 600);
            await RedisCache.set(claveDelCiclo, { promedio: 'viejo' }, 600);
        });

        await conLiceo('institute', () =>
            cycleStatisticsService.clearCycleCache(prisma as any, year.id)
        );

        expect(await conLiceo('institute', () => RedisCache.get(claveDelSexto))).toBeNull();
        expect(await conLiceo('institute', () => RedisCache.get(claveDelCiclo))).toBeNull();
    }, 120000);
});
