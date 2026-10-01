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
 * EL ALUMNO RETIRADO (ARCHIVADO) DEJA DE CONTAR EN SU SECCIÓN
 *
 * Retirar a un alumno a mitad de año, en la práctica, es «Archivar usuario»
 * en Usuarios. Pero archivar solo apagaba la CUENTA: la inscripción seguía
 * activa. El alumno que ya no viene seguía ocupando un puesto en el cupo,
 * contando en el total de la sección, y al cerrar el ciclo el sistema lo
 * proponía para inscribirlo en el año siguiente como si nada.
 *
 * Es una queja clásica de los sistemas escolares: el retirado sigue en la
 * lista y le siguen cayendo inasistencias.
 *
 *   RET-01  archivado, no cuenta en el total de la sección ni en el cupo;
 *   RET-02  archivado, no entra en el cierre del ciclo (no se le reinscribe solo);
 *   RET-03  su inscripción no se borra: queda inactiva, con su historial;
 *   RET-04  al desarchivarlo vuelve a su sección si hay cupo.
 */

const SLUG = 'test-institute';
const gId = () => `c${createId()}`;

describe('El alumno retirado (RET-01…04)', () => {
    let server: FastifyInstance;
    let prisma: PrismaClient;
    let tokenAdmin: string;
    let year: any;
    let seccion: any;
    let alumno: any;
    let otro: any;

    const auth = () => ({ Authorization: `Bearer ${tokenAdmin}`, 'X-Institute-Slug': SLUG });

    beforeAll(async () => {
        server = await createTestServer();
        prisma = await createTestPrismaClient();
    }, 120000);

    afterAll(async () => {
        await prisma.$disconnect();
        await server.close();
    });

    beforeEach(async () => {
        await cleanTestDatabase(prisma);
        await RedisCache.clearPattern('*').catch(() => undefined);
        await platformPrisma.institute.update({ where: { id: 'institute' }, data: { academicConfig: {} } }).catch(() => undefined);
        const admin = (await createTestUser(prisma, UserRole.ADMIN)).user;
        tokenAdmin = generateTestToken(admin.id, UserRole.ADMIN, 'institute');
        const hoy = Date.now();
        year = await prisma.academicYear.create({
            data: { id: gId(), name: `Ciclo-${gId().slice(0, 6)}`, startDate: new Date(hoy - 60 * 864e5), endDate: new Date(hoy + 200 * 864e5), isActive: true, status: 'ACTIVE', instituteId: 'institute' } as any,
        });
        await prisma.period.create({
            data: { id: gId(), name: 'Primer Lapso', startDate: new Date(hoy - 60 * 864e5), endDate: new Date(hoy + 30 * 864e5), isActive: true, academicYearId: year.id },
        });
        seccion = await prisma.classroom.create({
            data: { id: gId(), name: '1er Año A', slug: `aula-${gId()}`, grade: 1, section: 'A', capacity: 2, academicYearId: year.id, instituteId: 'institute' } as any,
        });
        alumno = (await createTestUser(prisma, UserRole.STUDENT)).user;
        otro = (await createTestUser(prisma, UserRole.STUDENT)).user;
        for (const a of [alumno, otro]) {
            await prisma.studentClassroom.create({
                data: { id: gId(), studentId: a.id, classroomId: seccion.id, academicYearId: year.id, isActive: true },
            });
        }
    }, 180000);

    const archivar = () => request(server.server).post(`/api/users/${alumno.id}/archive`).set(auth()).expect(200);

    it('RET-01: archivado, no cuenta en el total de la sección ni ocupa cupo', async () => {
        await archivar();

        const stats = await request(server.server).get(`/api/statistics/section/${seccion.id}`).set(auth()).expect(200);
        expect((stats.body.data ?? stats.body).totalStudents).toBe(1);

        const lista = await request(server.server).get(`/api/classrooms?academicYearId=${year.id}`).set(auth()).expect(200);
        const suya = (lista.body.data ?? lista.body).find((c: any) => c.id === seccion.id);
        expect(suya._count.students).toBe(1);

        // Y el puesto que deja se puede ocupar (cupo de 2).
        const { user: nuevo } = await createTestUser(prisma, UserRole.STUDENT);
        await request(server.server)
            .post(`/api/classrooms/${seccion.id}/students`)
            .set(auth())
            .send({ studentId: nuevo.id })
            .expect(201);
    }, 60000);

    it('RET-02: archivado, no entra en el cierre del ciclo', async () => {
        await archivar();
        const res = await request(server.server).post(`/api/academic-years/${year.id}/close/prepare`).set(auth()).expect(200);
        const ids = res.body.suggestions.map((s: any) => s.studentId);
        expect(ids).toContain(otro.id);
        expect(ids).not.toContain(alumno.id);
    }, 60000);

    it('RET-03: su inscripción no se borra, queda inactiva', async () => {
        await archivar();
        const suya = await prisma.studentClassroom.findFirst({ where: { studentId: alumno.id, academicYearId: year.id } });
        expect(suya).not.toBeNull();
        expect(suya!.isActive).toBe(false);
        expect(suya!.classroomId).toBe(seccion.id);
    }, 60000);

    it('RET-04: al desarchivarlo vuelve a su sección', async () => {
        await archivar();
        await request(server.server).post(`/api/users/${alumno.id}/unarchive`).set(auth()).expect(200);
        const suya = await prisma.studentClassroom.findFirst({ where: { studentId: alumno.id, academicYearId: year.id } });
        expect(suya!.isActive).toBe(true);
    }, 60000);
});
