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
 * LA MATERIA PENDIENTE COMO UNA CLASE (2026-10-12)
 *
 * Cada pendiente se trabaja en una CLASE: la materia de una sección del grado
 * de origen, en el año en que se cursa; la evalúa su profesor. Cada momento
 * tiene 1ª y 2ª opción (el «112» de los liceos: la segunda, una semana
 * después). Todo es del liceo: lo del MPPE es lo que sale de primeras.
 *
 *   PEND-09  la clase: la pendiente sin clase recibe la suya sola (la del
 *            profesor que la tenía, o la de la misma letra); la ven el admin y
 *            el profesor de esa clase; otro profesor y el alumno, no;
 *   PEND-10  1ª y 2ª opción (SIEMPRE): reprobar la 1ª deja el momento
 *            abierto; la 2ª decide; sin 1ª reprobada no hay 2ª; los momentos
 *            van en orden (no se pasa al 2 con el 1 abierto);
 *   PEND-11  SI_REPRUEBA_30: la 2ª opción solo si el 30 % o más del grupo
 *            reprobó la 1ª; NO: la 1ª decide el momento;
 *   PEND-12  faltar: sin justificar cuenta como presentada sin nota («IN»);
 *            justificada, no cuenta; con faltarPierdeElMomento = false, faltar
 *            no cuenta;
 *   PEND-13  PONDERADO: los pesos de cada momento (suman 100) deciden con
 *            todos los momentos; unos pesos que no suman 100 no se guardan;
 *   PEND-14  el cronograma: sin guardar, se propone el del MPPE (octubre,
 *            diciembre, enero y junio, la 2ª una semana después); lo guarda el
 *            admin; fechas al revés, 400;
 *   PEND-15  la sección: el admin y el guía ven las pendientes de SUS
 *            alumnos (de esa sección); otro profesor, no;
 *   PEND-16  el admin la pasa a otra clase de la misma materia y grado: la
 *            evalúa el profesor nuevo; a otra materia u otro grado, 400.
 */

const SLUG = 'test-institute';
const gId = () => `c${createId()}`;
const dia = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);

describe('La materia pendiente como una clase (PEND-09…16)', () => {
    let server: FastifyInstance;
    let prisma: PrismaClient;
    let admin: any;
    let profeA: any;
    let profeB: any;
    let guia: any;
    let otro: any;
    let anterior: any;
    let actual: any;
    let mate: any;
    let fisica: any;
    let claseA: any;
    let claseB: any;
    let claseFisica: any;
    let segundoA: any;
    const al: Record<string, any> = {};
    const pend: Record<string, any> = {};

    const como = (u: any, role: UserRole) => ({
        Authorization: `Bearer ${generateTestToken(u.id, role, 'institute')}`,
        'X-Institute-Slug': SLUG,
    });
    const api = () => request(server.server);
    const config = (pendientes: any) =>
        api().put('/api/institutes/current/academic-config').set(como(admin, UserRole.ADMIN)).send({ pendientes });
    const opcion = (p: any, m: number, o: number, body: any, u = profeA, role = UserRole.TEACHER) =>
        api()
            .put(`/api/materias-pendientes/${p.id}/momentos/${m}/opciones/${o}`)
            .set(como(u, role))
            .send({ fecha: '2026-10-05', asistio: true, ...body });
    const estado = async (p: any) => (prisma as any).materiaPendiente.findUnique({ where: { id: p.id } });
    const laClase = (clase: any, u = profeA, role = UserRole.TEACHER) => api().get(`/api/materias-pendientes/clase/${clase.id}`).set(como(u, role));

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
        profeA = (await createTestUser(prisma, UserRole.TEACHER)).user;
        profeB = (await createTestUser(prisma, UserRole.TEACHER)).user;
        guia = (await createTestUser(prisma, UserRole.TEACHER)).user;
        otro = (await createTestUser(prisma, UserRole.TEACHER)).user;
        anterior = await prisma.academicYear.create({
            data: { id: gId(), name: '2025-2026', startDate: dia('2025-09-15'), endDate: dia('2026-07-31'), status: 'COMPLETED', instituteId: 'institute' } as any,
        });
        actual = await prisma.academicYear.create({
            data: { id: gId(), name: '2026-2027', startDate: dia('2026-09-14'), endDate: dia('2027-07-31'), status: 'ACTIVE', isActive: true, instituteId: 'institute' } as any,
        });
        const seccion = (ano: any, grado: number, letra: string, guiaId: string | null = null) =>
            prisma.classroom.create({
                data: { id: gId(), name: `${grado}º ${letra}`, slug: `aula-${gId()}`, grade: grado, section: letra, capacity: 30, academicYearId: ano.id, instituteId: 'institute', teacherId: guiaId } as any,
            });
        mate = await prisma.subject.create({ data: { id: gId(), name: 'Matemática', code: `MAT-${gId().slice(0, 5)}`, slug: `mate-${gId()}`, instituteId: 'institute' } as any });
        fisica = await prisma.subject.create({ data: { id: gId(), name: 'Física', code: `FIS-${gId().slice(0, 5)}`, slug: `fis-${gId()}`, instituteId: 'institute' } as any });
        // Este año: 1º A y 1º B dan Matemática (la pendiente es de 1º); los alumnos están en 2º A.
        const primeroA = await seccion(actual, 1, 'A');
        const primeroB = await seccion(actual, 1, 'B');
        segundoA = await seccion(actual, 2, 'A', guia.id);
        const segundoB = await seccion(actual, 2, 'B');
        claseA = await prisma.classroomSubject.create({ data: { classroomId: primeroA.id, subjectId: mate.id, teacherId: profeA.id } });
        claseB = await prisma.classroomSubject.create({ data: { classroomId: primeroB.id, subjectId: mate.id, teacherId: profeB.id } });
        claseFisica = await prisma.classroomSubject.create({ data: { classroomId: primeroA.id, subjectId: fisica.id, teacherId: profeA.id } });
        // El año pasado, en 1º A (Ana, Beto, Caro y Dani) y 1º B (Eva).
        const antesA = await seccion(anterior, 1, 'A');
        const antesB = await seccion(anterior, 1, 'B');
        const alumno = async (nombre: string, antes: any, ahora: any) => {
            const u = (await createTestUser(prisma, UserRole.STUDENT, { firstName: nombre, lastName: 'Prueba' })).user;
            await prisma.studentClassroom.create({ data: { id: gId(), studentId: u.id, classroomId: antes.id, academicYearId: anterior.id, isActive: false } });
            await prisma.studentClassroom.create({ data: { id: gId(), studentId: u.id, classroomId: ahora.id, academicYearId: actual.id, isActive: true } });
            return u;
        };
        al.ana = await alumno('Ana', antesA, segundoA);
        al.beto = await alumno('Beto', antesA, segundoA);
        al.caro = await alumno('Caro', antesA, segundoA);
        al.dani = await alumno('Dani', antesA, segundoB);
        al.eva = await alumno('Eva', antesB, segundoB);
        const pendiente = (a: any) =>
            (prisma as any).materiaPendiente.create({
                data: { studentId: a.id, subjectId: mate.id, gradoDeOrigen: 1, cicloDeOrigenId: anterior.id, notaDeOrigen: 7, cicloId: actual.id },
            });
        for (const n of ['ana', 'beto', 'caro', 'dani', 'eva']) pend[n] = await pendiente(al[n]);
    }, 180000);

    it('PEND-09: cada pendiente recibe su clase; la ven el admin y el profesor de la clase', async () => {
        const deA = (await laClase(claseA).expect(200)).body.data;
        // Los de 1º A del año pasado, a la clase de 1º A; Eva (de 1º B), a la de 1º B.
        expect(deA.pendientes.map((p: any) => p.alumno.id).sort()).toEqual([al.ana.id, al.beto.id, al.caro.id, al.dani.id].sort());
        expect(deA).toMatchObject({ puedeEvaluar: true, reglas: { momentos: 4, segundaOpcion: 'SIEMPRE' }, minima: 10 });
        expect(deA.pendientes.find((p: any) => p.alumno.id === al.dani.id)).toMatchObject({ seccionActual: '2º B', profesor: { id: profeA.id } });
        const deB = (await laClase(claseB, profeB).expect(200)).body.data;
        expect(deB.pendientes.map((p: any) => p.alumno.id)).toEqual([al.eva.id]);
        expect((await laClase(claseA, admin, UserRole.ADMIN).expect(200)).body.data.otrasClases.map((c: any) => c.id)).toEqual([claseB.id]);
        await laClase(claseA, profeB).expect(403);
        await laClase(claseA, al.ana, UserRole.STUDENT).expect(403);
        // La evalúa el profesor de su clase; el de otra, no.
        await opcion(pend.ana, 1, 1, { nota: 14 }, profeB).expect(403);
        expect((await opcion(pend.ana, 1, 1, { nota: 14 }).expect(200)).body.data).toEqual({ estado: 'APROBADA', notaFinal: 14 });
    }, 60000);

    it('PEND-10: la 2ª opción, siempre: la 1ª reprobada deja el momento abierto', async () => {
        await laClase(claseA).expect(200);
        expect((await opcion(pend.ana, 1, 2, { nota: 12 }).expect(409)).body.code).toBe('SIN_SEGUNDA_OPCION');
        expect((await opcion(pend.ana, 1, 1, { nota: 8 }).expect(200)).body.data).toEqual({ estado: 'PENDIENTE', notaFinal: null });
        // Con el momento 1 abierto no se pasa al 2.
        expect((await opcion(pend.ana, 2, 1, { nota: 15 }).expect(400)).body.code).toBe('MOMENTO_INVALIDO');
        expect((await opcion(pend.ana, 1, 2, { nota: 12, fecha: '2026-10-12' }).expect(200)).body.data).toEqual({ estado: 'APROBADA', notaFinal: 12 });
        // La boleta y el alumno ven la nota del momento: la mejor de sus opciones.
        const suyas = (await api().get(`/api/materias-pendientes/alumno/${al.ana.id}`).set(como(al.ana, UserRole.STUDENT)).expect(200)).body.data;
        expect(suyas[0].momentos).toEqual([{ momento: 1, nota: 12, fecha: '2026-10-12', observaciones: null }]);
        expect(suyas[0].opciones.map((o: any) => [o.momento, o.opcion, o.nota])).toEqual([[1, 1, 8], [1, 2, 12]]);
        // Aprobada en la 1ª, no hay 2ª.
        await opcion(pend.beto, 1, 1, { nota: 15 }).expect(200);
        expect((await opcion(pend.beto, 1, 2, { nota: 18 }).expect(409)).body.code).toBe('SIN_SEGUNDA_OPCION');
        // Reprobada en las dos: el momento cuenta con la mejor y se sigue al 2.
        await opcion(pend.caro, 1, 1, { nota: 6 }).expect(200);
        await opcion(pend.caro, 1, 2, { nota: 8 }).expect(200);
        expect((await opcion(pend.caro, 2, 1, { nota: 7 }).expect(200)).body.data.estado).toBe('PENDIENTE');
        const momentos = await (prisma as any).evaluacionDePendiente.findMany({ where: { materiaPendienteId: pend.caro.id }, orderBy: { momento: 'asc' } });
        expect(momentos.map((m: any) => [m.momento, m.nota])).toEqual([[1, 8]]);
        // Solo se quita la última opción puesta.
        expect((await api().delete(`/api/materias-pendientes/${pend.caro.id}/momentos/1/opciones/2`).set(como(profeA, UserRole.TEACHER)).expect(409)).body.code).toBe('NO_ES_EL_ULTIMO');
        await api().delete(`/api/materias-pendientes/${pend.caro.id}/momentos/2/opciones/1`).set(como(profeA, UserRole.TEACHER)).expect(200);
    }, 60000);

    it('PEND-11: SI_REPRUEBA_30 y NO', async () => {
        await config({ momentos: 4, formaDeCalificar: 'MOMENTO_APROBADO', segundaOpcion: 'SI_REPRUEBA_30' }).expect(200);
        await laClase(claseA).expect(200);
        // 1 de 4 reprobó (25 %): no hay 2ª opción y el momento se cierra con su nota.
        for (const [n, nota] of [['ana', 15], ['beto', 14], ['caro', 13], ['dani', 8]] as const) await opcion(pend[n], 1, 1, { nota }).expect(200);
        expect((await opcion(pend.dani, 1, 2, { nota: 12 }).expect(409)).body.code).toBe('SIN_SEGUNDA_OPCION');
        expect((await laClase(claseA).expect(200)).body.data.segundaAbierta[0]).toBe(false);
        // Corrige a Caro: 2 de 4 (50 %): se abre para los que reprobaron.
        await opcion(pend.caro, 1, 1, { nota: 9 }).expect(200);
        expect((await laClase(claseA).expect(200)).body.data.segundaAbierta[0]).toBe(true);
        expect((await opcion(pend.dani, 1, 2, { nota: 12 }).expect(200)).body.data).toEqual({ estado: 'APROBADA', notaFinal: 12 });

        await config({ momentos: 4, formaDeCalificar: 'MOMENTO_APROBADO', segundaOpcion: 'NO' }).expect(200);
        await opcion(pend.eva, 1, 1, { nota: 5 }, profeB).expect(200);
        expect((await opcion(pend.eva, 1, 2, { nota: 12 }, profeB).expect(409)).body.code).toBe('SIN_SEGUNDA_OPCION');
        await opcion(pend.eva, 2, 1, { nota: 6 }, profeB).expect(200);
    }, 60000);

    it('PEND-12: faltar, justificado o no', async () => {
        await config({ momentos: 2, formaDeCalificar: 'MOMENTO_APROBADO', segundaOpcion: 'NO' }).expect(200);
        await laClase(claseA).expect(200);
        // Faltó sin justificar: el momento se pierde («IN», sin nota).
        await opcion(pend.ana, 1, 1, { asistio: false }).expect(200);
        let momentos = await (prisma as any).evaluacionDePendiente.findMany({ where: { materiaPendienteId: pend.ana.id } });
        expect(momentos.map((m: any) => [m.momento, m.nota])).toEqual([[1, null]]);
        await opcion(pend.ana, 2, 1, { asistio: false }).expect(200);
        expect(await estado(pend.ana)).toMatchObject({ estado: 'NO_APROBADA', notaFinal: null });
        // Justificada: no cuenta; el momento sigue abierto.
        await opcion(pend.beto, 1, 1, { asistio: false, justificada: true }).expect(200);
        expect((await opcion(pend.beto, 2, 1, { nota: 15 }).expect(400)).body.code).toBe('MOMENTO_INVALIDO');
        await opcion(pend.beto, 1, 1, { nota: 11 }).expect(200);
        expect((await estado(pend.beto)).estado).toBe('APROBADA');
        // El liceo dice que faltar no pierde el momento.
        await config({ momentos: 2, formaDeCalificar: 'MOMENTO_APROBADO', segundaOpcion: 'NO', faltarPierdeElMomento: false }).expect(200);
        await opcion(pend.caro, 1, 1, { asistio: false }).expect(200);
        expect((await opcion(pend.caro, 2, 1, { nota: 15 }).expect(400)).body.code).toBe('MOMENTO_INVALIDO');
    }, 60000);

    it('PEND-13: PONDERADO', async () => {
        expect((await config({ momentos: 4, formaDeCalificar: 'PONDERADO', pesos: [25, 25, 25, 20] }).expect(400)).body.code).toBe('REGLA_INVALIDA');
        await config({ momentos: 4, formaDeCalificar: 'PONDERADO', pesos: [10, 20, 30, 40], segundaOpcion: 'NO' }).expect(200);
        await laClase(claseA).expect(200);
        for (const [m, nota] of [[1, 20], [2, 15], [3, 10]] as const) {
            expect((await opcion(pend.ana, m, 1, { nota }).expect(200)).body.data).toEqual({ estado: 'PENDIENTE', notaFinal: null });
        }
        // 20·0,1 + 15·0,2 + 10·0,3 + 5·0,4 = 2 + 3 + 3 + 2 = 10.
        expect((await opcion(pend.ana, 4, 1, { nota: 5 }).expect(200)).body.data).toEqual({ estado: 'APROBADA', notaFinal: 10 });
    }, 60000);

    it('PEND-14: el cronograma', async () => {
        const url = `/api/materias-pendientes/cronograma?cicloId=${actual.id}`;
        const propuesto = (await api().get(url).set(como(profeA, UserRole.TEACHER)).expect(200)).body.data;
        expect(propuesto.propuesto).toBe(true);
        expect(propuesto.momentos.map((m: any) => [m.numero, m.desde1.slice(0, 7), m.desde2 > m.hasta1])).toEqual([
            [1, '2026-10', true],
            [2, '2026-12', true],
            [3, '2027-01', true],
            [4, '2027-06', true],
        ]);
        // El liceo corre el 1er momento dos semanas (y su 2ª opción con él).
        const nuevo = propuesto.momentos.map((m: any) =>
            m.numero === 1 ? { ...m, desde1: '2026-10-19', hasta1: '2026-10-23', desde2: '2026-10-26', hasta2: '2026-10-30' } : m
        );
        // La 2ª opción antes de que acabe la 1ª no cuadra.
        const pisada = nuevo.map((m: any) => (m.numero === 1 ? { ...m, desde2: '2026-10-21' } : m));
        expect((await api().put(url).set(como(admin, UserRole.ADMIN)).send({ momentos: pisada }).expect(400)).body.code).toBe('FECHAS_INVALIDAS');
        await api().put(url).set(como(profeA, UserRole.TEACHER)).send({ momentos: nuevo }).expect(403);
        await api().put(url).set(como(admin, UserRole.ADMIN)).send({ momentos: nuevo }).expect(200);
        const guardado = (await api().get(url).set(como(profeA, UserRole.TEACHER)).expect(200)).body.data;
        expect(guardado.propuesto).toBe(false);
        expect(guardado.momentos[0]).toMatchObject({ numero: 1, desde1: '2026-10-19', hasta1: '2026-10-23' });
        const alReves = nuevo.map((m: any) => (m.numero === 2 ? { ...m, desde1: m.hasta1, hasta1: m.desde1 } : m));
        expect((await api().put(url).set(como(admin, UserRole.ADMIN)).send({ momentos: alReves }).expect(400)).body.code).toBe('FECHAS_INVALIDAS');
    }, 60000);

    it('PEND-15: la sección ve las pendientes de sus alumnos', async () => {
        const url = `/api/materias-pendientes/seccion/${segundoA.id}`;
        const delGuia = (await api().get(url).set(como(guia, UserRole.TEACHER)).expect(200)).body.data;
        expect(delGuia.pendientes.map((p: any) => p.alumno.id).sort()).toEqual([al.ana.id, al.beto.id, al.caro.id].sort());
        expect(delGuia.pendientes[0]).toMatchObject({ materia: { nombre: 'Matemática' }, gradoDeOrigen: 1, profesor: { id: profeA.id } });
        await api().get(url).set(como(admin, UserRole.ADMIN)).expect(200);
        await api().get(url).set(como(otro, UserRole.TEACHER)).expect(403);
        await api().get(url).set(como(al.ana, UserRole.STUDENT)).expect(403);
    }, 60000);

    it('PEND-16: el admin la pasa a otra clase de la misma materia y grado', async () => {
        await laClase(claseA).expect(200);
        const url = `/api/materias-pendientes/${pend.ana.id}/clase`;
        await api().put(url).set(como(profeA, UserRole.TEACHER)).send({ claseId: claseB.id }).expect(403);
        expect((await api().put(url).set(como(admin, UserRole.ADMIN)).send({ claseId: claseFisica.id }).expect(400)).body.code).toBe('CLASE_INVALIDA');
        await api().put(url).set(como(admin, UserRole.ADMIN)).send({ claseId: claseB.id }).expect(200);
        await opcion(pend.ana, 1, 1, { nota: 12 }).expect(403);
        await opcion(pend.ana, 1, 1, { nota: 12 }, profeB).expect(200);
        expect((await laClase(claseB, profeB).expect(200)).body.data.pendientes.map((p: any) => p.alumno.id).sort()).toEqual([al.ana.id, al.eva.id].sort());
    }, 60000);
});
