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
import { gradesService } from '../../src/services/grades.service';
import { sectionAverage } from '../../src/services/aggregation.service';
import { bulkSubjectAveragesConDatos } from '../../src/services/bulk-averages.service';

/**
 * LAS MATERIAS QUE SE EVALÚAN CON APRECIACIÓN
 *
 * Orientación y Convivencia, Grupos de Creación… no llevan nota: llevan una
 * apreciación («Consolidado», «En proceso», «Iniciado»). No entran en ningún
 * promedio ni en la promoción.
 *
 *   CUALI-01  el admin elige cómo se evalúa cada materia (y nada más vale);
 *   CUALI-02  una materia con apreciación no entra en los promedios ni en las
 *             reprobadas, aunque tenga notas de antes;
 *   CUALI-03  la pone el profesor de esa materia (o el admin); el guía solo
 *             mira; otro profesor y el alumno, nada; solo palabras del liceo;
 *             vaciarla la quita con copia en la papelera;
 *   CUALI-04  la boleta la enseña por lapso y la final; el liceo cambia la
 *             lista de palabras;
 *   CUALI-05  el cierre la guarda en el expediente y el resumen final la
 *             enseña sin contarla.
 */

const SLUG = 'test-institute';
const gId = () => `c${createId()}`;
const dia = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);

describe('Las apreciaciones (CUALI-01…05)', () => {
    let server: FastifyInstance;
    let prisma: PrismaClient;
    let admin: any;
    let guia: any;
    let profeOri: any;
    let otro: any;
    let alumno: any;
    let year: any;
    let lapso: any;
    let seccion: any;
    let mate: any;
    let orientacion: any;

    const como = (u: any, role: UserRole) => ({
        Authorization: `Bearer ${generateTestToken(u.id, role, 'institute')}`,
        'X-Institute-Slug': SLUG,
    });
    const aCualitativa = () =>
        request(server.server).put(`/api/subjects/${orientacion.id}`).set(como(admin, UserRole.ADMIN)).send({ evaluacion: 'CUALITATIVA' });
    const poner = (body: any, u = profeOri, role = UserRole.TEACHER, materia = orientacion.id) =>
        request(server.server).put(`/api/apreciaciones/${seccion.id}/${materia}`).set(como(u, role)).send(body);
    const ver = (u = profeOri, role = UserRole.TEACHER) =>
        request(server.server).get(`/api/apreciaciones/${seccion.id}/${orientacion.id}`).set(como(u, role));
    const sugerencia = async () => {
        const res = await request(server.server).post(`/api/academic-years/${year.id}/close/prepare`).set(como(admin, UserRole.ADMIN)).send({}).expect(200);
        return res.body.suggestions.find((s: any) => s.studentId === alumno.id);
    };

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
        profeOri = (await createTestUser(prisma, UserRole.TEACHER)).user;
        otro = (await createTestUser(prisma, UserRole.TEACHER)).user;
        year = await prisma.academicYear.create({
            data: { id: gId(), name: '2026-2027', startDate: dia('2026-09-15'), endDate: dia('2027-07-15'), isActive: true, status: 'ACTIVE', instituteId: 'institute' } as any,
        });
        lapso = await prisma.period.create({ data: { id: gId(), name: 'Primer Lapso', startDate: dia('2026-09-15'), endDate: dia('2026-12-15'), academicYearId: year.id } });
        seccion = await prisma.classroom.create({
            data: { id: gId(), name: '1er Año A', slug: `aula-${gId()}`, grade: 1, section: 'A', capacity: 30, academicYearId: year.id, instituteId: 'institute', teacherId: guia.id } as any,
        });
        const materia = (nombre: string) =>
            prisma.subject.create({ data: { id: gId(), name: nombre, code: `${nombre.slice(0, 3).toUpperCase()}-${gId().slice(0, 5)}`, slug: `${nombre.toLowerCase()}-${gId()}`, instituteId: 'institute' } as any });
        mate = await materia('Matemática');
        orientacion = await materia('Orientación');
        await prisma.classroomSubject.create({ data: { classroomId: seccion.id, subjectId: mate.id, teacherId: guia.id } });
        await prisma.classroomSubject.create({ data: { classroomId: seccion.id, subjectId: orientacion.id, teacherId: profeOri.id } });
        alumno = (await createTestUser(prisma, UserRole.STUDENT, { firstName: 'Ana', lastName: 'Rojas' })).user;
        await prisma.studentClassroom.create({ data: { id: gId(), studentId: alumno.id, classroomId: seccion.id, academicYearId: year.id, isActive: true } });

        const nota = async (subjectId: string, score: number, teacherId: string) => {
            const act = await prisma.activity.create({
                data: {
                    id: gId(), title: 'Evaluación', description: 'x', type: 'TAREA' as any, scope: 'CLASSROOM' as any,
                    classroomId: seccion.id, subjectId, periodId: lapso.id, createdBy: teacherId, maxGrade: 20, weight: 1,
                    startDate: new Date(), endDate: new Date(), dueDate: new Date(),
                } as any,
            });
            await prisma.grade.create({ data: { id: gId(), score, studentId: alumno.id, activityId: act.id, periodId: lapso.id, subjectId, teacherId } });
        };
        await nota(mate.id, 15, guia.id);
        // Una nota de antes de pasarla a apreciación: reprobada.
        await nota(orientacion.id, 5, profeOri.id);
    }, 180000);

    it('CUALI-01: el admin elige cómo se evalúa cada materia', async () => {
        expect((await prisma.subject.findUnique({ where: { id: orientacion.id } }))!.evaluacion).toBe('NUMERICA');
        await aCualitativa().expect(200);
        const detalle = await request(server.server)
            .get(`/api/classrooms/${seccion.id}/subjects/${orientacion.id}`)
            .set(como(admin, UserRole.ADMIN))
            .expect(200);
        expect(detalle.body.classroomSubject.subject.evaluacion).toBe('CUALITATIVA');

        await request(server.server).put(`/api/subjects/${mate.id}`).set(como(admin, UserRole.ADMIN)).send({ evaluacion: 'OTRA' }).expect(400);
        await request(server.server).put(`/api/subjects/${mate.id}`).set(como(profeOri, UserRole.TEACHER)).send({ evaluacion: 'CUALITATIVA' }).expect(403);
        expect((await prisma.subject.findUnique({ where: { id: mate.id } }))!.evaluacion).toBe('NUMERICA');
    }, 60000);

    it('CUALI-02: no entra en los promedios ni en las reprobadas', async () => {
        const antes = await sugerencia();
        expect(antes.finalAverage).toBe(10);
        expect(antes.failedSubjects.map((f: any) => f.subjectId)).toEqual([orientacion.id]);

        await aCualitativa().expect(200);

        const despues = await sugerencia();
        expect(despues.finalAverage).toBe(15);
        expect(despues.failedSubjects).toEqual([]);
        expect(despues.suggestedStatus).toBe('PROMOVIDO');
        expect(despues.subjectGrades.find((g: any) => g.subjectId === orientacion.id)).toMatchObject({ cualitativa: true, conNotas: false, approved: true });

        const suya = await gradesService.promedioDeLaMateria(prisma, alumno.id, orientacion.id);
        expect(suya.conNotas).toBe(false);

        // El promedio de la sección (niveles 3 y 4) y el de la lista, igual.
        const n4 = await sectionAverage(prisma, seccion.id);
        expect(n4.average).toBe(15);
        expect(n4.subjectAverages.find((m) => m.subjectId === orientacion.id)!.average).toBe(0);
        const enBloque = await bulkSubjectAveragesConDatos(prisma, { classroomId: seccion.id, studentIds: [alumno.id], subjectIds: [mate.id, orientacion.id] });
        expect([...enBloque.get(alumno.id)!.keys()]).toEqual([mate.id]);
    }, 60000);

    it('CUALI-03: la pone el profesor de la materia; el guía solo mira', async () => {
        await aCualitativa().expect(200);

        await poner({ momento: lapso.id, items: [{ studentId: alumno.id, valor: 'Consolidado' }] }).expect(200);
        const vista = (await ver().expect(200)).body.data;
        expect(vista.valores).toEqual(['Consolidado', 'En proceso', 'Iniciado']);
        expect(vista.momentos.map((m: any) => m.id)).toEqual([lapso.id, 'FINAL']);
        expect(vista.alumnos[0].apreciaciones[lapso.id].valor).toBe('Consolidado');

        // El guía de la sección la mira, pero no la pone (no da Orientación).
        await ver(guia).expect(200);
        await poner({ momento: lapso.id, items: [{ studentId: alumno.id, valor: 'Iniciado' }] }, guia).expect(403);
        // Otro profesor, ni eso; el alumno, tampoco.
        await ver(otro).expect(403);
        await poner({ momento: lapso.id, items: [{ studentId: alumno.id, valor: 'Iniciado' }] }, alumno, UserRole.STUDENT).expect(403);
        // El admin sí (corrige). Sin distinguir mayúsculas: queda la palabra del liceo.
        await poner({ momento: 'FINAL', items: [{ studentId: alumno.id, valor: 'en proceso' }] }, admin, UserRole.ADMIN).expect(200);
        expect((await (prisma as any).apreciacion.findFirst({ where: { momento: 'FINAL' } })).valor).toBe('En proceso');

        expect((await poner({ momento: lapso.id, items: [{ studentId: alumno.id, valor: 'Excelente' }] }).expect(400)).body.code).toBe('APRECIACION_INVALIDA');
        expect((await poner({ momento: 'otro-lapso', items: [{ studentId: alumno.id, valor: 'Iniciado' }] }).expect(400)).body.code).toBe('MOMENTO_INVALIDO');
        const ajeno = (await createTestUser(prisma, UserRole.STUDENT)).user;
        expect((await poner({ momento: lapso.id, items: [{ studentId: ajeno.id, valor: 'Iniciado' }] }).expect(400)).body.code).toBe('ALUMNO_AJENO');
        // Una materia con nota no lleva apreciación.
        expect((await poner({ momento: lapso.id, items: [{ studentId: alumno.id, valor: 'Iniciado' }] }, admin, UserRole.ADMIN, mate.id).expect(409)).body.code).toBe('MATERIA_NUMERICA');

        // Vaciarla la quita, con copia en la papelera.
        await poner({ momento: lapso.id, items: [{ studentId: alumno.id, valor: '' }] }).expect(200);
        expect(await (prisma as any).apreciacion.count({ where: { momento: lapso.id } })).toBe(0);
        const copia = await prisma.$queryRawUnsafe<any[]>(`SELECT 1 FROM registros_borrados WHERE tabla = 'apreciacion'`);
        expect(copia.length).toBe(1);
    }, 60000);

    it('CUALI-04: la boleta la enseña; el liceo cambia la lista de palabras', async () => {
        await aCualitativa().expect(200);
        await poner({ momento: lapso.id, items: [{ studentId: alumno.id, valor: 'Iniciado' }] }).expect(200);
        await poner({ momento: 'FINAL', items: [{ studentId: alumno.id, valor: 'Consolidado' }] }).expect(200);

        const boleta = (await request(server.server).get(`/api/students/${alumno.id}/boleta`).set(como(alumno, UserRole.STUDENT)).expect(200)).body.data;
        const deOri = boleta.materias.find((m: any) => m.id === orientacion.id);
        expect(deOri).toMatchObject({ cualitativa: true, definitiva: null, aprobada: null });
        expect(deOri.apreciaciones).toEqual({ [lapso.id]: 'Iniciado', FINAL: 'Consolidado' });
        expect(boleta.promedios.definitivo).toBe(15);
        expect(boleta.promedios[lapso.id]).toBe(15);

        // El liceo usa otras palabras.
        const config = (body: any) =>
            request(server.server).put('/api/institutes/current/academic-config').set(como(admin, UserRole.ADMIN)).send(body);
        expect((await config({ apreciaciones: ['Solo una'] }).expect(400)).body.code).toBe('APRECIACIONES_INVALIDAS');
        expect((await config({ apreciaciones: ['A', 'a'] }).expect(400)).body.code).toBe('APRECIACIONES_INVALIDAS');
        await config({ apreciaciones: ['Alcanzado', 'Por alcanzar'] }).expect(200);
        expect((await ver().expect(200)).body.data.valores).toEqual(['Alcanzado', 'Por alcanzar']);
        await poner({ momento: lapso.id, items: [{ studentId: alumno.id, valor: 'Consolidado' }] }).expect(400);
        await poner({ momento: lapso.id, items: [{ studentId: alumno.id, valor: 'Alcanzado' }] }).expect(200);
        // Y el resto de la configuración sigue ahí.
        const leida = (await request(server.server).get('/api/institutes/current/academic-config').set(como(admin, UserRole.ADMIN)).expect(200)).body.data;
        expect(leida).toMatchObject({ notaMinimaAprobatoria: 10, apreciaciones: ['Alcanzado', 'Por alcanzar'] });
    }, 60000);

    it('CUALI-05: el cierre la guarda en el expediente; el resumen final no la cuenta', async () => {
        await aCualitativa().expect(200);
        await poner({ momento: 'FINAL', items: [{ studentId: alumno.id, valor: 'Consolidado' }] }).expect(200);

        const resumen = (await request(server.server).get(`/api/classrooms/${seccion.id}/resumen-final`).set(como(admin, UserRole.ADMIN)).expect(200)).body.data;
        expect(resumen.materias.find((m: any) => m.id === orientacion.id).cualitativa).toBe(true);
        const fila = resumen.alumnos[0];
        expect(fila.notas[orientacion.id]).toMatchObject({ definitiva: null, apreciacion: 'Consolidado' });
        expect(fila.reprobadas).toBe(0);
        expect(fila.promedio).toBe(15);
        expect(resumen.porMateria[orientacion.id]).toEqual({ aprobados: 0, reprobados: 0, sinNotas: 0 });

        // Al cerrar, el expediente la guarda con su apreciación y sin nota.
        const siguiente = await prisma.academicYear.create({
            data: { id: gId(), name: '2027-2028', startDate: dia('2027-09-15'), endDate: dia('2028-07-15'), status: 'UPCOMING', instituteId: 'institute' } as any,
        });
        await prisma.classroom.create({
            data: { id: gId(), name: '2do Año A', slug: `aula-${gId()}`, grade: 2, section: 'A', capacity: 30, academicYearId: siguiente.id, instituteId: 'institute' } as any,
        });
        await request(server.server).post(`/api/academic-years/${year.id}/close`).set(como(admin, UserRole.ADMIN)).send({ decisions: [] }).expect(200);
        const expediente = await prisma.academicRecord.findFirst({ where: { studentId: alumno.id, academicYearId: year.id } });
        expect(expediente!.finalAverage).toBe(15);
        expect(expediente!.pendingSubjects).toEqual([]);
        expect((expediente!.subjectGrades as any[]).find((g) => g.subjectId === orientacion.id)).toEqual({
            subjectId: orientacion.id,
            subjectName: 'Orientación',
            cualitativa: true,
            apreciacion: 'Consolidado',
        });
    }, 60000);
});
