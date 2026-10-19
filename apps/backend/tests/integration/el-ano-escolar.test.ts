import { FastifyInstance } from 'fastify';
import request = require('supertest');
import { PrismaClient } from '@prisma/client';
import { createId } from '@paralleldrive/cuid2';
import { UserRole } from '../../src/utils/prisma-enums';
import { createTestServer, createTestPrismaClient, createTestUser, createTestUserWithPassword, generateTestToken, createTestClassroom, createTestSubject } from '../helpers';

/**
 * ACTIVAR Y BORRAR UN AÑO ESCOLAR (puerta 4, `docs/LISTO-PARA-EL-PILOTO.md`)
 *
 * Hasta el 19-oct-2026 estas dos rutas solo se probaban por su rechazo
 * (`acciones-sin-prueba.ts --probadas`): nadie había visto que funcionaran.
 *
 *   ANO-01 activar uno deja al anterior como completado (uno solo activo); solo el admin
 *   ANO-02 borrar pide la contraseña; con notas, 409 y se archiva; sin notas, se va con copia
 */

const SLUG = 'test-institute';
const CLAVE = 'Clave-de-prueba-1';
const gId = () => `c${createId()}`;

describe('El año escolar: activar y borrar', () => {
    let server: FastifyInstance;
    let prisma: PrismaClient;
    let admin: any, profe: any;
    const tk: Record<string, string> = {};
    const api = (t: string) => (r: request.Test) => r.set('Authorization', `Bearer ${t}`).set('X-Institute-Slug', SLUG);
    const nuevoAno = (nombre: string, status = 'UPCOMING') =>
        prisma.academicYear.create({
            data: { id: gId(), name: nombre, status: status as any, isActive: status === 'ACTIVE', startDate: new Date('2027-09-15'), endDate: new Date('2028-07-15'), instituteId: 'institute' },
        });

    beforeAll(async () => {
        server = await createTestServer();
        prisma = await createTestPrismaClient();
        admin = (await createTestUserWithPassword(prisma, UserRole.ADMIN, CLAVE)).user;
        profe = (await createTestUser(prisma, UserRole.TEACHER)).user;
        tk.admin = generateTestToken(admin.id, UserRole.ADMIN, 'institute');
        tk.profe = generateTestToken(profe.id, UserRole.TEACHER, 'institute');
    }, 120000);

    afterAll(async () => {
        await prisma?.$disconnect();
        await server?.close();
    });

    it('ANO-01: activar uno deja al anterior como completado; solo el admin', async () => {
        await prisma.academicYear.updateMany({ data: { status: 'COMPLETED' as any, isActive: false } });
        const viejo = await nuevoAno(`Viejo-${gId().slice(0, 5)}`, 'ACTIVE');
        const nuevo = await nuevoAno(`Nuevo-${gId().slice(0, 5)}`);
        const activar = (t: string, status: string) => api(t)(request(server.server).put(`/api/academic-years/${nuevo.id}/status`)).send({ status });

        expect((await activar(tk.profe, 'ACTIVE')).status).toBe(403);
        expect((await activar(tk.admin, 'INVENTADO')).status).toBe(400);
        const r = await activar(tk.admin, 'ACTIVE');
        expect([r.status, r.body.status]).toEqual([200, 'ACTIVE']);
        expect((await prisma.academicYear.findUnique({ where: { id: viejo.id } }))!.status).toBe('COMPLETED');
        expect(await prisma.academicYear.count({ where: { status: 'ACTIVE' as any } })).toBe(1);
        expect((await api(tk.admin)(request(server.server).put(`/api/academic-years/${gId()}/status`)).send({ status: 'ACTIVE' })).status).toBe(404);
    }, 60000);

    it('ANO-02: borrar pide la contraseña; con notas no se borra; sin notas, se va con copia', async () => {
        const borrar = (id: string, body: any, t = tk.admin) => api(t)(request(server.server).delete(`/api/academic-years/${id}`)).send(body);

        // Con notas: 409, se archiva.
        const conNotas = await nuevoAno(`ConNotas-${gId().slice(0, 5)}`);
        const lapso = await prisma.period.create({ data: { id: gId(), name: 'Primer Lapso', startDate: new Date('2027-09-15'), endDate: new Date('2027-12-15'), academicYearId: conNotas.id } });
        const seccion = await createTestClassroom(prisma, conNotas.id, 'institute');
        const materia = await createTestSubject(prisma, 'institute');
        const alumno = (await createTestUser(prisma, UserRole.STUDENT)).user;
        const actividad = await prisma.activity.create({
            data: { title: 'Prueba', type: 'SUMATIVA', scope: 'CLASSROOM', startDate: new Date('2027-10-01'), maxGrade: 20, weight: 1, classroomId: seccion.id, subjectId: materia.id, periodId: lapso.id, lapso: '1', createdBy: profe.id, instituteId: 'institute' } as any,
        });
        await prisma.grade.create({ data: { studentId: alumno.id, activityId: actividad.id, periodId: lapso.id, subjectId: materia.id, teacherId: profe.id, score: 15 } });

        expect((await borrar(conNotas.id, { password: CLAVE }, tk.profe)).status).toBe(403);
        expect((await borrar(conNotas.id, {})).status).toBe(400);
        expect((await borrar(conNotas.id, { password: 'no-es-esta' })).body.code).toBe('INVALID_PASSWORD');
        const r409 = await borrar(conNotas.id, { password: CLAVE });
        expect([r409.status, r409.body.code]).toEqual([409, 'HAS_ACADEMIC_ACTIVITY_MUST_ARCHIVE']);
        expect(await prisma.academicYear.findUnique({ where: { id: conNotas.id } })).toBeTruthy();

        // Sin notas (con un alumno inscrito): se borra, con copia de lo que arrastra.
        const vacio = await nuevoAno(`Vacio-${gId().slice(0, 5)}`);
        const sec2 = await createTestClassroom(prisma, vacio.id, 'institute');
        await prisma.studentClassroom.create({ data: { studentId: alumno.id, classroomId: sec2.id, academicYearId: vacio.id } });
        expect((await borrar(vacio.id, { password: CLAVE })).status).toBe(204);
        expect(await prisma.academicYear.findUnique({ where: { id: vacio.id } })).toBeNull();
        expect(await prisma.registroBorrado.count({ where: { tabla: 'academicYear', registroId: vacio.id } })).toBe(1);
        expect(await prisma.registroBorrado.count({ where: { tabla: 'studentClassroom' } })).toBeGreaterThanOrEqual(1);
    }, 60000);
});
