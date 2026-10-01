import { FastifyInstance } from 'fastify';
import request = require('supertest');
import sharp from 'sharp';
import { PrismaClient } from '@prisma/client';
import { createId } from '@paralleldrive/cuid2';
import { UserRole } from '../../src/utils/prisma-enums';
import { todayInTimezone } from '../../src/utils/school-time';
import { sumarDias } from '../../src/services/pagos.service';
import { recordarCuotas } from '../../src/services/recordatorio-de-cuotas.service';
import { createTestServer, createTestPrismaClient, createTestUser, generateTestToken } from '../helpers';

/**
 * RECORDAR Y REPORTAR PAGOS (2026-10-01)
 *
 * Idea elegida por Cristian: un aviso antes de que venza la cuota, y que el
 * representante diga «ya pagué» con la captura; el admin lo confirma.
 *
 *   REPORTAR-01  el representante reporta lo de su representado, con la captura
 *   REPORTAR-02  el de otro: 404; el alumno, el profesor: 403
 *   REPORTAR-03  confirmar crea el pago de verdad, una sola vez, y avisa
 *   REPORTAR-04  rechazar pide motivo y se lo dice al representante
 *   REPORTAR-05  la captura: la ve el admin y quien la subió, nadie más
 *   RECORDAR-01  avisa una vez por cuota, aunque la tarea corra dos veces a la vez
 *   RECORDAR-02  con 0 días no avisa; lo pagado no se recuerda
 */

const SLUG = 'test-institute';
const HOY = todayInTimezone();

describe('Recordar y reportar pagos (REPORTAR, RECORDAR)', () => {
    let server: FastifyInstance;
    let prisma: PrismaClient;
    let ana: any, madre: any, otraMadre: any;
    const tk: Record<string, string> = {};

    const auth = (t: string) => (r: request.Test) => r.set('Authorization', `Bearer ${t}`).set('X-Institute-Slug', SLUG);
    const get = (t: string, url: string) => auth(t)(request(server.server).get(url));
    const put = (t: string, url: string, body: any) => auth(t)(request(server.server).put(url).send(body));
    const post = (t: string, url: string, body: any) => auth(t)(request(server.server).post(url).send(body));

    const CONFIG = {
        enabled: true, frequency: 'MONTHLY', dueMode: 'SAME_DAY', dueDay: Number(sumarDias(HOY, 2).slice(8, 10)), graceDays: 0,
        baseCurrency: 'USD', acceptedCurrencies: 'BOTH', feeAmount: 30,
        enrollmentEnabled: false, enrollmentAmount: 0, methods: ['Efectivo', 'Pago Móvil'],
        recordatorioDiasAntes: 3,
    };
    // Lo que vence de aquí a 3 días (una cuota; dos si cae a fin de mes): Ana lo paga entero.
    let primeraCuota: string;
    let cercanas: string[];

    beforeAll(async () => {
        server = await createTestServer();
        prisma = await createTestPrismaClient();
        const admin = (await createTestUser(prisma, UserRole.ADMIN)).user;
        const profe = (await createTestUser(prisma, UserRole.TEACHER)).user;
        ana = (await createTestUser(prisma, UserRole.STUDENT, { firstName: 'Ana', lastName: 'Arias' })).user;
        const beto = (await createTestUser(prisma, UserRole.STUDENT, { firstName: 'Beto', lastName: 'Bravo' })).user;
        madre = (await createTestUser(prisma, UserRole.TUTOR)).user;
        otraMadre = (await createTestUser(prisma, UserRole.TUTOR)).user;
        await prisma.studentTutor.create({ data: { studentId: ana.id, tutorId: madre.id, relationship: 'Madre' } });
        await prisma.studentTutor.create({ data: { studentId: beto.id, tutorId: otraMadre.id, relationship: 'Madre' } });
        tk.admin = generateTestToken(admin.id, UserRole.ADMIN, 'institute');
        tk.profe = generateTestToken(profe.id, UserRole.TEACHER, 'institute');
        tk.ana = generateTestToken(ana.id, UserRole.STUDENT, 'institute');
        tk.madre = generateTestToken(madre.id, UserRole.TUTOR, 'institute');
        tk.otra = generateTestToken(otraMadre.id, UserRole.TUTOR, 'institute');

        await prisma.academicYear.updateMany({ where: { status: 'ACTIVE' as any }, data: { status: 'COMPLETED' as any, isActive: false } });
        const year = await prisma.academicYear.create({
            data: {
                id: `c${createId()}`, name: `Ciclo-${createId().slice(0, 6)}`, status: 'ACTIVE' as any, isActive: true,
                startDate: new Date(`${HOY}T00:00:00Z`), endDate: new Date(`${sumarDias(HOY, 200)}T00:00:00Z`),
                instituteId: 'institute',
            },
        });
        const seccion = await prisma.classroom.create({
            data: { id: `c${createId()}`, name: '1er Año A', slug: `rr-${createId()}`, grade: 1, section: 'A', capacity: 30, academicYearId: year.id, instituteId: 'institute' },
        });
        for (const s of [ana, beto]) await prisma.studentClassroom.create({ data: { studentId: s.id, classroomId: seccion.id, academicYearId: year.id, isActive: true } });
        expect((await put(tk.admin, '/api/payments/settings', CONFIG)).status).toBe(200);
        const ficha = await get(tk.madre, `/api/payments/students/${ana.id}`);
        expect(ficha.status).toBe(200);
        primeraCuota = ficha.body.installments[0].key;
        cercanas = ficha.body.installments.filter((c: any) => c.dueDate <= sumarDias(HOY, 3)).map((c: any) => c.key);
    }, 120000);

    afterAll(async () => {
        await prisma?.$disconnect();
        await server?.close();
    });

    const reporte = (extra: any = {}) => ({ installmentKeys: cercanas, amount: 30 * cercanas.length, currency: 'USD', method: 'Pago Móvil', reference: '0123', paidAt: HOY, ...extra });
    let captura: string;
    let reporteId: string;

    it('REPORTAR-01: el representante reporta lo de su representado, con la captura', async () => {
        const png = await sharp({ create: { width: 40, height: 30, channels: 3, background: '#3366cc' } }).png().toBuffer();
        const sub = await auth(tk.madre)(request(server.server).post('/api/payments/comprobantes')).attach('file', png, { filename: 'captura.png', contentType: 'image/png' });
        expect(sub.status).toBe(201);
        captura = sub.body.comprobante.id;

        const res = await post(tk.madre, `/api/payments/students/${ana.id}/reportes`, reporte({ comprobanteId: captura }));
        expect(res.status).toBe(201);
        reporteId = res.body.reporte.id;
        // No cuenta todavía: nada pagado.
        expect(await prisma.payment.count({ where: { studentId: ana.id } })).toBe(0);
        // El admin lo ve, y recibió el aviso.
        const lista = await get(tk.admin, '/api/payments/reportes');
        expect(lista.body.reportes.map((r: any) => r.id)).toContain(reporteId);
        expect(lista.body.reportes.find((r: any) => r.id === reporteId)).toMatchObject({ conCaptura: true, monto: `${30 * cercanas.length}.00`, alumno: { id: ana.id } });
        expect(await prisma.notification.count({ where: { type: 'PAGO_REPORTADO' } })).toBeGreaterThan(0);
        // Y la ficha del representante lo enseña como «por confirmar».
        const ficha = await get(tk.madre, `/api/payments/students/${ana.id}`);
        expect(ficha.body.reports.map((r: any) => r.id)).toContain(reporteId);
    }, 60000);

    it('REPORTAR-02: lo de otro, 404; el alumno y el profesor, 403; una captura ajena no se usa', async () => {
        expect((await post(tk.otra, `/api/payments/students/${ana.id}/reportes`, reporte())).status).toBe(404);
        expect((await post(tk.ana, `/api/payments/students/${ana.id}/reportes`, reporte())).status).toBe(403);
        expect((await post(tk.profe, `/api/payments/students/${ana.id}/reportes`, reporte())).status).toBe(403);
        const ajena = await post(tk.madre, `/api/payments/students/${ana.id}/reportes`, reporte({ comprobanteId: 'cnoexiste000000000000000' }));
        expect(ajena.body.code).toBe('COMPROBANTE_INVALIDO');
        expect((await post(tk.madre, `/api/payments/students/${ana.id}/reportes`, reporte({ paidAt: sumarDias(HOY, 3) }))).status).toBe(400);
        // El alumno no sube nada.
        const png = await sharp({ create: { width: 10, height: 10, channels: 3, background: '#000' } }).png().toBuffer();
        expect((await auth(tk.ana)(request(server.server).post('/api/payments/comprobantes')).attach('file', png, { filename: 'x.png', contentType: 'image/png' })).status).toBe(403);
        // Ni ve la lista, ni confirma.
        expect([401, 403]).toContain((await get(tk.madre, '/api/payments/reportes')).status);
        expect([401, 403]).toContain((await post(tk.madre, `/api/payments/reportes/${reporteId}/confirmar`, {})).status);
    }, 60000);

    it('REPORTAR-05: la captura, el admin y quien la subió; nadie más', async () => {
        const deAdmin = await get(tk.admin, `/api/payments/reportes/${reporteId}/captura`);
        expect(deAdmin.status).toBe(200);
        expect(deAdmin.headers['content-type']).toContain('image/webp');
        expect((await get(tk.madre, `/api/payments/reportes/${reporteId}/captura`)).status).toBe(200);
        expect((await get(tk.otra, `/api/payments/reportes/${reporteId}/captura`)).status).toBe(404);
        expect((await get(tk.ana, `/api/payments/reportes/${reporteId}/captura`)).status).toBe(404);
    }, 60000);

    it('REPORTAR-03: confirmar crea el pago de verdad, una sola vez, y avisa al representante', async () => {
        const [a, b] = await Promise.all([
            // Cuerpos distintos: así no los junta el freno del doble clic y se mide el candado de verdad.
            post(tk.admin, `/api/payments/reportes/${reporteId}/confirmar`, { de: 'uno' }),
            post(tk.admin, `/api/payments/reportes/${reporteId}/confirmar`, { de: 'otro' }),
        ]);
        expect([a.status, b.status].filter((s) => s === 200)).toHaveLength(1);
        expect(await prisma.payment.count({ where: { studentId: ana.id, annulledAt: null } })).toBe(1);
        const fila = await (prisma as any).pagoReportado.findUnique({ where: { id: reporteId } });
        expect(fila).toMatchObject({ estado: 'CONFIRMADO' });
        expect(fila.paymentId).toBeTruthy();
        expect(await prisma.notification.count({ where: { recipientId: madre.id, type: 'PAGO_CONFIRMADO' } })).toBe(1);
        const ficha = await get(tk.madre, `/api/payments/students/${ana.id}`);
        expect(ficha.body.installments.filter((c: any) => cercanas.includes(c.key)).every((c: any) => c.state === 'PAGADA')).toBe(true);
    }, 60000);

    it('REPORTAR-04: rechazar pide motivo y se lo dice al representante', async () => {
        const otro = await post(tk.madre, `/api/payments/students/${ana.id}/reportes`, reporte({ installmentKeys: [primeraCuota], reference: '999' }));
        expect(otro.status).toBe(201);
        const id = otro.body.reporte.id;
        expect((await post(tk.admin, `/api/payments/reportes/${id}/rechazar`, { motivo: '' })).body.code).toBe('MOTIVO_REQUERIDO');
        expect((await post(tk.admin, `/api/payments/reportes/${id}/rechazar`, { motivo: 'No llegó a la cuenta' })).status).toBe(200);
        expect((await post(tk.admin, `/api/payments/reportes/${id}/rechazar`, { motivo: 'Otra vez' })).status).toBe(409);
        const aviso = await prisma.notification.findFirst({ where: { recipientId: madre.id, type: 'PAGO_RECHAZADO' } });
        expect(aviso?.message).toContain('No llegó a la cuenta');
        expect(await prisma.payment.count({ where: { studentId: ana.id, annulledAt: null } })).toBe(1);
    }, 60000);

    it('RECORDAR-01: avisa una vez por cuota, aunque la tarea corra dos veces a la vez', async () => {
        // Lo de Ana ya está pagado; la cuota de Beto vence en 2 días.
        const [x, y] = await Promise.all([recordarCuotas(prisma, 'institute', undefined, HOY), recordarCuotas(prisma, 'institute', undefined, HOY)]);
        expect(x + y).toBe(1);
        expect(await recordarCuotas(prisma, 'institute', undefined, HOY)).toBe(0);
        expect(await prisma.notification.count({ where: { recipientId: otraMadre.id, type: 'CUOTA_POR_VENCER' } })).toBe(1);
        // A la madre de Ana no: ya pagó.
        expect(await prisma.notification.count({ where: { recipientId: madre.id, type: 'CUOTA_POR_VENCER' } })).toBe(0);
    }, 60000);

    it('RECORDAR-02: con 0 días no avisa; fuera del plazo tampoco', async () => {
        await (prisma as any).recordatorioDeCuota.deleteMany({});
        expect((await put(tk.admin, '/api/payments/settings', { ...CONFIG, recordatorioDiasAntes: 0 })).status).toBe(200);
        expect(await recordarCuotas(prisma, 'institute', undefined, HOY)).toBe(0);
        expect((await put(tk.admin, '/api/payments/settings', { ...CONFIG, recordatorioDiasAntes: 1 })).status).toBe(200);
        // Vence en 2 días: con 1 día de aviso, todavía no.
        expect(await recordarCuotas(prisma, 'institute', undefined, HOY)).toBe(0);
    }, 60000);
});
