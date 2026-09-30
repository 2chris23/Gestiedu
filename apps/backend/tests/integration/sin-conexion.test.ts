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
import { plantillaDe } from '../../src/utils/instrumentos';
import { choquesDeNotas, huellaDelInstrumento } from '../../src/services/cambios-sin-conexion.service';
import { cierraElCambio } from '../../src/plugins/cambios-sin-conexion';

/**
 * LO HECHO SIN CONEXIÓN, QUE LLEGA TARDE (SINCON-*, 2026-09-30)
 *
 * Cristian lo pidió como WhatsApp: se trabaja sin señal y se envía al volver.
 * Y decidió qué pasa cuando choca con lo que hizo otro mientras tanto:
 *
 *   SINCON-01  el mismo cambio (X-Cambio) dos veces se aplica UNA vez; el número de otro, no
 *   SINCON-02  crear con el id del teléfono; repetido → 409; mal formado → 400
 *   SINCON-03  la misma nota tocada por dos: queda la primera; al segundo se le pregunta
 *   SINCON-04  borrar con notas que no se vieron → se pregunta; «borrar igual» avisa al profesor
 *   SINCON-05  notas a una actividad ya borrada → espera; quien la borró la recupera (o no)
 *   SINCON-06  marcas de un instrumento que se cambió → decide quien lo cambió
 *   SINCON-07  cambiar el instrumento con notas que no se vieron → se pregunta; «cambiar» las borra
 *   SINCON-08  asistencia cambiada por otro mientras tanto → se pregunta; «solo si no hay» no choca
 *   SINCON-09  una clase de un día que no ha llegado no se guarda
 *   SINCON-10  el alumno no escribe nada, venga como venga
 */

const SLUG = 'test-institute';

describe('Sin conexión: las cuentas (SINCON)', () => {
    it('la misma nota: choca solo si la de ahora no es la que se vio ni la que se quiere', () => {
        const ahora = { ana: 15, beto: 12, caro: 18 };
        const choques = choquesDeNotas(ahora, { ana: { usuarioId: 'admin' } }, { ana: 18, beto: 14, caro: 18 }, { ana: null, beto: 12, caro: null });
        expect(choques).toEqual([{ studentId: 'ana', antes: null, ahora: 15, tuya: 18, quien: 'admin', cuando: null }]);
        expect(choquesDeNotas(ahora, null, { ana: 18 }, undefined)).toEqual([]); // en línea, como siempre
    });

    it('el instrumento se reconoce por su contenido, no por el orden de sus llaves', () => {
        expect(huellaDelInstrumento({ tipo: 'COTEJO', criterios: [{ id: 'a', puntos: 2 }] })).toBe(huellaDelInstrumento({ criterios: [{ puntos: 2, id: 'a' }], tipo: 'COTEJO' }));
        expect(huellaDelInstrumento(plantillaDe('COTEJO'))).not.toBe(huellaDelInstrumento(plantillaDe('ESCALA')));
    });

    it('lo que queda por decidir no cierra el cambio', () => {
        expect(cierraElCambio(200)).toBe(true);
        expect(cierraElCambio(202)).toBe(true);
        expect(cierraElCambio(403)).toBe(true);
        expect(cierraElCambio(409)).toBe(false);
        expect(cierraElCambio(401)).toBe(false);
        expect(cierraElCambio(500)).toBe(false);
    });
});

describe('Sin conexión: contra el servidor (SINCON-01…10)', () => {
    let server: FastifyInstance;
    let prisma: PrismaClient;
    let seccion: any, materia: any, fila: any;
    let admin: any, profe: any, ana: any, beto: any;
    const cab = (u: any, rol: UserRole) => ({ Authorization: `Bearer ${generateTestToken(u.id, rol, 'institute')}`, 'X-Institute-Slug': SLUG });
    const api = () => request(server.server);
    const actividad = (extra: any = {}) =>
        prisma.classActivity.create({ data: { classroomId: seccion.id, subjectId: materia.id, title: 'Taller 2', target: 'CURRENT', scores: {}, ...extra } });
    const notas = (id: string, cuerpo: any, quien = profe, rol: UserRole = UserRole.TEACHER, cambio?: string) => {
        const r = api().post(`/api/sessions/activities/${id}/grades`).set(cab(quien, rol));
        if (cambio) r.set('X-Cambio', cambio);
        return r.send(cuerpo);
    };
    const hoy = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas' }).format(new Date());

    beforeAll(async () => {
        server = await createTestServer();
        prisma = await createTestPrismaClient();
    }, 120000);
    afterAll(async () => {
        await prisma.$disconnect();
        await server.close();
    });
    beforeEach(async () => {
        await prisma.cambioEnEspera.deleteMany();
        await prisma.cambioRecibido.deleteMany();
        await prisma.registroBorrado.deleteMany();
        await prisma.classActivity.deleteMany();
        await prisma.instrumentoDeEvaluacion.deleteMany();
        await prisma.evaluationPlanRow.deleteMany();
        await prisma.dailyAttendance.deleteMany();
        await prisma.classSession.deleteMany();
        await cleanTestDatabase(prisma);
        await RedisCache.clearPattern('*').catch(() => undefined);
        admin = (await createTestUser(prisma, UserRole.ADMIN)).user;
        const year = await createTestAcademicYear(prisma, 'institute');
        seccion = await createTestClassroom(prisma, year.id, 'institute');
        materia = await createTestSubject(prisma, 'institute');
        profe = (await createTestUser(prisma, UserRole.TEACHER)).user;
        ana = (await createTestUser(prisma, UserRole.STUDENT)).user;
        beto = (await createTestUser(prisma, UserRole.STUDENT)).user;
        await prisma.classroomSubject.create({ data: { classroomId: seccion.id, subjectId: materia.id, teacherId: profe.id } });
        for (const a of [ana, beto]) await prisma.studentClassroom.create({ data: { studentId: a.id, classroomId: seccion.id, academicYearId: year.id, isActive: true } });
        fila = await prisma.evaluationPlanRow.create({
            data: { classroomId: seccion.id, subjectId: materia.id, lapso: '1', rowType: 'EVALUATION', weekNumber: 3, orderIndex: 3, actividadEval: 'Cuaderno', puntos: 5 },
        });
    });

    it('SINCON-01: el mismo cambio dos veces se aplica una; con el número de otro, no', async () => {
        const cuerpo = { classroomId: seccion.id, subjectId: materia.id, title: 'Hecha sin conexión', target: 'CURRENT' };
        const r1 = await api().post('/api/sessions/activities').set(cab(profe, UserRole.TEACHER)).set('X-Cambio', 'cambio-uno-0001').send(cuerpo).expect(201);
        const r2 = await api().post('/api/sessions/activities').set(cab(profe, UserRole.TEACHER)).set('X-Cambio', 'cambio-uno-0001').send(cuerpo).expect(201);
        expect(r2.headers['x-cambio']).toBe('repetido');
        expect(r2.body.activity.id).toBe(r1.body.activity.id);
        expect(await prisma.classActivity.count({ where: { title: 'Hecha sin conexión' } })).toBe(1);

        const ajeno = await api().post('/api/sessions/activities').set(cab(admin, UserRole.ADMIN)).set('X-Cambio', 'cambio-uno-0001').send(cuerpo).expect(409);
        expect(ajeno.body.code).toBe('CAMBIO_AJENO');
        await api().post('/api/sessions/activities').set(cab(profe, UserRole.TEACHER)).set('X-Cambio', 'no vale!').send(cuerpo).expect(400);
    });

    it('SINCON-02: la actividad lleva el id que le puso el teléfono', async () => {
        const id = 'tel0000000000000000000001';
        const r = await api()
            .post('/api/sessions/activities')
            .set(cab(profe, UserRole.TEACHER))
            .send({ id, classroomId: seccion.id, subjectId: materia.id, title: 'Del teléfono', target: 'CURRENT' })
            .expect(201);
        expect(r.body.activity.id).toBe(id);
        const otra = await api().post('/api/sessions/activities').set(cab(profe, UserRole.TEACHER)).send({ id, classroomId: seccion.id, subjectId: materia.id, title: 'Otra' }).expect(409);
        expect(otra.body.code).toBe('ID_EN_USO');
        await api().post('/api/sessions/activities').set(cab(profe, UserRole.TEACHER)).send({ id: 'x', classroomId: seccion.id, subjectId: materia.id, title: 'Mal' }).expect(400);
    });

    it('SINCON-03: la misma nota tocada por dos: queda la primera y al segundo se le pregunta', async () => {
        const a = await actividad();
        // El admin, en línea, le pone 15 a Ana.
        await notas(a.id, { scores: { [ana.id]: 15 } }, admin, UserRole.ADMIN).expect(200);
        // El profesor, sin conexión, le había puesto 18 (cuando no tenía nota) y a Beto 12.
        const r = await notas(a.id, { scores: { [ana.id]: 18, [beto.id]: 12 }, antes: { [ana.id]: null, [beto.id]: null } }, profe, UserRole.TEACHER, 'cambio-tres-001').expect(409);
        expect(r.body).toMatchObject({ code: 'CAMBIO_MIENTRAS_TANTO', que: 'NOTAS' });
        expect(r.body.choques).toEqual([expect.objectContaining({ studentId: ana.id, ahora: 15, tuya: 18, quien: admin.id })]);
        expect(r.body.choques[0].quienNombre).toBeTruthy();
        // Nada se puso: la tanda espera a que elija.
        expect((await prisma.classActivity.findUnique({ where: { id: a.id } }))!.scores).toEqual({ [ana.id]: 15 });

        // Elige la suya: el mismo cambio, ya con la decisión, entra.
        await notas(a.id, { scores: { [ana.id]: 18, [beto.id]: 12 }, antes: { [ana.id]: null, [beto.id]: null }, decision: 'la-mia' }, profe, UserRole.TEACHER, 'cambio-tres-001').expect(200);
        const g = await prisma.classActivity.findUnique({ where: { id: a.id } });
        expect(g!.scores).toEqual({ [ana.id]: 18, [beto.id]: 12 });
        expect((g!.notasPuestasPor as any)[ana.id].usuarioId).toBe(profe.id);
    });

    it('SINCON-04: borrar con notas que no se vieron se pregunta; «borrar igual» avisa a quien las puso', async () => {
        const a = await actividad();
        await notas(a.id, { scores: { [ana.id]: 17, [beto.id]: 14 } }).expect(200);
        // El admin la borró sin conexión cuando no tenía notas (vio 0).
        const r = await api().delete(`/api/sessions/activities/${a.id}?notasVistas=0`).set(cab(admin, UserRole.ADMIN)).set('X-Cambio', 'cambio-cuatro-01').expect(409);
        expect(r.body).toMatchObject({ code: 'CAMBIO_MIENTRAS_TANTO', que: 'NOTAS_NUEVAS', notas: 2, notasVistas: 0 });
        expect(r.body.quienes).toHaveLength(1);
        expect(await prisma.classActivity.count({ where: { id: a.id } })).toBe(1);

        await api().delete(`/api/sessions/activities/${a.id}?notasVistas=0&decision=borrar`).set(cab(admin, UserRole.ADMIN)).set('X-Cambio', 'cambio-cuatro-01').expect(200);
        expect(await prisma.classActivity.count({ where: { id: a.id } })).toBe(0);
        expect(await prisma.registroBorrado.count({ where: { tabla: 'classActivity', registroId: a.id } })).toBe(1);
        expect(await prisma.notification.count({ where: { recipientId: profe.id, title: { contains: 'Taller 2' } } })).toBe(1);
    });

    it('SINCON-05: notas a una actividad que otro borró: esperan; quien la borró decide', async () => {
        const a = await actividad();
        await api().delete(`/api/sessions/activities/${a.id}`).set(cab(admin, UserRole.ADMIN)).expect(200);

        const r = await notas(a.id, { scores: { [ana.id]: 16 }, antes: { [ana.id]: null } }, profe, UserRole.TEACHER, 'cambio-cinco-01').expect(202);
        expect(r.body).toMatchObject({ code: 'EN_ESPERA' });
        const lista = await api().get('/api/cambios-en-espera').set(cab(admin, UserRole.ADMIN)).expect(200);
        expect(lista.body.porDecidir).toHaveLength(1);
        expect(lista.body.porDecidir[0]).toMatchObject({ tipo: 'NOTAS_A_ACTIVIDAD_BORRADA', objetivo: a.id, autorId: profe.id });
        expect(await prisma.notification.count({ where: { recipientId: admin.id, type: 'POR_DECIDIR' } })).toBe(1);
        // El profesor no decide lo que decide el admin.
        await api().post(`/api/cambios-en-espera/${r.body.esperaId}/decidir`).set(cab(profe, UserRole.TEACHER)).send({ decision: 'recuperar' }).expect(403);

        await api().post(`/api/cambios-en-espera/${r.body.esperaId}/decidir`).set(cab(admin, UserRole.ADMIN)).send({ decision: 'recuperar' }).expect(200);
        const vuelta = await prisma.classActivity.findUnique({ where: { id: a.id } });
        expect(vuelta!.title).toBe('Taller 2');
        expect(vuelta!.scores).toEqual({ [ana.id]: 16 });
        expect(await prisma.notification.count({ where: { recipientId: profe.id, title: 'Se decidió un cambio tuyo' } })).toBe(1);

        // Y «dejarla borrada»: no vuelve.
        const b = await actividad({ title: 'Taller 3' });
        await api().delete(`/api/sessions/activities/${b.id}`).set(cab(admin, UserRole.ADMIN)).expect(200);
        const r2 = await notas(b.id, { scores: { [ana.id]: 10 }, antes: { [ana.id]: null } }, profe, UserRole.TEACHER, 'cambio-cinco-02').expect(202);
        await api().post(`/api/cambios-en-espera/${r2.body.esperaId}/decidir`).set(cab(admin, UserRole.ADMIN)).send({ decision: 'dejar' }).expect(200);
        expect(await prisma.classActivity.count({ where: { id: b.id } })).toBe(0);
    });

    it('SINCON-06: marcas con la lista de cotejo tras cambiarla a escala: decide quien la cambió', async () => {
        const cotejo = plantillaDe('COTEJO');
        await api().put(`/api/evaluation-plan/rows/${fila.id}/instrumento`).set(cab(profe, UserRole.TEACHER)).send({ definicion: cotejo }).expect(200);
        const a = await actividad({ planRowId: fila.id, instrumento: cotejo as any, maxScore: 20 });
        // El admin la cambia a escala (en línea); la actividad, sin notas, la sigue.
        await api().put(`/api/evaluation-plan/rows/${fila.id}/instrumento`).set(cab(admin, UserRole.ADMIN)).send({ definicion: plantillaDe('ESCALA') }).expect(200);

        const marcas = { [ana.id]: { c1: true, c2: true, c3: true, c4: true, c5: false } };
        const r = await api()
            .post(`/api/sessions/activities/${a.id}/instrumento`)
            .set(cab(profe, UserRole.TEACHER))
            .set('X-Cambio', 'cambio-seis-001')
            .send({ marcas, instrumento: cotejo })
            .expect(202);
        expect(r.body.code).toBe('EN_ESPERA');
        const espera = await prisma.cambioEnEspera.findUnique({ where: { id: r.body.esperaId } });
        expect(espera).toMatchObject({ tipo: 'MARCAS_CON_OTRO_INSTRUMENTO', decideId: admin.id });

        // «No, que se quede la lista de cotejo»: vuelve, con las notas del profesor.
        await api().post(`/api/cambios-en-espera/${r.body.esperaId}/decidir`).set(cab(admin, UserRole.ADMIN)).send({ decision: 'anterior' }).expect(200);
        const inst = await prisma.instrumentoDeEvaluacion.findUnique({ where: { planRowId: fila.id } });
        expect(inst!.tipo).toBe('COTEJO');
        const g = await prisma.classActivity.findUnique({ where: { id: a.id } });
        expect(g!.scores).toEqual({ [ana.id]: 17 });
        expect((g!.instrumento as any).tipo).toBe('COTEJO');
    });

    it('SINCON-06b: «sí, la escala»: las marcas de la lista no se ponen y se avisa al profesor', async () => {
        const cotejo = plantillaDe('COTEJO');
        await api().put(`/api/evaluation-plan/rows/${fila.id}/instrumento`).set(cab(profe, UserRole.TEACHER)).send({ definicion: cotejo }).expect(200);
        const a = await actividad({ planRowId: fila.id, instrumento: cotejo as any, maxScore: 20 });
        await api().put(`/api/evaluation-plan/rows/${fila.id}/instrumento`).set(cab(admin, UserRole.ADMIN)).send({ definicion: plantillaDe('ESCALA') }).expect(200);
        const r = await api()
            .post(`/api/sessions/activities/${a.id}/instrumento`)
            .set(cab(profe, UserRole.TEACHER))
            .send({ marcas: { [ana.id]: { c1: true } }, instrumento: cotejo })
            .expect(202);
        await api().post(`/api/cambios-en-espera/${r.body.esperaId}/decidir`).set(cab(admin, UserRole.ADMIN)).send({ decision: 'nuevo' }).expect(200);
        const g = await prisma.classActivity.findUnique({ where: { id: a.id } });
        expect(g!.scores).toEqual({});
        expect((g!.instrumento as any).tipo).toBe('ESCALA');
        const aviso = await prisma.notification.findFirst({ where: { recipientId: profe.id, title: 'Se decidió un cambio tuyo' } });
        expect(aviso!.message).toMatch(/Vuelve a calificarla/);
    });

    it('SINCON-07: cambiar el instrumento con notas que no se vieron: se pregunta; «cambiar» las borra con copia', async () => {
        const cotejo = plantillaDe('COTEJO');
        await api().put(`/api/evaluation-plan/rows/${fila.id}/instrumento`).set(cab(profe, UserRole.TEACHER)).send({ definicion: cotejo }).expect(200);
        const a = await actividad({ planRowId: fila.id, instrumento: cotejo as any, maxScore: 20 });
        await api().post(`/api/sessions/activities/${a.id}/instrumento`).set(cab(profe, UserRole.TEACHER)).send({ marcas: { [ana.id]: { c1: true } } }).expect(200);

        const r = await api()
            .put(`/api/evaluation-plan/rows/${fila.id}/instrumento`)
            .set(cab(admin, UserRole.ADMIN))
            .send({ definicion: plantillaDe('ESCALA'), notasVistas: 0 })
            .expect(409);
        expect(r.body).toMatchObject({ code: 'CAMBIO_MIENTRAS_TANTO', que: 'NOTAS_CON_EL_INSTRUMENTO', notas: 1, anterior: 'COTEJO' });

        await api().put(`/api/evaluation-plan/rows/${fila.id}/instrumento`).set(cab(admin, UserRole.ADMIN)).send({ definicion: plantillaDe('ESCALA'), notasVistas: 0, decision: 'dejar' }).expect(200);
        expect((await prisma.instrumentoDeEvaluacion.findUnique({ where: { planRowId: fila.id } }))!.tipo).toBe('COTEJO');

        await api().put(`/api/evaluation-plan/rows/${fila.id}/instrumento`).set(cab(admin, UserRole.ADMIN)).send({ definicion: plantillaDe('ESCALA'), notasVistas: 0, decision: 'cambiar' }).expect(200);
        const g = await prisma.classActivity.findUnique({ where: { id: a.id } });
        expect(g!.scores).toEqual({});
        expect((g!.instrumento as any).tipo).toBe('ESCALA');
        expect(await prisma.registroBorrado.count({ where: { tabla: 'classActivity', registroId: a.id } })).toBe(1);
    });

    it('SINCON-08: la asistencia que otro cambió mientras tanto se pregunta; «solo si no hay» no choca', async () => {
        const base = { classroomId: seccion.id, subjectId: materia.id, date: hoy() };
        await api().post('/api/sessions/live-save').set(cab(admin, UserRole.ADMIN)).send({ ...base, attendances: [{ studentId: ana.id, status: 'ABSENT' }] }).expect(200);
        const r = await api()
            .post('/api/sessions/live-save')
            .set(cab(profe, UserRole.TEACHER))
            .set('X-Cambio', 'cambio-ocho-001')
            .send({ ...base, attendances: [{ studentId: ana.id, status: 'PRESENT', antes: null }, { studentId: beto.id, status: 'PRESENT', soloSiNoHay: true }] })
            .expect(409);
        expect(r.body).toMatchObject({ code: 'CAMBIO_MIENTRAS_TANTO', que: 'ASISTENCIA' });
        expect(r.body.choques).toEqual([expect.objectContaining({ studentId: ana.id, ahora: 'ABSENT', tuya: 'PRESENT' })]);

        await api()
            .post('/api/sessions/live-save')
            .set(cab(profe, UserRole.TEACHER))
            .set('X-Cambio', 'cambio-ocho-001')
            .send({ ...base, decision: 'la-mia', attendances: [{ studentId: ana.id, status: 'PRESENT', antes: null }, { studentId: beto.id, status: 'PRESENT', soloSiNoHay: true }] })
            .expect(200);
        const fila = await prisma.dailyAttendance.findFirst({ where: { studentId: ana.id } });
        expect(fila!.status).toBe('PRESENT');
        expect(fila!.modificadoPorId).toBe(profe.id);
    });

    it('SINCON-09: una clase de un día que no ha llegado no se guarda', async () => {
        const r = await api()
            .post('/api/sessions/live-save')
            .set(cab(profe, UserRole.TEACHER))
            .send({ classroomId: seccion.id, subjectId: materia.id, date: '2099-01-10', attendances: [] })
            .expect(400);
        expect(r.body.code).toBe('FUTURE_DATE');
    });

    it('SINCON-10: el alumno no escribe nada, venga como venga', async () => {
        const a = await actividad();
        await notas(a.id, { scores: { [ana.id]: 20 } }, ana, UserRole.STUDENT, 'cambio-diez-0001').expect(403);
        await api().get('/api/cambios-en-espera').set(cab(ana, UserRole.STUDENT)).expect(403);
        expect(await prisma.cambioRecibido.count()).toBe(0);
    });
});
