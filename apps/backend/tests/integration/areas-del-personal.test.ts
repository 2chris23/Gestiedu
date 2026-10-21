import { FastifyInstance } from 'fastify';
import request = require('supertest');
import { PrismaClient } from '@prisma/client';
import { createId } from '@paralleldrive/cuid2';
import { UserRole } from '../../src/utils/prisma-enums';
import { todayInTimezone } from '../../src/utils/school-time';
import { sumarDias } from '../../src/services/pagos.service';
import { createTestServer, createTestPrismaClient, createTestUser, generateTestToken } from '../helpers';

/**
 * LAS ÁREAS DEL PERSONAL Y LA MENSUALIDAD DE CADA ALUMNO (2026-10-14)
 *
 * Cristian: «en el panel de personal, crea un área como cocina, y añadir
 * personal se le coloca un nombre y listo; los profesores deben quedar como
 * predeterminado siempre». Y al cobrar desde «Ingreso», la tabla de la
 * sección dice cuánto es la mensualidad de cada uno.
 *
 *   AREAS-01  «Profesor» va siempre primero; las creadas se guardan sin
 *             repetir (tampoco «Profesores»), y un cargo de antes sale como área;
 *   AREAS-02  un nombre corto no vale; solo el admin las toca;
 *   MENSUALIDAD-01  el resumen de pagos trae la mensualidad de cada alumno,
 *             con su descuento.
 */

const SLUG = 'test-institute';
const HOY = todayInTimezone();

describe('Áreas del personal', () => {
    let server: FastifyInstance;
    let prisma: PrismaClient;
    const tk: Record<string, string> = {};
    let ana: any, beto: any, ciclo: any;

    const auth = (t: string) => (r: request.Test) => r.set('Authorization', `Bearer ${t}`).set('X-Institute-Slug', SLUG);
    const get = (t: string, url: string) => auth(t)(request(server.server).get(url));
    const put = (t: string, url: string, body: any) => auth(t)(request(server.server).put(url).send(body));
    const post = (t: string, url: string, body: any) => auth(t)(request(server.server).post(url).send(body));

    beforeAll(async () => {
        server = await createTestServer();
        prisma = await createTestPrismaClient();
        const admin = (await createTestUser(prisma, UserRole.ADMIN)).user;
        const profe = (await createTestUser(prisma, UserRole.TEACHER)).user;
        ana = (await createTestUser(prisma, UserRole.STUDENT, { firstName: 'Ana', lastName: 'Arias' })).user;
        beto = (await createTestUser(prisma, UserRole.STUDENT, { firstName: 'Beto', lastName: 'Bello' })).user;
        tk.admin = generateTestToken(admin.id, UserRole.ADMIN, 'institute');
        tk.profe = generateTestToken(profe.id, UserRole.TEACHER, 'institute');

        await prisma.academicYear.updateMany({ where: { status: 'ACTIVE' as any }, data: { status: 'COMPLETED' as any, isActive: false } });
        ciclo = await prisma.academicYear.create({
            data: {
                id: `c${createId()}`, name: `Areas-${createId().slice(0, 6)}`, status: 'ACTIVE' as any, isActive: true,
                startDate: new Date(`${sumarDias(HOY, -60)}T00:00:00Z`),
                endDate: new Date(`${sumarDias(HOY, 300)}T00:00:00Z`),
                instituteId: 'institute',
            },
        });
        const seccion = await prisma.classroom.create({
            data: { id: `c${createId()}`, name: '1er Año A', slug: `ar-${createId()}`, grade: 1, section: 'A', capacity: 30, academicYearId: ciclo.id, instituteId: 'institute' },
        });
        for (const s of [ana, beto]) {
            await prisma.studentClassroom.create({ data: { studentId: s.id, classroomId: seccion.id, academicYearId: ciclo.id, isActive: true } });
        }
        const config = {
            enabled: true, frequency: 'MONTHLY', dueMode: 'SAME_DAY', dueDay: 1, graceDays: 0,
            baseCurrency: 'USD', acceptedCurrencies: 'BOTH', feeAmount: 30,
            enrollmentEnabled: false, enrollmentAmount: 0, methods: ['Efectivo'],
        };
        expect((await put(tk.admin, '/api/payments/settings', config)).status).toBe(200);
    }, 120000);

    afterAll(async () => {
        await prisma?.$disconnect();
        await server?.close();
    });

    it('AREAS-01: «Profesor» siempre primero; las creadas sin repetir; un cargo de antes es un área', async () => {
        expect((await get(tk.admin, '/api/finanzas/personal')).body.areas[0]).toBe('Profesor');

        const r = await put(tk.admin, '/api/finanzas/areas', { areas: ['Cocina', 'Limpieza', 'Profesores', 'cocina', ' Limpieza '] });
        expect(r.status).toBe(200);
        expect(r.body.areas).toEqual(['Profesor', 'Cocina', 'Limpieza']);

        expect((await post(tk.admin, '/api/finanzas/personal', { nombre: 'Rosa Pérez', cargo: 'Cocina' })).status).toBe(201);
        expect((await post(tk.admin, '/api/finanzas/personal', { nombre: 'Luis Gómez', cargo: 'Vigilante' })).status).toBe(201);
        const lista = await get(tk.admin, '/api/finanzas/personal');
        expect(lista.body.areas).toEqual(['Profesor', 'Cocina', 'Limpieza', 'Vigilante']);
        expect(lista.body.personas.find((p: any) => p.nombre === 'Rosa Pérez').cargo).toBe('Cocina');
    }, 60000);

    it('AREAS-02: un nombre corto no vale; solo el admin', async () => {
        const corto = await put(tk.admin, '/api/finanzas/areas', { areas: ['C'] });
        expect([corto.status, corto.body.code]).toEqual([400, 'AREA_INVALIDA']);
        expect([401, 403]).toContain((await put(tk.profe, '/api/finanzas/areas', { areas: ['Cocina'] })).status);
        // Lo guardado antes sigue ahí.
        expect((await get(tk.admin, '/api/finanzas/personal')).body.areas).toContain('Limpieza');
    }, 60000);

    it('MENSUALIDAD-01: cada alumno trae su mensualidad, con su descuento', async () => {
        expect((await put(tk.admin, `/api/payments/students/${beto.id}/plan`, { descuentoPct: 50, descuentoMotivo: 'Beca' })).status).toBe(200);
        const r = await get(tk.admin, '/api/payments/overview');
        const alumnos = r.body.classrooms.flatMap((c: any) => c.students);
        expect(alumnos.find((a: any) => a.id === ana.id).mensualidad).toBe('30.00');
        expect(alumnos.find((a: any) => a.id === beto.id).mensualidad).toBe('15.00');
    }, 60000);
});
