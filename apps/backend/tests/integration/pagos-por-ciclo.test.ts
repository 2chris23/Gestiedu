import { FastifyInstance } from 'fastify';
import request = require('supertest');
import { PrismaClient } from '@prisma/client';
import { createId } from '@paralleldrive/cuid2';
import { UserRole } from '../../src/utils/prisma-enums';
import { todayInTimezone } from '../../src/utils/school-time';
import { sumarDias } from '../../src/services/pagos.service';
import { createTestServer, createTestPrismaClient, createTestUser, generateTestToken } from '../helpers';

/**
 * LOS PAGOS DE CADA CICLO (PAGOS-CICLO-*, 2026-10-01)
 *
 * Cristian: «se debe elegir por ciclo escolar para ver pagos pasados». Y lo
 * que había debajo: una sola configuración para todo el liceo, así que subir
 * la cuota el año que viene recalculaba el ciclo pasado con la cuota nueva.
 *
 *   PAGOS-CICLO-01  subir la cuota no cambia lo que se debía en un ciclo pasado
 *   PAGOS-CICLO-02  un ciclo cerrado se ve, no se toca (cobrar, anular, plan: 409)
 *   PAGOS-CICLO-03  el resumen y la lista de ciclos, solo para el admin
 *   PAGOS-CICLO-04  el primer pago congela la configuración del ciclo
 */

const SLUG = 'test-institute';
const HOY = todayInTimezone();

describe('Pagos por ciclo (PAGOS-CICLO)', () => {
    let server: FastifyInstance;
    let prisma: PrismaClient;
    let admin: any, ana: any, madre: any;
    let tkAdmin: string, tkMadre: string;
    let viejo: any, nuevo: any;
    let pagoViejo: string;

    const auth = (t: string) => (r: request.Test) => r.set('Authorization', `Bearer ${t}`).set('X-Institute-Slug', SLUG);
    const get = (t: string, url: string) => auth(t)(request(server.server).get(url));
    const put = (t: string, url: string, body: any) => auth(t)(request(server.server).put(url).send(body));
    const post = (t: string, url: string, body: any) => auth(t)(request(server.server).post(url).send(body));

    const CONFIG = {
        enabled: true, frequency: 'MONTHLY', dueMode: 'SAME_DAY', dueDay: 1, graceDays: 0,
        baseCurrency: 'USD', acceptedCurrencies: 'BOTH', feeAmount: 30,
        enrollmentEnabled: false, enrollmentAmount: 0, methods: ['Efectivo'],
    };

    const ciclo = async (dias: [number, number], estado: 'ACTIVE' | 'COMPLETED') => {
        const year = await prisma.academicYear.create({
            data: {
                id: `c${createId()}`, name: `Ciclo-${createId().slice(0, 6)}`, status: estado as any, isActive: estado === 'ACTIVE',
                startDate: new Date(`${sumarDias(HOY, dias[0])}T00:00:00Z`),
                endDate: new Date(`${sumarDias(HOY, dias[1])}T00:00:00Z`),
                instituteId: 'institute',
            },
        });
        const seccion = await prisma.classroom.create({
            data: { id: `c${createId()}`, name: '1er Año A', slug: `pc-${createId()}`, grade: 1, section: 'A', capacity: 30, academicYearId: year.id, instituteId: 'institute' },
        });
        await prisma.studentClassroom.create({ data: { studentId: ana.id, classroomId: seccion.id, academicYearId: year.id, isActive: true } });
        return year;
    };

    beforeAll(async () => {
        server = await createTestServer();
        prisma = await createTestPrismaClient();
        admin = (await createTestUser(prisma, UserRole.ADMIN)).user;
        ana = (await createTestUser(prisma, UserRole.STUDENT, { firstName: 'Ana', lastName: 'Arias' })).user;
        madre = (await createTestUser(prisma, UserRole.TUTOR)).user;
        await prisma.studentTutor.create({ data: { studentId: ana.id, tutorId: madre.id, relationship: 'Madre' } });
        tkAdmin = generateTestToken(admin.id, UserRole.ADMIN, 'institute');
        tkMadre = generateTestToken(madre.id, UserRole.TUTOR, 'institute');

        await prisma.academicYear.updateMany({ where: { status: 'ACTIVE' as any }, data: { status: 'COMPLETED' as any, isActive: false } });

        // El ciclo pasado, mientras estaba en curso: cuota de 30 y un pago.
        viejo = await ciclo([-400, -40], 'ACTIVE');
        expect((await put(tkAdmin, '/api/payments/settings', CONFIG)).status).toBe(200);
        const ficha = await get(tkAdmin, `/api/payments/students/${ana.id}`);
        const pago = await post(tkAdmin, `/api/payments/students/${ana.id}/payments`, {
            installmentKeys: [ficha.body.installments[0].key], amount: 30, currency: 'USD', method: 'Efectivo', paidAt: HOY,
        });
        expect(pago.status).toBe(201);
        pagoViejo = pago.body.payment.id;

        // Se cierra, y empieza el nuevo.
        await prisma.academicYear.update({ where: { id: viejo.id }, data: { status: 'COMPLETED' as any, isActive: false } });
        nuevo = await ciclo([-30, 300], 'ACTIVE');
    }, 120000);

    afterAll(async () => {
        await prisma?.$disconnect();
        await server?.close();
    });

    it('PAGOS-CICLO-04: el primer pago congela la configuración del ciclo', async () => {
        // El ciclo nuevo todavía no tiene la suya: usa la del liceo (30).
        expect(await prisma.ajustesDePagosDelCiclo.findUnique({ where: { academicYearId: nuevo.id } })).toBeNull();
        const ficha = await get(tkAdmin, `/api/payments/students/${ana.id}`);
        expect(ficha.body.installments[0].amount).toBe('30.00');
        const pago = await post(tkAdmin, `/api/payments/students/${ana.id}/payments`, {
            installmentKeys: [ficha.body.installments[0].key], amount: 10, currency: 'USD', method: 'Efectivo', paidAt: HOY,
        });
        expect(pago.status).toBe(201);
        const congelada = await prisma.ajustesDePagosDelCiclo.findUnique({ where: { academicYearId: nuevo.id } });
        expect(congelada?.feeAmount.toString()).toBe('30');

        // Si la del liceo cambia por otro camino, el ciclo con pagos no se mueve.
        await prisma.paymentSettings.update({ where: { id: 'liceo' }, data: { feeAmount: 99 } });
        expect((await get(tkAdmin, `/api/payments/students/${ana.id}`)).body.installments[0].amount).toBe('30.00');
    }, 60000);

    it('PAGOS-CICLO-01: subir la cuota no cambia lo que se debía en un ciclo pasado', async () => {
        const res = await put(tkAdmin, '/api/payments/settings', { ...CONFIG, feeAmount: 50 });
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ feeAmount: '50.00', cicloEnCurso: { id: nuevo.id } });

        const ahora = await get(tkAdmin, `/api/payments/students/${ana.id}`);
        expect(ahora.body.installments[0].amount).toBe('50.00');
        const antes = await get(tkAdmin, `/api/payments/students/${ana.id}?academicYearId=${viejo.id}`);
        expect(antes.status).toBe(200);
        expect(antes.body).toMatchObject({ academicYear: { id: viejo.id }, closed: true });
        expect(antes.body.installments.every((c: any) => c.amount === '30.00')).toBe(true);
        expect(antes.body.installments[0].state).toBe('PAGADA');
        expect(antes.body.payments).toHaveLength(1);
    }, 60000);

    it('PAGOS-CICLO-02: un ciclo cerrado se ve, no se toca', async () => {
        const ficha = await get(tkAdmin, `/api/payments/students/${ana.id}?academicYearId=${viejo.id}`);
        const cobrar = await post(tkAdmin, `/api/payments/students/${ana.id}/payments`, {
            installmentKeys: [ficha.body.installments[1].key], amount: 30, currency: 'USD', method: 'Efectivo', paidAt: HOY, academicYearId: viejo.id,
        });
        expect(cobrar.status).toBe(409);
        expect(cobrar.body.code).toBe('CICLO_CERRADO');
        const anular = await post(tkAdmin, `/api/payments/${pagoViejo}/annul`, { reason: 'Probando' });
        expect(anular.body.code).toBe('CICLO_CERRADO');
        const plan = await put(tkAdmin, `/api/payments/students/${ana.id}/plan?academicYearId=${viejo.id}`, { exempt: false });
        expect(plan.body.code).toBe('CICLO_CERRADO');
        // Y el pago sigue como estaba.
        expect((await prisma.payment.findUnique({ where: { id: pagoViejo } }))?.annulledAt).toBeNull();
    }, 60000);

    it('PAGOS-CICLO-03: el resumen de cualquier ciclo y la lista de ciclos, solo para el admin', async () => {
        const resumen = await get(tkAdmin, `/api/payments/overview?academicYearId=${viejo.id}`);
        expect(resumen.status).toBe(200);
        expect(resumen.body).toMatchObject({ closed: true, academicYear: { id: viejo.id, status: 'COMPLETED' } });

        const ciclos = await get(tkAdmin, '/api/payments/cycles');
        expect(ciclos.status).toBe(200);
        const porId = new Map(ciclos.body.cycles.map((c: any) => [c.id, c]));
        expect(porId.get(viejo.id)).toMatchObject({ closed: true, payments: 1 });
        expect(porId.get(nuevo.id)).toMatchObject({ closed: false, status: 'ACTIVE' });

        expect([401, 403]).toContain((await get(tkMadre, '/api/payments/cycles')).status);
        expect([401, 403]).toContain((await get(tkMadre, `/api/payments/overview?academicYearId=${viejo.id}`)).status);
        // El representante ve lo de su hija también en un ciclo pasado.
        expect((await get(tkMadre, `/api/payments/students/${ana.id}?academicYearId=${viejo.id}`)).status).toBe(200);
    }, 60000);
});
