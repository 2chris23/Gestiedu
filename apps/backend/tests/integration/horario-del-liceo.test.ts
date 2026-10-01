import { FastifyInstance } from 'fastify';
import request = require('supertest');
import { PrismaClient } from '@prisma/client';
import { UserRole } from '../../src/utils/prisma-enums';
import {
    createTestServer,
    createTestPrismaClient,
    createTestUser,
    createTestAcademicYear,
    createTestClassroom,
    createTestSubject,
    generateTestToken,
} from '../helpers';
import { platformPrisma } from '../../src/config/database';

/**
 * EL HORARIO DEL LICEO SE GUARDA SOLO SI CUADRA
 *
 * Por turno, el admin pone el inicio, el fin, cuánto dura una hora de clase y
 * los recreos; las horas las cuenta el servidor. Si sobran minutos no se guarda
 * (400, con la hora a la que tendría que acabar), y si hay clases puestas que
 * dejarían de caer en una hora del día, se pregunta antes (409).
 */

const SLUG = 'test-institute';

describe('El horario del liceo, a prueba de errores', () => {
    let server: FastifyInstance;
    let prisma: PrismaClient;
    let tokenAdmin: string;
    let tokenProfe: string;

    const cab = (t: string) => ({ Authorization: `Bearer ${t}`, 'X-Institute-Slug': SLUG });
    const guardar = (t: string, cuerpo: Record<string, unknown>) =>
        request(server.server).put('/api/institutes/current/config').set(cab(t)).send(cuerpo);

    const MANANA = { inicio: '07:00', fin: '12:30', duracion: 45, recreos: [{ despuesDe: 3, minutos: 15 }] };
    const TARDE = { inicio: '13:00', fin: '18:30', duracion: 45, recreos: [{ despuesDe: 3, minutos: 15 }] };

    beforeAll(async () => {
        server = await createTestServer();
        prisma = await createTestPrismaClient();
        await platformPrisma.institute.update({ where: { id: 'institute' }, data: { academicConfig: {} } });

        const admin = (await createTestUser(prisma, UserRole.ADMIN)).user;
        const profe = (await createTestUser(prisma, UserRole.TEACHER)).user;
        tokenAdmin = generateTestToken(admin.id, UserRole.ADMIN, 'institute');
        tokenProfe = generateTestToken(profe.id, UserRole.TEACHER, 'institute');

        // Una clase puesta en la 7ma hora de la mañana (11:45–12:30).
        const year = await createTestAcademicYear(prisma, 'institute');
        const seccion = await createTestClassroom(prisma, year.id, 'institute');
        const materia = await createTestSubject(prisma, 'institute');
        const cs = await prisma.classroomSubject.create({
            data: { classroomId: seccion.id, subjectId: materia.id, teacherId: profe.id },
        });
        await prisma.scheduleBlock.create({
            data: {
                classroomId: seccion.id,
                classroomSubjectId: cs.id,
                dayOfWeek: 1,
                startTime: '11:45',
                endTime: '12:30',
                blockType: 'CLASS',
            } as any,
        });
    }, 120000);

    afterAll(async () => {
        await platformPrisma.institute.update({ where: { id: 'institute' }, data: { academicConfig: {} } }).catch(() => {});
        await prisma?.$disconnect();
        await server?.close();
    });

    it('HORARIO-API-01: horas de 40 min hasta las 12:30 no se guardan; se dice cuánto sobra', async () => {
        const res = await guardar(tokenAdmin, {
            configuration: { schedule: { turnos: { MANANA: { ...MANANA, duracion: 40 }, TARDE } } },
        });
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('HORARIO_NO_CUADRA');
        expect(res.body.error).toContain('sobran 35 min');
    });

    it('HORARIO-API-02: por el otro camino (academicConfig) tampoco entra un horario que no cuadra', async () => {
        const res = await guardar(tokenAdmin, {
            academicConfig: { schedule: { turnos: { MANANA, TARDE: { ...TARDE, inicio: '12:00', fin: '17:30' } } } },
        });
        expect(res.status).toBe(400);
        expect(res.body.error).toContain('antes de que acabe la mañana');
    });

    it('HORARIO-API-03: si una clase puesta se queda fuera, pregunta (409); confirmado, se guarda', async () => {
        // Acabar a las 11:45 deja fuera la 7ma hora, donde hay una clase.
        const corto = { turnos: { MANANA: { ...MANANA, fin: '11:45' }, TARDE } };
        const sinConfirmar = await guardar(tokenAdmin, { configuration: { schedule: corto } });
        expect(sinConfirmar.status).toBe(409);
        expect(sinConfirmar.body.code).toBe('HORARIO_DEJA_CLASES_FUERA');
        expect(sinConfirmar.body.cuantas).toBe(1);

        const confirmado = await guardar(tokenAdmin, { configuration: { schedule: corto, confirmarClasesFuera: true } });
        expect(confirmado.status).toBe(200);
        const guardado: any = (await platformPrisma.institute.findUnique({ where: { id: 'institute' } }))?.academicConfig;
        expect(guardado.schedule.turnos.MANANA.fin).toBe('11:45');
        // La forma vieja, rellena con la mañana: 6 horas.
        expect(guardado.schedule.totalBlocks).toBe(6);
    });

    it('HORARIO-API-04: volver al horario de antes no pregunta nada (la clase vuelve a caber)', async () => {
        const res = await guardar(tokenAdmin, { configuration: { schedule: { turnos: { MANANA, TARDE } } } });
        expect(res.status).toBe(200);
    });

    it('HORARIO-API-05: guardar otra cosa con el mismo horario no pregunta nada', async () => {
        const res = await guardar(tokenAdmin, {
            configuration: { asistenciaMinima: 75, schedule: { turnos: { MANANA, TARDE } } },
        });
        expect(res.status).toBe(200);
    });

    it('HORARIO-API-06: un profesor no cambia el horario del liceo', async () => {
        const res = await guardar(tokenProfe, { configuration: { schedule: { turnos: { MANANA, TARDE } } } });
        expect(res.status).toBe(403);
    });
});
