import {
    aMonedaBase,
    cuotasDelCiclo,
    estadoDelAlumno,
    repartir,
    validarConfiguracion,
} from '../../services/pagos.service';

/**
 * EL CÁLCULO DE PAGOS, SIN BASE DE DATOS
 *
 * Ciclo de prueba: 15-09-2026 al 31-07-2027 (septiembre a julio: 11 meses).
 */

const INICIO = '2026-09-15';
const CIERRE = '2027-07-31';
const base = { frequency: 'MONTHLY' as const, dueDay: 5, feeCents: 3000, enrollmentEnabled: false, enrollmentCents: 0 };

describe('Cuotas del ciclo', () => {
    it('PAG-01: mensual → una por mes de septiembre a julio (11)', () => {
        const c = cuotasDelCiclo({ config: base, inicio: INICIO, cierre: CIERRE });
        expect(c.map((x) => x.key)).toEqual([
            '2026-09', '2026-10', '2026-11', '2026-12', '2027-01', '2027-02', '2027-03', '2027-04', '2027-05', '2027-06', '2027-07',
        ]);
        expect(c.every((x) => x.amountCents === 3000)).toBe(true);
    });

    it('PAG-02: el primer vencimiento no cae antes de que empiece el ciclo', () => {
        const [sep, oct] = cuotasDelCiclo({ config: base, inicio: INICIO, cierre: CIERRE });
        expect(sep.dueDate).toBe('2026-09-15'); // el 5 de septiembre el ciclo aún no empezaba
        expect(oct.dueDate).toBe('2026-10-05');
    });

    it('PAG-03: quincenal → dos por mes, el día elegido y 15 días después', () => {
        const c = cuotasDelCiclo({ config: { ...base, frequency: 'BIWEEKLY', dueDay: 10 }, inicio: '2026-10-01', cierre: '2026-11-30' });
        expect(c.map((x) => `${x.key}@${x.dueDate}`)).toEqual([
            '2026-10-1@2026-10-10', '2026-10-2@2026-10-25', '2026-11-1@2026-11-10', '2026-11-2@2026-11-25',
        ]);
    });

    it('PAG-04: en febrero, un día 28+15 se ajusta al último día del mes', () => {
        const c = cuotasDelCiclo({ config: { ...base, frequency: 'BIWEEKLY', dueDay: 28 }, inicio: '2027-02-01', cierre: '2027-02-28' });
        expect(c.map((x) => x.dueDate)).toEqual(['2027-02-28', '2027-02-28']);
    });

    it('PAG-05: por lapso → una por lapso, en orden, al empezar cada uno', () => {
        const c = cuotasDelCiclo({
            config: { ...base, frequency: 'PER_PERIOD' },
            inicio: INICIO,
            cierre: CIERRE,
            lapsos: [
                { id: 'l2', name: '2do Lapso', startDate: '2027-01-08' },
                { id: 'l1', name: '1er Lapso', startDate: '2026-09-15' },
            ],
        });
        expect(c.map((x) => [x.key, x.label, x.dueDate])).toEqual([
            ['P:l1', '1er Lapso', '2026-09-15'],
            ['P:l2', '2do Lapso', '2027-01-08'],
        ]);
    });

    it('PAG-06: inscripción primero; y el día propio del alumno manda', () => {
        const c = cuotasDelCiclo({
            config: { ...base, enrollmentEnabled: true, enrollmentCents: 5000 },
            inicio: INICIO,
            cierre: CIERRE,
            diaDelAlumno: 20,
        });
        expect(c[0]).toMatchObject({ key: 'INS', amountCents: 5000, dueDate: INICIO });
        expect(c[2].dueDate).toBe('2026-10-20');
    });
});

describe('Estado del alumno', () => {
    const cuotas = cuotasDelCiclo({ config: base, inicio: INICIO, cierre: CIERRE });
    const estado = (pagado: Record<string, number>, hoy: string, gracia = 0, exento = false) =>
        estadoDelAlumno({ cuotas, pagadoPorCuota: new Map(Object.entries(pagado)), hoy, graceDays: gracia, exento });

    it('PAG-07: el día del vencimiento todavía no debe; al día siguiente sí', () => {
        expect(estado({ '2026-09': 3000 }, '2026-10-05').state).toBe('AL_DIA');
        const r = estado({ '2026-09': 3000 }, '2026-10-06');
        expect(r.state).toBe('DEBE');
        expect([r.overdueCount, r.owedCents]).toEqual([1, 3000]);
    });

    it('PAG-08: los días de gracia corren el vencimiento', () => {
        expect(estado({ '2026-09': 3000 }, '2026-10-08', 3).state).toBe('AL_DIA');
        expect(estado({ '2026-09': 3000 }, '2026-10-09', 3).state).toBe('DEBE');
    });

    it('PAG-09: un abono no completa la cuota; lo que falta sigue debiéndose', () => {
        const r = estado({ '2026-09': 3000, '2026-10': 1000 }, '2026-10-20');
        const oct = r.cuotas.find((c) => c.key === '2026-10')!;
        expect([oct.state, oct.paidCents, oct.pendingCents]).toEqual(['VENCIDA', 1000, 2000]);
        expect(r.owedCents).toBe(2000);
        const antes = estado({ '2026-09': 3000, '2026-10': 1000 }, '2026-10-01').cuotas.find((c) => c.key === '2026-10')!;
        expect(antes.state).toBe('ABONADA');
    });

    it('PAG-10: todo pagado → año pagado; exonerado → no debe aunque no pague', () => {
        const todo = Object.fromEntries(cuotas.map((c) => [c.key, 3000]));
        expect(estado(todo, '2026-10-20').state).toBe('ANO_PAGADO');
        const ex = estado({}, '2027-08-01', 0, true);
        expect([ex.state, ex.owedCents, ex.overdueCount]).toEqual(['EXONERADO', 0, 0]);
    });

    it('PAG-11: pagar de más en una cuota no "sobra" para la siguiente', () => {
        const r = estado({ '2026-09': 9000 }, '2026-10-20');
        expect(r.cuotas[0].paidCents).toBe(3000);
        expect(r.owedCents).toBe(3000);
    });
});

describe('Reparto y monedas', () => {
    it('PAG-12: se reparte de la cuota más vieja a la más nueva, sin importar el orden elegido', () => {
        const r = estadoDelAlumno({
            cuotas: cuotasDelCiclo({ config: base, inicio: INICIO, cierre: CIERRE }),
            pagadoPorCuota: new Map([['2026-09', 1000]]),
            hoy: '2026-09-01',
            graceDays: 0,
            exento: false,
        });
        const [sep, oct, nov] = r.cuotas;
        expect(repartir(5500, [nov, sep, oct])).toEqual([
            { key: '2026-09', amountCents: 2000 },
            { key: '2026-10', amountCents: 3000 },
            { key: '2026-11', amountCents: 500 },
        ]);
    });

    it('PAG-13: bolívares a dólares con la tasa, en céntimos exactos', () => {
        // 1.100,00 Bs a 36,50 Bs/$ = 30,14 $
        expect(aMonedaBase(110000, 'VES', 'USD', 36.5)).toBe(3014);
        expect(aMonedaBase(3000, 'USD', 'VES', 36.5)).toBe(109500);
        expect(aMonedaBase(3000, 'USD', 'USD', null)).toBe(3000);
        expect(() => aMonedaBase(110000, 'VES', 'USD', null)).toThrow(/tasa/);
    });

    it('PAG-14: 0,10 + 0,20 da 0,30 (céntimos, no coma flotante)', () => {
        const cuotas = [{ key: 'A', label: 'A', dueDate: '2026-01-01', amountCents: 30, kind: 'CUOTA' as const }];
        const r = estadoDelAlumno({ cuotas, pagadoPorCuota: new Map([['A', 10 + 20]]), hoy: '2026-02-01', graceDays: 0, exento: false });
        expect(r.state).toBe('ANO_PAGADO');
    });
});

describe('Validar configuración', () => {
    const buena = {
        enabled: true, frequency: 'MONTHLY', dueMode: 'SAME_DAY', dueDay: 5, graceDays: 3,
        baseCurrency: 'USD', acceptedCurrencies: 'BOTH', feeAmount: '30.00',
        enrollmentEnabled: true, enrollmentAmount: 50, methods: ['Efectivo', ' Pago Móvil ', 'Efectivo', '<b>x</b>'],
    };

    it('PAG-15: limpia métodos repetidos y con HTML, y guarda montos con 2 decimales', () => {
        const v = validarConfiguracion(buena);
        expect(v.methods).toEqual(['Efectivo', 'Pago Móvil']);
        expect([v.feeAmount, v.enrollmentAmount]).toEqual(['30.00', '50.00']);
    });

    it('PAG-16: rechaza lo que no tiene sentido', () => {
        for (const cambio of [
            { dueDay: 31 }, { dueDay: 0 }, { graceDays: -1 }, { frequency: 'DIARIO' },
            { feeAmount: -5 }, { feeAmount: 'abc' }, { methods: [] },
            { acceptedCurrencies: 'VES', baseCurrency: 'USD' },
        ]) {
            expect(() => validarConfiguracion({ ...buena, ...cambio })).toThrow();
        }
    });
});
