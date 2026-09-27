import { FastifyInstance } from 'fastify';
import request = require('supertest');
import { PrismaClient } from '@prisma/client';
import { createId } from '@paralleldrive/cuid2';
import { UserRole } from '../../src/utils/prisma-enums';
import { createTestServer, createTestPrismaClient, cleanTestDatabase, createTestUser, generateTestToken } from '../helpers';
import { platformPrisma } from '../../src/config/database';
import { RedisCache } from '../../src/config/redis';

/**
 * EL CARNET ESTUDIANTIL
 *
 *   CARNET-01  el de un alumno: su sección de este año y su foto; sin sección, 404;
 *   CARNET-02  los de una sección: solo sus alumnos activos, por apellido; solo el admin.
 */

const SLUG = 'test-institute';
const gId = () => `c${createId()}`;
const dia = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);

describe('El carnet (CARNET-01/02)', () => {
    let server: FastifyInstance;
    let prisma: PrismaClient;
    let admin: any, profe: any, ana: any, beto: any, carla: any, sinSeccion: any, a: any;

    const como = (u: any, role: UserRole) => ({ Authorization: `Bearer ${generateTestToken(u.id, role, 'institute')}`, 'X-Institute-Slug': SLUG });
    const api = () => request(server.server);

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
        await platformPrisma.institute.update({ where: { id: 'institute' }, data: { academicConfig: { notaMinimaAprobatoria: 10 } } });
        admin = (await createTestUser(prisma, UserRole.ADMIN)).user;
        profe = (await createTestUser(prisma, UserRole.TEACHER)).user;
        ana = (await createTestUser(prisma, UserRole.STUDENT, { firstName: 'Ana', lastName: 'Zamora', avatar: '/users/x/photo?v=1' })).user;
        beto = (await createTestUser(prisma, UserRole.STUDENT, { firstName: 'Beto', lastName: 'Arias' })).user;
        carla = (await createTestUser(prisma, UserRole.STUDENT, { firstName: 'Carla', lastName: 'Mora' })).user;
        sinSeccion = (await createTestUser(prisma, UserRole.STUDENT)).user;
        const year = await prisma.academicYear.create({
            data: { id: gId(), name: '2026-2027', startDate: dia('2026-09-14'), endDate: dia('2027-07-31'), status: 'ACTIVE', isActive: true, instituteId: 'institute' } as any,
        });
        a = await prisma.classroom.create({ data: { id: gId(), name: '1º A', slug: `a-${gId()}`, grade: 1, section: 'A', academicYearId: year.id, instituteId: 'institute' } as any });
        const b = await prisma.classroom.create({ data: { id: gId(), name: '1º B', slug: `b-${gId()}`, grade: 1, section: 'B', academicYearId: year.id, instituteId: 'institute' } as any });
        await prisma.studentClassroom.create({ data: { studentId: ana.id, classroomId: a.id, academicYearId: year.id } });
        await prisma.studentClassroom.create({ data: { studentId: beto.id, classroomId: a.id, academicYearId: year.id } });
        await prisma.studentClassroom.create({ data: { studentId: carla.id, classroomId: b.id, academicYearId: year.id } });
    });

    it('CARNET-01: el de un alumno', async () => {
        const r = (await api().get(`/api/students/${ana.id}/carnet`).set(como(admin, UserRole.ADMIN)).expect(200)).body.data;
        expect(r.carnets).toEqual([{ id: ana.id, nombres: 'Ana', apellidos: 'Zamora', tipoDeCedula: null, foto: '/users/x/photo?v=1', seccion: '1º A', ciclo: '2026-2027' }]);
        expect(r.liceo.nombre).toBeTruthy();
        await api().get(`/api/students/${sinSeccion.id}/carnet`).set(como(admin, UserRole.ADMIN)).expect(404);
    });

    it('CARNET-02: los de una sección, sin los de otra; solo el admin', async () => {
        const r = (await api().get(`/api/classrooms/${a.id}/carnets`).set(como(admin, UserRole.ADMIN)).expect(200)).body.data;
        expect(r.carnets.map((c: any) => c.apellidos)).toEqual(['Arias', 'Zamora']);
        await api().get(`/api/classrooms/${a.id}/carnets`).set(como(profe, UserRole.TEACHER)).expect(403);
        await api().get(`/api/students/${ana.id}/carnet`).set(como(ana, UserRole.STUDENT)).expect(403);
    });
});
