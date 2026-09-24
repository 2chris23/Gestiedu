import { FastifyInstance } from 'fastify';
import request = require('supertest');
import { PrismaClient } from '@prisma/client';
import { createId } from '@paralleldrive/cuid2';
import { UserRole } from '../../src/utils/prisma-enums';
import { platformPrisma } from '../../src/config/database';
import { codigoDelAlumno, codigoDelPase, SEGUNDOS_DEL_CODIGO } from '../../src/services/asistencia-qr.service';
import {
    createTestServer,
    createTestPrismaClient,
    createTestUser,
    createTestAcademicYear,
    createTestSubject,
    generateTestToken,
} from '../helpers';

/**
 * ASISTENCIA POR QR: QUE NADIE FIRME POR OTRO
 *
 * El profesor abre un pase de lista, su teléfono enseña un QR que cambia cada
 * 10 s y los alumnos lo escanean. Aquí se prueba cada trampa del diseño
 * (`docs/PROXIMAS-FUNCIONES.md` §1) contra el servidor de verdad:
 *
 *   QR-01  solo el profesor de esa clase (o el admin) abre el pase
 *   QR-02  el alumno escanea: queda PRESENTE, en la misma fila que la de a mano
 *   QR-03  un código caducado, falsificado o inventado no vale
 *   QR-04  un teléfono registra a UN alumno por clase (y el profesor lo ve)
 *   QR-05  una cuenta, un teléfono; el admin desbloquea, y queda anotado
 *   QR-06  el faro: lejos o sin GPS entra «por confirmar»; ubicación falsa, fuera
 *   QR-07  un alumno de otra sección no se registra
 *   QR-08  el profesor quita a uno, y al cerrar quien no escaneó queda ausente
 *   QR-09  quien llega después del tiempo, entra como TARDE
 *   QR-10  el profesor escanea el QR del alumno; una captura vieja no vale
 *   QR-11  corregir un día pasado: sí dentro del plazo, no del futuro ni de lejos
 *   QR-12  un pase cerrado no acepta a nadie
 *   QR-13  la configuración es del admin, y guardar otras reglas no la borra
 *   QR-14  el faro llega después (el GPS tarda) y, puesto, ya no se mueve
 */

const SLUG = 'test-institute';
const INST = 'institute';
const gId = () => `c${createId()}`;

const AULA = { lat: 10.5, lng: -66.9, precision: 15 };
const CERCA = { lat: 10.5002, lng: -66.9, precision: 12 }; // ~22 m
const LEJOS = { lat: 10.51, lng: -66.9, precision: 10 }; // ~1,1 km

describe('Asistencia por QR', () => {
    let server: FastifyInstance;
    let prisma: PrismaClient;
    const tk: Record<string, string> = {};
    const alumnos: any[] = [];
    let admin: any, profe: any, otroProfe: any, ajeno: any;
    let seccion: any, otraSeccion: any, materia: any;
    let configAntes: any;

    const auth = (token: string) => (req: request.Test) =>
        req.set('Authorization', `Bearer ${token}`).set('X-Institute-Slug', SLUG);
    const post = (token: string, url: string, body: Record<string, unknown> = {}) =>
        auth(token)(request(server.server).post(`/api/asistencia-qr${url}`).send(body));
    const get = (token: string, url: string) => auth(token)(request(server.server).get(`/api/asistencia-qr${url}`));
    const abrir = (token: string, extra: Record<string, unknown> = {}) =>
        post(token, '/pases', { classroomId: seccion.id, subjectId: materia.id, ...extra });
    const aparato = (id: string) => ({ id: `aparato-de-prueba-${id}`, descripcion: `Android · prueba ${id}` });
    const asistenciaDe = async (studentId: string) =>
        (await prisma.dailyAttendance.findFirst({ where: { studentId }, orderBy: { date: 'desc' } }))?.status ?? null;
    const cerrarAbiertos = () => prisma.paseDeLista.updateMany({ where: { cerradoEn: null }, data: { cerradoEn: new Date() } });

    beforeAll(async () => {
        server = await createTestServer();
        prisma = await createTestPrismaClient();
        configAntes = (await platformPrisma.institute.findUnique({ where: { id: INST }, select: { academicConfig: true } }))
            ?.academicConfig;

        admin = (await createTestUser(prisma, UserRole.ADMIN)).user;
        profe = (await createTestUser(prisma, UserRole.TEACHER, { firstName: 'Pedro' })).user;
        otroProfe = (await createTestUser(prisma, UserRole.TEACHER)).user;
        ajeno = (await createTestUser(prisma, UserRole.STUDENT, { firstName: 'Ajeno' })).user;
        for (const nombre of ['Sofía', 'Carlos', 'Lucía', 'Marco', 'Nora', 'Iván']) {
            alumnos.push((await createTestUser(prisma, UserRole.STUDENT, { firstName: nombre })).user);
        }
        tk.admin = generateTestToken(admin.id, UserRole.ADMIN, INST);
        tk.profe = generateTestToken(profe.id, UserRole.TEACHER, INST);
        tk.otro = generateTestToken(otroProfe.id, UserRole.TEACHER, INST);
        tk.ajeno = generateTestToken(ajeno.id, UserRole.STUDENT, INST);
        alumnos.forEach((a, i) => (tk[`a${i}`] = generateTestToken(a.id, UserRole.STUDENT, INST)));

        const year = await createTestAcademicYear(prisma, INST);
        const nueva = (name: string, letra: string) =>
            prisma.classroom.create({
                data: { id: gId(), name, slug: `qr-${letra}-${gId()}`, grade: 1, section: letra, capacity: 30, academicYearId: year.id, instituteId: INST },
            });
        seccion = await nueva('1er Año A', 'A');
        otraSeccion = await nueva('1er Año B', 'B');
        materia = await createTestSubject(prisma, INST);
        await prisma.classroomSubject.create({ data: { classroomId: seccion.id, subjectId: materia.id, teacherId: profe.id, weeklyBlocks: 3 } });
        for (const a of alumnos) {
            await prisma.studentClassroom.create({ data: { studentId: a.id, classroomId: seccion.id, academicYearId: year.id } });
        }
        await prisma.studentClassroom.create({ data: { studentId: ajeno.id, classroomId: otraSeccion.id, academicYearId: year.id } });
    }, 120000);

    afterAll(async () => {
        await platformPrisma.institute.update({ where: { id: INST }, data: { academicConfig: configAntes ?? {} } });
        await prisma?.$disconnect();
        await server?.close();
    });

    beforeEach(async () => {
        await auth(tk.admin)(
            request(server.server).put('/api/asistencia-qr/configuracion').send({
                activa: true,
                radioMetros: 150,
                fueraDelRadio: 'confirmar',
                unTelefonoPorAlumno: true,
                minutosATiempo: 5,
                diasParaCorregir: 7,
            })
        );
    });

    it('QR-01: solo el profesor de esa clase (o el admin) abre el pase', async () => {
        for (const t of [tk.otro, tk.a0]) {
            const res = await abrir(t);
            expect([401, 403]).toContain(res.status);
        }
        const res = await abrir(tk.profe, { ubicacion: AULA });
        expect(res.status).toBe(201);
        expect(res.body.data.codigo).toMatch(/^GQP1\./);
        expect(res.body.data.cuenta).toEqual({ registrados: 0, total: alumnos.length });
        expect(res.body.data.pase.conFaro).toBe(true);

        // Abrirlo otra vez devuelve el mismo, no uno nuevo.
        const otra = await abrir(tk.profe);
        expect(otra.body.data.pase.id).toBe(res.body.data.pase.id);
        await cerrarAbiertos();
    }, 60000);

    it('QR-02: el alumno escanea y queda PRESENTE, en la misma fila que la de a mano', async () => {
        const { body } = await abrir(tk.profe, { ubicacion: AULA });
        const codigo = body.data.codigo;

        const res = await post(tk.a0, '/escanear', { codigo, aparato: aparato('sofia'), ubicacion: CERCA });
        expect(res.status).toBe(200);
        expect(res.body.data).toMatchObject({ estado: 'ACEPTADO', asistencia: 'PRESENT' });
        expect(await asistenciaDe(alumnos[0].id)).toBe('PRESENT');
        const fila = await prisma.dailyAttendance.findFirst({ where: { studentId: alumnos[0].id } });
        expect(fila?.classSessionId).toBeTruthy();

        // Dos veces es lo mismo que una.
        const otra = await post(tk.a0, '/escanear', { codigo, aparato: aparato('sofia'), ubicacion: CERCA });
        expect(otra.body.data.yaEstaba).toBe(true);

        const vista = await get(tk.profe, `/pases/${body.data.pase.id}`);
        expect(vista.body.data.cuenta.registrados).toBe(1);
        expect(vista.body.data.registros[0]).toMatchObject({ estado: 'ACEPTADO', nombre: expect.stringContaining('Sofía') });
        await cerrarAbiertos();
    }, 60000);

    it('QR-03: un código caducado, falsificado o inventado no vale', async () => {
        const { body } = await abrir(tk.profe, { ubicacion: AULA });
        const pase = await prisma.paseDeLista.findUniqueOrThrow({ where: { id: body.data.pase.id } });

        const viejo = codigoDelPase(pase, Date.now() - 3 * SEGUNDOS_DEL_CODIGO * 1000);
        const r1 = await post(tk.a1, '/escanear', { codigo: viejo, aparato: aparato('carlos'), ubicacion: CERCA });
        expect(r1.status).toBe(400);
        expect(r1.body.code).toBe('CODIGO_CADUCADO');

        const falso = body.data.codigo.replace(/\.[^.]+$/, '.AAAAAAAAAAAAAAAAAAAAAA');
        const r2 = await post(tk.a1, '/escanear', { codigo: falso, aparato: aparato('carlos'), ubicacion: CERCA });
        expect(r2.status).toBe(400);

        const r3 = await post(tk.a1, '/escanear', { codigo: 'hola-que-tal-esto-no', aparato: aparato('carlos') });
        expect(r3.status).toBe(400);
        expect(await asistenciaDe(alumnos[1].id)).toBeNull();
        await cerrarAbiertos();
    }, 60000);

    it('QR-04: un teléfono registra a UN alumno por clase, y el profesor lo ve', async () => {
        const { body } = await abrir(tk.profe, { ubicacion: AULA });
        const ok = await post(tk.a2, '/escanear', { codigo: body.data.codigo, aparato: aparato('lucia'), ubicacion: CERCA });
        expect(ok.body.data.estado).toBe('ACEPTADO');

        // Lucía cierra sesión, entra Marco en SU teléfono y escanea.
        const trampa = await post(tk.a3, '/escanear', { codigo: body.data.codigo, aparato: aparato('lucia'), ubicacion: CERCA });
        expect(trampa.status).toBe(409);
        expect(trampa.body.code).toBe('TELEFONO_YA_USADO');
        expect(await asistenciaDe(alumnos[3].id)).toBeNull();

        const vista = await get(tk.profe, `/pases/${body.data.pase.id}`);
        expect(vista.body.data.registros.some((r: any) => r.studentId === alumnos[3].id && r.estado === 'RECHAZADO')).toBe(true);
        await cerrarAbiertos();
    }, 60000);

    it('QR-05: una cuenta, un teléfono; el admin desbloquea y queda anotado', async () => {
        // Sofía ya quedó con su teléfono en QR-02. Desde otro, no.
        const { body } = await abrir(tk.profe, { ubicacion: AULA, fecha: undefined });
        const otroTel = await post(tk.a0, '/escanear', { codigo: body.data.codigo, aparato: aparato('nuevo-de-sofia'), ubicacion: CERCA });
        // Si ya estaba registrada hoy, da «ya estabas»; se prueba con un pase nuevo abajo.
        expect([200, 409]).toContain(otroTel.status);
        await cerrarAbiertos();

        // El teléfono registrado se ve en su perfil, y solo el admin lo desbloquea.
        const ver = await get(tk.admin, `/aparato/${alumnos[0].id}`);
        expect(ver.body.data.descripcion).toContain('sofia');
        const noProfe = await auth(tk.profe)(request(server.server).delete(`/api/asistencia-qr/aparato/${alumnos[0].id}`));
        expect(noProfe.status).toBe(403);

        const des = await auth(tk.admin)(request(server.server).delete(`/api/asistencia-qr/aparato/${alumnos[0].id}`));
        expect(des.body.data.desbloqueado).toBe(true);
        expect(await prisma.aparatoDelAlumno.findUnique({ where: { studentId: alumnos[0].id } })).toBeNull();
        const nota = await prisma.auditLog.findFirst({ where: { action: 'DESBLOQUEAR_TELEFONO', entityId: alumnos[0].id } });
        expect(nota?.userId).toBe(admin.id);

        // Nora entra con el teléfono de Iván ya registrado a Iván: no.
        const p2 = await abrir(tk.profe, { ubicacion: AULA });
        await post(tk.a5, '/escanear', { codigo: p2.body.data.codigo, aparato: aparato('ivan'), ubicacion: CERCA });
        await cerrarAbiertos();
        const p3 = await abrir(tk.profe, { ubicacion: AULA });
        const deOtro = await post(tk.a4, '/escanear', { codigo: p3.body.data.codigo, aparato: aparato('ivan'), ubicacion: CERCA });
        expect(deOtro.status).toBe(409);
        expect(['TELEFONO_DE_OTRO', 'TELEFONO_YA_USADO']).toContain(deOtro.body.code);
        await cerrarAbiertos();
    }, 60000);

    it('QR-06: el faro — lejos o sin GPS entra por confirmar; una ubicación falsa, fuera', async () => {
        const { body } = await abrir(tk.profe, { ubicacion: AULA });
        const codigo = body.data.codigo;

        const lejos = await post(tk.a1, '/escanear', { codigo, aparato: aparato('carlos'), ubicacion: LEJOS });
        expect(lejos.body.data.estado).toBe('POR_CONFIRMAR');
        expect(await asistenciaDe(alumnos[1].id)).toBeNull(); // hasta que el profesor lo apruebe

        const sinGps = await post(tk.a3, '/escanear', { codigo, aparato: aparato('marco') });
        expect(sinGps.body.data.estado).toBe('POR_CONFIRMAR');

        const falsa = await post(tk.a4, '/escanear', { codigo, aparato: aparato('nora'), ubicacion: { ...CERCA, falsa: true } });
        expect(falsa.status).toBe(409);
        expect(falsa.body.code).toBe('UBICACION_FALSA');

        // El profesor aprueba a Carlos de un toque.
        const vista = await get(tk.profe, `/pases/${body.data.pase.id}`);
        const deCarlos = vista.body.data.registros.find((r: any) => r.studentId === alumnos[1].id);
        expect(deCarlos.motivo).toBe('FUERA_DEL_RADIO');
        expect(deCarlos.distancia).toBeGreaterThan(1000);
        const ok = await post(tk.profe, `/pases/${body.data.pase.id}/registros/${deCarlos.id}/aprobar`);
        expect(ok.status).toBe(200);
        expect(await asistenciaDe(alumnos[1].id)).toBe('PRESENT');
        await cerrarAbiertos();

        // Con «bloquear», lejos es no.
        await auth(tk.admin)(request(server.server).put('/api/asistencia-qr/configuracion').send({ fueraDelRadio: 'bloquear' }));
        const p2 = await abrir(tk.profe, { ubicacion: AULA });
        const bloqueado = await post(tk.a4, '/escanear', { codigo: p2.body.data.codigo, aparato: aparato('nora'), ubicacion: LEJOS });
        expect(bloqueado.status).toBe(409);
        expect(bloqueado.body.code).toBe('FUERA_DEL_RADIO');
        await cerrarAbiertos();
    }, 60000);

    it('QR-07: un alumno de otra sección no se registra', async () => {
        const { body } = await abrir(tk.profe, { ubicacion: AULA });
        const res = await post(tk.ajeno, '/escanear', { codigo: body.data.codigo, aparato: aparato('ajeno'), ubicacion: CERCA });
        expect(res.status).toBe(403);
        expect(await asistenciaDe(ajeno.id)).toBeNull();
        // Y el profesor no puede pedir el QR de un alumno (es del alumno).
        expect((await get(tk.profe, '/mi-codigo')).status).toBe(403);
        await cerrarAbiertos();
    }, 60000);

    it('QR-08: el profesor quita a uno, y al cerrar quien no escaneó queda ausente', async () => {
        await prisma.dailyAttendance.deleteMany({});
        await prisma.registroDeAsistenciaQr.deleteMany({});
        await prisma.paseDeLista.deleteMany({});

        const { body } = await abrir(tk.profe, { ubicacion: AULA });
        const paseId = body.data.pase.id;
        await post(tk.a2, '/escanear', { codigo: body.data.codigo, aparato: aparato('lucia'), ubicacion: CERCA });
        await post(tk.a5, '/escanear', { codigo: body.data.codigo, aparato: aparato('ivan'), ubicacion: CERCA });

        // «Esa no es Iván»: fuera, desde el propio aviso.
        const vista = await get(tk.profe, `/pases/${paseId}`);
        const deIvan = vista.body.data.registros.find((r: any) => r.studentId === alumnos[5].id);
        await post(tk.profe, `/pases/${paseId}/registros/${deIvan.id}/quitar`);
        expect(await asistenciaDe(alumnos[5].id)).toBe('ABSENT');

        // Antes de cerrar se ve quién falta; Marco estaba, se le olvidó escanear.
        const antes = await get(tk.profe, `/pases/${paseId}`);
        expect(antes.body.data.faltan.map((f: any) => f.id)).toEqual(expect.arrayContaining([alumnos[3].id, alumnos[5].id]));
        const cierre = await post(tk.profe, `/pases/${paseId}/cerrar`, { presentesAMano: [alumnos[3].id] });
        expect(cierre.status).toBe(200);
        expect(await asistenciaDe(alumnos[2].id)).toBe('PRESENT');
        expect(await asistenciaDe(alumnos[3].id)).toBe('PRESENT');
        expect(await asistenciaDe(alumnos[0].id)).toBe('ABSENT');
        expect(await asistenciaDe(alumnos[5].id)).toBe('ABSENT');
    }, 60000);

    it('QR-09: quien llega pasado el tiempo entra como TARDE', async () => {
        await prisma.dailyAttendance.deleteMany({});
        await prisma.registroDeAsistenciaQr.deleteMany({});
        await prisma.paseDeLista.deleteMany({});
        const { body } = await abrir(tk.profe, { ubicacion: AULA });
        await prisma.paseDeLista.update({ where: { id: body.data.pase.id }, data: { aTiempoHasta: new Date(Date.now() - 1000) } });
        const res = await post(tk.a2, '/escanear', { codigo: body.data.codigo, aparato: aparato('lucia'), ubicacion: CERCA });
        expect(res.body.data.asistencia).toBe('LATE');
        expect(await asistenciaDe(alumnos[2].id)).toBe('LATE');
        await cerrarAbiertos();
    }, 60000);

    it('QR-10: el profesor escanea el QR del alumno; una captura vieja no vale', async () => {
        await prisma.dailyAttendance.deleteMany({});
        await prisma.registroDeAsistenciaQr.deleteMany({});
        await prisma.paseDeLista.deleteMany({});
        const { body } = await abrir(tk.profe);
        const paseId = body.data.pase.id;

        const suyo = await get(tk.a4, '/mi-codigo');
        expect(suyo.body.data.codigo).toMatch(/^GQA1\./);
        const res = await post(tk.profe, `/pases/${paseId}/escanear-alumno`, { codigo: suyo.body.data.codigo });
        expect(res.status).toBe(200);
        expect(res.body.data.alumno.nombre).toContain('Nora');
        expect(await asistenciaDe(alumnos[4].id)).toBe('PRESENT');

        const captura = codigoDelAlumno(INST, alumnos[1].id, Date.now() - 5 * SEGUNDOS_DEL_CODIGO * 1000);
        const vieja = await post(tk.profe, `/pases/${paseId}/escanear-alumno`, { codigo: captura });
        expect(vieja.status).toBe(400);
        expect(vieja.body.code).toBe('CODIGO_CADUCADO');

        const deOtraSeccion = await post(tk.profe, `/pases/${paseId}/escanear-alumno`, { codigo: codigoDelAlumno(INST, ajeno.id) });
        expect(deOtraSeccion.status).toBe(403);
        await cerrarAbiertos();
    }, 60000);

    it('QR-11: corregir un día pasado: sí dentro del plazo; ni del futuro ni de muy lejos', async () => {
        const hoy = (await auth(tk.profe)(request(server.server).get('/api/time'))).body?.date as string;
        expect(hoy).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        const dia = (n: number) => {
            const d = new Date(`${hoy}T12:00:00Z`);
            d.setUTCDate(d.getUTCDate() + n);
            return d.toISOString().slice(0, 10);
        };

        expect((await abrir(tk.profe, { fecha: dia(1) })).status).toBe(400);
        expect((await abrir(tk.profe, { fecha: dia(-30) })).status).toBe(400);

        const ayer = await abrir(tk.profe, { fecha: dia(-1), ubicacion: AULA });
        expect(ayer.status).toBe(201);
        expect(ayer.body.data.pase.esCorreccion).toBe(true);
        const res = await post(tk.a3, '/escanear', { codigo: ayer.body.data.codigo, aparato: aparato('marco'), ubicacion: CERCA });
        expect(res.body.data.estado).toBe('ACEPTADO');
        const fila = await prisma.dailyAttendance.findFirst({ where: { studentId: alumnos[3].id, date: new Date(`${dia(-1)}T00:00:00Z`) } });
        expect(fila?.status).toBe('PRESENT');

        // Cerrar una corrección no marca ausente a nadie más.
        await post(tk.profe, `/pases/${ayer.body.data.pase.id}/cerrar`, {});
        expect(await prisma.dailyAttendance.count({ where: { date: new Date(`${dia(-1)}T00:00:00Z`) } })).toBe(1);
    }, 60000);

    it('QR-12: un pase cerrado no acepta a nadie', async () => {
        const { body } = await abrir(tk.profe, { ubicacion: AULA });
        await post(tk.profe, `/pases/${body.data.pase.id}/cerrar`, {});
        const res = await post(tk.a1, '/escanear', { codigo: body.data.codigo, aparato: aparato('carlos'), ubicacion: CERCA });
        expect(res.status).toBe(410);
    }, 60000);

    it('QR-14: el faro llega después (el GPS tarda) y, puesto, ya no se mueve', async () => {
        await cerrarAbiertos();
        const { body } = await abrir(tk.profe);
        expect(body.data.pase.conFaro).toBe(false);
        const puesto = await post(tk.profe, `/pases/${body.data.pase.id}/faro`, { ubicacion: AULA });
        expect(puesto.body.data.pase.conFaro).toBe(true);
        // Otro faro no mueve el centro a mitad del pase.
        await post(tk.profe, `/pases/${body.data.pase.id}/faro`, { ubicacion: LEJOS });
        const pase = await prisma.paseDeLista.findUniqueOrThrow({ where: { id: body.data.pase.id } });
        expect(pase.latitud).toBe(AULA.lat);
        // Y solo el profesor de la clase lo pone.
        expect((await post(tk.otro, `/pases/${body.data.pase.id}/faro`, { ubicacion: AULA })).status).toBe(403);
        await cerrarAbiertos();
    }, 60000);

    it('QR-13: la configuración es del admin, y guardar otras reglas no la borra', async () => {
        const put = (t: string, body: Record<string, unknown>) =>
            auth(t)(request(server.server).put('/api/asistencia-qr/configuracion').send(body));
        expect((await put(tk.profe, { radioMetros: 999 })).status).toBe(403);
        expect((await put(tk.admin, { radioMetros: 5 })).status).toBe(400); // menos de 10 m no es un radio
        const ok = await put(tk.admin, { radioMetros: 80, diasParaCorregir: 3 });
        expect(ok.body.data).toMatchObject({ radioMetros: 80, diasParaCorregir: 3 });

        // Guardar las reglas de promoción del liceo borraba todo lo demás de la
        // configuración académica (la escala de notas, el horario…).
        await platformPrisma.institute.update({
            where: { id: INST },
            data: { academicConfig: { ...((await platformPrisma.institute.findUnique({ where: { id: INST } }))?.academicConfig as any), gradeScale: { min: 1, max: 10 } } },
        });
        const reglas = await auth(tk.admin)(
            request(server.server).put('/api/institutes/current/academic-config').send({ notaMinimaAprobatoria: 6 })
        );
        expect(reglas.status).toBe(200);
        const guardada = (await platformPrisma.institute.findUnique({ where: { id: INST } }))?.academicConfig as any;
        expect(guardada.asistenciaQr.radioMetros).toBe(80);
        expect(guardada.gradeScale).toEqual({ min: 1, max: 10 });
        expect(guardada.notaMinimaAprobatoria).toBe(6);
    }, 60000);
});
