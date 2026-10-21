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
 * LA CLASE DE PENDIENTES COMO UNA CLASE (2026-10-12): el plan por momento,
 * sus notas y los encuentros con asistencia (`plan-de-pendientes.service`).
 *
 *   PEND-17  el plan de un momento: las evaluaciones suman 100; lo lleva el
 *            profesor de la clase (o el admin); sale con la clase;
 *   PEND-18  con todas las notas del momento, la nota de la opción sale sola
 *            (suma ponderada); con instrumento, de lo marcado, llevada a 20;
 *            a mano manda sobre el plan;
 *   PEND-19  quitar una evaluación con notas pide confirmarlo y va a la
 *            papelera; la nota que salía del plan se rehace;
 *   PEND-20  los encuentros y su asistencia: faltar a la evaluación de una
 *            opción la deja «IN» (justificado, no cuenta); volver a marcarlo
 *            presente lo quita.
 */

const SLUG = 'test-institute';
const gId = () => `c${createId()}`;
const dia = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);

describe('El plan y los encuentros de las pendientes (PEND-17…20)', () => {
    let server: FastifyInstance;
    let prisma: PrismaClient;
    let admin: any;
    let profe: any;
    let otro: any;
    let clase: any;
    const al: Record<string, any> = {};
    const pend: Record<string, any> = {};

    const como = (u: any, role: UserRole) => ({
        Authorization: `Bearer ${generateTestToken(u.id, role, 'institute')}`,
        'X-Institute-Slug': SLUG,
    });
    const api = () => request(server.server);
    const plan = (momento: number, evaluaciones: any[], extra: any = {}, u = profe, role = UserRole.TEACHER) =>
        api().put(`/api/materias-pendientes/clase/${clase.id}/plan/${momento}`).set(como(u, role)).send({ evaluaciones, ...extra });
    const nota = (p: any, evaluacionId: string, opcion: number, body: any, u = profe) =>
        api().put(`/api/materias-pendientes/${p.id}/plan/${evaluacionId}/opciones/${opcion}`).set(como(u, UserRole.TEACHER)).send(body);
    const laClase = () => api().get(`/api/materias-pendientes/clase/${clase.id}`).set(como(profe, UserRole.TEACHER));
    const opcionDe = (p: any, momento: number, opcion: number) =>
        (prisma as any).opcionDePendiente.findUnique({ where: { materiaPendienteId_momento_opcion: { materiaPendienteId: p.id, momento, opcion } } });

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
        profe = (await createTestUser(prisma, UserRole.TEACHER)).user;
        otro = (await createTestUser(prisma, UserRole.TEACHER)).user;
        const anterior = await prisma.academicYear.create({
            data: { id: gId(), name: '2025-2026', startDate: dia('2025-09-15'), endDate: dia('2026-07-31'), status: 'COMPLETED', instituteId: 'institute' } as any,
        });
        const actual = await prisma.academicYear.create({
            data: { id: gId(), name: '2026-2027', startDate: dia('2026-09-14'), endDate: dia('2027-07-31'), status: 'ACTIVE', isActive: true, instituteId: 'institute' } as any,
        });
        const seccion = (grado: number) =>
            prisma.classroom.create({
                data: { id: gId(), name: `${grado}º A`, slug: `aula-${gId()}`, grade: grado, section: 'A', capacity: 30, academicYearId: actual.id, instituteId: 'institute' } as any,
            });
        const primero = await seccion(1);
        const segundo = await seccion(2);
        const mate = await prisma.subject.create({ data: { id: gId(), name: 'Matemática', code: `MAT-${gId().slice(0, 5)}`, slug: `mate-${gId()}`, instituteId: 'institute' } as any });
        clase = await prisma.classroomSubject.create({ data: { classroomId: primero.id, subjectId: mate.id, teacherId: profe.id } });
        for (const n of ['ana', 'beto', 'caro']) {
            al[n] = (await createTestUser(prisma, UserRole.STUDENT, { firstName: n, lastName: 'Prueba' })).user;
            await prisma.studentClassroom.create({ data: { id: gId(), studentId: al[n].id, classroomId: segundo.id, academicYearId: actual.id, isActive: true } });
            pend[n] = await (prisma as any).materiaPendiente.create({
                data: { studentId: al[n].id, subjectId: mate.id, gradoDeOrigen: 1, cicloDeOrigenId: anterior.id, notaDeOrigen: 7, cicloId: actual.id, claseId: clase.id },
            });
        }
    }, 180000);

    it('PEND-17: el plan de un momento', async () => {
        expect((await plan(1, [{ nombre: 'Prueba escrita', peso: 70 }, { nombre: 'Guía', peso: 20 }]).expect(400)).body.code).toBe('PLAN_INVALIDO');
        await plan(1, [{ nombre: 'Prueba escrita', peso: 70 }, { nombre: 'Guía', peso: 30 }], {}, otro).expect(403);
        await plan(1, [{ nombre: 'Prueba escrita', peso: 70, contenidos: 'Ecuaciones de primer grado' }, { nombre: 'Guía', peso: 30 }]).expect(200);
        await plan(2, [{ nombre: 'Prueba', peso: 100 }], {}, admin, UserRole.ADMIN).expect(200);
        const datos = (await laClase().expect(200)).body.data;
        expect(datos.plan.map((e: any) => [e.momento, e.nombre, e.peso])).toEqual([
            [1, 'Prueba escrita', 70],
            [1, 'Guía', 30],
            [2, 'Prueba', 100],
        ]);
        expect(datos.plan[0].contenidos).toBe('Ecuaciones de primer grado');
        expect((await plan(1, [{ nombre: 'Prueba', peso: 100, instrumento: { tipo: 'PUNTOS', criterios: [] } }]).expect(400)).body.code).toBe('INSTRUMENTO_INVALIDO');
    }, 60000);

    it('PEND-18: la nota de la opción sale del plan', async () => {
        const instrumento = { tipo: 'PUNTOS', criterios: [{ id: 'ser', texto: 'Ser', puntos: 2 }, { id: 'hacer', texto: 'Hacer', puntos: 8 }] };
        const hecho = (await plan(1, [{ nombre: 'Prueba escrita', peso: 70 }, { nombre: 'Guía', peso: 30, instrumento }]).expect(200)).body.data;
        const [prueba, guia] = hecho.plan;
        // Con una sola de las dos, todavía no hay nota de la opción.
        expect((await nota(pend.ana, prueba.id, 1, { nota: 12 }).expect(200)).body.data).toMatchObject({ nota: 12, estado: 'PENDIENTE' });
        expect(await opcionDe(pend.ana, 1, 1)).toBeNull();
        // La guía con su instrumento: 2 + 6 = 8 de 10 → 16 de 20. 12·0,7 + 16·0,3 = 13,2 → 13.
        expect((await nota(pend.ana, guia.id, 1, { marcas: { ser: 2, hacer: 6 } }).expect(200)).body.data).toMatchObject({ nota: 16, estado: 'APROBADA', notaFinal: 13 });
        expect(await opcionDe(pend.ana, 1, 1)).toMatchObject({ nota: 13, delPlan: true, asistio: true });
        expect((await nota(pend.beto, guia.id, 1, { marcas: { ser: 2 } }).expect(400)).body.code).toBe('INSTRUMENTO_INCOMPLETO');
        await nota(pend.beto, prueba.id, 1, { nota: 12 }, otro).expect(403);
        // A mano manda: el profesor pone la de Caro directa y el plan no la pisa.
        await api().put(`/api/materias-pendientes/${pend.caro.id}/momentos/1/opciones/1`).set(como(profe, UserRole.TEACHER)).send({ nota: 9, asistio: true, fecha: '2026-10-05' }).expect(200);
        await nota(pend.caro, prueba.id, 1, { nota: 15 }).expect(200);
        await nota(pend.caro, guia.id, 1, { marcas: { ser: 2, hacer: 8 } }).expect(200);
        expect(await opcionDe(pend.caro, 1, 1)).toMatchObject({ nota: 9, delPlan: false });
        // La 2ª opción del plan, solo para quien reprobó la 1ª.
        expect((await nota(pend.ana, prueba.id, 2, { nota: 18 }).expect(409)).body.code).toBe('SIN_SEGUNDA_OPCION');
        await nota(pend.caro, prueba.id, 2, { nota: 14 }).expect(200);
    }, 60000);

    it('PEND-19: quitar una evaluación con notas pide confirmarlo', async () => {
        const hecho = (await plan(1, [{ nombre: 'Prueba escrita', peso: 70 }, { nombre: 'Guía', peso: 30 }]).expect(200)).body.data;
        const [prueba, guia] = hecho.plan;
        await nota(pend.ana, prueba.id, 1, { nota: 12 }).expect(200);
        await nota(pend.ana, guia.id, 1, { nota: 16 }).expect(200);
        expect((await opcionDe(pend.ana, 1, 1)).nota).toBe(13);
        // La prueba pasa a pesar todo y la guía se va: tiene notas.
        const soloLaPrueba = [{ id: prueba.id, nombre: 'Prueba escrita', peso: 100 }];
        expect((await plan(1, soloLaPrueba).expect(409)).body.code).toBe('EVALUACION_CON_NOTAS');
        await plan(1, soloLaPrueba, { confirmar: true }).expect(200);
        // La nota de la opción se rehace con el plan nuevo: 12.
        expect((await opcionDe(pend.ana, 1, 1)).nota).toBe(12);
        const copia = await prisma.$queryRawUnsafe<any[]>(`SELECT 1 FROM registros_borrados WHERE tabla = 'evaluacionDelMomento'`);
        expect(copia).toHaveLength(1);
        // Quitar la nota (null) deja la opción sin salir del plan.
        await nota(pend.ana, prueba.id, 1, { nota: null }).expect(200);
        expect(await opcionDe(pend.ana, 1, 1)).toBeNull();
        expect((await (prisma as any).materiaPendiente.findUnique({ where: { id: pend.ana.id } })).estado).toBe('PENDIENTE');
    }, 60000);

    it('PEND-20: los encuentros y su asistencia', async () => {
        const url = `/api/materias-pendientes/clase/${clase.id}/encuentros`;
        await api().post(url).set(como(otro, UserRole.TEACHER)).send({ momento: 1, tipo: 'TUTORIA', fecha: '2026-09-28' }).expect(403);
        expect((await api().post(url).set(como(profe, UserRole.TEACHER)).send({ momento: 1, tipo: 'EVALUACION', fecha: '2026-10-05' }).expect(400)).body.code).toBe('ENCUENTRO_INVALIDO');
        await api().post(url).set(como(profe, UserRole.TEACHER)).send({ momento: 1, tipo: 'TUTORIA', fecha: '2026-09-28', hora: '08:00', aula: 'Aula 3', tema: 'Repaso' }).expect(201);
        const evaluacion = (await api().post(url).set(como(profe, UserRole.TEACHER)).send({ momento: 1, tipo: 'EVALUACION', opcion: 1, fecha: '2026-10-05', hora: '09:30' }).expect(201)).body.data;

        const asistencia = (lista: any[]) => api().put(`/api/materias-pendientes/encuentros/${evaluacion.id}/asistencia`).set(como(profe, UserRole.TEACHER)).send({ asistencias: lista });
        await asistencia([
            { materiaPendienteId: pend.ana.id, estado: 'PRESENTE' },
            { materiaPendienteId: pend.beto.id, estado: 'AUSENTE' },
            { materiaPendienteId: pend.caro.id, estado: 'JUSTIFICADO' },
        ]).expect(200);
        expect(await opcionDe(pend.ana, 1, 1)).toBeNull();
        expect(await opcionDe(pend.beto, 1, 1)).toMatchObject({ asistio: false, justificada: false, nota: null });
        expect(await opcionDe(pend.caro, 1, 1)).toMatchObject({ asistio: false, justificada: true });
        // Beto faltó sin justificar: la 1ª cuenta como reprobada; tiene la 2ª.
        await api().put(`/api/materias-pendientes/${pend.beto.id}/momentos/1/opciones/2`).set(como(profe, UserRole.TEACHER)).send({ nota: 11, asistio: true, fecha: '2026-10-12' }).expect(200);
        // Caro sí vino al final (se corrige): deja de estar «no presentada».
        await asistencia([{ materiaPendienteId: pend.caro.id, estado: 'PRESENTE' }]).expect(200);
        expect(await opcionDe(pend.caro, 1, 1)).toBeNull();

        const datos = (await laClase().expect(200)).body.data;
        expect(datos.encuentros.map((e: any) => [e.tipo, e.fecha, e.opcion])).toEqual([
            ['TUTORIA', '2026-09-28', null],
            ['EVALUACION', '2026-10-05', 1],
        ]);
        expect(datos.encuentros[1].asistencias).toEqual({ [pend.ana.id]: 'PRESENTE', [pend.beto.id]: 'AUSENTE', [pend.caro.id]: 'PRESENTE' });
        // Un alumno que no es de la clase, no.
        const fisica = await prisma.subject.create({ data: { id: gId(), name: 'Física', code: `FIS-${gId().slice(0, 5)}`, slug: `fis-${gId()}`, instituteId: 'institute' } as any });
        const ajena = await (prisma as any).materiaPendiente.create({
            data: { studentId: al.ana.id, subjectId: fisica.id, gradoDeOrigen: 1, cicloDeOrigenId: pend.ana.cicloDeOrigenId, cicloId: pend.ana.cicloId },
        });
        expect((await asistencia([{ materiaPendienteId: ajena.id, estado: 'PRESENTE' }]).expect(400)).body.code).toBe('ALUMNO_INVALIDO');
        // Mover la evaluación: otra fecha y otra aula; el profesor de otra clase, no.
        const mover = (u: any) => api().put(`/api/materias-pendientes/encuentros/${evaluacion.id}`).set(como(u, UserRole.TEACHER));
        await mover(otro).send({ momento: 1, tipo: 'EVALUACION', opcion: 1, fecha: '2026-10-06' }).expect(403);
        await mover(profe).send({ momento: 1, tipo: 'EVALUACION', opcion: 1, fecha: '2026-10-06', hora: '10:00', aula: 'Aula 5' }).expect(200);
        const movido = (await laClase().expect(200)).body.data.encuentros.find((e: any) => e.id === evaluacion.id);
        expect(movido).toMatchObject({ fecha: '2026-10-06', hora: '10:00', aula: 'Aula 5' });
        // La asistencia se queda con el encuentro.
        expect(movido.asistencias[pend.beto.id]).toBe('AUSENTE');
        // Quitar un encuentro va a la papelera, con su asistencia.
        await api().delete(`/api/materias-pendientes/encuentros/${evaluacion.id}`).set(como(profe, UserRole.TEACHER)).expect(200);
        expect(await prisma.$queryRawUnsafe<any[]>(`SELECT 1 FROM registros_borrados WHERE tabla = 'encuentroDePendiente'`)).toHaveLength(1);
    }, 60000);
});
