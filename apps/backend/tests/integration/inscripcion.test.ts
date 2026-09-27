import { FastifyInstance } from 'fastify';
import request = require('supertest');
import { PrismaClient } from '@prisma/client';
import { createId } from '@paralleldrive/cuid2';
import { UserRole } from '../../src/utils/prisma-enums';
import { createTestServer, createTestPrismaClient, cleanTestDatabase, createTestUser, generateTestToken } from '../helpers';
import { platformPrisma } from '../../src/config/database';
import { RedisCache } from '../../src/config/redis';

/**
 * CREAR CON LO MÍNIMO; LO DEMÁS, EN LA FICHA
 *
 *   CREAR-01  una cuenta se crea con nombre, apellido, correo, cédula,
 *             contraseña, rol y sexo; sin cédula, 400 claro (antes, 500);
 *   REC-01    los recaudos del liceo: los de siempre, los suyos, y volver;
 *   REC-02    marcar y desmarcar lo entregado (desmarcar guarda copia); un
 *             recaudo que no está en la lista, 404; solo el admin;
 *   REC-03    «les falta algo»: la lista de usuarios filtra a quien le falta
 *             un dato para el Ministerio o un recaudo;
 *   REC-04    la planilla de inscripción, con sus datos, su representante,
 *             lo entregado y la declaración de la plantilla del liceo.
 */

const SLUG = 'test-institute';
const gId = () => `c${createId()}`;
const dia = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);

describe('La inscripción sin castigar al liceo (CREAR-01, REC-01…04)', () => {
    let server: FastifyInstance;
    let prisma: PrismaClient;
    let admin: any;
    let profe: any;
    let mama: any;
    let completo: any;
    let aMedias: any;

    const como = (u: any, role: UserRole) => ({
        Authorization: `Bearer ${generateTestToken(u.id, role, 'institute')}`,
        'X-Institute-Slug': SLUG,
    });
    const api = () => request(server.server);
    const comoAdmin = () => como(admin, UserRole.ADMIN);

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
        mama = (await createTestUser(prisma, UserRole.TUTOR, { firstName: 'Rosa', lastName: 'Páez', phone: '0414-5550000' })).user;
        const datos = {
            birthDate: dia('2012-05-04'),
            gender: 'FEMENINO',
            nacionalidad: 'V',
            lugarDeNacimiento: 'Valencia',
            entidadDeNacimiento: 'Carabobo',
        };
        completo = (await createTestUser(prisma, UserRole.STUDENT, { firstName: 'Ana', lastName: 'Páez', ...datos })).user;
        aMedias = (await createTestUser(prisma, UserRole.STUDENT, { firstName: 'Beto', lastName: 'Ruiz' })).user;
        await prisma.studentTutor.create({ data: { studentId: completo.id, tutorId: mama.id, relationship: 'MADRE' } });
        const year = await prisma.academicYear.create({
            data: { id: gId(), name: '2026-2027', startDate: dia('2026-09-14'), endDate: dia('2027-07-31'), status: 'ACTIVE', isActive: true, instituteId: 'institute' } as any,
        });
        const aula = await prisma.classroom.create({
            data: { id: gId(), name: '1º A', slug: `aula-${gId()}`, grade: 1, section: 'A', academicYearId: year.id, instituteId: 'institute' } as any,
        });
        await prisma.studentClassroom.create({ data: { studentId: completo.id, classroomId: aula.id, academicYearId: year.id } });
    });

    it('CREAR-01: se crea con los siete datos; sin cédula, 400 y no un 500', async () => {
        const base = { email: `nuevo.${gId()}@testing.edu.ve`, firstName: 'Carla', lastName: 'Mora', role: 'STUDENT', gender: 'FEMENINO', password: 'Clave-segura-1' };
        const sin = await api().post('/api/users').set(comoAdmin()).send(base);
        expect(sin.status).toBe(400);
        expect(sin.body.code).toBe('CEDULA_REQUERIDA');

        const cedula = `V${Date.now()}`.slice(0, 12);
        const con = await api().post('/api/users').set(comoAdmin()).send({ ...base, id: cedula });
        expect(con.status).toBe(201);
        const creada = await prisma.user.findUnique({ where: { id: cedula } });
        expect(creada).toMatchObject({ firstName: 'Carla', gender: 'FEMENINO', birthDate: null, phone: null, lugarDeNacimiento: null });
    });

    it('REC-01: los recaudos de siempre, los del liceo y volver a los de siempre', async () => {
        const deSiempre = await api().get('/api/institutes/current/recaudos').set(comoAdmin()).expect(200);
        expect(deSiempre.body.data.map((r: any) => r.clave)).toContain('PARTIDA_DE_NACIMIENTO');

        const suyos = await api()
            .put('/api/institutes/current/recaudos')
            .set(comoAdmin())
            .send({ recaudos: [{ nombre: 'Partida de nacimiento' }, { nombre: 'Carpeta marrón con gancho' }] })
            .expect(200);
        expect(suyos.body.data).toEqual([
            { clave: 'PARTIDA_DE_NACIMIENTO', nombre: 'Partida de nacimiento' },
            { clave: 'CARPETA_MARRON_CON_GANCHO', nombre: 'Carpeta marrón con gancho' },
        ]);
        // Repetido o demasiado corto: no se guarda.
        const mal = await api().put('/api/institutes/current/recaudos').set(comoAdmin()).send({ recaudos: [{ nombre: 'Fotos' }, { nombre: 'fotos' }] });
        expect(mal.status).toBe(400);
        expect(mal.body.code).toBe('RECAUDOS_INVALIDOS');
        // El profesor no toca la lista.
        await api().put('/api/institutes/current/recaudos').set(como(profe, UserRole.TEACHER)).send({ recaudos: [] }).expect(403);

        await api().delete('/api/institutes/current/recaudos').set(comoAdmin()).expect(200);
        const otraVez = await api().get('/api/institutes/current/recaudos').set(comoAdmin()).expect(200);
        expect(otraVez.body.data).toEqual(deSiempre.body.data);
    });

    it('REC-02: marcar y desmarcar lo entregado; desmarcar guarda copia; solo el admin', async () => {
        const url = `/api/students/${completo.id}/recaudos`;
        const antes = await api().get(url).set(comoAdmin()).expect(200);
        const total = antes.body.data.recaudos.length;
        expect(antes.body.data.faltan).toBe(total);

        const marcado = await api().put(`${url}/FOTOS`).set(comoAdmin()).send({ entregado: true }).expect(200);
        expect(marcado.body.data.faltan).toBe(total - 1);
        expect(marcado.body.data.recaudos.find((r: any) => r.clave === 'FOTOS')).toMatchObject({ entregado: true });
        // Marcar dos veces no duplica.
        await api().put(`${url}/FOTOS`).set(comoAdmin()).send({ entregado: true }).expect(200);
        expect(await prisma.recaudoEntregado.count({ where: { studentId: completo.id } })).toBe(1);

        await api().put(`${url}/FOTOS`).set(comoAdmin()).send({ entregado: false }).expect(200);
        expect(await prisma.recaudoEntregado.count({ where: { studentId: completo.id } })).toBe(0);
        expect(await prisma.registroBorrado.count({ where: { tabla: 'recaudoEntregado' } })).toBe(1);

        const raro = await api().put(`${url}/NO_EXISTE`).set(comoAdmin()).send({ entregado: true });
        expect(raro.status).toBe(404);
        expect(raro.body.code).toBe('RECAUDO_DESCONOCIDO');

        await api().put(`${url}/FOTOS`).set(como(profe, UserRole.TEACHER)).send({ entregado: true }).expect(403);
        await api().get(url).set(como(completo, UserRole.STUDENT)).expect(403);
        await api().get(url).set(como(mama, UserRole.TUTOR)).expect(403);
    });

    it('REC-03: «les falta algo» filtra a quien le falta un dato o un recaudo', async () => {
        const nombres = async () =>
            (await api().get('/api/users?faltan=true&limit=50').set(comoAdmin()).expect(200)).body.users.map((u: any) => u.firstName).sort();
        // A los dos les faltan recaudos; a Beto, además, los datos.
        expect(await nombres()).toEqual(['Ana', 'Beto']);

        await api().put('/api/institutes/current/recaudos').set(comoAdmin()).send({ recaudos: [{ nombre: 'Fotos tipo carnet' }] }).expect(200);
        await api().put(`/api/students/${completo.id}/recaudos/FOTOS_TIPO_CARNET`).set(comoAdmin()).send({ entregado: true }).expect(200);
        // Ana tiene sus datos y su único recaudo: ya no le falta nada.
        expect(await nombres()).toEqual(['Beto']);

        const ficha = await api().get(`/api/students/${aMedias.id}/recaudos`).set(comoAdmin()).expect(200);
        expect(ficha.body.data.falta).toEqual(['fecha de nacimiento', 'sexo', 'nacionalidad', 'lugar de nacimiento', 'entidad de nacimiento', '1 recaudo']);
    });

    it('REC-04: la planilla de inscripción, con su representante y la declaración', async () => {
        await api().put(`/api/students/${completo.id}/recaudos/PARTIDA_DE_NACIMIENTO`).set(comoAdmin()).send({ entregado: true }).expect(200);
        const r = await api().get(`/api/students/${completo.id}/planilla-de-inscripcion`).set(comoAdmin()).expect(200);
        const p = r.body.data;
        expect(p.alumno).toMatchObject({ nombres: 'Ana', apellidos: 'Páez', sexo: 'Femenino', fechaDeNacimiento: '2012-05-04', lugarDeNacimiento: 'Valencia' });
        expect(p.seccion).toMatchObject({ grado: 1, seccion: 'A' });
        expect(p.representantes).toEqual([expect.objectContaining({ nombre: 'Rosa Páez', parentesco: 'MADRE', cedula: mama.id })]);
        expect(p.recaudos.find((x: any) => x.clave === 'PARTIDA_DE_NACIMIENTO').entregado).toBe(true);
        expect(p.declaracion.join(' ')).toContain(`Yo, Rosa Páez, titular de la cédula de identidad ${mama.id}, representante del (la) estudiante Ana Páez`);

        await api().get(`/api/students/${completo.id}/planilla-de-inscripcion`).set(como(mama, UserRole.TUTOR)).expect(403);
        await api().get(`/api/students/${profe.id}/planilla-de-inscripcion`).set(comoAdmin()).expect(404);
    });
});
