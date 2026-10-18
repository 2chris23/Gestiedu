import { FastifyInstance } from 'fastify';
import request = require('supertest');
import { PrismaClient } from '@prisma/client';
import { createId } from '@paralleldrive/cuid2';
import { UserRole } from '../../src/utils/prisma-enums';
import { createTestServer, createTestPrismaClient, cleanTestDatabase, createTestUser, generateTestToken } from '../helpers';
import { platformPrisma } from '../../src/config/database';
import { RedisCache } from '../../src/config/redis';

/**
 * LOS GRUPOS ESTABLES: EL ALUMNO ELIGE, EL PROFESOR DEL GRUPO DECIDE
 *
 *   GRUPO-01  solo el admin crea grupos, y solo en una materia «por grupos»
 *             (que se evalúa con apreciación);
 *   GRUPO-02  el alumno ve los grupos de su turno con cupo, sin la lista de
 *             quién está; los de otro turno, ni los ve ni los puede pedir;
 *   GRUPO-03  pide uno: queda pendiente, el profesor recibe el aviso y no
 *             puede pedir otro mientras tanto; puede retirarla;
 *   GRUPO-04  solo el profesor de ESE grupo decide; rechazado (con motivo),
 *             el alumno puede pedir otro o el mismo;
 *   GRUPO-05  el cupo no se pasa ni aceptando dos a la vez el último lugar;
 *             un grupo lleno no se ofrece ni se puede pedir;
 *   GRUPO-06  «sin grupo»: el admin ve quién no tiene y lo asigna; queda
 *             aceptado y su pendiente se retira;
 *   GRUPO-07  la elección cerrada no deja pedir; por lapso, cada lapso es otro
 *             momento.
 */

const SLUG = 'test-institute';
const gId = () => `c${createId()}`;
const dia = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);

describe('Los grupos estables (GRUPO-01…07)', () => {
    let server: FastifyInstance;
    let prisma: PrismaClient;
    let admin: any;
    let profeFutbol: any;
    let profeCostura: any;
    let otroProfe: any;
    let ana: any;
    let beto: any;
    let carla: any;
    let year: any;
    let lapso1: any;
    let manana: any;
    let tarde: any;
    let gcrp: any;

    const como = (u: any, role: UserRole) => ({ Authorization: `Bearer ${generateTestToken(u.id, role, 'institute')}`, 'X-Institute-Slug': SLUG });
    const api = () => request(server.server);
    const crear = (body: any, u = admin, role = UserRole.ADMIN) =>
        api().post(`/api/grupos-estables/materia/${gcrp.id}?academicYearId=${year.id}`).set(como(u, role)).send(body);
    const paraMi = (u: any) => api().get('/api/grupos-estables/para-mi').set(como(u, UserRole.STUDENT));
    const pedir = (u: any, grupoId: string) => api().post(`/api/grupos-estables/${grupoId}/solicitudes`).set(como(u, UserRole.STUDENT)).send({});
    const decidir = (solicitudId: string, decision: string, u: any, role = UserRole.TEACHER, motivo?: string) =>
        api().post(`/api/grupos-estables/solicitudes/${solicitudId}/decidir`).set(como(u, role)).send({ decision, ...(motivo ? { motivo } : {}) });
    const reglas = (gruposEstables: any) =>
        platformPrisma.institute.update({ where: { id: 'institute' }, data: { academicConfig: { gruposEstables } } });

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
        await reglas({ eleccion: 'ANUAL', abierta: true });

        admin = (await createTestUser(prisma, UserRole.ADMIN)).user;
        profeFutbol = (await createTestUser(prisma, UserRole.TEACHER, { firstName: 'Pedro', lastName: 'Fútbol' })).user;
        profeCostura = (await createTestUser(prisma, UserRole.TEACHER, { firstName: 'Rosa', lastName: 'Costura' })).user;
        otroProfe = (await createTestUser(prisma, UserRole.TEACHER)).user;
        year = await prisma.academicYear.create({
            data: { id: gId(), name: '2026-2027', startDate: dia('2026-09-15'), endDate: dia('2027-07-15'), isActive: true, status: 'ACTIVE', instituteId: 'institute' } as any,
        });
        // Dos lapsos que cubren cualquier día de prueba: el de hoy decide el momento.
        lapso1 = await prisma.period.create({ data: { id: gId(), name: 'Primer Lapso', startDate: dia('2000-01-01'), endDate: dia('2026-12-15'), academicYearId: year.id } });
        await prisma.period.create({ data: { id: gId(), name: 'Segundo Lapso', startDate: dia('2026-12-16'), endDate: dia('2099-12-31'), academicYearId: year.id } });
        const seccion = (nombre: string, grade: number, shift: string) =>
            prisma.classroom.create({
                data: { id: gId(), name: nombre, slug: `aula-${gId()}`, grade, section: nombre.slice(-1), shift, capacity: 30, academicYearId: year.id, instituteId: 'institute' } as any,
            });
        manana = await seccion('1er Año A', 1, 'MANANA');
        tarde = await seccion('3er Año B', 3, 'TARDE');
        gcrp = await prisma.subject.create({
            data: { id: gId(), name: 'Grupos de Creación', slug: `gcrp-${gId()}`, evaluacion: 'CUALITATIVA', porGrupos: true, instituteId: 'institute' } as any,
        });
        await prisma.classroomSubject.create({ data: { classroomId: manana.id, subjectId: gcrp.id } });
        await prisma.classroomSubject.create({ data: { classroomId: tarde.id, subjectId: gcrp.id } });
        const alumno = async (nombre: string, seccionId: string) => {
            const u = (await createTestUser(prisma, UserRole.STUDENT, { firstName: nombre, lastName: 'Prueba' })).user;
            await prisma.studentClassroom.create({ data: { id: gId(), studentId: u.id, classroomId: seccionId, academicYearId: year.id, isActive: true } });
            return u;
        };
        ana = await alumno('Ana', manana.id);
        beto = await alumno('Beto', manana.id);
        carla = await alumno('Carla', tarde.id);
    }, 180000);

    const dosGrupos = async () => {
        const futbol = (await crear({ nombre: 'Fútbol', cupo: 1, profesorId: profeFutbol.id, area: 'ACTIVIDAD_FISICA', turno: 'MANANA' }).expect(200)).body.data;
        const costura = (await crear({ nombre: 'Costura', cupo: 20, profesorId: profeCostura.id, area: 'PRODUCCION' }).expect(200)).body.data;
        return { futbol, costura };
    };
    const solicitudDe = (alumnoId: string) =>
        prisma.solicitudDeGrupo.findFirst({ where: { studentId: alumnoId, estado: { in: ['PENDIENTE', 'ACEPTADA'] } } });

    it('GRUPO-01: solo el admin crea grupos, y solo en una materia por grupos', async () => {
        await crear({ nombre: 'Fútbol', cupo: 10 }, profeFutbol, UserRole.TEACHER).expect(403);
        await crear({ nombre: 'Fútbol', cupo: 10 }, ana, UserRole.STUDENT).expect(403);
        await crear({ nombre: 'Fútbol', cupo: 0 }).expect(400);
        await crear({ nombre: 'Fútbol', cupo: 10, area: 'MAGIA' }).expect(400);
        await crear({ nombre: 'Fútbol', cupo: 10, profesorId: ana.id }).expect(400);
        await crear({ nombre: 'Fútbol', cupo: 10 }).expect(200);
        await crear({ nombre: 'Fútbol', cupo: 10 }).expect(409);

        // Una materia normal no tiene grupos; y «por grupos» pide apreciación.
        const mate = await prisma.subject.create({ data: { id: gId(), name: 'Matemática', slug: `mate-${gId()}`, instituteId: 'institute' } as any });
        await api().post(`/api/grupos-estables/materia/${mate.id}?academicYearId=${year.id}`).set(como(admin, UserRole.ADMIN)).send({ nombre: 'X', cupo: 5 }).expect(409);
        await api().put(`/api/subjects/${mate.id}`).set(como(admin, UserRole.ADMIN)).send({ porGrupos: true }).expect(400);
        expect((await prisma.subject.findUnique({ where: { id: mate.id } }))!.porGrupos).toBe(false);
        await api().put(`/api/subjects/${mate.id}`).set(como(admin, UserRole.ADMIN)).send({ porGrupos: true, evaluacion: 'CUALITATIVA' }).expect(200);
        expect((await prisma.subject.findUnique({ where: { id: mate.id } }))!.porGrupos).toBe(true);
    }, 60000);

    it('GRUPO-02: el alumno ve los grupos de su turno con cupo, sin quién está', async () => {
        const { futbol, costura } = await dosGrupos();
        const deAna = (await paraMi(ana).expect(200)).body.data;
        expect(deAna.materias).toHaveLength(1);
        expect(deAna.materias[0].grupos.map((g: any) => g.nombre)).toEqual(['Costura', 'Fútbol']);
        expect(deAna.materias[0].grupos.find((g: any) => g.id === futbol.id).cupoLibre).toBe(1);
        // De la tarde: Fútbol es de la mañana.
        const deCarla = (await paraMi(carla).expect(200)).body.data;
        expect(deCarla.materias[0].grupos.map((g: any) => g.id)).toEqual([costura.id]);
        await pedir(carla, futbol.id).expect(409);

        // Con Beto dentro de Costura, a Ana no le llega ni su id ni su nombre.
        await pedir(beto, costura.id).expect(200);
        const texto = JSON.stringify((await paraMi(ana).expect(200)).body);
        expect(texto).not.toContain(beto.id);
        expect(texto).not.toContain('Beto');
        // Ni el alumno ni el representante entran a la lista del grupo.
        await api().get(`/api/grupos-estables/${costura.id}`).set(como(ana, UserRole.STUDENT)).expect(403);
        await api().get(`/api/grupos-estables/${costura.id}`).set(como(ana, UserRole.TUTOR)).expect(403);
    }, 60000);

    it('GRUPO-03: pide, el profesor recibe el aviso, no puede pedir otro, y puede retirarla', async () => {
        const { futbol, costura } = await dosGrupos();
        const pedida = (await pedir(ana, costura.id).expect(200)).body.data;
        expect(pedida.estado).toBe('PENDIENTE');
        expect(await prisma.notification.count({ where: { recipientId: profeCostura.id } })).toBe(1);
        const yo = (await paraMi(ana).expect(200)).body.data.materias[0];
        expect(yo.solicitud).toMatchObject({ estado: 'PENDIENTE', grupo: { id: costura.id } });

        const otra = await pedir(ana, futbol.id).expect(409);
        expect(otra.body.code ?? otra.body.error?.code).toBe('YA_TIENE_SOLICITUD');
        // Dos a la vez: el índice parcial deja una sola viva.
        await Promise.all([pedir(beto, futbol.id), pedir(beto, costura.id)]);
        expect(await prisma.solicitudDeGrupo.count({ where: { studentId: beto.id, estado: 'PENDIENTE' } })).toBe(1);

        // Retirarla: solo el dueño y solo pendiente.
        await api().post(`/api/grupos-estables/solicitudes/${pedida.id}/retirar`).set(como(beto, UserRole.STUDENT)).send({}).expect(409);
        await api().post(`/api/grupos-estables/solicitudes/${pedida.id}/retirar`).set(como(ana, UserRole.STUDENT)).send({}).expect(200);
        await pedir(ana, futbol.id).expect(200);
    }, 60000);

    it('GRUPO-04: solo el profesor de ese grupo decide; rechazado, puede pedir de nuevo (también el mismo)', async () => {
        const { costura } = await dosGrupos();
        const pedida = (await pedir(ana, costura.id).expect(200)).body.data;

        await api().get(`/api/grupos-estables/${costura.id}`).set(como(profeFutbol, UserRole.TEACHER)).expect(403);
        await decidir(pedida.id, 'ACEPTAR', otroProfe).expect(403);
        await decidir(pedida.id, 'ACEPTAR', ana, UserRole.STUDENT).expect(403);

        const grupo = (await api().get(`/api/grupos-estables/${costura.id}`).set(como(profeCostura, UserRole.TEACHER)).expect(200)).body.data;
        expect(grupo.pendientes.map((p: any) => p.alumno.id)).toEqual([ana.id]);
        expect(grupo.pendientes[0].alumno.seccion).toBe('1er Año A');

        await decidir(pedida.id, 'RECHAZAR', profeCostura, UserRole.TEACHER, 'Ya no hay máquinas').expect(200);
        await decidir(pedida.id, 'ACEPTAR', profeCostura).expect(409);
        expect(await prisma.notification.count({ where: { recipientId: ana.id } })).toBe(1);
        const yo = (await paraMi(ana).expect(200)).body.data.materias[0];
        expect(yo.solicitud).toMatchObject({ estado: 'RECHAZADA', motivoRechazo: 'Ya no hay máquinas' });

        // Vuelve a pedir el mismo, y esta vez lo aceptan.
        const otraVez = (await pedir(ana, costura.id).expect(200)).body.data;
        await decidir(otraVez.id, 'ACEPTAR', profeCostura).expect(200);
        expect((await solicitudDe(ana.id))!.estado).toBe('ACEPTADA');
        const ya = (await api().get(`/api/grupos-estables/${costura.id}`).set(como(profeCostura, UserRole.TEACHER)).expect(200)).body.data;
        expect(ya.miembros.map((m: any) => m.alumno.id)).toEqual([ana.id]);
        // El admin también puede llevar el grupo.
        await api().get(`/api/grupos-estables/${costura.id}`).set(como(admin, UserRole.ADMIN)).expect(200);
    }, 60000);

    it('GRUPO-05: el cupo no se pasa, ni aceptando dos a la vez el último lugar', async () => {
        const { futbol } = await dosGrupos(); // cupo 1
        const deAna = (await pedir(ana, futbol.id).expect(200)).body.data;
        const deBeto = (await pedir(beto, futbol.id).expect(200)).body.data;
        const [r1, r2] = await Promise.all([decidir(deAna.id, 'ACEPTAR', profeFutbol), decidir(deBeto.id, 'ACEPTAR', profeFutbol)]);
        expect([r1.status, r2.status].sort()).toEqual([200, 409]);
        expect(await prisma.solicitudDeGrupo.count({ where: { grupoId: futbol.id, estado: 'ACEPTADA' } })).toBe(1);

        // Lleno: no se ofrece (salvo a quien está dentro) ni se puede pedir.
        const dentro = (await solicitudDe(ana.id))!.estado === 'ACEPTADA' ? ana : beto;
        const fuera = dentro === ana ? beto : ana;
        await prisma.solicitudDeGrupo.updateMany({ where: { studentId: fuera.id }, data: { estado: 'RETIRADA' } });
        expect((await paraMi(fuera).expect(200)).body.data.materias[0].grupos.map((g: any) => g.nombre)).toEqual(['Costura']);
        expect((await paraMi(dentro).expect(200)).body.data.materias[0].grupos.map((g: any) => g.nombre)).toContain('Fútbol');
        await pedir(fuera, futbol.id).expect(409);
        // Y el cupo no se puede bajar por debajo de los que ya están.
        await api().put(`/api/grupos-estables/${futbol.id}`).set(como(admin, UserRole.ADMIN)).send({ cupo: 0 }).expect(400);
    }, 60000);

    it('GRUPO-06: el admin ve quién está sin grupo y lo asigna', async () => {
        const { costura } = await dosGrupos();
        await pedir(beto, costura.id).expect(200);
        const sin = (await api().get(`/api/grupos-estables/materia/${gcrp.id}/sin-grupo?academicYearId=${year.id}`).set(como(admin, UserRole.ADMIN)).expect(200)).body.data;
        expect(sin.total).toBe(3);
        const deManana = sin.secciones.find((s: any) => s.seccion.id === manana.id);
        expect(deManana.alumnos.find((a: any) => a.id === beto.id).pendienteEn).toBe('Costura');
        await api().get(`/api/grupos-estables/materia/${gcrp.id}/sin-grupo?academicYearId=${year.id}`).set(como(profeCostura, UserRole.TEACHER)).expect(403);

        await api().post(`/api/grupos-estables/${costura.id}/asignar`).set(como(admin, UserRole.ADMIN)).send({ studentId: beto.id }).expect(200);
        const suya = await prisma.solicitudDeGrupo.findMany({ where: { studentId: beto.id }, orderBy: { createdAt: 'asc' } });
        expect(suya.map((s) => s.estado)).toEqual(['RETIRADA', 'ACEPTADA']);
        expect(suya[1].asignadaPorAdmin).toBe(true);
        await api().post(`/api/grupos-estables/${costura.id}/asignar`).set(como(admin, UserRole.ADMIN)).send({ studentId: beto.id }).expect(409);

        const despues = (await api().get(`/api/grupos-estables/materia/${gcrp.id}/sin-grupo?academicYearId=${year.id}`).set(como(admin, UserRole.ADMIN)).expect(200)).body.data;
        expect(despues.total).toBe(2);
        const losGrupos = (await api().get(`/api/grupos-estables/materia/${gcrp.id}?academicYearId=${year.id}`).set(como(admin, UserRole.ADMIN)).expect(200)).body.data;
        expect(losGrupos.grupos.find((g: any) => g.id === costura.id).aceptados).toBe(1);
    }, 60000);

    it('GRUPO-07: la elección cerrada no deja pedir; por lapso, cada lapso es otro momento', async () => {
        const { costura } = await dosGrupos();
        await reglas({ eleccion: 'ANUAL', abierta: false });
        await pedir(ana, costura.id).expect(409);
        expect((await paraMi(ana).expect(200)).body.data.materias[0].abierta).toBe(false);

        await reglas({ eleccion: 'POR_LAPSO', abierta: true });
        await pedir(ana, costura.id).expect(200);
        const suya = await solicitudDe(ana.id);
        expect(suya!.momento).not.toBe('ANUAL');
        expect(suya!.momento).toBe(
            (await prisma.period.findFirst({ where: { academicYearId: year.id, startDate: { lte: new Date() }, endDate: { gte: new Date() } } }))!.id
        );
        expect(lapso1.id).toBeTruthy();
    }, 60000);
});
