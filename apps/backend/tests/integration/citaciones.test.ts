import { FastifyInstance } from 'fastify';
import request = require('supertest');
import { PrismaClient } from '@prisma/client';
import { createId } from '@paralleldrive/cuid2';
import { UserRole } from '../../src/utils/prisma-enums';
import { createTestServer, createTestPrismaClient, cleanTestDatabase, createTestUser, generateTestToken } from '../helpers';
import { platformPrisma } from '../../src/config/database';
import { RedisCache } from '../../src/config/redis';
import { esperarEnvios } from '../../src/services/avisos.service';

/**
 * EL PANEL DE OBSERVACIONES Y LAS CITACIONES
 *
 *   OBS-PANEL-01  el admin ve todas; el profesor, las de sus secciones y las
 *                 suyas; el alumno y el representante no entran al panel;
 *   OBS-PANEL-02  se crea una observación sin estar en una clase (con la
 *                 sección del alumno); el profesor no la deja a un ajeno;
 *   OBS-PANEL-03  los filtros: alumno, tipo, con citación;
 *   CITA-01       citar avisa a CADA representante del alumno, y a nadie más;
 *   CITA-02       citan el admin, el guía del alumno y quien escribió la
 *                 observación; otro profesor, el alumno o el representante no;
 *   CITA-03       día pasado, hora rara o sin motivo: 400 claro;
 *   CITA-04       ¿vino? sí/no con lo que se habló; el representante no marca;
 *   CITA-05       la hoja para imprimir: plantilla del liceo, a nombre del
 *                 representante que la mira; un representante ajeno no la ve.
 */

const SLUG = 'test-institute';
const gId = () => `c${createId()}`;
const dia = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);
const MANANA = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);

describe('Observaciones y citaciones (OBS-PANEL-01…03, CITA-01…05)', () => {
    let server: FastifyInstance;
    let prisma: PrismaClient;
    let admin: any, guia: any, profe: any, otroProfe: any, mama: any, papa: any, otraMama: any, ana: any, beto: any;
    let seccion: any, otraSeccion: any;

    const como = (u: any, role: UserRole) => ({ Authorization: `Bearer ${generateTestToken(u.id, role, 'institute')}`, 'X-Institute-Slug': SLUG });
    const api = () => request(server.server);
    const observar = (u: any, role: UserRole, body: any) => api().post('/api/observations').set(como(u, role)).send(body);
    const citarA = (obsId: string, u: any, role: UserRole, extra: any = {}) =>
        api().post(`/api/observations/${obsId}/citaciones`).set(como(u, role)).send({ fecha: MANANA, hora: '08:00', lugar: 'la dirección', motivo: 'Conversar sobre su conducta en el recreo', ...extra });

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
        await platformPrisma.institute.update({ where: { id: 'institute' }, data: { academicConfig: { notaMinimaAprobatoria: 10 } } });
        admin = (await createTestUser(prisma, UserRole.ADMIN)).user;
        guia = (await createTestUser(prisma, UserRole.TEACHER)).user;
        profe = (await createTestUser(prisma, UserRole.TEACHER)).user;
        otroProfe = (await createTestUser(prisma, UserRole.TEACHER)).user;
        mama = (await createTestUser(prisma, UserRole.TUTOR, { firstName: 'Rosa', lastName: 'Páez' })).user;
        papa = (await createTestUser(prisma, UserRole.TUTOR, { firstName: 'Luis', lastName: 'Páez' })).user;
        otraMama = (await createTestUser(prisma, UserRole.TUTOR)).user;
        ana = (await createTestUser(prisma, UserRole.STUDENT, { firstName: 'Ana', lastName: 'Páez' })).user;
        beto = (await createTestUser(prisma, UserRole.STUDENT, { firstName: 'Beto', lastName: 'Ruiz' })).user;
        await prisma.studentTutor.createMany({ data: [
            { studentId: ana.id, tutorId: mama.id, relationship: 'MADRE' },
            { studentId: ana.id, tutorId: papa.id, relationship: 'PADRE' },
            { studentId: beto.id, tutorId: otraMama.id, relationship: 'MADRE' },
        ] });
        const year = await prisma.academicYear.create({
            data: { id: gId(), name: '2026-2027', startDate: dia('2026-09-14'), endDate: dia('2027-07-31'), status: 'ACTIVE', isActive: true, instituteId: 'institute' } as any,
        });
        seccion = await prisma.classroom.create({ data: { id: gId(), name: '1º A', slug: `a-${gId()}`, grade: 1, section: 'A', academicYearId: year.id, instituteId: 'institute', teacherId: guia.id } as any });
        otraSeccion = await prisma.classroom.create({ data: { id: gId(), name: '1º B', slug: `b-${gId()}`, grade: 1, section: 'B', academicYearId: year.id, instituteId: 'institute', teacherId: otroProfe.id } as any });
        const materia = await prisma.subject.create({ data: { id: gId(), name: 'Matemática', code: `MA-${gId().slice(0, 5)}`, slug: `ma-${gId()}`, instituteId: 'institute' } as any });
        await prisma.classroomSubject.create({ data: { classroomId: seccion.id, subjectId: materia.id, teacherId: profe.id } as any });
        await prisma.studentClassroom.create({ data: { studentId: ana.id, classroomId: seccion.id, academicYearId: year.id } });
        await prisma.studentClassroom.create({ data: { studentId: beto.id, classroomId: otraSeccion.id, academicYearId: year.id } });
    });

    it('OBS-PANEL-01/02: cada rol ve lo suyo; se crea sin clase; el profesor no la deja a un ajeno', async () => {
        // El profesor de Matemática de 1º A deja una a Ana desde el panel (sin clase: con su sección).
        await observar(profe, UserRole.TEACHER, { title: 'Llegó tarde', studentIds: [ana.id], classroomId: seccion.id }).expect(201);
        await observar(otroProfe, UserRole.TEACHER, { title: 'No trajo el cuaderno', studentIds: [beto.id], classroomId: otraSeccion.id }).expect(201);
        // A un alumno de otra sección, no.
        await observar(profe, UserRole.TEACHER, { title: 'x', studentIds: [beto.id], classroomId: seccion.id }).expect(403);

        const titulos = async (u: any, role: UserRole) =>
            (await api().get('/api/observations/panel').set(como(u, role)).expect(200)).body.data.observaciones.map((o: any) => o.titulo).sort();
        expect(await titulos(admin, UserRole.ADMIN)).toEqual(['Llegó tarde', 'No trajo el cuaderno']);
        expect(await titulos(profe, UserRole.TEACHER)).toEqual(['Llegó tarde']);
        expect(await titulos(guia, UserRole.TEACHER)).toEqual(['Llegó tarde']);
        expect(await titulos(otroProfe, UserRole.TEACHER)).toEqual(['No trajo el cuaderno']);
        await api().get('/api/observations/panel').set(como(ana, UserRole.STUDENT)).expect(403);
        await api().get('/api/observations/panel').set(como(mama, UserRole.TUTOR)).expect(403);
    });

    it('OBS-PANEL-03 y CITA-01: los filtros; citar avisa a cada representante y a nadie más', async () => {
        const o1 = (await observar(guia, UserRole.TEACHER, { title: 'Peleó en el recreo', type: 'CONDUCTA', studentIds: [ana.id], classroomId: seccion.id }).expect(201)).body.observations[0];
        await observar(guia, UserRole.TEACHER, { title: 'Buen trabajo', type: 'FELICITACION', studentIds: [ana.id], classroomId: seccion.id }).expect(201);
        await observar(admin, UserRole.ADMIN, { title: 'Uniforme', studentIds: [beto.id] }).expect(201);

        const c = await citarA(o1.id, guia, UserRole.TEACHER).expect(201);
        expect(c.body.data).toMatchObject({ estado: 'PENDIENTE', avisados: 2 });
        await esperarEnvios();
        const avisos = await prisma.notification.findMany({ select: { recipientId: true, type: true, actionUrl: true } });
        expect(avisos.map((a) => a.recipientId).sort()).toEqual([mama.id, papa.id].sort());
        expect(avisos.every((a) => a.type === 'CITACION' && a.actionUrl === `/dashboard/citaciones/${c.body.data.id}`)).toBe(true);

        const ver = async (q: string) =>
            (await api().get(`/api/observations/panel?${q}`).set(como(admin, UserRole.ADMIN)).expect(200)).body.data.observaciones.map((o: any) => o.titulo).sort();
        expect(await ver(`alumno=${ana.id}`)).toEqual(['Buen trabajo', 'Peleó en el recreo']);
        expect(await ver('tipo=CONDUCTA')).toEqual(['Peleó en el recreo']);
        expect(await ver('conCitacion=true')).toEqual(['Peleó en el recreo']);
        const conCita = (await api().get('/api/observations/panel?conCitacion=true').set(como(admin, UserRole.ADMIN))).body.data.observaciones[0];
        expect(conCita.citaciones[0]).toMatchObject({ lugar: 'la dirección', estado: 'PENDIENTE', hora: '08:00' });

        // El representante ve la suya en su Inicio.
        const deMama = await api().get('/api/citaciones/mias').set(como(mama, UserRole.TUTOR)).expect(200);
        expect(deMama.body.data).toEqual([expect.objectContaining({ id: c.body.data.id, alumno: { id: ana.id, nombre: 'Ana Páez' } })]);
        expect((await api().get('/api/citaciones/mias').set(como(otraMama, UserRole.TUTOR)).expect(200)).body.data).toEqual([]);
    });

    it('CITA-02/03: quién cita, y lo que no se acepta', async () => {
        const deProfe = (await observar(profe, UserRole.TEACHER, { title: 'Habló en clase', studentIds: [ana.id], classroomId: seccion.id }).expect(201)).body.observations[0];
        await citarA(deProfe.id, profe, UserRole.TEACHER).expect(201); // la escribió él
        await citarA(deProfe.id, guia, UserRole.TEACHER).expect(201); // es el guía de Ana
        await citarA(deProfe.id, admin, UserRole.ADMIN).expect(201);
        await citarA(deProfe.id, otroProfe, UserRole.TEACHER).expect(403);
        await citarA(deProfe.id, mama, UserRole.TUTOR).expect(403);
        await citarA(deProfe.id, ana, UserRole.STUDENT).expect(403);

        const ayer = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10);
        const pasado = await citarA(deProfe.id, admin, UserRole.ADMIN, { fecha: ayer });
        expect(pasado.status).toBe(400);
        expect(pasado.body.code).toBe('CITACION_INVALIDA');
        expect((await citarA(deProfe.id, admin, UserRole.ADMIN, { hora: '25:00' })).status).toBe(400);
        expect((await citarA(deProfe.id, admin, UserRole.ADMIN, { motivo: 'x' })).status).toBe(400);
    });

    it('CITA-04/05: vino o no, con lo hablado; la hoja, a nombre de quien la mira', async () => {
        await prisma.studentTutor.deleteMany({ where: { tutorId: papa.id } });
        const o = (await observar(guia, UserRole.TEACHER, { title: 'Faltas seguidas', studentIds: [ana.id], classroomId: seccion.id }).expect(201)).body.observations[0];
        const c = (await citarA(o.id, guia, UserRole.TEACHER).expect(201)).body.data;

        await api().put(`/api/citaciones/${c.id}/asistencia`).set(como(mama, UserRole.TUTOR)).send({ estado: 'ASISTIO' }).expect(403);
        await api().put(`/api/citaciones/${c.id}/asistencia`).set(como(otroProfe, UserRole.TEACHER)).send({ estado: 'ASISTIO' }).expect(403);
        const marcada = await api()
            .put(`/api/citaciones/${c.id}/asistencia`)
            .set(como(guia, UserRole.TEACHER))
            .send({ estado: 'ASISTIO', loQueSeHablo: 'Se acordó que traerá justificativo médico.' })
            .expect(200);
        expect(marcada.body.data).toMatchObject({ estado: 'ASISTIO', loQueSeHablo: 'Se acordó que traerá justificativo médico.' });

        const hoja = await api().get(`/api/citaciones/${c.id}`).set(como(mama, UserRole.TUTOR)).expect(200);
        expect(hoja.body.data.titulo).toBe('Citación');
        const texto = hoja.body.data.parrafos.join(' ');
        expect(texto).toContain('Ciudadano(a) Rosa Páez, representante del (la) estudiante Ana Páez');
        expect(texto).toContain('a las 8:00 a. m., en la dirección');
        expect(hoja.body.data.puedeMarcar).toBe(false);
        expect((await api().get(`/api/citaciones/${c.id}`).set(como(guia, UserRole.TEACHER)).expect(200)).body.data.puedeMarcar).toBe(true);
        await api().get(`/api/citaciones/${c.id}`).set(como(otraMama, UserRole.TUTOR)).expect(404);
        await api().get(`/api/citaciones/${c.id}`).set(como(ana, UserRole.STUDENT)).expect(404);
    });
});
