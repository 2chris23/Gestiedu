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
 * LA LABOR SOCIAL (LAS HORAS COMUNITARIAS)
 *
 *   LABOR-01  la anotan el admin y el guía de la sección del alumno; el guía
 *             de otra sección, un profesor cualquiera, el alumno o su
 *             representante, no;
 *   LABOR-02  una salida de la sección se anota a varios de una vez; si uno
 *             no es suyo, no se anota a nadie;
 *   LABOR-03  solo en los grados del liceo (5to por defecto) y si está activa;
 *   LABOR-04  el avance: horas contra las del liceo, o por proyecto; el guía
 *             ve solo su sección;
 *   LABOR-05  el alumno y su representante la ven sin poder tocarla; borrar
 *             guarda copia;
 *   LABOR-06  en el cierre del último año: BLOQUEA deja el egreso pendiente;
 *             AVISA egresa con aviso;
 *   LABOR-07  la constancia de labor social, solo cumplida y solo del admin.
 */

const SLUG = 'test-institute';
const gId = () => `c${createId()}`;
const dia = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);

describe('La labor social (LABOR-01…07)', () => {
    let server: FastifyInstance;
    let prisma: PrismaClient;
    let admin: any;
    let guia5A: any;
    let guia5B: any;
    let guia3: any;
    let profe: any;
    let mama: any;
    let year: any;
    const al: Record<string, any> = {};

    const como = (u: any, role: UserRole) => ({
        Authorization: `Bearer ${generateTestToken(u.id, role, 'institute')}`,
        'X-Institute-Slug': SLUG,
    });
    const api = () => request(server.server);
    const anotar = (alumnos: any[], extra: any = {}, u = guia5A, role = UserRole.TEACHER) =>
        api().post('/api/labor-social/actividades').set(como(u, role)).send({
            alumnos: alumnos.map((a) => a.id),
            fecha: '2027-03-10',
            horas: 4,
            que: 'Jornada de limpieza de la plaza',
            donde: 'Plaza Bolívar',
            ...extra,
        });
    const config = (body: any) => api().put('/api/institutes/current/academic-config').set(como(admin, UserRole.ADMIN)).send(body);

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
        await platformPrisma.institute.update({ where: { id: 'institute' }, data: { academicConfig: { notaMinimaAprobatoria: 10 } } });

        admin = (await createTestUser(prisma, UserRole.ADMIN)).user;
        guia5A = (await createTestUser(prisma, UserRole.TEACHER)).user;
        guia5B = (await createTestUser(prisma, UserRole.TEACHER)).user;
        guia3 = (await createTestUser(prisma, UserRole.TEACHER)).user;
        profe = (await createTestUser(prisma, UserRole.TEACHER)).user;
        mama = (await createTestUser(prisma, UserRole.TUTOR)).user;
        year = await prisma.academicYear.create({
            data: { id: gId(), name: '2026-2027', startDate: dia('2026-09-14'), endDate: dia('2027-07-31'), status: 'ACTIVE', isActive: true, instituteId: 'institute' } as any,
        });
        const seccion = (grado: number, letra: string, guia: any) =>
            prisma.classroom.create({
                data: { id: gId(), name: `${grado}º ${letra}`, slug: `aula-${gId()}`, grade: grado, section: letra, capacity: 30, academicYearId: year.id, instituteId: 'institute', teacherId: guia.id } as any,
            });
        const quintoA = await seccion(5, 'A', guia5A);
        const quintoB = await seccion(5, 'B', guia5B);
        const terceroA = await seccion(3, 'A', guia3);
        // Un profesor que da clase en 5to A sin ser su guía.
        const mate = await prisma.subject.create({ data: { id: gId(), name: 'Matemática', code: `MAT-${gId().slice(0, 5)}`, slug: `mate-${gId()}`, instituteId: 'institute' } as any });
        await prisma.classroomSubject.create({ data: { classroomId: quintoA.id, subjectId: mate.id, teacherId: profe.id } });
        const inscribir = async (nombre: string, classroomId: string) => {
            const u = (await createTestUser(prisma, UserRole.STUDENT, { firstName: nombre, lastName: 'Prueba' })).user;
            await prisma.studentClassroom.create({ data: { id: gId(), studentId: u.id, classroomId, academicYearId: year.id, isActive: true } });
            return u;
        };
        al.ana = await inscribir('Ana', quintoA.id);
        al.beto = await inscribir('Beto', quintoA.id);
        al.caro = await inscribir('Caro', quintoB.id);
        al.dani = await inscribir('Dani', terceroA.id);
        await prisma.studentTutor.create({ data: { studentId: al.ana.id, tutorId: mama.id, relationship: 'Madre' } });
    }, 180000);

    it('LABOR-01: la anotan el admin y el guía de su sección', async () => {
        await anotar([al.ana]).expect(201);
        await anotar([al.ana], {}, admin, UserRole.ADMIN).expect(201);
        await anotar([al.ana], {}, guia5B).expect(403);
        await anotar([al.ana], {}, profe).expect(403);
        await anotar([al.ana], {}, al.ana, UserRole.STUDENT).expect(403);
        await anotar([al.ana], {}, mama, UserRole.TUTOR).expect(403);
        const suyas = await (prisma as any).actividadDeLaborSocial.findMany({ where: { studentId: al.ana.id } });
        expect(suyas.map((a: any) => a.registradaPorId).sort()).toEqual([admin.id, guia5A.id].sort());
    }, 60000);

    it('LABOR-02: una salida de la sección, a varios de una vez; con uno ajeno, a nadie', async () => {
        const r = (await anotar([al.ana, al.beto]).expect(201)).body.data;
        expect(r.anotadas).toBe(2);
        const grupos = await (prisma as any).actividadDeLaborSocial.findMany({ select: { grupo: true } });
        expect(new Set(grupos.map((g: any) => g.grupo))).toEqual(new Set([r.grupo]));
        await anotar([al.ana, al.caro]).expect(403);
        expect(await (prisma as any).actividadDeLaborSocial.count()).toBe(2);
        await anotar([al.ana], { horas: 0 }).expect(400);
        await anotar([al.ana], { que: '' }).expect(400);
    }, 60000);

    it('LABOR-03: solo en los grados del liceo y si está activa', async () => {
        expect((await anotar([al.dani], {}, guia3).expect(409)).body.code).toBe('FUERA_DE_LABOR_SOCIAL');
        await config({ laborSocial: { activa: true, grados: [3, 5], horasRequeridas: 60, paraEgresar: 'AVISA' } }).expect(200);
        await anotar([al.dani], {}, guia3).expect(201);
        await config({ laborSocial: { activa: false, grados: [5], horasRequeridas: 60, paraEgresar: 'AVISA' } }).expect(200);
        expect((await anotar([al.ana]).expect(409)).body.code).toBe('LABOR_SOCIAL_INACTIVA');
        expect((await config({ laborSocial: { activa: true, grados: [], horasRequeridas: 60, paraEgresar: 'AVISA' } }).expect(400)).body.code).toBe('REGLA_INVALIDA');
    }, 60000);

    it('LABOR-04: el avance, por horas o por proyecto; el guía ve su sección', async () => {
        await anotar([al.ana], { horas: 20 }).expect(201);
        await anotar([al.ana], { horas: 12.5 }).expect(201);
        const deAdmin = (await api().get('/api/labor-social').set(como(admin, UserRole.ADMIN)).expect(200)).body.data;
        expect(deAdmin.alumnos).toHaveLength(3);
        expect(deAdmin.alumnos.find((a: any) => a.alumno.id === al.ana.id)).toMatchObject({ horas: 32.5, requeridas: 60, cumplida: false });
        const delGuia = (await api().get('/api/labor-social').set(como(guia5A, UserRole.TEACHER)).expect(200)).body.data;
        expect(delGuia.alumnos.map((a: any) => a.alumno.id).sort()).toEqual([al.ana.id, al.beto.id].sort());

        await config({ laborSocial: { activa: true, grados: [5], horasRequeridas: 0, paraEgresar: 'AVISA' } }).expect(200);
        let ana = (await api().get(`/api/labor-social/alumno/${al.ana.id}`).set(como(admin, UserRole.ADMIN)).expect(200)).body.data;
        expect(ana.avance).toMatchObject({ porProyecto: true, cumplida: false });
        await anotar([al.ana], { horas: 2, proyecto: 'Huerto escolar', culminaElProyecto: true }).expect(201);
        ana = (await api().get(`/api/labor-social/alumno/${al.ana.id}`).set(como(admin, UserRole.ADMIN)).expect(200)).body.data;
        expect(ana.avance).toMatchObject({ porProyecto: true, cumplida: true, horas: 34.5 });
    }, 60000);

    it('LABOR-05: el alumno y su representante la ven; borrar guarda copia', async () => {
        await anotar([al.ana]).expect(201);
        const url = `/api/labor-social/alumno/${al.ana.id}`;
        const suya = (await api().get(url).set(como(al.ana, UserRole.STUDENT)).expect(200)).body.data;
        expect(suya).toMatchObject({ puedeAnotar: false, avance: { horas: 4 } });
        expect(suya.actividades[0]).toMatchObject({ que: 'Jornada de limpieza de la plaza', donde: 'Plaza Bolívar', horas: 4 });
        await api().get(url).set(como(mama, UserRole.TUTOR)).expect(200);
        await api().get(url).set(como(al.beto, UserRole.STUDENT)).expect(403);
        expect((await api().get(url).set(como(guia5A, UserRole.TEACHER)).expect(200)).body.data.puedeAnotar).toBe(true);

        const id = suya.actividades[0].id;
        await api().delete(`/api/labor-social/actividades/${id}`).set(como(guia5B, UserRole.TEACHER)).expect(403);
        await api().delete(`/api/labor-social/actividades/${id}`).set(como(guia5A, UserRole.TEACHER)).expect(200);
        expect(await (prisma as any).actividadDeLaborSocial.count()).toBe(0);
        expect(await prisma.$queryRawUnsafe<any[]>(`SELECT 1 FROM registros_borrados WHERE tabla = 'actividadDeLaborSocial'`)).toHaveLength(1);
    }, 60000);

    it('LABOR-06: en el cierre del último año, BLOQUEA o AVISA', async () => {
        const siguiente = await prisma.academicYear.create({
            data: { id: gId(), name: '2027-2028', startDate: dia('2027-09-20'), endDate: dia('2028-07-31'), status: 'UPCOMING', instituteId: 'institute' } as any,
        });
        await prisma.classroom.create({ data: { id: gId(), name: '4º A', slug: `aula-${gId()}`, grade: 4, section: 'A', academicYearId: siguiente.id, instituteId: 'institute' } as any });
        for (let i = 0; i < 3; i++) await anotar([al.beto], { horas: 20 }).expect(201);

        const sugerencias = (await api().post(`/api/academic-years/${year.id}/close/prepare`).set(como(admin, UserRole.ADMIN)).send({}).expect(200)).body.suggestions;
        const ana = sugerencias.find((s: any) => s.studentId === al.ana.id);
        expect(ana.laborSocial).toMatchObject({ horas: 0, cumplida: false });
        expect(ana.motivoDeLaSugerencia).toMatch(/labor social/);

        await config({ laborSocial: { activa: true, grados: [5], horasRequeridas: 60, paraEgresar: 'BLOQUEA' } }).expect(200);
        await api().post(`/api/academic-years/${year.id}/close`).set(como(admin, UserRole.ADMIN)).send({ decisions: [] }).expect(200);
        const egreso = async (a: any) =>
            (await prisma.academicRecord.findUnique({ where: { studentId_academicYearId: { studentId: a.id, academicYearId: year.id } } }))!.egreso;
        expect(await egreso(al.ana)).toBe('PENDIENTE');
        expect(await egreso(al.beto)).toBe('EGRESADO');
    }, 60000);

    it('LABOR-07: la constancia de labor social, cumplida y del admin', async () => {
        const url = `/api/students/${al.ana.id}/constancia?tipo=LABOR_SOCIAL`;
        await anotar([al.ana], { horas: 20 }).expect(201);
        expect((await api().get(url).set(como(admin, UserRole.ADMIN)).expect(409)).body.code).toBe('LABOR_SOCIAL_NO_CUMPLIDA');
        await anotar([al.ana], { horas: 20, proyecto: 'Huerto escolar' }).expect(201);
        await anotar([al.ana], { horas: 20 }).expect(201);
        const c = (await api().get(url).set(como(admin, UserRole.ADMIN)).expect(200)).body.data;
        expect(c.titulo).toBe('Constancia de labor social');
        expect(c.parrafos[0]).toMatch(/cumplió 60 horas de labor social comunitaria en el proyecto «Huerto escolar»/);
        await api().get(url).set(como(al.ana, UserRole.STUDENT)).expect(403);
    }, 60000);
});
