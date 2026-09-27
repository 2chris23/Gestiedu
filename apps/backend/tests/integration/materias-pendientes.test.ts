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
 * LA MATERIA PENDIENTE, DE VERDAD
 *
 *   PEND-01  la lista: el admin ve todas; el profesor, las que evalúa; el
 *            alumno, ninguna lista;
 *   PEND-02  la califica el profesor asignado (o el admin); otro profesor y
 *            el alumno, no;
 *   PEND-03  los momentos: del 1 al tope del liceo, en orden; la nota de 0 a
 *            20; volver a ponerla la corrige;
 *   PEND-04  aprobada en el momento en que llega a la mínima (lo del MPPE):
 *            después no hay más momentos; corregir el que la aprobó la
 *            devuelve a pendiente;
 *   PEND-05  sin aprobar en ningún momento, NO_APROBADA con la mejor; con
 *            «por promedio», la media de todos decide;
 *   PEND-06  el cierre del año la cuenta: sin aprobar no se promueve (MPPE);
 *            aprobada, ya no pesa;
 *   PEND-07  la ven el alumno y su representante (y en la boleta); otro
 *            alumno u otro representante, no; el acta sale de los registros;
 *   PEND-08  el admin cambia quién la evalúa; quitar un momento guarda copia
 *            y recalcula.
 */

const SLUG = 'test-institute';
const gId = () => `c${createId()}`;
const dia = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);

describe('Las materias pendientes (PEND-01…08)', () => {
    let server: FastifyInstance;
    let prisma: PrismaClient;
    let admin: any;
    let profe: any;
    let otro: any;
    let ana: any;
    let beto: any;
    let mama: any;
    let otroTutor: any;
    let anterior: any;
    let actual: any;
    let pendiente: any;

    const como = (u: any, role: UserRole) => ({
        Authorization: `Bearer ${generateTestToken(u.id, role, 'institute')}`,
        'X-Institute-Slug': SLUG,
    });
    const api = () => request(server.server);
    const momento = (n: number, nota: number, u = profe, role = UserRole.TEACHER) =>
        api().put(`/api/materias-pendientes/${pendiente.id}/momentos/${n}`).set(como(u, role)).send({ nota, fecha: '2027-01-20' });
    const estado = async () => (prisma as any).materiaPendiente.findUnique({ where: { id: pendiente.id } });

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
        profe = (await createTestUser(prisma, UserRole.TEACHER)).user;
        otro = (await createTestUser(prisma, UserRole.TEACHER)).user;
        mama = (await createTestUser(prisma, UserRole.TUTOR)).user;
        otroTutor = (await createTestUser(prisma, UserRole.TUTOR)).user;
        anterior = await prisma.academicYear.create({
            data: { id: gId(), name: '2025-2026', startDate: dia('2025-09-15'), endDate: dia('2026-07-31'), status: 'COMPLETED', instituteId: 'institute' } as any,
        });
        actual = await prisma.academicYear.create({
            data: { id: gId(), name: '2026-2027', startDate: dia('2026-09-14'), endDate: dia('2027-07-31'), status: 'ACTIVE', isActive: true, instituteId: 'institute' } as any,
        });
        await prisma.period.create({ data: { id: gId(), name: 'Primer Lapso', startDate: dia('2026-09-14'), endDate: dia('2026-12-11'), academicYearId: actual.id } });
        const seccion = await prisma.classroom.create({
            data: { id: gId(), name: '2do Año A', slug: `aula-${gId()}`, grade: 2, section: 'A', capacity: 30, academicYearId: actual.id, instituteId: 'institute' } as any,
        });
        const mate = await prisma.subject.create({ data: { id: gId(), name: 'Matemática', code: `MAT-${gId().slice(0, 5)}`, slug: `mate-${gId()}`, instituteId: 'institute' } as any });
        await prisma.classroomSubject.create({ data: { classroomId: seccion.id, subjectId: mate.id, teacherId: profe.id } });
        ana = (await createTestUser(prisma, UserRole.STUDENT, { firstName: 'Ana', lastName: 'Rivas' })).user;
        beto = (await createTestUser(prisma, UserRole.STUDENT, { firstName: 'Beto', lastName: 'Luna' })).user;
        for (const a of [ana, beto]) {
            await prisma.studentClassroom.create({ data: { id: gId(), studentId: a.id, classroomId: seccion.id, academicYearId: actual.id, isActive: true } });
        }
        await prisma.studentTutor.create({ data: { studentId: ana.id, tutorId: mama.id, relationship: 'Madre' } });
        pendiente = await (prisma as any).materiaPendiente.create({
            data: { studentId: ana.id, subjectId: mate.id, gradoDeOrigen: 1, cicloDeOrigenId: anterior.id, notaDeOrigen: 7, cicloId: actual.id, profesorId: profe.id },
        });
    }, 180000);

    it('PEND-01: el admin ve todas; el profesor, las que evalúa', async () => {
        const deAdmin = (await api().get('/api/materias-pendientes').set(como(admin, UserRole.ADMIN)).expect(200)).body.data;
        expect(deAdmin).toMatchObject({ cicloId: actual.id, momentos: 4, forma: 'MOMENTO_APROBADO', minima: 10 });
        expect(deAdmin.pendientes).toHaveLength(1);
        expect(deAdmin.pendientes[0]).toMatchObject({ alumno: { id: ana.id }, gradoDeOrigen: 1, cicloDeOrigen: '2025-2026', notaDeOrigen: 7, estado: 'PENDIENTE' });
        expect((await api().get('/api/materias-pendientes').set(como(profe, UserRole.TEACHER)).expect(200)).body.data.pendientes).toHaveLength(1);
        expect((await api().get('/api/materias-pendientes').set(como(otro, UserRole.TEACHER)).expect(200)).body.data.pendientes).toHaveLength(0);
        await api().get('/api/materias-pendientes').set(como(ana, UserRole.STUDENT)).expect(403);
    }, 60000);

    it('PEND-02: la califica el profesor asignado o el admin', async () => {
        await momento(1, 8, otro).expect(403);
        await momento(1, 8, ana, UserRole.STUDENT).expect(403);
        await momento(1, 8).expect(200);
        expect((await estado()).estado).toBe('PENDIENTE');
        await momento(2, 9, admin, UserRole.ADMIN).expect(200);
        const notas = await (prisma as any).evaluacionDePendiente.findMany({ where: { materiaPendienteId: pendiente.id }, orderBy: { momento: 'asc' } });
        expect(notas.map((n: any) => [n.momento, n.nota, n.registradaPorId])).toEqual([[1, 8, profe.id], [2, 9, admin.id]]);
    }, 60000);

    it('PEND-03: los momentos van del 1 al tope, en orden; volver a ponerla la corrige', async () => {
        expect((await momento(5, 12).expect(400)).body.code).toBe('MOMENTO_INVALIDO');
        expect((await momento(2, 12).expect(400)).body.code).toBe('MOMENTO_INVALIDO');
        await momento(1, 25).expect(400);
        await momento(1, 6).expect(200);
        await momento(1, 7).expect(200);
        const notas = await (prisma as any).evaluacionDePendiente.findMany({ where: { materiaPendienteId: pendiente.id } });
        expect(notas.map((n: any) => n.nota)).toEqual([7]);
    }, 60000);

    it('PEND-04: aprobada al llegar a la mínima; corregir la devuelve a pendiente', async () => {
        await momento(1, 8).expect(200);
        const r = (await momento(2, 12).expect(200)).body.data;
        expect(r).toEqual({ estado: 'APROBADA', notaFinal: 12 });
        expect((await momento(3, 15).expect(409)).body.code).toBe('YA_APROBADA');
        // Se equivocó en el 2: era 9.
        expect((await momento(2, 9).expect(200)).body.data).toEqual({ estado: 'PENDIENTE', notaFinal: null });
        // Un 9,5 es un 10 (redondeo del MPPE): aprueba.
        expect((await momento(3, 9.5).expect(200)).body.data).toEqual({ estado: 'APROBADA', notaFinal: 10 });
    }, 60000);

    it('PEND-05: sin aprobar en ningún momento, NO_APROBADA; «por promedio», la media decide', async () => {
        for (const [n, nota] of [[1, 5], [2, 8], [3, 6], [4, 7]]) await momento(n, nota).expect(200);
        expect(await estado()).toMatchObject({ estado: 'NO_APROBADA', notaFinal: 8 });

        await (prisma as any).evaluacionDePendiente.deleteMany({ where: { materiaPendienteId: pendiente.id } });
        await (prisma as any).materiaPendiente.update({ where: { id: pendiente.id }, data: { estado: 'PENDIENTE', notaFinal: null } });
        await api().put('/api/institutes/current/academic-config').set(como(admin, UserRole.ADMIN)).send({ pendientes: { momentos: 2, formaDeCalificar: 'PROMEDIO' } }).expect(200);
        expect((await momento(1, 9).expect(200)).body.data).toEqual({ estado: 'PENDIENTE', notaFinal: null });
        // (9 + 12) / 2 = 10,5 → 11 con el redondeo del MPPE.
        expect((await momento(2, 12).expect(200)).body.data).toEqual({ estado: 'APROBADA', notaFinal: 11 });
        expect((await momento(3, 12).expect(400)).body.code).toBe('MOMENTO_INVALIDO');
    }, 60000);

    it('PEND-06: el cierre del año la cuenta', async () => {
        const sugerencia = async () =>
            (await api().post(`/api/academic-years/${actual.id}/close/prepare`).set(como(admin, UserRole.ADMIN)).send({}).expect(200)).body.suggestions.find((s: any) => s.studentId === ana.id);
        expect((await sugerencia()).suggestedStatus).toBe('NO_PROMOVIDO');
        await momento(1, 14).expect(200);
        const despues = await sugerencia();
        expect(despues.suggestedStatus).toBe('PROMOVIDO');
        expect(despues.pendientesArrastradas[0].estado).toBe('APROBADA');
    }, 60000);

    it('PEND-07: la ven el alumno y su representante; el acta sale de los registros', async () => {
        await momento(1, 8).expect(200);
        const url = `/api/materias-pendientes/alumno/${ana.id}`;
        expect((await api().get(url).set(como(ana, UserRole.STUDENT)).expect(200)).body.data[0].momentos).toEqual([
            { momento: 1, nota: 8, fecha: '2027-01-20', observaciones: null },
        ]);
        await api().get(url).set(como(mama, UserRole.TUTOR)).expect(200);
        await api().get(url).set(como(beto, UserRole.STUDENT)).expect(403);
        await api().get(url).set(como(otroTutor, UserRole.TUTOR)).expect(403);

        const acta = (await api().get(`${url}/acta`).set(como(mama, UserRole.TUTOR)).expect(200)).body.data;
        expect(acta).toMatchObject({
            alumno: { cedula: ana.id },
            representantes: [{ cedula: mama.id, parentesco: 'Madre' }],
            seccion: '2do Año A',
            ciclo: '2026-2027',
        });
        expect(acta.pendientes[0]).toMatchObject({ materia: { nombre: 'Matemática' }, profesor: { id: profe.id } });

        const boleta = (await api().get(`/api/students/${ana.id}/boleta`).set(como(ana, UserRole.STUDENT)).expect(200)).body.data;
        expect(boleta.materiasPendientes).toEqual([
            { materia: 'Matemática', gradoDeOrigen: 1, cicloDeOrigen: '2025-2026', estado: 'PENDIENTE', notaFinal: null, momentos: [{ momento: 1, nota: 8 }] },
        ]);
    }, 60000);

    it('PEND-08: el admin cambia quién la evalúa; quitar un momento guarda copia', async () => {
        const url = `/api/materias-pendientes/${pendiente.id}/profesor`;
        await api().put(url).set(como(profe, UserRole.TEACHER)).send({ profesorId: profe.id }).expect(403);
        expect((await api().put(url).set(como(admin, UserRole.ADMIN)).send({ profesorId: ana.id }).expect(400)).body.code).toBe('PROFESOR_INVALIDO');
        await api().put(url).set(como(admin, UserRole.ADMIN)).send({ profesorId: otro.id }).expect(200);
        await momento(1, 8).expect(403);
        await momento(1, 8, otro).expect(200);
        await momento(2, 13, otro).expect(200);
        expect((await estado()).estado).toBe('APROBADA');

        expect((await api().delete(`/api/materias-pendientes/${pendiente.id}/momentos/1`).set(como(otro, UserRole.TEACHER)).expect(409)).body.code).toBe('NO_ES_EL_ULTIMO');
        expect((await api().delete(`/api/materias-pendientes/${pendiente.id}/momentos/2`).set(como(otro, UserRole.TEACHER)).expect(200)).body.data).toEqual({ estado: 'PENDIENTE', notaFinal: null });
        const copia = await prisma.$queryRawUnsafe<any[]>(`SELECT 1 FROM registros_borrados WHERE tabla = 'evaluacionDePendiente'`);
        expect(copia).toHaveLength(1);
    }, 60000);
});
