import { FastifyInstance } from 'fastify';
import request = require('supertest');
import { PrismaClient } from '@prisma/client';
import { createId } from '@paralleldrive/cuid2';
import { UserRole } from '../../src/utils/prisma-enums';
import { invalidateTenantCache } from '../../src/config/database';
import { createTestServer, createTestPrismaClient, createTestUser, createTestSubject, generateTestToken } from '../helpers';

/**
 * LA ASISTENCIA DEL AÑO (ASIS-CICLO-01, 2026-10-05)
 *
 * `MAPA` §4: la del año es la media de SUS SECCIONES CON DATOS y la del ciclo,
 * la de sus años; los días sin toma de asistencia no penalizan. El código
 * dividía la del año entre todas sus secciones, también la que aún no pasó
 * lista. (La del ciclo, ASIS-CICLO-02, vivía en `/api/statistics/cycle`, que
 * ninguna pantalla enseñaba: se quitó con esa ruta el 19-oct-2026.)
 */

const SLUG = 'test-institute';
const LICEO = 'institute';
const gId = () => `c${createId()}`;

describe('La asistencia del año (ASIS-CICLO)', () => {
    let server: FastifyInstance;
    let prisma: PrismaClient;
    let admin: any;
    let year: any;

    beforeAll(async () => {
        server = await createTestServer();
        await invalidateTenantCache(LICEO);
        prisma = await createTestPrismaClient();
        admin = (await createTestUser(prisma, UserRole.ADMIN)).user;
        const profesor = (await createTestUser(prisma, UserRole.TEACHER)).user;
        year = await prisma.academicYear.create({
            data: { id: gId(), name: `2026-${gId()}`, startDate: new Date('2026-09-01'), endDate: new Date('2027-07-15'), isActive: true, status: 'ACTIVE', instituteId: LICEO },
        });
        await prisma.period.create({
            data: { id: gId(), name: 'Primer Lapso', academicYearId: year.id, startDate: new Date('2026-09-01'), endDate: new Date('2026-12-15'), isActive: true },
        });
        const materia = await createTestSubject(prisma, LICEO);
        // Solo 1.º año, dos secciones: la A pasó lista (todos presentes), la B todavía no.
        for (const letra of ['A', 'B']) {
            const aula = await prisma.classroom.create({
                data: { id: gId(), name: `1 ${letra}`, slug: `asis-${gId()}`, grade: 1, section: letra, capacity: 30, academicYearId: year.id, instituteId: LICEO },
            });
            await prisma.classroomSubject.create({ data: { classroomId: aula.id, subjectId: materia.id, teacherId: profesor.id } });
            for (let i = 0; i < 3; i++) {
                const est = (await createTestUser(prisma, UserRole.STUDENT)).user;
                await prisma.studentClassroom.create({ data: { studentId: est.id, classroomId: aula.id, academicYearId: year.id, isActive: true } });
                if (letra === 'A') {
                    await prisma.dailyAttendance.create({ data: { id: gId(), studentId: est.id, classroomId: aula.id, teacherId: profesor.id, date: new Date('2026-10-01'), status: 'PRESENT' } as any });
                }
            }
        }
    }, 240000);

    afterAll(async () => {
        await prisma?.$disconnect();
        await server?.close();
    }, 120000);

    const pedir = (url: string) =>
        request(server.server)
            .get(url)
            .set('Authorization', `Bearer ${generateTestToken(admin.id, UserRole.ADMIN, LICEO)}`)
            .set('X-Institute-Slug', SLUG);

    it('ASIS-CICLO-01: el año es la media de sus secciones CON asistencia: 100 %, no 50 %', async () => {
        // La pantalla del año escolar (`GET /academic-years/:id/stats`). Antes
        // se miraba en `/api/statistics`, que ninguna pantalla usaba y se quitó.
        const r = await pedir(`/api/academic-years/${year.id}/stats`);
        expect(r.status).toBe(200);
        expect(r.body.find((g: any) => g.grade === 1).stats.attendance).toBe('100%');
    });
});
