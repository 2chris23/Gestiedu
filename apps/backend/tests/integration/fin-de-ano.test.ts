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
 * EL FIN DEL AÑO ESCOLAR, POR PASOS
 *
 *   CIERRE-01  ¿está todo cargado?: qué sección y materia tiene alumnos sin
 *              notas del último lapso (o sin apreciación final), y de quién;
 *   CIERRE-02  la revisión la pone el profesor de la materia, con las partes
 *              del liceo (30 % + 70 %); el guía mira; otro profesor, no;
 *   CIERRE-03  con tope de materias en revisión, quien reprobó más no va;
 *   CIERRE-04  el admin cambia la decisión de un alumno SOLO con motivo;
 *              volver a la sugerida la quita;
 *   CIERRE-05  las reglas del último año y de la pendiente son del liceo
 *              (REPITE por defecto, como el MPPE) y se validan;
 *   CIERRE-06  sin año siguiente no se cierra, y no se inventa uno;
 *   CIERRE-07  el año siguiente se crea con el calendario del MPPE y la
 *              estructura de este (secciones, materias y horas, profesores
 *              y horarios si se pide); dos veces no;
 *   CIERRE-08  al cerrar: el que reprueba 5to repite 5to, el que aprueba
 *              egresa, las pendientes nacen con su profesor, el expediente
 *              guarda la condición sugerida;
 *   CIERRE-09  corregir después de cerrar: expediente, matrícula y pendientes
 *              se rehacen, con motivo y quedando anotado;
 *   CIERRE-10  la pendiente sin aprobar cuenta en el cierre del año siguiente:
 *              REPITE (MPPE) o SIGUE_PENDIENTE, según el liceo.
 */

const SLUG = 'test-institute';
const gId = () => `c${createId()}`;
const dia = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);

describe('El fin del año escolar (CIERRE-01…10)', () => {
    let server: FastifyInstance;
    let prisma: PrismaClient;
    let admin: any;
    let guia: any;
    let profeMate: any;
    let profeCaste: any;
    let year: any;
    let lapsos: any[];
    let primeroA: any;
    let segundoA: any;
    let quintoA: any;
    let mate: any;
    let caste: any;
    let ingles: any;
    let orientacion: any;
    const al: Record<string, any> = {};

    const como = (u: any, role: UserRole) => ({
        Authorization: `Bearer ${generateTestToken(u.id, role, 'institute')}`,
        'X-Institute-Slug': SLUG,
    });
    const comoAdmin = () => como(admin, UserRole.ADMIN);
    const api = () => request(server.server);
    const config = (body: any) => api().put('/api/institutes/current/academic-config').set(comoAdmin()).send(body);
    const sugerencias = async (anio = year.id) =>
        (await api().post(`/api/academic-years/${anio}/close/prepare`).set(comoAdmin()).send({}).expect(200)).body.suggestions as any[];
    const de = (lista: any[], a: any) => lista.find((s) => s.studentId === a.id);

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
        guia = (await createTestUser(prisma, UserRole.TEACHER)).user;
        profeMate = (await createTestUser(prisma, UserRole.TEACHER)).user;
        profeCaste = (await createTestUser(prisma, UserRole.TEACHER)).user;
        year = await prisma.academicYear.create({
            data: { id: gId(), name: '2026-2027', startDate: dia('2026-09-14'), endDate: dia('2027-07-31'), isActive: true, status: 'ACTIVE', instituteId: 'institute' } as any,
        });
        lapsos = [];
        for (const [nombre, desde, hasta] of [
            ['Primer Lapso', '2026-09-14', '2026-12-11'],
            ['Segundo Lapso', '2027-01-11', '2027-03-19'],
            ['Tercer Lapso', '2027-03-29', '2027-07-31'],
        ]) {
            lapsos.push(await prisma.period.create({ data: { id: gId(), name: nombre, startDate: dia(desde), endDate: dia(hasta), academicYearId: year.id } }));
        }
        const seccion = (grado: number, nombre: string, capacidad: number, teacherId: string | null) =>
            prisma.classroom.create({
                data: { id: gId(), name: nombre, slug: `aula-${gId()}`, grade: grado, section: 'A', capacity: capacidad, academicYearId: year.id, instituteId: 'institute', teacherId } as any,
            });
        primeroA = await seccion(1, '1er Año A', 33, guia.id);
        segundoA = await seccion(2, '2do Año A', 31, null);
        quintoA = await seccion(5, '5to Año A', 28, null);
        const materia = (nombre: string, evaluacion = 'NUMERICA') =>
            prisma.subject.create({ data: { id: gId(), name: nombre, code: `${nombre.slice(0, 3).toUpperCase()}-${gId().slice(0, 5)}`, slug: `${nombre.toLowerCase()}-${gId()}`, instituteId: 'institute', evaluacion } as any });
        mate = await materia('Matemática');
        caste = await materia('Castellano');
        ingles = await materia('Inglés');
        orientacion = await materia('Orientación', 'CUALITATIVA');
        const asignar = (classroomId: string, subjectId: string, teacherId: string | null, weeklyBlocks = 4) =>
            prisma.classroomSubject.create({ data: { classroomId, subjectId, teacherId, weeklyBlocks, hoursPerWeek: weeklyBlocks * 0.75 } });
        const mate1 = await asignar(primeroA.id, mate.id, profeMate.id, 6);
        await asignar(primeroA.id, caste.id, profeCaste.id);
        await asignar(primeroA.id, ingles.id, null, 3);
        await asignar(primeroA.id, orientacion.id, guia.id, 2);
        await asignar(segundoA.id, mate.id, profeMate.id, 6);
        await asignar(quintoA.id, mate.id, profeMate.id, 5);
        // Un bloque del horario, para ver que se copia.
        await prisma.scheduleBlock.create({ data: { classroomId: primeroA.id, classroomSubjectId: mate1.id, dayOfWeek: 1, startTime: '07:00', endTime: '07:45', blockType: 'CLASS' } });

        const inscribir = async (nombre: string, classroomId: string) => {
            const u = (await createTestUser(prisma, UserRole.STUDENT, { firstName: nombre, lastName: 'Prueba' })).user;
            await prisma.studentClassroom.create({ data: { id: gId(), studentId: u.id, classroomId, academicYearId: year.id, isActive: true } });
            return u;
        };
        al.ana = await inscribir('Ana', primeroA.id);
        al.beto = await inscribir('Beto', primeroA.id);
        al.caro = await inscribir('Caro', primeroA.id);
        al.dani = await inscribir('Dani', quintoA.id);
        al.eva = await inscribir('Eva', quintoA.id);

        const nota = async (alumno: any, classroomId: string, subjectId: string, score: number, lapso = lapsos[2]) => {
            const act = await prisma.activity.create({
                data: {
                    id: gId(), title: 'Evaluación', description: 'x', type: 'TAREA' as any, scope: 'CLASSROOM' as any,
                    classroomId, subjectId, periodId: lapso.id, createdBy: admin.id, maxGrade: 20, weight: 1,
                    startDate: new Date(), endDate: new Date(), dueDate: new Date(),
                } as any,
            });
            await prisma.grade.create({ data: { id: gId(), score, studentId: alumno.id, activityId: act.id, periodId: lapso.id, subjectId, teacherId: admin.id } });
        };
        // 1er año: Ana reprueba Matemática; Beto aprueba todo (Inglés solo del
        // 1er lapso: le falta la del último); Caro reprueba tres.
        await nota(al.ana, primeroA.id, mate.id, 8);
        await nota(al.ana, primeroA.id, caste.id, 14);
        await nota(al.ana, primeroA.id, ingles.id, 13);
        await nota(al.beto, primeroA.id, mate.id, 16);
        await nota(al.beto, primeroA.id, caste.id, 15);
        await nota(al.beto, primeroA.id, ingles.id, 12, lapsos[0]);
        await nota(al.caro, primeroA.id, mate.id, 5);
        await nota(al.caro, primeroA.id, caste.id, 6);
        await nota(al.caro, primeroA.id, ingles.id, 7);
        // 5to año: Dani reprueba Matemática; Eva la aprueba.
        await nota(al.dani, quintoA.id, mate.id, 8);
        await nota(al.eva, quintoA.id, mate.id, 17);
    }, 180000);

    it('CIERRE-01: dice qué falta por cargar del último lapso, y de quién', async () => {
        const r = (await api().get(`/api/academic-years/${year.id}/cierre/faltantes`).set(comoAdmin()).expect(200)).body.data;
        expect(r.lapso.nombre).toBe('Tercer Lapso');
        const deIngles = r.faltantes.find((f: any) => f.materia.id === ingles.id);
        expect(deIngles).toMatchObject({ sinNota: 1, total: 3, profesor: null, alumnos: ['Prueba, Beto'] });
        const deOri = r.faltantes.find((f: any) => f.materia.id === orientacion.id);
        expect(deOri).toMatchObject({ sinNota: 3, materia: { cualitativa: true } });
        expect(r.faltantes.find((f: any) => f.materia.id === mate.id)).toBeUndefined();
        // Solo el admin.
        await api().get(`/api/academic-years/${year.id}/cierre/faltantes`).set(como(profeMate, UserRole.TEACHER)).expect(403);
    }, 60000);

    it('CIERRE-02: la revisión la pone el profesor de la materia, con las partes del liceo', async () => {
        await config({ revision: { componentes: [{ nombre: 'Actividades', peso: 30 }, { nombre: 'Prueba', peso: 70 }], maxMaterias: null } }).expect(200);
        const url = `/api/revision/${primeroA.id}/${mate.id}`;

        const lista = (await api().get(url).set(como(profeMate, UserRole.TEACHER)).expect(200)).body.data;
        expect(lista.componentes.map((c: any) => c.nombre)).toEqual(['Actividades', 'Prueba']);
        expect(lista.alumnos.map((a: any) => a.id).sort()).toEqual([al.ana.id, al.caro.id].sort());

        // Falta una parte: no.
        expect((await api().put(url).set(como(profeMate, UserRole.TEACHER)).send({ studentId: al.ana.id, componentes: [{ nombre: 'Prueba', nota: 12 }] }).expect(400)).body.code).toBe('NOTA_INVALIDA');
        // 30 % de 20 + 70 % de 10 = 13.
        await api().put(url).set(como(profeMate, UserRole.TEACHER)).send({
            studentId: al.ana.id,
            componentes: [{ nombre: 'Actividades', nota: 20 }, { nombre: 'Prueba', nota: 10 }],
            fecha: '2027-07-20',
        }).expect(200);
        const guardada = await (prisma as any).notaDeRevision.findFirst({ where: { studentId: al.ana.id } });
        expect(guardada.score).toBe(13);
        expect(guardada.componentes).toEqual([{ nombre: 'Actividades', peso: 30, nota: 20 }, { nombre: 'Prueba', peso: 70, nota: 10 }]);
        expect(guardada.registradaPor).toBe(profeMate.id);

        // El guía mira pero no la pone; el de Castellano, ni eso.
        await api().get(url).set(como(guia, UserRole.TEACHER)).expect(200);
        await api().put(url).set(como(guia, UserRole.TEACHER)).send({ studentId: al.caro.id, componentes: [{ nombre: 'Actividades', nota: 20 }, { nombre: 'Prueba', nota: 20 }] }).expect(403);
        await api().get(url).set(como(profeCaste, UserRole.TEACHER)).expect(403);
        // Un alumno de otra sección, tampoco.
        expect((await api().put(url).set(como(profeMate, UserRole.TEACHER)).send({ studentId: al.dani.id, score: 12 }).expect(403)).body.code).toBe('ALUMNO_AJENO');

        // Con la revisión aprobada, Ana pasa sin pendientes.
        const ana = de(await sugerencias(), al.ana);
        expect(ana).toMatchObject({ suggestedStatus: 'PROMOVIDO', pendingCount: 0 });

        // En la lista del admin (paso 3) sale con su revisión.
        const paso3 = (await api().get(`/api/academic-years/${year.id}/cierre/revision`).set(comoAdmin()).expect(200)).body.data;
        expect(paso3.filas.find((f: any) => f.alumno.id === al.ana.id)).toMatchObject({ definitiva: 8, revision: 13, profesor: expect.any(String) });
    }, 60000);

    it('CIERRE-03: con tope de materias en revisión, quien reprobó más no va', async () => {
        await config({ revision: { componentes: [{ nombre: 'Revisión', peso: 100 }], maxMaterias: 2 } }).expect(200);
        const r = await api().put(`/api/revision/${primeroA.id}/${mate.id}`).set(como(profeMate, UserRole.TEACHER)).send({ studentId: al.caro.id, score: 15 }).expect(409);
        expect(r.body.code).toBe('FUERA_DE_REVISION');
        await api().put(`/api/revision/${primeroA.id}/${mate.id}`).set(como(profeMate, UserRole.TEACHER)).send({ studentId: al.ana.id, score: 15 }).expect(200);
        const paso3 = (await api().get(`/api/academic-years/${year.id}/cierre/revision`).set(comoAdmin()).expect(200)).body.data;
        expect(paso3.filas.filter((f: any) => f.alumno.id === al.caro.id).every((f: any) => f.fueraDeRevision)).toBe(true);
    }, 60000);

    it('CIERRE-04: el admin cambia la decisión solo con motivo; volver a la sugerida la quita', async () => {
        const url = `/api/academic-years/${year.id}/cierre/decisiones/${al.caro.id}`;
        expect((await api().put(url).set(comoAdmin()).send({ condicion: 'PROMOVIDO_CON_PENDIENTES' }).expect(400)).body.code).toBe('FALTA_EL_MOTIVO');
        await api().put(url).set(comoAdmin()).send({ condicion: 'PROMOVIDO_CON_PENDIENTES', motivo: 'Tres semanas hospitalizada' }).expect(200);

        const filas = (await api().get(`/api/academic-years/${year.id}/cierre/decisiones`).set(comoAdmin()).expect(200)).body.data;
        const caro = filas.find((f: any) => f.alumno.id === al.caro.id);
        expect(caro).toMatchObject({
            sugerida: 'NO_PROMOVIDO',
            condicion: 'PROMOVIDO_CON_PENDIENTES',
            decision: { motivo: 'Tres semanas hospitalizada', decididaPor: admin.id },
        });
        expect(caro.motivoDeLaSugerencia).toMatch(/3 materias/);

        await api().put(url).set(comoAdmin()).send({ condicion: 'NO_PROMOVIDO' }).expect(200);
        expect(await (prisma as any).decisionDeFinDeAno.count()).toBe(0);
        // Un profesor no decide.
        await api().put(url).set(como(guia, UserRole.TEACHER)).send({ condicion: 'PROMOVIDO', motivo: 'porque sí' }).expect(403);
    }, 60000);

    it('CIERRE-05: las reglas del último año y de la pendiente son del liceo', async () => {
        // Por defecto, como el MPPE: el de 5to que reprueba repite.
        let dani = de(await sugerencias(), al.dani);
        expect(dani).toMatchObject({ suggestedStatus: 'NO_PROMOVIDO', defaultTargetGrade: 5 });
        expect(de(await sugerencias(), al.eva).defaultTargetGrade).toBeNull();

        await config({ ultimoAnoConPendientes: 'SOLO_PENDIENTES' }).expect(200);
        dani = de(await sugerencias(), al.dani);
        expect(dani).toMatchObject({ suggestedStatus: 'PROMOVIDO_CON_PENDIENTES', defaultTargetGrade: null });

        expect((await config({ ultimoAnoConPendientes: 'DA_IGUAL' }).expect(400)).body.code).toBe('REGLA_INVALIDA');
        expect((await config({ pendienteNoAprobada: 'NUNCA' }).expect(400)).body.code).toBe('REGLA_INVALIDA');
        expect((await config({ revision: { componentes: [{ nombre: 'A', peso: 60 }, { nombre: 'B', peso: 30 }], maxMaterias: null } }).expect(400)).body.code).toBe('REVISION_INVALIDA');
        expect((await config({ pendientes: { momentos: 0, formaDeCalificar: 'PROMEDIO' } }).expect(400)).body.code).toBe('REGLA_INVALIDA');
        const leida = (await api().get('/api/institutes/current/academic-config').set(comoAdmin()).expect(200)).body.data;
        expect(leida).toMatchObject({ ultimoAnoConPendientes: 'SOLO_PENDIENTES', pendienteNoAprobada: 'REPITE', pendientes: { momentos: 4 }, notaMinimaAprobatoria: 10 });
    }, 60000);

    it('CIERRE-06: sin año siguiente no se cierra, y no se inventa uno', async () => {
        const r = await api().post(`/api/academic-years/${year.id}/close`).set(comoAdmin()).send({ decisions: [] }).expect(409);
        expect(r.body.code).toBe('SIN_ANO_SIGUIENTE');
        expect(await prisma.academicYear.count()).toBe(1);
        expect(await prisma.academicRecord.count()).toBe(0);
        const estado = (await api().get(`/api/academic-years/${year.id}/cierre`).set(comoAdmin()).expect(200)).body.data;
        expect(estado).toMatchObject({ cerrado: false, anoSiguiente: null, resultado: { alumnos: 5, noPromovidos: 2 } });
    }, 60000);

    it('CIERRE-07: el año siguiente, con el calendario del MPPE y la estructura de este', async () => {
        const hecho = (await api().post(`/api/academic-years/${year.id}/cierre/ano-siguiente`).set(comoAdmin()).send({ copiar: { profesores: true, horarios: true } }).expect(201)).body.data;
        expect(hecho).toMatchObject({ nombre: '2027-2028', inicio: '2027-09-20', fin: '2028-07-31', lapsos: 3, secciones: 3, materias: 6, bloques: 1 });

        const nuevo = await prisma.academicYear.findUnique({ where: { id: hecho.id }, include: { periods: { orderBy: { startDate: 'asc' } } } });
        expect(nuevo!.status).toBe('UPCOMING');
        expect(nuevo!.periods.map((p) => p.name)).toEqual(['Primer Lapso', 'Segundo Lapso', 'Tercer Lapso']);
        expect(nuevo!.periods[0].nombreAntesDelPlan).toBe('Diagnóstico');

        const copia = await prisma.classroom.findFirst({
            where: { academicYearId: hecho.id, grade: 1 },
            include: { subjects: { include: { scheduleBlocks: true } } },
        });
        expect(copia).toMatchObject({ name: '1er Año A', capacity: 33, teacherId: guia.id, slug: '1er-ano-a-2027-2028' });
        const deMate = copia!.subjects.find((m) => m.subjectId === mate.id)!;
        expect(deMate).toMatchObject({ weeklyBlocks: 6, teacherId: profeMate.id });
        expect(deMate.scheduleBlocks).toHaveLength(1);

        expect((await api().post(`/api/academic-years/${year.id}/cierre/ano-siguiente`).set(comoAdmin()).send({}).expect(409)).body.code).toBe('YA_EXISTE_EL_SIGUIENTE');
    }, 60000);

    it('CIERRE-08: al cerrar, repite quien reprueba 5to, egresa quien aprueba, nacen las pendientes', async () => {
        await api().post(`/api/academic-years/${year.id}/cierre/ano-siguiente`).set(comoAdmin()).send({ copiar: { profesores: true } }).expect(201);
        const r = (await api().post(`/api/academic-years/${year.id}/close`).set(comoAdmin()).send({ decisions: [] }).expect(200)).body;
        expect(r.closed).toBe(true);
        expect(r.pendientesCreadas).toBe(1);

        const siguiente = await prisma.academicYear.findFirst({ where: { name: '2027-2028' } });
        const matricula = async (a: any) =>
            prisma.studentClassroom.findUnique({ where: { studentId_academicYearId: { studentId: a.id, academicYearId: siguiente!.id } }, include: { classroom: true } });
        const expediente = (a: any) => prisma.academicRecord.findUnique({ where: { studentId_academicYearId: { studentId: a.id, academicYearId: year.id } } });

        // Dani reprobó 5to: repite 5to (antes egresaba igual).
        expect((await matricula(al.dani))!.classroom.grade).toBe(5);
        expect(await expediente(al.dani)).toMatchObject({ finalResult: 'NO_PROMOVIDO', egreso: null });
        // Eva egresa: sin matrícula.
        expect(await matricula(al.eva)).toBeNull();
        expect(await expediente(al.eva)).toMatchObject({ finalResult: 'PROMOVIDO', egreso: 'EGRESADO' });
        // Ana pasa a 2do con Matemática pendiente, que evalúa el profesor de 1er año.
        expect((await matricula(al.ana))!.classroom.grade).toBe(2);
        const pendiente = await (prisma as any).materiaPendiente.findFirst({ where: { studentId: al.ana.id } });
        expect(pendiente).toMatchObject({ subjectId: mate.id, gradoDeOrigen: 1, notaDeOrigen: 8, cicloId: siguiente!.id, profesorId: profeMate.id, estado: 'PENDIENTE' });
        // Caro repite 1ero; en su expediente, la sugerida.
        expect((await matricula(al.caro))!.classroom.grade).toBe(1);
        expect(await expediente(al.caro)).toMatchObject({ finalResult: 'NO_PROMOVIDO', condicionSugerida: 'NO_PROMOVIDO', motivo: null });
        // No se creó ninguna sección con valores inventados: son las copiadas.
        expect(await prisma.classroom.count({ where: { academicYearId: siguiente!.id } })).toBe(3);
    }, 60000);

    it('CIERRE-09: corregir después de cerrar, con motivo', async () => {
        await api().post(`/api/academic-years/${year.id}/cierre/ano-siguiente`).set(comoAdmin()).send({}).expect(201);
        await api().post(`/api/academic-years/${year.id}/close`).set(comoAdmin()).send({ decisions: [] }).expect(200);
        const siguiente = await prisma.academicYear.findFirst({ where: { name: '2027-2028' } });
        const url = `/api/academic-years/${year.id}/cierre/correccion/${al.caro.id}`;

        expect((await api().put(url).set(comoAdmin()).send({ condicion: 'PROMOVIDO_CON_PENDIENTES', motivo: '' }).expect(400)).body.code).toBe('FALTA_EL_MOTIVO');
        await api().put(url).set(comoAdmin()).send({ condicion: 'PROMOVIDO_CON_PENDIENTES', motivo: 'Se cargó mal la nota de Inglés' }).expect(200);

        const matricula = await prisma.studentClassroom.findUnique({ where: { studentId_academicYearId: { studentId: al.caro.id, academicYearId: siguiente!.id } }, include: { classroom: true } });
        expect(matricula!.classroom.grade).toBe(2);
        expect(await (prisma as any).materiaPendiente.count({ where: { studentId: al.caro.id } })).toBe(3);
        const expediente = await prisma.academicRecord.findUnique({ where: { studentId_academicYearId: { studentId: al.caro.id, academicYearId: year.id } } });
        expect(expediente).toMatchObject({ finalResult: 'PROMOVIDO_CON_PENDIENTES', motivo: 'Se cargó mal la nota de Inglés', decididaPor: admin.id });
        expect(expediente!.corregidoEl).toBeTruthy();
        expect(await prisma.auditLog.count({ where: { entityType: 'ACADEMIC_RECORD', entityId: expediente!.id } })).toBe(1);

        // Y de vuelta: las pendientes se van (con copia) y vuelve a 1ero.
        await api().put(url).set(comoAdmin()).send({ condicion: 'NO_PROMOVIDO', motivo: 'Era correcto al principio' }).expect(200);
        expect(await (prisma as any).materiaPendiente.count({ where: { studentId: al.caro.id } })).toBe(0);
        const otraVez = await prisma.studentClassroom.findUnique({ where: { studentId_academicYearId: { studentId: al.caro.id, academicYearId: siguiente!.id } }, include: { classroom: true } });
        expect(otraVez!.classroom.grade).toBe(1);
        // Con el año abierto no hay «corregir»: se decide en el paso 4.
        expect((await api().put(`/api/academic-years/${siguiente!.id}/cierre/correccion/${al.caro.id}`).set(comoAdmin()).send({ condicion: 'PROMOVIDO', motivo: 'no toca' }).expect(409)).body.code).toBe('CICLO_ABIERTO');
    }, 60000);

    it('CIERRE-10: la pendiente sin aprobar cuenta en el cierre del año siguiente', async () => {
        await api().post(`/api/academic-years/${year.id}/cierre/ano-siguiente`).set(comoAdmin()).send({}).expect(201);
        await api().post(`/api/academic-years/${year.id}/close`).set(comoAdmin()).send({ decisions: [] }).expect(200);
        const siguiente = await prisma.academicYear.findFirst({ where: { name: '2027-2028' } });
        await prisma.academicYear.update({ where: { id: siguiente!.id }, data: { status: 'ACTIVE' } });

        // Ana no aprobó su Matemática de 1ero: como el MPPE, no se promueve.
        let ana = de(await sugerencias(siguiente!.id), al.ana);
        expect(ana.pendientesArrastradas).toHaveLength(1);
        expect(ana).toMatchObject({ suggestedStatus: 'NO_PROMOVIDO' });
        expect(ana.motivoDeLaSugerencia).toMatch(/pendiente/);

        // El liceo la deja seguir pendiente: cuenta en el tope y pasa con pendientes.
        await config({ pendienteNoAprobada: 'SIGUE_PENDIENTE' }).expect(200);
        ana = de(await sugerencias(siguiente!.id), al.ana);
        expect(ana).toMatchObject({ suggestedStatus: 'PROMOVIDO_CON_PENDIENTES', pendingCount: 1 });

        // Aprobada, ya no cuenta.
        await (prisma as any).materiaPendiente.updateMany({ where: { studentId: al.ana.id }, data: { estado: 'APROBADA', notaFinal: 12 } });
        ana = de(await sugerencias(siguiente!.id), al.ana);
        expect(ana).toMatchObject({ suggestedStatus: 'PROMOVIDO', pendingCount: 0 });
    }, 60000);
});
