process.env.CONTAR_CONSULTAS = '1';

import { FastifyInstance } from 'fastify';
import request = require('supertest');
import { PrismaClient } from '@prisma/client';
import { createId } from '@paralleldrive/cuid2';
import { UserRole } from '../../src/utils/prisma-enums';
import { gradesService } from '../../src/services/grades.service';
import { consultasALaBase, invalidateTenantCache } from '../../src/config/database';
import { createTestServer, createTestPrismaClient, createTestUser, createTestSubject, generateTestToken } from '../helpers';

/**
 * LA LISTA DE ALUMNOS, EN BLOQUE Y SIN INVENTAR CEROS
 *
 * `GET /students` es la lista de alumnos. Con una sección elegida ya calculaba
 * los promedios en bloque. Sin sección —la lista de todo el liceo, o la de un
 * profesor con todas las suyas—:
 *
 *   · el promedio general salía **0 para todo el mundo** («Sin calificar»),
 *     porque el cálculo en bloque solo se hacía con una sección elegida;
 *   · el de una materia se calculaba alumno por alumno (unas 20 consultas por
 *     alumno), todas a la vez contra las mismas conexiones;
 *   · y las notas de Clase en Vivo se buscaban en TODAS las actividades del
 *     liceo, porque el filtro de sección quedaba vacío.
 *
 * Ahora se agrupa por la sección de cada alumno y se calcula en bloque por
 * sección. La asistencia, además, es la del ciclo de su sección —como en el
 * panel del alumno—, no la de toda su vida escolar.
 */

const SLUG = 'test-institute';
const gId = () => `c${createId()}`;

describe('La lista de alumnos, en bloque', () => {
    let server: FastifyInstance;
    let prisma: PrismaClient;
    let admin: any;
    let profesor: any;
    let year: any;
    let lapso: any;
    let materia: any;
    const alumnos: any[] = [];

    async function lista(query: string) {
        const token = generateTestToken(admin.id, UserRole.ADMIN, 'institute');
        const antes = consultasALaBase();
        const res = await request(server.server)
            .get(`/api/students?${query}`)
            .set('Authorization', `Bearer ${token}`)
            .set('X-Institute-Slug', SLUG);
        expect(res.status).toBe(200);
        const filas = res.body?.data?.students ?? res.body?.data ?? res.body?.students ?? [];
        return { filas: filas as any[], consultas: consultasALaBase() - antes };
    }

    beforeAll(async () => {
        server = await createTestServer();
        await invalidateTenantCache('institute');
        prisma = await createTestPrismaClient();
        admin = (await createTestUser(prisma, UserRole.ADMIN)).user;
        profesor = (await createTestUser(prisma, UserRole.TEACHER)).user;
        year = await prisma.academicYear.create({
            data: { id: gId(), name: `2026-${gId()}`, startDate: new Date('2026-09-01'), endDate: new Date('2027-07-15'), isActive: true, status: 'ACTIVE', instituteId: 'institute' },
        });
        lapso = await prisma.period.create({
            data: { id: gId(), name: 'Primer Lapso', academicYearId: year.id, startDate: new Date('2026-09-01'), endDate: new Date('2026-12-15'), isActive: true },
        });
        materia = await createTestSubject(prisma, 'institute');

        // Dos secciones, 12 alumnos repartidos, cada uno con dos notas.
        for (const letra of ['A', 'B']) {
            const aula = await prisma.classroom.create({
                data: { id: gId(), name: `1 ${letra}`, slug: `lista-${gId()}`, grade: 1, section: letra, capacity: 30, academicYearId: year.id, instituteId: 'institute' },
            });
            await prisma.classroomSubject.create({ data: { classroomId: aula.id, subjectId: materia.id, teacherId: profesor.id } });
            for (let i = 0; i < 6; i++) {
                const est = (await createTestUser(prisma, UserRole.STUDENT)).user;
                await prisma.studentClassroom.create({ data: { studentId: est.id, classroomId: aula.id, academicYearId: year.id, isActive: true } });
                for (let e = 0; e < 2; e++) {
                    const act = await prisma.activity.create({
                        data: { id: gId(), title: `E${e}`, type: 'EXAM', scope: 'CLASSROOM', startDate: new Date(), createdBy: profesor.id, classroomId: aula.id, subjectId: materia.id, periodId: lapso.id },
                    });
                    await prisma.grade.create({
                        data: { id: gId(), studentId: est.id, activityId: act.id, periodId: lapso.id, subjectId: materia.id, teacherId: profesor.id, score: 9 + ((i * 3 + e * 4) % 11) },
                    });
                }
                // Asistencia: una de este ciclo (presente) y una de hace dos años (ausente).
                await prisma.dailyAttendance.create({ data: { id: gId(), studentId: est.id, classroomId: aula.id, teacherId: profesor.id, date: new Date('2026-10-01'), status: 'PRESENT' } as any });
                await prisma.dailyAttendance.create({ data: { id: gId(), studentId: est.id, classroomId: aula.id, teacherId: profesor.id, date: new Date('2024-10-01'), status: 'ABSENT' } as any });
                alumnos.push(est);
            }
        }
    }, 240000);

    afterAll(async () => {
        await prisma.$disconnect();
        await server.close();
    }, 120000);

    it('LISTA-01: sin sección, cada alumno trae su promedio de verdad (no 0), el mismo que el cálculo de siempre', async () => {
        const { filas } = await lista('page=1&limit=50');
        const nuestros = filas.filter((f) => alumnos.some((a) => a.id === f.id));
        expect(nuestros).toHaveLength(alumnos.length);
        for (const f of nuestros) {
            const deSiempre = await gradesService.calculateWeightedSubjectAverage(prisma as any, f.id, materia.id, undefined, [lapso.id]);
            expect(f.average ?? f.promedio).toBeCloseTo(Math.round(deSiempre * 10) / 10, 5);
            expect(f.average ?? f.promedio).toBeGreaterThan(0);
        }
    }, 120000);

    it('LISTA-02: con una materia y sin sección, las consultas no crecen con los alumnos', async () => {
        const pocos = await lista(`page=1&limit=3&subjectId=${materia.id}`);
        const muchos = await lista(`page=1&limit=12&subjectId=${materia.id}`);
        // Como mucho, el bloque de una sección más (4 consultas: los 12 están en
        // dos secciones y los 3 pueden estar en una). Nunca por alumno: antes
        // eran 30 consultas más por 9 alumnos más.
        expect(muchos.consultas - pocos.consultas).toBeLessThanOrEqual(4);
    }, 120000);

    it('LISTA-03: la asistencia es la del ciclo de su sección, no la de toda su vida escolar', async () => {
        const { filas } = await lista('page=1&limit=50');
        const uno = filas.find((f) => f.id === alumnos[0].id);
        expect(uno.attendancePercentage ?? uno.attendance).toBe(100);
    }, 120000);
});
