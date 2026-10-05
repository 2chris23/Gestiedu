import { PrismaClient } from '@prisma/client';
import { createTestPrismaClient } from '../helpers';
import { reconvertirBolivares } from '../../src/services/reconversion.service';

/**
 * RECONVERSIÓN MONETARIA (RECONV-01…03). Ver `services/reconversion.service.ts`.
 */
describe('Reconversión monetaria (RECONV)', () => {
    let prisma: PrismaClient;
    let fondoVes: any;
    let fondoUsd: any;
    let gastoVes: any;

    beforeAll(async () => {
        prisma = await createTestPrismaClient();
        const p = prisma as any;
        await p.paymentSettings.upsert({
            where: { id: 'liceo' },
            create: { id: 'liceo', baseCurrency: 'VES', feeAmount: 36000000, enrollmentAmount: 50000000, moraTipo: 'PORCENTAJE', moraValor: 5 },
            update: { baseCurrency: 'VES', feeAmount: 36000000, enrollmentAmount: 50000000, moraTipo: 'PORCENTAJE', moraValor: 5 },
        });
        // Base VES: un fondo en bolívares, uno en dólares con su tasa, y un gasto en bolívares.
        fondoVes = await p.fondoDelLiceo.create({ data: { fecha: new Date('2026-09-01'), concepto: 'Saldo', moneda: 'VES', monto: 120000000, montoBase: 120000000 } });
        fondoUsd = await p.fondoDelLiceo.create({ data: { fecha: new Date('2026-09-02'), concepto: 'Donación', moneda: 'USD', monto: 100, tasa: 36500000, montoBase: 3650000000 } });
        gastoVes = await p.gasto.create({ data: { fecha: new Date('2026-09-03'), concepto: 'Tablero', categoria: 'MANTENIMIENTO', moneda: 'VES', monto: 7300000, montoBase: 7300000 } });
    }, 120000);

    afterAll(async () => {
        await prisma?.$disconnect();
    });

    it('RECONV-01: por defecto solo mira: dice qué tocaría y no cambia nada', async () => {
        const r = await reconvertirBolivares(prisma, 1_000_000);
        expect(r.aplicado).toBe(false);
        expect(r.filas.fondos_del_liceo).toBeGreaterThanOrEqual(2);
        expect(r.filas.payment_settings).toBe(1);
        const sigue = await (prisma as any).fondoDelLiceo.findUnique({ where: { id: fondoVes.id } });
        expect(Number(sigue.monto)).toBe(120000000);
    });

    it('RECONV-02: aplicado, lo de bolívares pasa al cono nuevo y lo de dólares no se toca', async () => {
        await reconvertirBolivares(prisma, 1_000_000, { aplicar: true });
        const p = prisma as any;
        const ves = await p.fondoDelLiceo.findUnique({ where: { id: fondoVes.id } });
        expect([Number(ves.monto), Number(ves.montoBase)]).toEqual([120, 120]);
        const usd = await p.fondoDelLiceo.findUnique({ where: { id: fondoUsd.id } });
        // 100 dólares siguen siendo 100; la tasa y el monto en base (VES) pierden los ceros.
        expect([Number(usd.monto), Number(usd.tasa), Number(usd.montoBase)]).toEqual([100, 36.5, 3650]);
        const gasto = await p.gasto.findUnique({ where: { id: gastoVes.id } });
        expect(Number(gasto.monto)).toBe(7.3);
        const ajustes = await p.paymentSettings.findUnique({ where: { id: 'liceo' } });
        expect([Number(ajustes.feeAmount), Number(ajustes.enrollmentAmount)]).toEqual([36, 50]);
        // La mora en porcentaje no es dinero: 5 % sigue siendo 5 %.
        expect(Number(ajustes.moraValor)).toBe(5);
    });

    it('RECONV-03: el factor tiene que ser una potencia de 10', async () => {
        await expect(reconvertirBolivares(prisma, 12345)).rejects.toThrow(/potencia de 10/);
    });
});
