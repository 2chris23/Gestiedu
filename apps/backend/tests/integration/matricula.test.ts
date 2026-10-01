import { FastifyInstance } from 'fastify';
import request = require('supertest');
import { PrismaClient } from '@prisma/client';
import { createId } from '@paralleldrive/cuid2';
import { UserRole } from '../../src/utils/prisma-enums';
import { createTestServer, createTestPrismaClient, cleanTestDatabase, createTestUser, generateTestToken } from '../helpers';
import { platformPrisma } from '../../src/config/database';
import { RedisCache } from '../../src/config/redis';

/**
 * LA ESTADÍSTICA DE MATRÍCULA
 *
 *   MAT-01  lo inscrito en los primeros días es matrícula inicial; lo que llega
 *           después, ingreso del mes en que llega;
 *   MAT-02  el retiro cuenta en el mes en que se va y sale de la final;
 *           final = inicial + ingresos − retiros, por sexo;
 *   MAT-03  sin sexo o sin fecha de nacimiento: «sin dato», no se inventa;
 *   MAT-04  la edad, cumplida en la fecha de corte del liceo (30/09 por defecto);
 *           solo el admin.
 */

const SLUG = 'test-institute';
const gId = () => `c${createId()}`;
const dia = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);

describe('La estadística de matrícula (MAT-01…04)', () => {
    let server: FastifyInstance;
    let prisma: PrismaClient;
    let admin: any, profe: any, year: any, primeroA: any, segundoA: any;

    const como = (u: any, role: UserRole) => ({ Authorization: `Bearer ${generateTestToken(u.id, role, 'institute')}`, 'X-Institute-Slug': SLUG });
    const api = () => request(server.server);
    const alumno = async (datos: any, aula: any, inscrito: string, retirado?: string) => {
        const u = (await createTestUser(prisma, UserRole.STUDENT, datos)).user;
        await prisma.studentClassroom.create({
            data: { studentId: u.id, classroomId: aula.id, academicYearId: year.id, enrollmentDate: dia(inscrito), isActive: !retirado, retiradoEl: retirado ? dia(retirado) : null },
        });
        return u;
    };
    const ver = async (q = '') => (await api().get(`/api/academic-years/${year.id}/matricula${q}`).set(como(admin, UserRole.ADMIN)).expect(200)).body.data;

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
        year = await prisma.academicYear.create({
            data: { id: gId(), name: '2025-2026', startDate: dia('2025-09-15'), endDate: dia('2026-07-31'), status: 'ACTIVE', isActive: true, instituteId: 'institute' } as any,
        });
        primeroA = await prisma.classroom.create({ data: { id: gId(), name: '1º A', slug: `a-${gId()}`, grade: 1, section: 'A', academicYearId: year.id, instituteId: 'institute' } as any });
        segundoA = await prisma.classroom.create({ data: { id: gId(), name: '2º A', slug: `b-${gId()}`, grade: 2, section: 'A', academicYearId: year.id, instituteId: 'institute' } as any });
        // 1º A: dos niñas y un niño de la inscripción; una niña llega en noviembre; un niño se va en noviembre.
        await alumno({ gender: 'FEMENINO', birthDate: dia('2013-05-01') }, primeroA, '2025-09-10');
        await alumno({ gender: 'FEMENINO', birthDate: dia('2013-10-01') }, primeroA, '2025-09-20');
        await alumno({ gender: 'MASCULINO', birthDate: dia('2012-09-30') }, primeroA, '2025-09-15', '2025-11-12');
        await alumno({ gender: 'FEMENINO', birthDate: dia('2013-01-15') }, primeroA, '2025-11-03');
        // 2º A: uno sin sexo ni fecha de nacimiento.
        await alumno({ gender: null, birthDate: null }, segundoA, '2025-09-01');
    });

    it('MAT-01/02: inicial, ingresos, retiros y final, por sexo', async () => {
        const nov = await ver('?desde=2025-11-01&hasta=2025-11-30');
        const a = nov.secciones.find((s: any) => s.id === primeroA.id);
        expect(a.inicial).toEqual({ M: 1, F: 2, X: 0, total: 3 });
        expect(a.ingresos).toEqual({ M: 0, F: 1, X: 0, total: 1 });
        expect(a.retiros).toEqual({ M: 1, F: 0, X: 0, total: 1 });
        expect(a.final).toEqual({ M: 0, F: 3, X: 0, total: 3 });
        expect(nov.total.final.total).toBe(4);

        // En septiembre: todo es matrícula inicial (los primeros 30 días), nadie se fue.
        const sep = await ver('?desde=2025-09-15&hasta=2025-09-30');
        const s = sep.secciones.find((x: any) => x.id === primeroA.id);
        expect(s.inicial.total).toBe(3);
        expect(s.ingresos.total).toBe(0);
        expect(s.final.total).toBe(3);

        // En diciembre, el que se fue ya no está al empezar, y la de noviembre sí.
        const dic = await ver('?desde=2025-12-01&hasta=2025-12-31');
        expect(dic.secciones.find((x: any) => x.id === primeroA.id).inicial).toEqual({ M: 0, F: 3, X: 0, total: 3 });
    });

    it('MAT-03/04: sin dato no se inventa; la edad en la fecha de corte; solo el admin', async () => {
        const r = await ver('?desde=2025-09-15&hasta=2025-12-31');
        expect(r.secciones.find((x: any) => x.id === segundoA.id).final).toEqual({ M: 0, F: 0, X: 1, total: 1 });
        expect(r.reglas.fechaDeCorte).toBe('2025-09-30');
        // Al 30/09/2025: nacida 2013-05-01 → 12; 2013-10-01 → 11 (aún no); 2013-01-15 → 12.
        const edades: string[] = r.porEdad.edades;
        const primero = r.porEdad.grados.find((g: any) => g.grado === 1).celdas;
        expect(primero[edades.indexOf('12')]).toEqual({ M: 0, F: 2, X: 0, total: 2 });
        expect(primero[edades.indexOf('11')]).toEqual({ M: 0, F: 1, X: 0, total: 1 });
        expect(r.porEdad.grados.find((g: any) => g.grado === 2).celdas[edades.indexOf('sin dato')]).toEqual({ M: 0, F: 0, X: 1, total: 1 });

        await api().get(`/api/academic-years/${year.id}/matricula`).set(como(profe, UserRole.TEACHER)).expect(403);
        const mal = await api().get(`/api/academic-years/${year.id}/matricula?desde=2025-12-01&hasta=2025-11-01`).set(como(admin, UserRole.ADMIN));
        expect(mal.status).toBe(400);
    });
});
