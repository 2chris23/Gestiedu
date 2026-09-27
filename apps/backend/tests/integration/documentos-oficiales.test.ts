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
 * LOS DOCUMENTOS OFICIALES DEL LICEO
 *
 *   DOC-01  la constancia sale del texto del liceo, relleno con los datos;
 *   DOC-02  el liceo edita la plantilla; un marcador que no existe se
 *           rechaza; «volver a la de siempre»;
 *   DOC-03  la de prosecución: solo con un año aprobado y cerrado;
 *   DOC-04  la de retiro (con la fecha) y la de inscripción (la del año
 *           siguiente, si ya está inscrito);
 *   DOC-05  quién saca cuál: la familia, estudio e inscripción; el resto, el
 *           admin;
 *   DOC-06  el Resumen Final en sus tres tipos (final, revisión, pendiente),
 *           con los datos del alumno, abreviaturas y docentes;
 *   DOC-07  la certificación: lo del liceo de los expedientes (F, R, MP y
 *           apreciación) y lo de otro plantel de lo cargado; solo el admin;
 *   DOC-08  cargar un año de otro plantel: se revisa, se reemplaza y se quita
 *           con copia.
 */

const SLUG = 'test-institute';
const gId = () => `c${createId()}`;
const dia = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);

describe('Los documentos oficiales (DOC-01…08)', () => {
    let server: FastifyInstance;
    let prisma: PrismaClient;
    let admin: any;
    let profe: any;
    let mama: any;
    let ana: any;
    let beto: any;
    let caro: any;
    let dani: any;
    let anterior: any;
    let actual: any;
    let siguiente: any;
    let segundoA: any;
    let mate: any;
    let caste: any;
    let fisica: any;
    let orientacion: any;

    const como = (u: any, role: UserRole) => ({
        Authorization: `Bearer ${generateTestToken(u.id, role, 'institute')}`,
        'X-Institute-Slug': SLUG,
    });
    const api = () => request(server.server);
    const constancia = (alumno: any, tipo: string, u = admin, role = UserRole.ADMIN) =>
        api().get(`/api/students/${alumno.id}/constancia?tipo=${tipo}`).set(como(u, role));

    beforeAll(async () => {
        server = await createTestServer();
        prisma = await createTestPrismaClient();
    }, 120000);

    afterAll(async () => {
        await platformPrisma.institute.update({ where: { id: 'institute' }, data: { academicConfig: {}, city: null } as any }).catch(() => undefined);
        await prisma.$disconnect();
        await server.close();
    });

    beforeEach(async () => {
        await cleanTestDatabase(prisma);
        await RedisCache.clearPattern('*').catch(() => undefined);
        await platformPrisma.institute.update({
            where: { id: 'institute' },
            data: {
                city: 'Valencia',
                academicConfig: {
                    notaMinimaAprobatoria: 10,
                    documentos: { firmanteNombre: 'Carmen Páez', firmanteCedula: 'V-9876543', firmanteCargo: 'Directora', nombreOficial: 'U.E.N. Liceo de Prueba', codigoDea: 'OD00541105' },
                },
            } as any,
        });

        admin = (await createTestUser(prisma, UserRole.ADMIN)).user;
        profe = (await createTestUser(prisma, UserRole.TEACHER)).user;
        mama = (await createTestUser(prisma, UserRole.TUTOR)).user;
        anterior = await prisma.academicYear.create({ data: { id: gId(), name: '2025-2026', startDate: dia('2025-09-15'), endDate: dia('2026-07-31'), status: 'COMPLETED', instituteId: 'institute' } as any });
        actual = await prisma.academicYear.create({ data: { id: gId(), name: '2026-2027', startDate: dia('2026-09-14'), endDate: dia('2027-07-31'), status: 'ACTIVE', isActive: true, instituteId: 'institute' } as any });
        siguiente = await prisma.academicYear.create({ data: { id: gId(), name: '2027-2028', startDate: dia('2027-09-20'), endDate: dia('2028-07-31'), status: 'UPCOMING', instituteId: 'institute' } as any });
        const lapso = await prisma.period.create({ data: { id: gId(), name: 'Primer Lapso', startDate: dia('2026-09-14'), endDate: dia('2026-12-11'), academicYearId: actual.id } });
        const seccion = (anio: any, grado: number, nombre: string) =>
            prisma.classroom.create({ data: { id: gId(), name: nombre, slug: `aula-${gId()}`, grade: grado, section: 'A', academicYearId: anio.id, instituteId: 'institute' } as any });
        const primeroA = await seccion(anterior, 1, '1er Año A');
        segundoA = await seccion(actual, 2, '2do Año A');
        const terceroA = await seccion(siguiente, 3, '3er Año A');
        const materia = (nombre: string, code: string, evaluacion = 'NUMERICA') =>
            prisma.subject.create({ data: { id: gId(), name: nombre, code: `${code}-${gId().slice(0, 4)}`, slug: `${nombre.toLowerCase()}-${gId()}`, instituteId: 'institute', evaluacion } as any });
        mate = await materia('Matemática', 'MAT');
        caste = await materia('Castellano', 'CAS');
        fisica = await materia('Física', 'FIS');
        orientacion = await materia('Orientación', 'OYC', 'CUALITATIVA');
        await prisma.classroomSubject.create({ data: { classroomId: segundoA.id, subjectId: fisica.id, teacherId: profe.id } });

        const alumno = async (nombre: string, extra: any = {}) =>
            (await createTestUser(prisma, UserRole.STUDENT, { firstName: nombre, lastName: 'Rivas', ...extra })).user;
        ana = await alumno('Ana');
        await prisma.user.update({
            where: { id: ana.id },
            data: { lugarDeNacimiento: 'Puerto Cabello', entidadDeNacimiento: 'Carabobo', birthDate: dia('2012-04-03'), gender: 'FEMENINO' } as any,
        });
        beto = await alumno('Beto');
        caro = await alumno('Caro');
        dani = await alumno('Dani');
        await prisma.studentTutor.create({ data: { studentId: ana.id, tutorId: mama.id, relationship: 'Madre' } });

        const inscribir = (u: any, classroomId: string, anio: any, isActive = true) =>
            prisma.studentClassroom.create({ data: { id: gId(), studentId: u.id, classroomId, academicYearId: anio.id, isActive } });
        await inscribir(ana, primeroA.id, anterior);
        await inscribir(ana, segundoA.id, actual);
        await inscribir(ana, terceroA.id, siguiente);
        await inscribir(caro, segundoA.id, actual);
        await inscribir(beto, segundoA.id, actual, false);
        await prisma.user.update({ where: { id: beto.id }, data: { isActive: false, archivedAt: dia('2027-03-15') } as any });

        // El año anterior de Ana, cerrado: Matemática reprobada (pendiente), Castellano en revisión.
        await prisma.academicRecord.create({
            data: {
                studentId: ana.id,
                academicYearId: anterior.id,
                sectionSnapshot: 'A',
                finalAverage: 12,
                status: 'COMPLETED',
                finalResult: 'PROMOVIDO_CON_PENDIENTES',
                subjectGrades: [
                    { subjectId: mate.id, subjectName: 'Matemática', average: 8 },
                    { subjectId: caste.id, subjectName: 'Castellano', average: 13, revision: 13, definitivaDeLapsos: 9 },
                    { subjectId: orientacion.id, subjectName: 'Orientación', cualitativa: true, apreciacion: 'Consolidado' },
                ],
            } as any,
        });
        const pendiente = await (prisma as any).materiaPendiente.create({
            data: { studentId: ana.id, subjectId: mate.id, gradoDeOrigen: 1, cicloDeOrigenId: anterior.id, notaDeOrigen: 8, cicloId: actual.id, profesorId: profe.id, estado: 'APROBADA', notaFinal: 12 },
        });
        await (prisma as any).evaluacionDePendiente.create({ data: { materiaPendienteId: pendiente.id, momento: 1, nota: 12, fecha: dia('2027-01-20') } });

        // Este año: Física. Ana la reprueba (8) y la aprueba en revisión (12); Caro, 15.
        const nota = async (u: any, score: number) => {
            const act = await prisma.activity.create({
                data: {
                    id: gId(), title: 'Evaluación', description: 'x', type: 'TAREA' as any, scope: 'CLASSROOM' as any,
                    classroomId: segundoA.id, subjectId: fisica.id, periodId: lapso.id, createdBy: profe.id, maxGrade: 20, weight: 1,
                    startDate: new Date(), endDate: new Date(), dueDate: new Date(),
                } as any,
            });
            await prisma.grade.create({ data: { id: gId(), score, studentId: u.id, activityId: act.id, periodId: lapso.id, subjectId: fisica.id, teacherId: profe.id } });
        };
        await nota(ana, 8);
        await nota(caro, 15);
        await (prisma as any).notaDeRevision.create({ data: { studentId: ana.id, subjectId: fisica.id, academicYearId: actual.id, score: 12, fecha: dia('2027-07-20'), registradaPor: profe.id } });
    }, 180000);

    it('DOC-01: la constancia sale del texto del liceo, relleno', async () => {
        const c = (await constancia(ana, 'ESTUDIO').expect(200)).body.data;
        expect(c.titulo).toBe('Constancia de estudio');
        expect(c.parrafos).toHaveLength(2);
        expect(c.parrafos[0]).toBe(
            `Quien suscribe, Carmen Páez, titular de la cédula de identidad V-9876543, en su carácter de Directora de U.E.N. Liceo de Prueba, hace constar por medio de la presente que el (la) estudiante Ana Rivas, titular de la cédula de identidad ${ana.id}, cursa estudios de Educación Media General en esta institución, en el 2do año, sección «A», turno de la mañana, durante el año escolar 2026-2027.`
        );
        expect(c.parrafos[1]).toMatch(/^Constancia que se expide a petición de la parte interesada en Valencia, a los \d+ días del mes de \w+ de \d{4}\.$/);
    }, 60000);

    it('DOC-02: el liceo edita la plantilla; un marcador que no existe se rechaza', async () => {
        const url = '/api/institutes/current/plantillas/ESTUDIO';
        const texto = 'El plantel {liceo} certifica que {alumno} ({cedula}) cursa el {grado}.\n\nSe expide {lugarYFecha}.';
        await api().put(url).set(comoAdmin()).send({ titulo: 'Constancia de estudios', texto }).expect(200);
        const c = (await constancia(ana, 'ESTUDIO').expect(200)).body.data;
        expect(c.titulo).toBe('Constancia de estudios');
        expect(c.parrafos[0]).toBe(`El plantel U.E.N. Liceo de Prueba certifica que Ana Rivas (${ana.id}) cursa el 2do año.`);

        expect((await api().put(url).set(comoAdmin()).send({ titulo: 'Mala', texto: 'Hace constar que {alumnno} estudia aquí hace tiempo.' }).expect(400)).body.code).toBe('MARCADOR_DESCONOCIDO');
        expect((await api().put(url).set(comoAdmin()).send({ titulo: 'Mala', texto: 'Hace constar que pasa al {gradoSiguiente} sin más.' }).expect(400)).body.code).toBe('MARCADOR_DESCONOCIDO');
        await api().put(url).set(como(profe, UserRole.TEACHER)).send({ titulo: 'x', texto }).expect(403);

        const todas = (await api().get('/api/institutes/current/plantillas').set(comoAdmin()).expect(200)).body.data;
        // Las seis constancias, y los demás documentos del liceo que van llegando (planilla, citación…).
        expect(todas.map((p: any) => p.tipo)).toEqual(expect.arrayContaining(['ESTUDIO', 'BUENA_CONDUCTA', 'PROSECUCION', 'RETIRO', 'INSCRIPCION', 'LABOR_SOCIAL', 'PLANILLA_INSCRIPCION']));
        expect(todas[0]).toMatchObject({ propia: true, titulo: 'Constancia de estudios' });
        expect(todas[2].marcadores).toHaveProperty('gradoSiguiente');

        await api().delete(url).set(comoAdmin()).expect(200);
        expect((await constancia(ana, 'ESTUDIO').expect(200)).body.data.titulo).toBe('Constancia de estudio');
    }, 60000);

    it('DOC-03: la de prosecución, con un año aprobado y cerrado', async () => {
        const c = (await constancia(ana, 'PROSECUCION').expect(200)).body.data;
        expect(c.parrafos[0]).toMatch(/cursó y aprobó el 1er año de Educación Media General en esta institución durante el año escolar 2025-2026, por lo que puede proseguir estudios en el 2do año\.$/);
        expect((await constancia(caro, 'PROSECUCION').expect(409)).body.code).toBe('SIN_PROSECUCION');
    }, 60000);

    it('DOC-04: la de retiro y la de inscripción', async () => {
        const r = (await constancia(beto, 'RETIRO').expect(200)).body.data;
        expect(r.parrafos[0]).toMatch(/se retiró del plantel el 15 de marzo de 2027\.$/);
        expect((await constancia(ana, 'RETIRO').expect(409)).body.code).toBe('NO_RETIRADO');

        const i = (await constancia(ana, 'INSCRIPCION').expect(200)).body.data;
        expect(i.parrafos[0]).toMatch(/para cursar el 3er año, sección «A», turno de la mañana, de Educación Media General, en el año escolar 2027-2028\.$/);
        expect((await constancia(beto, 'INSCRIPCION').expect(409)).body.code).toBe('NO_INSCRITO');
    }, 60000);

    it('DOC-05: quién saca cuál', async () => {
        await constancia(ana, 'ESTUDIO', ana, UserRole.STUDENT).expect(200);
        await constancia(ana, 'INSCRIPCION', ana, UserRole.STUDENT).expect(200);
        await constancia(ana, 'ESTUDIO', mama, UserRole.TUTOR).expect(200);
        for (const tipo of ['BUENA_CONDUCTA', 'PROSECUCION', 'RETIRO', 'LABOR_SOCIAL']) {
            await constancia(ana, tipo, ana, UserRole.STUDENT).expect(403);
            await constancia(ana, tipo, mama, UserRole.TUTOR).expect(403);
        }
        await constancia(ana, 'ESTUDIO', caro, UserRole.STUDENT).expect(403);
        await constancia(ana, 'ESTUDIO', profe, UserRole.TEACHER).expect(403);
        await constancia(ana, 'OTRA').expect(400);
    }, 60000);

    it('DOC-06: el Resumen Final en sus tres tipos', async () => {
        const resumen = async (tipo: string) =>
            (await api().get(`/api/classrooms/${segundoA.id}/resumen-final?tipo=${tipo}`).set(comoAdmin()).expect(200)).body.data;
        const final = await resumen('FINAL');
        expect(final).toMatchObject({ tipo: 'FINAL', membrete: { nombre: 'U.E.N. Liceo de Prueba', codigoDea: 'OD00541105' }, firmante: { nombre: 'Carmen Páez' } });
        expect(final.mesYAno).toMatch(/^[A-Z]+ \d{4}$/);
        expect(final.materias).toEqual([
            { id: fisica.id, nombre: 'Física', cualitativa: false, abreviatura: 'FI', docente: { nombre: expect.any(String), cedula: profe.id } },
        ]);
        const deAna = final.alumnos.find((a: any) => a.cedula === ana.id);
        expect(deAna).toMatchObject({ lugarDeNacimiento: 'Puerto Cabello', entidadDeNacimiento: 'Carabobo', fechaDeNacimiento: '2012-04-03', sexo: 'FEMENINO' });
        expect(deAna.notas[fisica.id]).toEqual({ definitiva: 8, revision: 12 });
        expect(final.alumnos).toHaveLength(2);

        const revision = await resumen('REVISION');
        expect(revision.alumnos.map((a: any) => a.cedula)).toEqual([ana.id]);
        expect(revision.porMateria[fisica.id]).toEqual({ aprobados: 1, reprobados: 0, sinNotas: 0 });

        const mp = await resumen('MATERIA_PENDIENTE');
        expect(mp.materias.map((m: any) => m.nombre)).toEqual(['Matemática (1º)']);
        expect(mp.alumnos.map((a: any) => a.cedula)).toEqual([ana.id]);
        expect(mp.alumnos[0].notas[`${mate.id}|1`]).toMatchObject({ definitiva: 12, estado: 'APROBADA' });

        await api().get(`/api/classrooms/${segundoA.id}/resumen-final?tipo=OTRO`).set(comoAdmin()).expect(400);
    }, 60000);

    it('DOC-07: la certificación, de los expedientes y de otro plantel', async () => {
        const c = (await api().get(`/api/students/${ana.id}/certificacion`).set(comoAdmin()).expect(200)).body.data;
        expect(c.anos).toHaveLength(5);
        const primero = c.anos[0];
        expect(primero).toMatchObject({ grado: 1, anoEscolar: '2025-2026', fuente: 'LICEO', plantel: 'U.E.N. Liceo de Prueba', codigoDelPlantel: 'OD00541105' });
        expect(primero.materias).toEqual([
            { nombre: 'Castellano', nota: 13, apreciacion: null, tipo: 'R', fecha: '07/2026' },
            { nombre: 'Matemática', nota: 12, apreciacion: null, tipo: 'MP', fecha: '01/2027' },
            { nombre: 'Orientación', nota: null, apreciacion: 'Consolidado', tipo: 'F', fecha: '07/2026' },
        ]);
        // 2do año todavía no se ha cerrado.
        expect(c.anos[1]).toMatchObject({ grado: 2, fuente: 'SIN_DATOS', materias: [] });

        await api().post(`/api/students/${dani.id}/calificaciones-externas`).set(comoAdmin()).send({
            grado: 1,
            anoEscolar: '2024-2025',
            plantel: 'U.E. Colegio Otro',
            codigoDelPlantel: 'PD00112233',
            entidad: 'Aragua',
            materias: [{ materia: 'Matemática', nota: 15, fecha: '07/2025' }, { materia: 'Castellano', nota: 11, tipo: 'R', fecha: '07/2025' }],
        }).expect(201);
        const d = (await api().get(`/api/students/${dani.id}/certificacion`).set(comoAdmin()).expect(200)).body.data;
        expect(d.anos[0]).toMatchObject({ grado: 1, fuente: 'OTRO_PLANTEL', plantel: 'U.E. Colegio Otro', anoEscolar: '2024-2025' });
        expect(d.anos[0].materias.map((x: any) => [x.nombre, x.nota, x.tipo])).toEqual([['Castellano', 11, 'R'], ['Matemática', 15, 'F']]);

        await api().get(`/api/students/${ana.id}/certificacion`).set(como(profe, UserRole.TEACHER)).expect(403);
        await api().get(`/api/students/${ana.id}/certificacion`).set(como(ana, UserRole.STUDENT)).expect(403);
    }, 60000);

    it('DOC-08: cargar un año de otro plantel: se revisa, se reemplaza, se quita con copia', async () => {
        const url = `/api/students/${dani.id}/calificaciones-externas`;
        const base = { grado: 2, anoEscolar: '2025-2026', plantel: 'U.E. Colegio Otro', materias: [{ materia: 'Física', nota: 14 }] };
        expect((await api().post(url).set(comoAdmin()).send({ ...base, grado: 6 }).expect(400)).body.code).toBe('GRADO_INVALIDO');
        expect((await api().post(url).set(comoAdmin()).send({ ...base, anoEscolar: '2025' }).expect(400)).body.code).toBe('ANO_INVALIDO');
        expect((await api().post(url).set(comoAdmin()).send({ ...base, materias: [{ materia: 'Física', nota: 25 }] }).expect(400)).body.code).toBe('NOTA_INVALIDA');
        expect((await api().post(url).set(comoAdmin()).send({ ...base, materias: [{ materia: 'Física' }] }).expect(400)).body.code).toBe('NOTA_INVALIDA');
        await api().post(url).set(comoAdmin()).send({ ...base, materias: [{ materia: 'Física', tipo: 'X', nota: 12 }] }).expect(400);
        await api().post(url).set(como(profe, UserRole.TEACHER)).send(base).expect(403);

        await api().post(url).set(comoAdmin()).send(base).expect(201);
        await api().post(url).set(comoAdmin()).send({ ...base, materias: [{ materia: 'Física', nota: 16 }, { materia: 'Química', nota: 12 }] }).expect(201);
        const cargadas = (await api().get(url).set(comoAdmin()).expect(200)).body.data;
        expect(cargadas.map((x: any) => [x.materia, x.nota])).toEqual([['Física', 16], ['Química', 12]]);

        await api().delete(`${url}/2`).set(comoAdmin()).expect(200);
        expect(await (prisma as any).calificacionExterna.count()).toBe(0);
        const copias = await prisma.$queryRawUnsafe<any[]>(`SELECT 1 FROM registros_borrados WHERE tabla = 'calificacionExterna'`);
        expect(copias).toHaveLength(3);
        await api().delete(`${url}/2`).set(comoAdmin()).expect(404);
    }, 60000);

    function comoAdmin() {
        return como(admin, UserRole.ADMIN);
    }
});
