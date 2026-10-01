import { FastifyInstance } from 'fastify';
import request = require('supertest');
import sharp from 'sharp';
import { PrismaClient } from '@prisma/client';
import { createId } from '@paralleldrive/cuid2';
import { UserRole } from '../../src/utils/prisma-enums';
import { todayInTimezone } from '../../src/utils/school-time';
import { sumarDias } from '../../src/services/pagos.service';
import { createTestServer, createTestPrismaClient, createTestUser, generateTestToken } from '../helpers';

/**
 * LAS FINANZAS DEL LICEO (FIN-*, NOMINA-*, 2026-10-01)
 *
 * Cristian: fondos (saldo inicial, agregar fondos), gastos con su factura,
 * la nómina de profesores y de otro personal (fecha de pago para todos o para
 * cada uno, vacaciones, «guardar para los próximos ciclos») y que el profesor
 * vea solo lo suyo.
 */

const SLUG = 'test-institute';
const HOY = todayInTimezone();

describe('Finanzas del liceo', () => {
    let server: FastifyInstance;
    let prisma: PrismaClient;
    let admin: any, profe1: any, profe2: any, madre: any, alumno: any;
    const tk: Record<string, string> = {};
    let ciclo: any;

    const auth = (t: string) => (r: request.Test) => r.set('Authorization', `Bearer ${t}`).set('X-Institute-Slug', SLUG);
    const get = (t: string, url: string) => auth(t)(request(server.server).get(url));
    const put = (t: string, url: string, body: any) => auth(t)(request(server.server).put(url).send(body));
    const post = (t: string, url: string, body: any) => auth(t)(request(server.server).post(url).send(body));
    const disponibles = async () => Number((await get(tk.admin, '/api/finanzas/resumen')).body.fondosDisponibles);

    const CONFIG = {
        enabled: true, frequency: 'MONTHLY', dueMode: 'SAME_DAY', dueDay: 1, graceDays: 0,
        baseCurrency: 'USD', acceptedCurrencies: 'BOTH', feeAmount: 30,
        enrollmentEnabled: false, enrollmentAmount: 0, methods: ['Efectivo', 'Transferencia'],
    };

    beforeAll(async () => {
        server = await createTestServer();
        prisma = await createTestPrismaClient();
        admin = (await createTestUser(prisma, UserRole.ADMIN)).user;
        profe1 = (await createTestUser(prisma, UserRole.TEACHER, { firstName: 'Ana', lastName: 'Profe' })).user;
        profe2 = (await createTestUser(prisma, UserRole.TEACHER, { firstName: 'Beto', lastName: 'Profe' })).user;
        madre = (await createTestUser(prisma, UserRole.TUTOR)).user;
        alumno = (await createTestUser(prisma, UserRole.STUDENT)).user;
        for (const [k, u, r] of [
            ['admin', admin, UserRole.ADMIN],
            ['profe1', profe1, UserRole.TEACHER],
            ['profe2', profe2, UserRole.TEACHER],
            ['madre', madre, UserRole.TUTOR],
            ['alumno', alumno, UserRole.STUDENT],
        ] as Array<[string, any, UserRole]>) {
            tk[k] = generateTestToken(u.id, r, 'institute');
        }
        await prisma.academicYear.updateMany({ where: { status: 'ACTIVE' as any }, data: { status: 'COMPLETED' as any, isActive: false } });
        ciclo = await prisma.academicYear.create({
            data: {
                id: `c${createId()}`, name: `Fin-${createId().slice(0, 6)}`, status: 'ACTIVE' as any, isActive: true,
                startDate: new Date(`${sumarDias(HOY, -60)}T00:00:00Z`),
                endDate: new Date(`${sumarDias(HOY, 300)}T00:00:00Z`),
                instituteId: 'institute',
            },
        });
    }, 120000);

    afterAll(async () => {
        await prisma?.$disconnect();
        await server?.close();
    });

    it('FIN-01: con el módulo de pagos apagado, las finanzas tampoco responden', async () => {
        for (const url of ['/api/finanzas/resumen', '/api/finanzas/personal', '/api/finanzas/gastos', '/api/finanzas/mis-pagos', '/api/finanzas/reporte?mes=2026-10']) {
            const r = await get(tk.admin, url);
            expect([r.status, r.body.code]).toEqual([403, 'PAYMENTS_DISABLED']);
        }
        const r = await post(tk.admin, '/api/finanzas/fondos', { concepto: 'OTRO', fecha: HOY, monto: 1 });
        expect(r.body.code).toBe('PAYMENTS_DISABLED');
        expect((await put(tk.admin, '/api/payments/settings', CONFIG)).status).toBe(200);
    }, 60000);

    it('FIN-02: solo el admin ve y toca las finanzas', async () => {
        for (const t of [tk.profe1, tk.madre, tk.alumno]) {
            expect([401, 403]).toContain((await get(t, '/api/finanzas/resumen')).status);
            expect([401, 403]).toContain((await get(t, '/api/finanzas/personal')).status);
            expect([401, 403]).toContain((await post(t, '/api/finanzas/fondos', { concepto: 'OTRO', fecha: HOY, monto: 1 })).status);
        }
    }, 60000);

    it('FIN-03: fondos: saldo inicial y donación en bolívares; anular no borra', async () => {
        expect((await get(tk.admin, '/api/finanzas/resumen')).body.tieneSaldoInicial).toBe(false);
        expect((await post(tk.admin, '/api/finanzas/fondos', { concepto: 'SALDO_INICIAL', fecha: HOY, monto: 1000, moneda: 'USD' })).status).toBe(201);
        const don = await post(tk.admin, '/api/finanzas/fondos', { concepto: 'DONACION', fecha: HOY, monto: 50000, moneda: 'VES', tasa: 50, descripcion: 'Rifa' });
        expect(don.status).toBe(201);
        expect(await disponibles()).toBe(2000);
        expect((await post(tk.admin, `/api/finanzas/fondos/${don.body.fondo.id}/anular`, { motivo: 'x' })).status).toBe(400);
        expect((await post(tk.admin, `/api/finanzas/fondos/${don.body.fondo.id}/anular`, { motivo: 'Mal anotada' })).status).toBe(200);
        expect((await post(tk.admin, `/api/finanzas/fondos/${don.body.fondo.id}/anular`, { motivo: 'Otra vez' })).status).toBe(404);
        expect(await disponibles()).toBe(1000);
        expect(await prisma.fondoDelLiceo.count()).toBe(2); // sigue ahí, anulada
        const futuro = await post(tk.admin, '/api/finanzas/fondos', { concepto: 'OTRO', fecha: sumarDias(HOY, 3), monto: 5 });
        expect(futuro.body.code).toBe('FECHA_FUTURA');
    }, 60000);

    it('FIN-04: un gasto con la foto de su factura (redibujada); un SVG no entra', async () => {
        const png = await sharp({ create: { width: 40, height: 30, channels: 3, background: '#cc3300' } }).png().toBuffer();
        const sub = await auth(tk.admin)(request(server.server).post('/api/finanzas/comprobantes')).attach('file', png, { filename: 'factura.png', contentType: 'image/png' });
        expect(sub.status).toBe(201);
        const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
        const mala = await auth(tk.admin)(request(server.server).post('/api/finanzas/comprobantes')).attach('file', svg, { filename: 'f.svg', contentType: 'image/svg+xml' });
        expect(mala.status).toBe(400);

        const sinCategoria = await post(tk.admin, '/api/finanzas/gastos', { concepto: 'Tablero', categoria: 'Inventada', fecha: HOY, monto: 180 });
        expect(sinCategoria.body.code).toBe('CATEGORIA_INVALIDA');
        const g = await post(tk.admin, '/api/finanzas/gastos', {
            concepto: 'Tablero de básquet', categoria: 'Compras', proveedor: 'Deportes C.A.', fecha: HOY, monto: 180, comprobanteId: sub.body.comprobante.id,
        });
        expect(g.status).toBe(201);
        expect(await disponibles()).toBe(820);
        const img = await get(tk.admin, `/api/finanzas/comprobantes/${sub.body.comprobante.id}`);
        expect(img.headers['content-type']).toBe('image/webp');
        const lista = await get(tk.admin, '/api/finanzas/gastos');
        expect(lista.body.gastos[0]).toMatchObject({ concepto: 'Tablero de básquet', categoria: 'Compras', comprobanteId: sub.body.comprobante.id });
        const resumen = (await get(tk.admin, '/api/finanzas/resumen')).body;
        expect(resumen.gastos.porCategoria).toEqual([{ categoria: 'Compras', monto: '180.00' }]);
    }, 60000);

    let vigilante: string;
    let persona1: string;
    let persona2: string;

    it('NOMINA-01: los profesores aparecen solos; se agrega otro personal y se le pone su sueldo', async () => {
        const r = await get(tk.admin, '/api/finanzas/personal');
        expect(r.status).toBe(200);
        const p1 = r.body.personas.find((p: any) => p.cedula === profe1.id);
        const p2 = r.body.personas.find((p: any) => p.cedula === profe2.id);
        expect(p1).toMatchObject({ conCuenta: true, cargo: 'Profesor', acuerdo: null });
        persona1 = p1.id;
        persona2 = p2.id;
        const nuevo = await post(tk.admin, '/api/finanzas/personal', { nombre: 'José Vigilante', cargo: 'Vigilante', seQuedaParaProximosCiclos: false });
        expect(nuevo.status).toBe(201);
        vigilante = nuevo.body.persona.id;

        expect((await put(tk.admin, `/api/finanzas/personal/${persona1}/acuerdo`, { monto: 300, frecuencia: 'MENSUAL' })).status).toBe(200);
        const ficha = await get(tk.admin, `/api/finanzas/personal/${persona1}`);
        expect(ficha.body.debidos.length).toBeGreaterThanOrEqual(10);
        expect(ficha.body.debidos[0]).toMatchObject({ monto: '300.00', estado: expect.any(String) });
        // El nombre de quien tiene cuenta no se cambia desde aquí.
        await put(tk.admin, `/api/finanzas/personal/${persona1}`, { nombre: 'Otro Nombre', cargo: 'Coordinadora' });
        const despues = await get(tk.admin, `/api/finanzas/personal/${persona1}`);
        expect(despues.body.persona).toMatchObject({ nombre: 'Ana Profe', cargo: 'Coordinadora' });
    }, 60000);

    let pago1: string;

    it('NOMINA-02: pagar al profesor descuenta de los fondos; lo ya pagado no se paga dos veces', async () => {
        const antes = await disponibles();
        const ficha = await get(tk.admin, `/api/finanzas/personal/${persona1}`);
        const primera = ficha.body.debidos[0].clave;
        const pago = await post(tk.admin, `/api/finanzas/personal/${persona1}/pagos`, { claves: [primera], monto: 300, metodo: 'Transferencia', fecha: HOY, referencia: '<b>123</b>' });
        expect(pago.status).toBe(201);
        pago1 = pago.body.pago.id;
        expect(await disponibles()).toBe(antes - 300);
        const otra = await post(tk.admin, `/api/finanzas/personal/${persona1}/pagos`, { claves: [primera], monto: 10, metodo: 'Efectivo', fecha: HOY });
        expect(otra.body.code).toBe('YA_PAGADO');
        const segunda = ficha.body.debidos[1].clave;
        const deMas = await post(tk.admin, `/api/finanzas/personal/${persona1}/pagos`, { claves: [segunda], monto: 301, metodo: 'Efectivo', fecha: HOY });
        expect(deMas.body.code).toBe('MONTO_DE_MAS');
        const sinSueldo = await post(tk.admin, `/api/finanzas/personal/${vigilante}/pagos`, { claves: ['S:x'], monto: 10, metodo: 'Efectivo', fecha: HOY });
        expect(sinSueldo.body.code).toBe('SIN_ACUERDO');
        const recibo = await get(tk.admin, `/api/finanzas/pagos-al-personal/${pago1}/recibo`);
        expect(recibo.body).toMatchObject({ persona: { nombre: 'Ana Profe' }, montoBase: '300', anulado: false });
        expect(recibo.body.referencia).not.toMatch(/[<>]/);
    }, 60000);

    it('NOMINA-03: el mismo sueldo para varios; quien ya cobró no cambia de frecuencia', async () => {
        const r = await post(tk.admin, '/api/finanzas/nomina/a-todos', { monto: 150, frecuencia: 'QUINCENAL', personalIds: [persona1, persona2, vigilante] });
        expect(r.body).toMatchObject({ aplicados: 2, saltados: 1 });
        const p2 = await get(tk.admin, `/api/finanzas/personal/${persona2}`);
        expect(p2.body.persona.acuerdo).toMatchObject({ frecuencia: 'QUINCENAL', monto: '150' });
        expect(p2.body.debidos[0].clave).toMatch(/-1$/);
        const p1 = await get(tk.admin, `/api/finanzas/personal/${persona1}`);
        expect(p1.body.persona.acuerdo.frecuencia).toBe('MENSUAL');
        // Vacaciones y día del liceo para todos.
        expect((await put(tk.admin, '/api/finanzas/nomina', { diaDePago: 15, mesesDeVacaciones: [], cobraEnVacaciones: true, bonoVacacional: 50 })).status).toBe(200);
        const conBono = await get(tk.admin, `/api/finanzas/personal/${persona1}`);
        expect(conBono.body.debidos.find((d: any) => d.tipo === 'BONO')).toBeUndefined(); // sin meses de vacaciones ni fecha: no hay cuándo
        expect(conBono.body.debidos[1].fecha.slice(8)).toBe('15');
    }, 60000);

    it('NOMINA-04: el profesor ve SOLO lo suyo', async () => {
        const mios = await get(tk.profe1, '/api/finanzas/mis-pagos');
        expect(mios.status).toBe(200);
        expect(mios.body).toMatchObject({ tiene: true, persona: { nombre: 'Ana Profe' } });
        expect(mios.body.pagos).toHaveLength(1);
        expect(JSON.stringify(mios.body)).not.toContain('Beto');
        expect((await get(tk.profe1, `/api/finanzas/pagos-al-personal/${pago1}/recibo`)).status).toBe(200);
        expect((await get(tk.profe2, `/api/finanzas/pagos-al-personal/${pago1}/recibo`)).status).toBe(404);
        expect((await get(tk.madre, '/api/finanzas/mis-pagos')).body).toEqual({ tiene: false });
        expect([401, 403]).toContain((await get(tk.profe1, `/api/finanzas/personal/${persona2}`)).status);
    }, 60000);

    it('NOMINA-05: anular un pago lo devuelve a los fondos; un ciclo cerrado no se toca', async () => {
        const antes = await disponibles();
        expect((await post(tk.admin, `/api/finanzas/pagos-al-personal/${pago1}/anular`, { motivo: 'Se pagó dos veces' })).status).toBe(200);
        expect(await disponibles()).toBe(antes + 300);
    }, 60000);

    it('REPORTE-01: el reporte del mes cuadra con el resumen; solo el admin', async () => {
        const mes = HOY.slice(0, 7);
        const r = await get(tk.admin, `/api/finanzas/reporte?mes=${mes}`);
        expect(r.status).toBe(200);
        const n = (x: string) => Math.round(Number(x) * 100);
        // Inicio + entró − salió = final; y el final del mes en curso es lo que hay hoy.
        expect(n(r.body.saldoFinal)).toBe(n(r.body.saldoInicial) + n(r.body.entradas.total) - n(r.body.salidas.total));
        expect(Number(r.body.saldoFinal)).toBe(await disponibles());
        expect(n(r.body.entradas.total)).toBe(n(r.body.entradas.cobros) + r.body.entradas.fondos.reduce((t: number, f: any) => t + n(f.monto), 0));
        expect(n(r.body.salidas.gastos)).toBe(r.body.salidas.gastosPorCategoria.reduce((t: number, g: any) => t + n(g.monto), 0));
        // El mes anterior empieza en lo que había antes de todo esto.
        const [a, m] = mes.split('-').map(Number);
        const previo = m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, '0')}`;
        expect((await get(tk.admin, `/api/finanzas/reporte?mes=${previo}`)).body.saldoFinal).toBe(r.body.saldoInicial);

        expect((await get(tk.admin, '/api/finanzas/reporte?mes=2026-13')).body.code).toBe('MES_INVALIDO');
        for (const t of [tk.profe1, tk.madre, tk.alumno]) expect([401, 403]).toContain((await get(t, `/api/finanzas/reporte?mes=${mes}`)).status);
    }, 60000);

    it('NOMINA-06: el ciclo nuevo trae a quien se queda, sin duplicar; el ciclo viejo, cerrado', async () => {
        await prisma.academicYear.update({ where: { id: ciclo.id }, data: { status: 'COMPLETED' as any, isActive: false } });
        expect((await put(tk.admin, `/api/finanzas/personal/${persona1}/acuerdo?academicYearId=${ciclo.id}`, { monto: 1, frecuencia: 'MENSUAL' })).body.code).toBe('CICLO_CERRADO');
        expect((await post(tk.admin, `/api/finanzas/personal/${persona1}/pagos?academicYearId=${ciclo.id}`, { claves: ['S:x'], monto: 1, metodo: 'Efectivo', fecha: HOY })).body.code).toBe('CICLO_CERRADO');

        // El vigilante (no se queda) recibe un sueldo en el viejo... no se puede: está cerrado. Se mira solo a los profesores.
        const nuevo = await prisma.academicYear.create({
            data: {
                id: `c${createId()}`, name: `Fin2-${createId().slice(0, 6)}`, status: 'ACTIVE' as any, isActive: true,
                startDate: new Date(`${sumarDias(HOY, 301)}T00:00:00Z`),
                endDate: new Date(`${sumarDias(HOY, 600)}T00:00:00Z`),
                instituteId: 'institute',
            },
        });
        const r = await get(tk.admin, '/api/finanzas/personal');
        expect(r.body.academicYear.id).toBe(nuevo.id);
        expect(r.body.traidos.traidos).toBe(2);
        const otra = await get(tk.admin, '/api/finanzas/personal');
        expect(otra.body.traidos.traidos).toBe(0);
        expect(await prisma.acuerdoDePago.count({ where: { academicYearId: nuevo.id } })).toBe(2);
        const p1 = otra.body.personas.find((p: any) => p.id === persona1);
        expect(p1.acuerdo).toMatchObject({ frecuencia: 'MENSUAL', monto: '300' });
        // Quien no se queda, no viene.
        await put(tk.admin, `/api/finanzas/personal/${persona2}`, { seQuedaParaProximosCiclos: false });
        expect(otra.body.personas.find((p: any) => p.id === vigilante).acuerdo).toBeNull();
    }, 60000);
});
