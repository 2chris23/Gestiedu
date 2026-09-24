import { FastifyInstance } from 'fastify';
import request = require('supertest');
import { PrismaClient } from '@prisma/client';
import { createId } from '@paralleldrive/cuid2';
import { UserRole } from '../../src/utils/prisma-enums';
import { todayInTimezone } from '../../src/utils/school-time';
import { sumarDias as sumarDiasPara } from '../../src/services/pagos.service';
import { createTestServer, createTestPrismaClient, createTestUser, generateTestToken } from '../helpers';

/**
 * PAGOS, DE PUNTA A PUNTA
 *
 * Montaje: un ciclo ACTIVO que empezó hace 70 días y dura un año; cuota mensual
 * de 30 $ el día 1; inscripción 50 $. Ana y Luis inscritos; la madre representa
 * a Ana. Con eso, a día de hoy, hay al menos dos cuotas vencidas.
 */

const SLUG = 'test-institute';
const HOY = todayInTimezone();

describe('Pagos', () => {
    let server: FastifyInstance;
    let prisma: PrismaClient;
    const tk: Record<string, string> = {};
    let admin: any, ana: any, luis: any, pedro: any, profe: any, madre: any, otraMadre: any;
    let yearId: string;

    const auth = (t: string) => (r: request.Test) => r.set('Authorization', `Bearer ${t}`).set('X-Institute-Slug', SLUG);
    const get = (t: string, url: string) => auth(t)(request(server.server).get(url));
    const put = (t: string, url: string, body: any) => auth(t)(request(server.server).put(url).send(body));
    const post = (t: string, url: string, body: any) => auth(t)(request(server.server).post(url).send(body));

    const CONFIG = {
        enabled: true, frequency: 'MONTHLY', dueMode: 'SAME_DAY', dueDay: 1, graceDays: 0,
        baseCurrency: 'USD', acceptedCurrencies: 'BOTH', feeAmount: 30,
        enrollmentEnabled: true, enrollmentAmount: 50, methods: ['Efectivo', 'Pago Móvil'],
    };

    beforeAll(async () => {
        server = await createTestServer();
        prisma = await createTestPrismaClient();
        admin = (await createTestUser(prisma, UserRole.ADMIN)).user;
        ana = (await createTestUser(prisma, UserRole.STUDENT, { firstName: 'Ana', lastName: 'Arias' })).user;
        luis = (await createTestUser(prisma, UserRole.STUDENT, { firstName: 'Luis', lastName: 'Lara' })).user;
        pedro = (await createTestUser(prisma, UserRole.STUDENT, { firstName: 'Pedro', lastName: 'Páez' })).user; // no inscrito
        profe = (await createTestUser(prisma, UserRole.TEACHER)).user;
        madre = (await createTestUser(prisma, UserRole.TUTOR)).user;
        otraMadre = (await createTestUser(prisma, UserRole.TUTOR)).user;
        const pares: Array<[string, any, UserRole]> = [
            ['admin', admin, UserRole.ADMIN], ['ana', ana, UserRole.STUDENT], ['profe', profe, UserRole.TEACHER],
            ['madre', madre, UserRole.TUTOR], ['otraMadre', otraMadre, UserRole.TUTOR],
        ];
        for (const [k, u, r] of pares) tk[k] = generateTestToken(u.id, r, 'institute');

        // Esta base de pruebas es una copia propia: se deja un solo ciclo activo, el de la prueba.
        await prisma.academicYear.updateMany({ where: { status: 'ACTIVE' as any }, data: { status: 'COMPLETED' as any, isActive: false } });
        const year = await prisma.academicYear.create({
            data: {
                id: `c${createId()}`, name: `Pagos-${createId()}`, status: 'ACTIVE' as any, isActive: true,
                startDate: new Date(`${sumarDiasPara(HOY, -70)}T00:00:00Z`),
                endDate: new Date(`${sumarDiasPara(HOY, 295)}T00:00:00Z`),
                instituteId: 'institute',
            },
        });
        yearId = year.id;
        const seccion = await prisma.classroom.create({
            data: { id: `c${createId()}`, name: '1er Año A', slug: `pagos-${createId()}`, grade: 1, section: 'A', capacity: 30, academicYearId: year.id, instituteId: 'institute' },
        });
        for (const s of [ana, luis]) {
            await prisma.studentClassroom.create({ data: { studentId: s.id, classroomId: seccion.id, academicYearId: year.id, isActive: true } });
        }
        await prisma.studentTutor.create({ data: { studentId: ana.id, tutorId: madre.id, relationship: 'Madre' } });
    }, 60000);

    afterAll(async () => {
        await prisma?.$disconnect();
        await server?.close();
    });

    it('PAGOS-01: apagado, nada responde salvo saber que está apagado', async () => {
        expect((await get(tk.madre, '/api/payments/settings')).body).toEqual({ enabled: false });
        expect((await get(tk.admin, '/api/payments/overview')).body.code).toBe('PAYMENTS_DISABLED');
        expect((await get(tk.madre, '/api/payments/my-children')).status).toBe(403);
    }, 60000);

    it('PAGOS-02: solo el admin configura; el resto solo ve "enabled"', async () => {
        for (const t of [tk.profe, tk.madre, tk.ana]) {
            expect([401, 403]).toContain((await put(t, '/api/payments/settings', CONFIG)).status);
        }
        const res = await put(tk.admin, '/api/payments/settings', CONFIG);
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ enabled: true, feeAmount: '30.00', enrollmentAmount: '50.00' });
        expect(await get(tk.profe, '/api/payments/settings').then((r) => r.body)).toEqual({ enabled: true });
    }, 60000);

    it('PAGOS-03: el resumen dice cuántos deben, y solo el admin lo ve', async () => {
        const res = await get(tk.admin, '/api/payments/overview');
        expect(res.status).toBe(200);
        expect(res.body.summary).toMatchObject({ students: 2, debtors: 2 });
        const nombres = res.body.classrooms[0].students.map((s: any) => s.firstName);
        expect(nombres).toEqual(['Ana', 'Luis']); // Pedro no está inscrito
        expect(res.body.classrooms[0].students[0]).toMatchObject({ state: 'DEBE' });
        for (const t of [tk.profe, tk.madre, tk.ana]) expect([401, 403]).toContain((await get(t, '/api/payments/overview')).status);
    }, 60000);

    it('PAGOS-04: pagar inscripción + 1 cuota completa + abono de otra', async () => {
        const ficha = await get(tk.admin, `/api/payments/students/${ana.id}`);
        const [ins, c1, c2] = ficha.body.installments;
        expect(ins.key).toBe('INS');

        const res = await post(tk.admin, `/api/payments/students/${ana.id}/payments`, {
            installmentKeys: [c2.key, ins.key, c1.key], amount: 90, currency: 'USD', method: 'Efectivo', paidAt: HOY, reference: '<script>x</script>123',
        });
        expect(res.status).toBe(201);
        expect(res.body.payment.receiptNumber).toBeGreaterThan(0);

        const despues = await get(tk.admin, `/api/payments/students/${ana.id}`);
        const [a, b, c] = despues.body.installments;
        expect([a.state, b.state, c.pending]).toEqual(['PAGADA', 'PAGADA', '20.00']);
        expect(despues.body.payments[0].reference).not.toMatch(/[<>]/);
    }, 60000);

    it('PAGOS-05: en bolívares con tasa; sin tasa no; más de lo que se debe tampoco', async () => {
        const ficha = await get(tk.admin, `/api/payments/students/${ana.id}`);
        const c2 = ficha.body.installments[2];
        const url = `/api/payments/students/${ana.id}/payments`;

        expect((await post(tk.admin, url, { installmentKeys: [c2.key], amount: 730, currency: 'VES', method: 'Pago Móvil', paidAt: HOY })).status).toBe(400);
        const demas = await post(tk.admin, url, { installmentKeys: [c2.key], amount: 21, currency: 'USD', method: 'Efectivo', paidAt: HOY });
        expect(demas.body.code).toBe('AMOUNT_EXCEEDS_DEBT');

        // 20 $ a 36,50 Bs/$ = 730 Bs
        const ok = await post(tk.admin, url, { installmentKeys: [c2.key], amount: 730, currency: 'VES', exchangeRate: 36.5, method: 'Pago Móvil', paidAt: HOY });
        expect(ok.status).toBe(201);
        const tras = await get(tk.admin, `/api/payments/students/${ana.id}`);
        expect(tras.body.installments[2].state).toBe('PAGADA');
    }, 60000);

    it('PAGOS-06: validaciones del pago', async () => {
        const url = `/api/payments/students/${ana.id}/payments`;
        const ficha = await get(tk.admin, `/api/payments/students/${ana.id}`);
        const libre = ficha.body.installments[3].key;
        const bien = { installmentKeys: [libre], amount: 10, currency: 'USD', method: 'Efectivo', paidAt: HOY };

        expect((await post(tk.admin, url, { ...bien, installmentKeys: ['INS'] })).body.code).toBe('ALREADY_PAID');
        expect((await post(tk.admin, url, { ...bien, installmentKeys: ['1999-01'] })).body.code).toBe('UNKNOWN_INSTALLMENT');
        expect((await post(tk.admin, url, { ...bien, paidAt: sumarDiasPara(HOY, 1) })).body.code).toBe('INVALID_DATE');
        expect((await post(tk.admin, url, { ...bien, method: 'Bitcoin' })).status).toBe(400);
        expect((await post(tk.admin, url, { ...bien, amount: 0 })).status).toBe(400);
        expect((await post(tk.admin, `/api/payments/students/${pedro.id}/payments`, bien)).body.code).toBe('NOT_ENROLLED');
        for (const t of [tk.profe, tk.madre, tk.ana]) expect([401, 403]).toContain((await post(t, url, bien)).status);
    }, 60000);

    it('PAGOS-07: dos cobros a la vez de la misma cuota → solo uno entra', async () => {
        const ficha = await get(tk.admin, `/api/payments/students/${luis.id}`);
        const cuota = ficha.body.installments[1];
        const url = `/api/payments/students/${luis.id}/payments`;
        const cuerpo = { installmentKeys: [cuota.key], amount: 30, currency: 'USD', method: 'Efectivo', paidAt: HOY };
        const [a, b] = await Promise.all([post(tk.admin, url, cuerpo), post(tk.admin, url, { ...cuerpo, reference: 'otro' })]);
        expect([a.status, b.status].sort()).toEqual([201, 409]);
    }, 60000);

    it('PAGOS-08: la madre ve los pagos de Ana, no los de Luis; otra madre no ve nada', async () => {
        const suyos = await get(tk.madre, '/api/payments/my-children');
        expect(suyos.status).toBe(200);
        expect(suyos.body.children.map((c: any) => c.student.id)).toEqual([ana.id]);
        expect(suyos.body.children[0].payments[0].createdById).toBeUndefined();

        expect((await get(tk.madre, `/api/payments/students/${ana.id}`)).status).toBe(200);
        expect((await get(tk.madre, `/api/payments/students/${luis.id}`)).status).toBe(404);
        expect((await get(tk.otraMadre, `/api/payments/students/${ana.id}`)).status).toBe(404);
        expect((await get(tk.ana, `/api/payments/students/${ana.id}`)).status).toBe(404);
        expect((await get(tk.otraMadre, '/api/payments/my-children')).body.children).toEqual([]);

        const recibo = suyos.body.children[0].payments[0].id;
        expect((await get(tk.madre, `/api/payments/${recibo}/receipt`)).status).toBe(200);
        expect((await get(tk.otraMadre, `/api/payments/${recibo}/receipt`)).status).toBe(404);
    }, 60000);

    it('PAGOS-09: anular pide motivo, no se borra, deja de contar, y no se anula dos veces', async () => {
        const ficha = await get(tk.admin, `/api/payments/students/${luis.id}`);
        const pago = ficha.body.payments[0];
        expect((await post(tk.admin, `/api/payments/${pago.id}/annul`, { reason: '' })).body.code).toBe('ANNUL_REASON_REQUIRED');
        expect([401, 403]).toContain((await post(tk.madre, `/api/payments/${pago.id}/annul`, { reason: 'porque sí' })).status);

        expect((await post(tk.admin, `/api/payments/${pago.id}/annul`, { reason: 'Billete falso' })).status).toBe(200);
        expect((await post(tk.admin, `/api/payments/${pago.id}/annul`, { reason: 'Otra vez' })).status).toBe(404);

        const fila = await prisma.payment.findUnique({ where: { id: pago.id } });
        expect(fila?.annulReason).toBe('Billete falso');
        const tras = await get(tk.admin, `/api/payments/students/${luis.id}`);
        expect(tras.body.installments[1].state).not.toBe('PAGADA');
        expect((await get(tk.admin, `/api/payments/${pago.id}/receipt`)).body.annulled).toBe(true);
    }, 60000);

    it('PAGOS-10: exonerar pide motivo; exonerado no debe y no se le cobra', async () => {
        const url = `/api/payments/students/${luis.id}/plan`;
        expect((await put(tk.admin, url, { exempt: true })).body.code).toBe('EXEMPT_REASON_REQUIRED');
        const ok = await put(tk.admin, url, { exempt: true, exemptReason: 'Hijo de docente' });
        expect(ok.status).toBe(200);
        expect(ok.body.summary.state).toBe('EXONERADO');

        const cobro = await post(tk.admin, `/api/payments/students/${luis.id}/payments`, {
            installmentKeys: [ok.body.installments[1].key], amount: 30, currency: 'USD', method: 'Efectivo', paidAt: HOY,
        });
        expect(cobro.status).toBe(409);
        expect((await get(tk.admin, '/api/payments/overview')).body.summary.debtors).toBeLessThanOrEqual(1);
    }, 60000);

    it('PAGOS-11: con pagos en el ciclo no se cambia la frecuencia (dejaría pagos huérfanos)', async () => {
        const res = await put(tk.admin, '/api/payments/settings', { ...CONFIG, frequency: 'BIWEEKLY' });
        expect(res.status).toBe(409);
        expect(res.body.code).toBe('FREQUENCY_LOCKED');
        // El monto sí se puede cambiar.
        expect((await put(tk.admin, '/api/payments/settings', { ...CONFIG, feeAmount: 35 })).status).toBe(200);
    }, 60000);

    it('PAGOS-12: el ciclo se usa bien — el año de prueba es el activo', async () => {
        const res = await get(tk.admin, '/api/payments/overview');
        expect(res.body.academicYear.id).toBe(yearId);
    }, 60000);
});
