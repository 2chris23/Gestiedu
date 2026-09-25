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
 * EL RESUMEN FINAL DEL RENDIMIENTO DE UNA SECCIÓN
 *
 * Lo que control de estudios entrega al MPPE al cerrar el año: por sección, la
 * definitiva de cada alumno en cada materia y cuántos aprobaron y reprobaron.
 * Gestiedu tenía las notas y no lo sacaba: se copiaba a mano de cada boleta.
 *
 *   RES-01  una fila por alumno (por apellido), la definitiva de cada materia
 *           (la de la revisión si la tiene), la condición con las reglas del
 *           cierre y los totales por materia;
 *   RES-02  lo ven el admin y el profesor guía; nadie más;
 *   RES-03  el retirado no sale en la lista: se cuenta aparte;
 *   RES-04  con el ciclo cerrado, la condición es la que dejó el admin.
 */

const SLUG = 'test-institute';
const gId = () => `c${createId()}`;
const dia = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);

describe('El resumen final (RES-01…04)', () => {
    let server: FastifyInstance;
    let prisma: PrismaClient;
    let admin: any;
    let guia: any;
    let otroProfe: any;
    let year: any;
    let seccion: any;
    let materias: any[];
    let ana: any;
    let beto: any;
    let caro: any;

    const como = (u: any, role: UserRole) => ({
        Authorization: `Bearer ${generateTestToken(u.id, role, 'institute')}`,
        'X-Institute-Slug': SLUG,
    });
    const resumen = (u = admin, role = UserRole.ADMIN) =>
        request(server.server).get(`/api/classrooms/${seccion.id}/resumen-final`).set(como(u, role));

    beforeAll(async () => {
        server = await createTestServer();
        prisma = await createTestPrismaClient();
    }, 120000);

    afterAll(async () => {
        await platformPrisma.institute.update({ where: { id: 'institute' }, data: { academicConfig: {} } }).catch(() => undefined);
        await prisma.$disconnect();
        await server.close();
    });

    beforeEach(async () => {
        await cleanTestDatabase(prisma);
        await RedisCache.clearPattern('*').catch(() => undefined);
        await platformPrisma.institute.update({ where: { id: 'institute' }, data: { academicConfig: { notaMinimaAprobatoria: 10, maxMateriasPendientesParaPromover: 2 } } });

        admin = (await createTestUser(prisma, UserRole.ADMIN)).user;
        guia = (await createTestUser(prisma, UserRole.TEACHER)).user;
        otroProfe = (await createTestUser(prisma, UserRole.TEACHER)).user;
        year = await prisma.academicYear.create({
            data: { id: gId(), name: '2026-2027', startDate: dia('2026-09-15'), endDate: dia('2027-07-15'), isActive: true, status: 'ACTIVE', instituteId: 'institute' } as any,
        });
        const lapso = await prisma.period.create({ data: { id: gId(), name: 'Primer Lapso', startDate: dia('2026-09-15'), endDate: dia('2026-12-15'), academicYearId: year.id } });
        seccion = await prisma.classroom.create({
            data: { id: gId(), name: '3er Año A', slug: `aula-${gId()}`, grade: 3, section: 'A', capacity: 30, academicYearId: year.id, instituteId: 'institute', teacherId: guia.id } as any,
        });
        materias = [];
        for (const nombre of ['Biología', 'Castellano', 'Física', 'Matemática']) {
            const m = await prisma.subject.create({ data: { id: gId(), name: nombre, code: `${nombre.slice(0, 3).toUpperCase()}-${gId().slice(0, 5)}`, slug: `${nombre.toLowerCase()}-${gId()}`, instituteId: 'institute' } as any });
            await prisma.classroomSubject.create({ data: { classroomId: seccion.id, subjectId: m.id, teacherId: otroProfe.id } });
            materias.push(m);
        }
        const [bio, caste, fisica] = materias; // Matemática: sin notas para nadie.
        const alumno = async (firstName: string, lastName: string) => {
            const u = (await createTestUser(prisma, UserRole.STUDENT, { firstName, lastName })).user;
            await prisma.studentClassroom.create({ data: { id: gId(), studentId: u.id, classroomId: seccion.id, academicYearId: year.id, isActive: true } });
            return u;
        };
        // Se crean desordenados: la lista sale por apellido.
        caro = await alumno('Carolina', 'Zamora');
        ana = await alumno('Ana', 'Álvarez');
        beto = await alumno('Beto', 'Mora');

        const nota = async (studentId: string, subjectId: string, score: number) => {
            const act = await prisma.activity.create({
                data: {
                    id: gId(), title: 'Evaluación', description: 'x', type: 'TAREA' as any, scope: 'CLASSROOM' as any,
                    classroomId: seccion.id, subjectId, periodId: lapso.id, createdBy: otroProfe.id, maxGrade: 20, weight: 1,
                    startDate: new Date(), endDate: new Date(), dueDate: new Date(),
                } as any,
            });
            await prisma.grade.create({ data: { id: gId(), score, studentId, activityId: act.id, periodId: lapso.id, subjectId, teacherId: otroProfe.id } });
        };
        // Ana: todo aprobado. Beto: reprueba Física (8) y la aprueba en revisión (13).
        // Carolina: reprueba las tres (5, 6, 9,4 → 9).
        await nota(ana.id, bio.id, 18); await nota(ana.id, caste.id, 16); await nota(ana.id, fisica.id, 14.5);
        await nota(beto.id, bio.id, 12); await nota(beto.id, caste.id, 11); await nota(beto.id, fisica.id, 8);
        await nota(caro.id, bio.id, 5); await nota(caro.id, caste.id, 6); await nota(caro.id, fisica.id, 9.4);
        await (prisma as any).notaDeRevision.create({
            data: { studentId: beto.id, subjectId: fisica.id, academicYearId: year.id, score: 13, fecha: dia('2027-07-20'), registradaPor: admin.id },
        });
    }, 180000);

    it('RES-01: filas por apellido, definitivas con revisión, condición y totales', async () => {
        const r = (await resumen().expect(200)).body.data;
        const [bio, caste, fisica, mate] = materias;
        expect(r.materias.map((m: any) => m.nombre)).toEqual(['Biología', 'Castellano', 'Física', 'Matemática']);
        expect(r.alumnos.map((a: any) => a.apellidos)).toEqual(['Álvarez', 'Mora', 'Zamora']);

        const [a, b, c] = r.alumnos;
        expect(a.notas[fisica.id]).toEqual({ definitiva: 15, revision: null }); // 14,5 → 15 (MPPE)
        expect(a.notas[mate.id]).toEqual({ definitiva: null, revision: null });
        expect(a.condicion).toBe('PROMOVIDO');
        expect(b.notas[fisica.id]).toEqual({ definitiva: 8, revision: 13 });
        expect(b.reprobadas).toBe(0);
        expect(b.condicion).toBe('PROMOVIDO');
        expect(b.promedio).toBe(12); // (12 + 11 + 13) / 3
        expect(c.notas[fisica.id].definitiva).toBe(9);
        expect(c.reprobadas).toBe(3);
        expect(c.condicion).toBe('NO_PROMOVIDO'); // más de 2 pendientes

        expect(r.porMateria[bio.id]).toEqual({ aprobados: 2, reprobados: 1, sinNotas: 0 });
        expect(r.porMateria[fisica.id]).toEqual({ aprobados: 2, reprobados: 1, sinNotas: 0 });
        expect(r.porMateria[mate.id]).toEqual({ aprobados: 0, reprobados: 0, sinNotas: 3 });
        void caste;
        expect(r.totales).toEqual({ inscritos: 3, retirados: 0, promovidos: 2, conPendientes: 0, noPromovidos: 1 });
        expect(r.seccion).toMatchObject({ grado: 3, seccion: 'A' });
        expect(r.ciclo.cerrado).toBe(false);
    }, 60000);

    it('RES-02: lo ven el admin y el profesor guía; nadie más', async () => {
        await resumen().expect(200);
        await resumen(guia, UserRole.TEACHER).expect(200);
        await resumen(otroProfe, UserRole.TEACHER).expect(403);
        await resumen(ana, UserRole.STUDENT).expect(403);
        const { user: tutor } = await createTestUser(prisma, UserRole.TUTOR);
        await prisma.studentTutor.create({ data: { studentId: ana.id, tutorId: tutor.id, relationship: 'Madre' } });
        await resumen(tutor, UserRole.TUTOR).expect(403);
    }, 60000);

    it('RES-03: el retirado no sale en la lista, se cuenta aparte', async () => {
        await prisma.studentClassroom.updateMany({ where: { studentId: caro.id }, data: { isActive: false } });
        const r = (await resumen().expect(200)).body.data;
        expect(r.alumnos.map((a: any) => a.cedula)).toEqual([ana.id, beto.id]);
        expect(r.totales).toMatchObject({ inscritos: 2, retirados: 1, noPromovidos: 0 });
    }, 60000);

    it('RES-04: con el ciclo cerrado, la condición es la que dejó el admin', async () => {
        await prisma.academicRecord.create({
            data: { studentId: caro.id, academicYearId: year.id, sectionSnapshot: '3A', finalAverage: 6.67, status: 'X', finalResult: 'PROMOVIDO_CON_PENDIENTES' },
        });
        await prisma.academicYear.update({ where: { id: year.id }, data: { status: 'COMPLETED' as any } });
        const r = (await resumen().expect(200)).body.data;
        expect(r.ciclo.cerrado).toBe(true);
        expect(r.alumnos.find((a: any) => a.cedula === caro.id).condicion).toBe('PROMOVIDO_CON_PENDIENTES');
    }, 60000);
});
