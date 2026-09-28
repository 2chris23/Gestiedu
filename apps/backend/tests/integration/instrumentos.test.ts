import { FastifyInstance } from 'fastify';
import request = require('supertest');
import { PrismaClient } from '@prisma/client';
import { UserRole } from '../../src/utils/prisma-enums';
import {
    createTestServer,
    createTestPrismaClient,
    cleanTestDatabase,
    createTestUser,
    createTestAcademicYear,
    createTestClassroom,
    createTestSubject,
    generateTestToken,
} from '../helpers';
import { RedisCache } from '../../src/config/redis';
import { notaDelInstrumento, plantillaDe, validarInstrumento, maximoDelInstrumento, InstrumentoInvalido } from '../../src/utils/instrumentos';

/**
 * LOS INSTRUMENTOS DE EVALUACIÓN (INSTR-*)
 *
 * Del plan de un profesor de Física de un liceo de Carabobo (2026-27): la
 * infografía con escala de estimación (AD 4, A 3, B 2, C 1), el cuaderno con
 * lista de cotejo (portada 2, plan firmado 5, firmas 5, ejercicios 5,
 * pulcritud 3), y su «Ser 1, Hacer 1, Convivir 1, Conocer 17».
 *
 *   INSTR-01  cada tipo suma bien (cotejo, escala con peso, rúbrica, puntos)
 *   INSTR-02  escala o puntos incompletos: sin nota; marca que no cabe: 400
 *   INSTR-03  se arma en el plan (admin o su profesor; otro profesor no)
 *   INSTR-04  calificar marcando: la nota va a `scores`, el desglose aparte
 *   INSTR-05  con instrumento no hay nota a mano (409), salvo «otra forma»
 *   INSTR-06  cambiar el plan no cambia lo ya calificado (la copia)
 *   INSTR-07  alumno de otra sección → 400; dos tandas a la vez no se pisan
 *   INSTR-08  copiar el plan lleva el instrumento; borrar la fila lo manda a la papelera
 *   INSTR-09  guardar con una versión vieja → 409
 *   MICLASE-07 el alumno ve SU desglose y no el de los demás
 */

const SLUG = 'test-institute';

describe('Instrumentos: la cuenta (INSTR-01/02)', () => {
    it('INSTR-01: cada tipo suma bien', () => {
        const cotejo = validarInstrumento(plantillaDe('COTEJO'));
        expect(maximoDelInstrumento(cotejo)).toBe(20);
        expect(notaDelInstrumento(cotejo, { c1: true, c2: true, c3: false, c4: true })).toBe(12);
        expect(notaDelInstrumento(cotejo, {})).toBe(0);

        const escala = validarInstrumento({ ...plantillaDe('ESCALA'), criterios: [...plantillaDe('ESCALA').criterios.slice(0, 4), { id: 'c5', texto: 'Proceso', peso: 2 }] });
        expect(maximoDelInstrumento(escala)).toBe(24);
        expect(notaDelInstrumento(escala, { c1: 'AD', c2: 'A', c3: 'B', c4: 'C', c5: 'A' })).toBe(4 + 3 + 2 + 1 + 6);

        const rubrica = validarInstrumento({ ...plantillaDe('RUBRICA'), descriptores: { c1: { AD: 'Ordenada y a tiempo', Z: 'no existe' } } });
        expect(rubrica.descriptores).toEqual({ c1: { AD: 'Ordenada y a tiempo' } });

        const puntos = validarInstrumento(plantillaDe('PUNTOS'));
        expect(maximoDelInstrumento(puntos)).toBe(20);
        expect(notaDelInstrumento(puntos, { ser: 1, hacer: 0.5, convivir: 1, conocer: 14 })).toBe(16.5);
    });

    it('INSTR-02: incompleto no da nota; lo que no cabe se rechaza', () => {
        const escala = validarInstrumento(plantillaDe('ESCALA'));
        expect(notaDelInstrumento(escala, { c1: 'AD' })).toBeNull();
        expect(() => notaDelInstrumento(escala, { c1: 'X', c2: 'A', c3: 'A', c4: 'A', c5: 'A' })).toThrow(InstrumentoInvalido);
        const puntos = validarInstrumento(plantillaDe('PUNTOS'));
        expect(notaDelInstrumento(puntos, { ser: 1 })).toBeNull();
        expect(() => notaDelInstrumento(puntos, { ser: 2, hacer: 1, convivir: 1, conocer: 1 })).toThrow(/de 0 a 1/);
        expect(() => notaDelInstrumento(puntos, { nada: 1 })).toThrow(/no existe/);
        expect(() => validarInstrumento({ tipo: 'COTEJO', criterios: [] })).toThrow(/al menos un criterio/);
        expect(() => validarInstrumento({ tipo: 'COTEJO', criterios: [{ id: 'a', texto: 'x', puntos: 0 }] })).toThrow(/puntos/);
        expect(() => validarInstrumento({ tipo: 'OTRO', criterios: [] })).toThrow(/desconocido/);
    });
});

describe('Instrumentos: en el plan y en la clase (INSTR-03…09, MICLASE-07)', () => {
    let server: FastifyInstance;
    let prisma: PrismaClient;
    let seccion: any, otraSeccion: any, materia: any, fila: any;
    let admin: any, profe: any, otroProfe: any, ana: any, beto: any, ajeno: any;
    const cab = (u: any, rol: UserRole) => ({ Authorization: `Bearer ${generateTestToken(u.id, rol, 'institute')}`, 'X-Institute-Slug': SLUG });
    const api = () => request(server.server);
    const ponerInstrumento = (definicion: any, version?: number) =>
        api().put(`/api/evaluation-plan/rows/${fila.id}/instrumento`).set(cab(profe, UserRole.TEACHER)).send({ definicion, version });
    const actividad = (extra: any = {}) =>
        prisma.classActivity.create({ data: { classroomId: seccion.id, subjectId: materia.id, title: 'Cuaderno', target: 'CURRENT', planRowId: fila.id, scores: {}, ...extra } });
    const marcar = (id: string, marcas: any, quien = profe) =>
        api().post(`/api/sessions/activities/${id}/instrumento`).set(cab(quien, UserRole.TEACHER)).send({ marcas });

    beforeAll(async () => {
        server = await createTestServer();
        prisma = await createTestPrismaClient();
    }, 120000);
    afterAll(async () => {
        await prisma.$disconnect();
        await server.close();
    });
    beforeEach(async () => {
        await prisma.classActivity.deleteMany();
        await prisma.instrumentoDeEvaluacion.deleteMany();
        await prisma.evaluationPlanRow.deleteMany();
        await cleanTestDatabase(prisma);
        await RedisCache.clearPattern('*').catch(() => undefined);
        admin = (await createTestUser(prisma, UserRole.ADMIN)).user; // crea el liceo
        const year = await createTestAcademicYear(prisma, 'institute');
        seccion = await createTestClassroom(prisma, year.id, 'institute');
        otraSeccion = await prisma.classroom.create({ data: { id: `c${Date.now()}b`, name: '1er Grado B', slug: `b-${Date.now()}`, grade: 1, section: 'B', capacity: 30, academicYearId: year.id, instituteId: 'institute' } });
        materia = await createTestSubject(prisma, 'institute');
        profe = (await createTestUser(prisma, UserRole.TEACHER)).user;
        otroProfe = (await createTestUser(prisma, UserRole.TEACHER)).user;
        ana = (await createTestUser(prisma, UserRole.STUDENT)).user;
        beto = (await createTestUser(prisma, UserRole.STUDENT)).user;
        ajeno = (await createTestUser(prisma, UserRole.STUDENT)).user;
        await prisma.classroomSubject.create({ data: { classroomId: seccion.id, subjectId: materia.id, teacherId: profe.id } });
        await prisma.classroomSubject.create({ data: { classroomId: otraSeccion.id, subjectId: materia.id, teacherId: profe.id } });
        for (const a of [ana, beto]) await prisma.studentClassroom.create({ data: { studentId: a.id, classroomId: seccion.id, academicYearId: year.id, isActive: true } });
        await prisma.studentClassroom.create({ data: { studentId: ajeno.id, classroomId: otraSeccion.id, academicYearId: year.id, isActive: true } });
        fila = await prisma.evaluationPlanRow.create({
            data: { classroomId: seccion.id, subjectId: materia.id, lapso: '1', rowType: 'EVALUATION', weekNumber: 3, orderIndex: 3, actividadEval: 'Revisión del cuaderno', instrumentos: 'Lista de cotejo', puntos: 5 },
        });
    });

    it('INSTR-03: se arma en el plan; otro profesor no', async () => {
        const r = await ponerInstrumento(plantillaDe('COTEJO')).expect(200);
        expect(r.body.data).toMatchObject({ tipo: 'COTEJO', version: 1, maximo: 20 });
        const leido = await api().get(`/api/evaluation-plan/rows/${fila.id}/instrumento`).set(cab(admin, UserRole.ADMIN)).expect(200);
        expect(leido.body.data.instrumento.definicion.criterios).toHaveLength(5);
        await api().put(`/api/evaluation-plan/rows/${fila.id}/instrumento`).set(cab(otroProfe, UserRole.TEACHER)).send({ definicion: plantillaDe('COTEJO') }).expect(403);
        await api().get(`/api/evaluation-plan/rows/${fila.id}/instrumento`).set(cab(ana, UserRole.STUDENT)).expect(403);
        const malo = await ponerInstrumento({ tipo: 'COTEJO', criterios: [] }).expect(400);
        expect(malo.body.code).toBe('INSTRUMENTO_INVALIDO');
    });

    it('INSTR-04: calificar marcando; la nota va a scores y el desglose aparte', async () => {
        await ponerInstrumento(plantillaDe('COTEJO')).expect(200);
        const a = await actividad();
        const r = await marcar(a.id, { [ana.id]: { c1: true, c2: true, c3: true, c4: true, c5: false }, [beto.id]: { c1: true } }).expect(200);
        expect(r.body.data.notas).toEqual({ [ana.id]: 17, [beto.id]: 2 });
        const g = await prisma.classActivity.findUnique({ where: { id: a.id } });
        expect(g!.scores).toEqual({ [ana.id]: 17, [beto.id]: 2 });
        expect(g!.maxScore).toBe(20);
        expect((g!.detalleDelInstrumento as any)[ana.id]).toEqual({ marcas: { c1: true, c2: true, c3: true, c4: true, c5: false }, total: 17 });
        expect((g!.instrumento as any).tipo).toBe('COTEJO');
        // Quitar la nota de uno deja la del otro.
        await marcar(a.id, { [beto.id]: null }).expect(200);
        const h = await prisma.classActivity.findUnique({ where: { id: a.id } });
        expect(h!.scores).toEqual({ [ana.id]: 17 });
        expect(Object.keys(h!.detalleDelInstrumento as any)).toEqual([ana.id]);
    });

    it('INSTR-05: con instrumento no hay nota a mano, salvo al evaluado de otra forma', async () => {
        await ponerInstrumento(plantillaDe('COTEJO')).expect(200);
        const a = await actividad({ evaluadoDeOtraForma: { [beto.id]: { metodo: 'Trabajo escrito' } } });
        const r = await api().post(`/api/sessions/activities/${a.id}/grades`).set(cab(profe, UserRole.TEACHER)).send({ scores: { [ana.id]: 15 } }).expect(409);
        expect(r.body.code).toBe('NOTA_POR_INSTRUMENTO');
        await api().put(`/api/sessions/activities/${a.id}`).set(cab(profe, UserRole.TEACHER)).send({ scores: { [ana.id]: 15 } }).expect(409);
        await api().post(`/api/sessions/activities/${a.id}/grades`).set(cab(profe, UserRole.TEACHER)).send({ scores: { [beto.id]: 15 } }).expect(200);
    });

    it('INSTR-06: cambiar el plan no cambia lo ya calificado; lo que aún no tiene notas sigue al plan', async () => {
        await ponerInstrumento(plantillaDe('COTEJO')).expect(200);
        const calificada = await actividad();
        const vacia = await actividad({ title: 'Otra' });
        await marcar(calificada.id, { [ana.id]: { c1: true } }).expect(200);
        const r = await ponerInstrumento(plantillaDe('PUNTOS'), 1).expect(200);
        expect(r.body.data.version).toBe(2);
        expect(((await prisma.classActivity.findUnique({ where: { id: calificada.id } }))!.instrumento as any).tipo).toBe('COTEJO');
        expect(((await prisma.classActivity.findUnique({ where: { id: vacia.id } }))!.instrumento as any).tipo).toBe('PUNTOS');
    });

    it('INSTR-07: alumno de otra sección → 400; dos tandas a la vez no se pisan', async () => {
        await ponerInstrumento(plantillaDe('COTEJO')).expect(200);
        const a = await actividad();
        const r = await marcar(a.id, { [ajeno.id]: { c1: true } }).expect(400);
        expect(r.body.code).toBe('ALUMNO_AJENO');
        await Promise.all([marcar(a.id, { [ana.id]: { c1: true } }), marcar(a.id, { [beto.id]: { c2: true } })]);
        expect((await prisma.classActivity.findUnique({ where: { id: a.id } }))!.scores).toEqual({ [ana.id]: 2, [beto.id]: 5 });
    });

    it('INSTR-08: copiar el plan lleva el instrumento; borrar la fila lo manda a la papelera', async () => {
        await ponerInstrumento(plantillaDe('ESCALA')).expect(200);
        await api()
            .post('/api/evaluation-plan/copy')
            .set(cab(profe, UserRole.TEACHER))
            .send({ sourceClassroomId: seccion.id, sourceSubjectId: materia.id, sourceLapso: '1', targetClassroomIds: [otraSeccion.id] })
            .expect(200);
        const copiada = await prisma.evaluationPlanRow.findFirst({ where: { classroomId: otraSeccion.id }, include: { instrumento: true } });
        expect(copiada!.instrumento?.tipo).toBe('ESCALA');

        await api().delete(`/api/evaluation-plan/rows/${fila.id}/instrumento`).set(cab(profe, UserRole.TEACHER)).expect(200);
        expect(await prisma.instrumentoDeEvaluacion.count({ where: { planRowId: fila.id } })).toBe(0);
        expect(await prisma.registroBorrado.count({ where: { tabla: 'instrumentoDeEvaluacion', registroId: { not: '' } } })).toBeGreaterThan(0);
    });

    it('INSTR-09: guardar con una versión vieja → 409', async () => {
        await ponerInstrumento(plantillaDe('COTEJO')).expect(200);
        await ponerInstrumento(plantillaDe('COTEJO'), 1).expect(200);
        const r = await ponerInstrumento(plantillaDe('PUNTOS'), 1).expect(409);
        expect(r.body.code).toBe('INSTRUMENTO_CAMBIADO');
    });

    it('INSTR-10: una actividad nueva de esa evaluación ya viene con su instrumento', async () => {
        await ponerInstrumento(plantillaDe('PUNTOS')).expect(200);
        const year = await prisma.classroom.findUnique({ where: { id: seccion.id }, select: { academicYearId: true } });
        await prisma.period.create({
            data: { id: `c${Date.now()}p`, name: 'Primer Lapso', startDate: new Date('2026-08-19'), endDate: new Date('2026-12-31'), isActive: true, academicYearId: year!.academicYearId },
        });
        await prisma.evaluationPlanMetadata.create({ data: { classroomId: seccion.id, subjectId: materia.id, lapso: '1', fechaDesde: new Date('2026-08-19') } });
        // 08/09/2026 es la semana 3 del plan (desde el miércoles 19/08).
        const r = await api()
            .post('/api/sessions/activities')
            .set(cab(profe, UserRole.TEACHER))
            .send({ classroomId: seccion.id, subjectId: materia.id, title: 'Taller', target: 'CURRENT', date: '2026-09-08' })
            .expect(201);
        expect(r.body.activity.planRowId).toBe(fila.id);
        expect(r.body.activity.instrumento.tipo).toBe('PUNTOS');
        expect(r.body.activity.maxScore).toBe(20);
    });

    it('MICLASE-07: el alumno ve SU desglose y no el de los demás', async () => {
        await ponerInstrumento(plantillaDe('COTEJO')).expect(200);
        const a = await actividad();
        await marcar(a.id, { [ana.id]: { c1: true, c2: true }, [beto.id]: { c5: true } }).expect(200);
        const r = await api().get(`/api/students/${ana.id}/materias/${materia.id}/clase`).set(cab(ana, UserRole.STUDENT)).expect(200);
        const suya = r.body.actividades.find((x: any) => x.id === a.id);
        expect(suya.nota).toBe(7);
        expect(suya.miDetalle).toEqual({ marcas: { c1: true, c2: true }, total: 7 });
        expect(suya.instrumento.tipo).toBe('COTEJO');
        expect(JSON.stringify(r.body)).not.toContain(beto.id);
    });

    it('PAPEL-01: el acta de socialización lleva el texto del liceo y la lista de la sección', async () => {
        await prisma.user.update({ where: { id: ana.id }, data: { lastName: 'Zamora' } });
        await prisma.user.update({ where: { id: beto.id }, data: { lastName: 'Arias' } });
        const r = await api()
            .get('/api/evaluation-plan/acta-de-socializacion')
            .query({ classroomId: seccion.id, subjectId: materia.id, lapso: '1' })
            .set(cab(profe, UserRole.TEACHER))
            .expect(200);
        const a = r.body.data;
        expect(a.titulo).toBe('Acta de socialización del plan de evaluación');
        expect(a.parrafos[0]).toContain('primer momento');
        expect(a.parrafos[0]).toContain(materia.name);
        expect(a.alumnos.map((x: any) => x.apellidos)).toEqual(['Arias', 'Zamora']);
        expect(a.alumnos.map((x: any) => x.n)).toEqual([1, 2]);
        await api()
            .get('/api/evaluation-plan/acta-de-socializacion')
            .query({ classroomId: seccion.id, subjectId: materia.id, lapso: '1' })
            .set(cab(otroProfe, UserRole.TEACHER))
            .expect(403);
    });

    it('PAPEL-02: los instrumentos del lapso, en blanco y con las marcas', async () => {
        await ponerInstrumento(plantillaDe('COTEJO')).expect(200);
        const act = await actividad();
        await marcar(act.id, { [ana.id]: { c1: true } }).expect(200);
        const q = { classroomId: seccion.id, subjectId: materia.id, lapso: '1' };
        const enBlanco = (await api().get('/api/evaluation-plan/instrumentos-del-lapso').query(q).set(cab(profe, UserRole.TEACHER)).expect(200)).body.data;
        expect(enBlanco.evaluaciones).toHaveLength(1);
        expect(enBlanco.evaluaciones[0]).toMatchObject({ actividad: 'Revisión del cuaderno', nombreDelInstrumento: 'Lista de cotejo', maximo: 20, calificadas: [] });
        expect(enBlanco.alumnos).toHaveLength(2);
        const conNotas = (await api().get('/api/evaluation-plan/instrumentos-del-lapso').query({ ...q, conNotas: '1' }).set(cab(profe, UserRole.TEACHER)).expect(200)).body.data;
        expect(conNotas.evaluaciones[0].calificadas[0].detalle[ana.id]).toEqual({ marcas: { c1: true }, total: 2 });
        await api().get('/api/evaluation-plan/instrumentos-del-lapso').query(q).set(cab(ana, UserRole.STUDENT)).expect(403);
    });
});
