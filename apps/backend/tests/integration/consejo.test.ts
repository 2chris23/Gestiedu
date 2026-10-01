import { FastifyInstance } from 'fastify';
import request = require('supertest');
import { PrismaClient } from '@prisma/client';
import { createId } from '@paralleldrive/cuid2';
import { UserRole } from '../../src/utils/prisma-enums';
import { createTestServer, createTestPrismaClient, cleanTestDatabase, createTestUser, generateTestToken } from '../helpers';
import { platformPrisma } from '../../src/config/database';
import { RedisCache } from '../../src/config/redis';

/**
 * EL CONSEJO DE SECCIÓN
 *
 *   CONSEJO-01  el sistema propone: materias reprobadas en el lapso, asistencia
 *               por debajo de la mínima, observaciones en el lapso;
 *   CONSEJO-02  escriben el admin y el guía; leen los profesores de la sección;
 *               otro profesor, el alumno y el representante, no;
 *   CONSEJO-03  un acta por sección y lapso: guardar dos veces la corrige; un
 *               caso quitado guarda copia; un alumno ajeno no entra;
 *   CONSEJO-04  borrar guarda copia; el acta para imprimir usa la plantilla.
 */

const SLUG = 'test-institute';
const gId = () => `c${createId()}`;
const dia = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);

describe('El consejo de sección (CONSEJO-01…04)', () => {
    let server: FastifyInstance;
    let prisma: PrismaClient;
    let admin: any, guia: any, profe: any, otroProfe: any, mama: any, ana: any, beto: any, carla: any, ajeno: any;
    let seccion: any, lapso: any, mate: any;

    const como = (u: any, role: UserRole) => ({ Authorization: `Bearer ${generateTestToken(u.id, role, 'institute')}`, 'X-Institute-Slug': SLUG });
    const api = () => request(server.server);
    const url = () => `/api/classrooms/${seccion.id}/consejos/${lapso.id}`;
    const acta = (casos: any[], extra: any = {}) => ({
        fecha: '2026-12-12',
        asistentes: [
            { id: guia.id, asistio: true },
            { id: profe.id, asistio: false },
        ],
        acuerdosGenerales: 'Reforzar matemática con guías semanales.',
        casos,
        ...extra,
    });

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
        await platformPrisma.institute.update({ where: { id: 'institute' }, data: { academicConfig: { notaMinimaAprobatoria: 10, asistenciaMinima: 80 } } });
        admin = (await createTestUser(prisma, UserRole.ADMIN)).user;
        guia = (await createTestUser(prisma, UserRole.TEACHER, { firstName: 'Luis', lastName: 'Guía' })).user;
        profe = (await createTestUser(prisma, UserRole.TEACHER, { firstName: 'Marta', lastName: 'Mate' })).user;
        otroProfe = (await createTestUser(prisma, UserRole.TEACHER)).user;
        mama = (await createTestUser(prisma, UserRole.TUTOR)).user;
        ana = (await createTestUser(prisma, UserRole.STUDENT, { firstName: 'Ana', lastName: 'Arias' })).user;
        beto = (await createTestUser(prisma, UserRole.STUDENT, { firstName: 'Beto', lastName: 'Bello' })).user;
        carla = (await createTestUser(prisma, UserRole.STUDENT, { firstName: 'Carla', lastName: 'Cruz' })).user;
        ajeno = (await createTestUser(prisma, UserRole.STUDENT)).user;
        const year = await prisma.academicYear.create({
            data: { id: gId(), name: '2026-2027', startDate: dia('2026-09-14'), endDate: dia('2027-07-31'), status: 'ACTIVE', isActive: true, instituteId: 'institute' } as any,
        });
        lapso = await prisma.period.create({ data: { name: 'Primer Lapso', startDate: dia('2026-09-14'), endDate: dia('2026-12-18'), academicYearId: year.id } as any });
        seccion = await prisma.classroom.create({ data: { id: gId(), name: '3º A', slug: `a-${gId()}`, grade: 3, section: 'A', academicYearId: year.id, instituteId: 'institute', teacherId: guia.id } as any });
        mate = await prisma.subject.create({ data: { id: gId(), name: 'Matemática', code: 'MA-01', slug: `ma-${gId()}`, instituteId: 'institute' } as any });
        await prisma.classroomSubject.create({ data: { classroomId: seccion.id, subjectId: mate.id, teacherId: profe.id } as any });
        for (const s of [ana, beto, carla]) await prisma.studentClassroom.create({ data: { studentId: s.id, classroomId: seccion.id, academicYearId: year.id } });
        await prisma.studentTutor.create({ data: { studentId: ana.id, tutorId: mama.id, relationship: 'MADRE' } });
        const act = await prisma.activity.create({
            data: { title: 'Prueba', type: 'SUMATIVA', scope: 'CLASSROOM', startDate: lapso.startDate, maxGrade: 20, weight: 1, classroomId: seccion.id, subjectId: mate.id, periodId: lapso.id, lapso: '1', createdBy: profe.id, instituteId: 'institute' } as any,
        });
        // Ana reprueba Matemática; Beto falta mucho; Carla tiene una observación.
        await prisma.grade.create({ data: { studentId: ana.id, subjectId: mate.id, activityId: act.id, periodId: lapso.id, teacherId: profe.id, score: 7 } });
        await prisma.grade.create({ data: { studentId: beto.id, subjectId: mate.id, activityId: act.id, periodId: lapso.id, teacherId: profe.id, score: 16 } });
        for (const [i, status] of ['ABSENT', 'ABSENT', 'PRESENT', 'ABSENT', 'LATE'].entries()) {
            await prisma.dailyAttendance.create({ data: { date: dia(`2026-10-0${i + 1}`), status: status as any, studentId: beto.id, classroomId: seccion.id, teacherId: guia.id } });
        }
        await prisma.observation.create({ data: { title: 'Pelea en el recreo', studentId: carla.id, createdById: guia.id, classroomId: seccion.id, date: dia('2026-11-05') } });
    });

    it('CONSEJO-01: propone reprobadas, poca asistencia y observaciones', async () => {
        const r = (await api().get(url()).set(como(guia, UserRole.TEACHER)).expect(200)).body.data;
        expect(r.acta).toBeNull();
        const por = Object.fromEntries(r.propuestos.map((p: any) => [p.alumno.nombre, p.motivos]));
        expect(por['Ana Arias'].reprobadas).toEqual([{ materia: 'Matemática', nota: 7 }]);
        expect(por['Beto Bello']).toMatchObject({ reprobadas: [], asistencia: 40 });
        expect(por['Carla Cruz']).toMatchObject({ observaciones: 1 });
        expect(r.profesores.map((p: any) => p.nombre).sort()).toEqual(['Luis Guía', 'Marta Mate']);
    });

    it('CONSEJO-02: quién escribe y quién lee', async () => {
        await api().put(url()).set(como(profe, UserRole.TEACHER)).send(acta([])).expect(403);
        await api().get(url()).set(como(profe, UserRole.TEACHER)).expect(200);
        await api().get(url()).set(como(otroProfe, UserRole.TEACHER)).expect(403);
        await api().get(url()).set(como(ana, UserRole.STUDENT)).expect(403);
        await api().get(url()).set(como(mama, UserRole.TUTOR)).expect(403);
        await api().put(url()).set(como(guia, UserRole.TEACHER)).send(acta([{ studentId: ana.id }])).expect(200);
        await api().put(url()).set(como(admin, UserRole.ADMIN)).send(acta([{ studentId: ana.id }])).expect(200);
    });

    it('CONSEJO-03: un acta por lapso; quitar un caso guarda copia; un ajeno no entra', async () => {
        const primera = await api()
            .put(url())
            .set(como(guia, UserRole.TEACHER))
            .send(acta([{ studentId: ana.id, loTratado: 'Bajo rendimiento en Matemática', acuerdo: 'Plan de refuerzo' }, { studentId: beto.id }]))
            .expect(200);
        expect(primera.body.data.acta.casos.map((c: any) => c.alumno.nombre)).toEqual(['Ana Arias', 'Beto Bello']);
        expect(primera.body.data.acta.casos[0].motivos.reprobadas).toEqual([{ materia: 'Matemática', nota: 7 }]);
        expect(primera.body.data.acta.asistentes.find((a: any) => a.id === profe.id)).toMatchObject({ asistio: false, materias: ['Matemática'] });

        await api().put(url()).set(como(guia, UserRole.TEACHER)).send(acta([{ studentId: ana.id, acuerdo: 'Plan de refuerzo' }])).expect(200);
        expect(await prisma.consejoDeSeccion.count()).toBe(1);
        expect(await prisma.casoDelConsejo.count()).toBe(1);
        expect(await prisma.registroBorrado.count({ where: { tabla: 'casoDelConsejo' } })).toBe(1);

        const conAjeno = await api().put(url()).set(como(guia, UserRole.TEACHER)).send(acta([{ studentId: ajeno.id }]));
        expect(conAjeno.status).toBe(400);
    });

    it('CONSEJO-04: el acta para imprimir, y borrar con copia', async () => {
        await api().get(`${url()}/acta`).set(como(guia, UserRole.TEACHER)).expect(404);
        await api().put(url()).set(como(guia, UserRole.TEACHER)).send(acta([{ studentId: ana.id }])).expect(200);
        const h = (await api().get(`${url()}/acta`).set(como(profe, UserRole.TEACHER)).expect(200)).body.data;
        expect(h.titulo).toBe('Acta del consejo de sección');
        expect(h.parrafos[0]).toContain('el día 12 de diciembre de 2026, se reunió el consejo de sección del 3er año, sección «A», correspondiente al Primer Lapso del año escolar 2026-2027');
        const lista = (await api().get(`/api/classrooms/${seccion.id}/consejos`).set(como(guia, UserRole.TEACHER)).expect(200)).body.data;
        expect(lista.lapsos).toEqual([{ id: lapso.id, nombre: 'Primer Lapso', acta: '2026-12-12' }]);

        await api().delete(url()).set(como(profe, UserRole.TEACHER)).expect(403);
        await api().delete(url()).set(como(guia, UserRole.TEACHER)).expect(200);
        expect(await prisma.consejoDeSeccion.count()).toBe(0);
        expect(await prisma.registroBorrado.count({ where: { tabla: 'consejoDeSeccion' } })).toBe(1);
    });
});
