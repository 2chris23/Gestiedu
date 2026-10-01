import { estadoDelPersonal, pagosDelPersonal, repartirAlPersonal, validarAcuerdo, type Acuerdo, type Nomina } from '../../services/finanzas.service';

/**
 * LA NÓMINA: LAS CUENTAS (NOMINA-C-*, 2026-10-01)
 *
 * Ciclo de agosto de 2026 a julio de 2027; vacaciones en agosto de 2027 no
 * entra (el ciclo acaba en julio), así que se marcan julio y agosto de 2026.
 */
const CICLO = { inicio: '2026-08-15', cierre: '2027-07-31' };
const NOMINA: Nomina = { diaDePago: 31, mesesDeVacaciones: ['2026-08'], cobraEnVacaciones: true, bonoCents: 0, fechaBono: null };
const acuerdo = (x: Partial<Acuerdo> = {}): Acuerdo => ({
    montoCents: 30000,
    frecuencia: 'MENSUAL',
    diaDePago: null,
    fechaUnica: null,
    cobraEnVacaciones: null,
    bonoCents: null,
    fechaBono: null,
    ...x,
});

describe('La nómina: las cuentas (NOMINA-C)', () => {
    it('NOMINA-C-01: mensual, el último día de cada mes (31 en septiembre es el 30)', () => {
        const p = pagosDelPersonal({ acuerdo: acuerdo(), nomina: NOMINA, ...CICLO });
        expect(p).toHaveLength(12);
        expect(p[0]).toMatchObject({ clave: 'S:2026-08', fecha: '2026-08-31', vacaciones: true });
        expect(p[1]).toMatchObject({ clave: 'S:2026-09', fecha: '2026-09-30' });
        expect(p.find((x) => x.clave === 'S:2027-02')?.fecha).toBe('2027-02-28');
    });

    it('NOMINA-C-02: quincenal, el 15 y el último; su día propio manda sobre el del liceo en mensual', () => {
        const q = pagosDelPersonal({ acuerdo: acuerdo({ frecuencia: 'QUINCENAL' }), nomina: NOMINA, ...CICLO });
        expect(q).toHaveLength(24);
        expect(q.slice(2, 4).map((x) => x.fecha)).toEqual(['2026-09-15', '2026-09-30']);
        const propio = pagosDelPersonal({ acuerdo: acuerdo({ diaDePago: 5 }), nomina: NOMINA, ...CICLO });
        expect(propio[1].fecha).toBe('2026-09-05');
    });

    it('NOMINA-C-03: vacaciones: sin cobrar esos meses (de la persona o del liceo) y con bono', () => {
        const sin = pagosDelPersonal({ acuerdo: acuerdo({ cobraEnVacaciones: false }), nomina: NOMINA, ...CICLO });
        expect(sin.find((x) => x.clave === 'S:2026-08')).toBeUndefined();
        expect(sin).toHaveLength(11);
        const delLiceo = pagosDelPersonal({ acuerdo: acuerdo(), nomina: { ...NOMINA, cobraEnVacaciones: false }, ...CICLO });
        expect(delLiceo).toHaveLength(11);
        // Lo suyo gana a lo del liceo.
        const suyo = pagosDelPersonal({ acuerdo: acuerdo({ cobraEnVacaciones: true }), nomina: { ...NOMINA, cobraEnVacaciones: false }, ...CICLO });
        expect(suyo).toHaveLength(12);
        const conBono = pagosDelPersonal({ acuerdo: acuerdo(), nomina: { ...NOMINA, bonoCents: 15000 }, ...CICLO });
        expect(conBono.find((x) => x.tipo === 'BONO')).toMatchObject({ clave: 'B', fecha: '2026-08-01', montoCents: 15000 });
        const bonoPropio = pagosDelPersonal({ acuerdo: acuerdo({ bonoCents: 20000, fechaBono: '2027-07-15' }), nomina: { ...NOMINA, bonoCents: 15000 }, ...CICLO });
        expect(bonoPropio.find((x) => x.tipo === 'BONO')).toMatchObject({ fecha: '2027-07-15', montoCents: 20000 });
    });

    it('NOMINA-C-04: pago único, en su fecha', () => {
        const u = pagosDelPersonal({ acuerdo: acuerdo({ frecuencia: 'UNICO', fechaUnica: '2026-11-20', montoCents: 5000 }), nomina: NOMINA, ...CICLO });
        expect(u).toEqual([expect.objectContaining({ clave: 'U', fecha: '2026-11-20', montoCents: 5000 })]);
    });

    it('NOMINA-C-05: estado y reparto de lo más viejo a lo más nuevo; lo que no llega queda como abono', () => {
        const p = pagosDelPersonal({ acuerdo: acuerdo(), nomina: NOMINA, ...CICLO });
        const e = estadoDelPersonal(p, new Map([['S:2026-08', 30000]]), '2026-10-05');
        expect(e.pagos[0].estado).toBe('PAGADO');
        expect(e.pagos[1].estado).toBe('VENCIDO'); // septiembre, vencido el 30
        expect(e.pagos[2].estado).toBe('PENDIENTE');
        expect(e.vencidoCents).toBe(30000);
        expect(e.proximo?.clave).toBe('S:2026-09');
        const reparto = repartirAlPersonal(40000, [e.pagos[2], e.pagos[1]]);
        expect(reparto).toEqual([
            { clave: 'S:2026-09', montoCents: 30000 },
            { clave: 'S:2026-10', montoCents: 10000 },
        ]);
    });

    it('NOMINA-C-06: lo que manda el admin se revisa', () => {
        expect(() => validarAcuerdo({ frecuencia: 'SEMANAL', monto: 10 })).toThrow();
        expect(() => validarAcuerdo({ frecuencia: 'MENSUAL', monto: 0 })).toThrow();
        expect(() => validarAcuerdo({ frecuencia: 'UNICO', monto: 10 })).toThrow(); // sin fecha
        expect(() => validarAcuerdo({ frecuencia: 'MENSUAL', monto: 10, diaDePago: 32 })).toThrow();
        expect(validarAcuerdo({ frecuencia: 'MENSUAL', monto: '300.50' }).montoCents).toBe(30050);
    });
});
