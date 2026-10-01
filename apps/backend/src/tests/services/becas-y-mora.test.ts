import { cuotasDelCiclo, estadoDelAlumno } from '../../services/pagos.service';

/**
 * BECAS, DESCUENTOS Y MORA: LAS CUENTAS (BECA-*, 2026-10-01)
 *
 * Cuota mensual de 30 $ el día 1, sin gracia. Mora: 5 días después del
 * vencimiento.
 */
const CONFIG = { frequency: 'MONTHLY' as const, dueDay: 1, feeCents: 3000, enrollmentEnabled: false, enrollmentCents: 0 };
const CICLO = { inicio: '2026-09-01', cierre: '2026-11-30' };

describe('Becas, descuentos y mora (BECA)', () => {
    it('BECA-01: el descuento baja cada cuota y se recuerda lo que valía', () => {
        const c = cuotasDelCiclo({ config: CONFIG, ...CICLO, descuentoPct: 20 });
        expect(c.map((x) => x.amountCents)).toEqual([2400, 2400, 2400]);
        expect(c[0].fullCents).toBe(3000);
        expect(cuotasDelCiclo({ config: CONFIG, ...CICLO })[0].fullCents).toBeUndefined();
    });

    it('BECA-02: mora fija, una vez, a quien no pagó a tiempo; quien pagó a tiempo no la paga', () => {
        const cuotas = cuotasDelCiclo({ config: CONFIG, ...CICLO });
        const mora = (ultimo: Map<string, string>) => ({ tipo: 'FIJA' as const, valorCents: 500, diasDespues: 5, ultimoPago: ultimo });
        // Septiembre sin pagar, hoy 10 de octubre: septiembre lleva mora; octubre (vence el 1, mora el 6) también.
        const sinPagar = estadoDelAlumno({ cuotas, pagadoPorCuota: new Map(), hoy: '2026-10-10', graceDays: 0, exento: false, mora: mora(new Map()) });
        expect(sinPagar.cuotas.map((c) => c.lateFeeCents ?? 0)).toEqual([500, 500, 0]);
        expect(sinPagar.owedCents).toBe(3500 * 2);
        // Septiembre pagado el 3 (a tiempo): sin mora.
        const aTiempo = estadoDelAlumno({
            cuotas,
            pagadoPorCuota: new Map([['2026-09', 3000]]),
            hoy: '2026-10-10',
            graceDays: 0,
            exento: false,
            mora: mora(new Map([['2026-09', '2026-09-03']])),
        });
        expect(aTiempo.cuotas[0]).toMatchObject({ state: 'PAGADA', amountCents: 3000 });
        // Septiembre pagado el 20 (tarde), solo los 30: le falta la mora.
        const tarde = estadoDelAlumno({
            cuotas,
            pagadoPorCuota: new Map([['2026-09', 3000]]),
            hoy: '2026-10-10',
            graceDays: 0,
            exento: false,
            mora: mora(new Map([['2026-09', '2026-09-20']])),
        });
        expect(tarde.cuotas[0]).toMatchObject({ state: 'VENCIDA', pendingCents: 500 });
    });

    it('BECA-03: mora en porcentaje (centésimas de punto: 1000 = 10 %)', () => {
        const cuotas = cuotasDelCiclo({ config: CONFIG, ...CICLO });
        const r = estadoDelAlumno({ cuotas, pagadoPorCuota: new Map(), hoy: '2026-09-20', graceDays: 0, exento: false, mora: { tipo: 'PORCENTAJE', valorCents: 1000, diasDespues: 5, ultimoPago: new Map() } });
        expect(r.cuotas[0].lateFeeCents).toBe(300);
    });

    it('BECA-04: al exonerado no se le cobra mora, ni se le debe nada', () => {
        const cuotas = cuotasDelCiclo({ config: CONFIG, ...CICLO });
        const r = estadoDelAlumno({ cuotas, pagadoPorCuota: new Map(), hoy: '2026-11-20', graceDays: 0, exento: true, mora: { tipo: 'FIJA', valorCents: 500, diasDespues: 0, ultimoPago: new Map() } });
        expect(r.cuotas.every((c) => !c.lateFeeCents)).toBe(true);
        expect(r.owedCents).toBe(0);
    });
});
