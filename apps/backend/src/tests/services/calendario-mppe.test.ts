import { calendarioComoElMPPE, domingoDePascua } from '../../utils/calendario-mppe';

/**
 * El calendario escolar del MPPE como plantilla. La misma cuenta está en la
 * web (`apps/web/src/lib/calendario-mppe.ts`) con estas mismas pruebas.
 */
const ymd = (f: Date) => f.toISOString().slice(0, 10);
const diaDeLaSemana = (s: string) => new Date(`${s}T00:00:00Z`).getUTCDay();

describe('El calendario del MPPE (CAL-MPPE-01…03)', () => {
    it('CAL-MPPE-01: el domingo de Pascua de varios años', () => {
        expect(ymd(domingoDePascua(2024))).toBe('2024-03-31');
        expect(ymd(domingoDePascua(2025))).toBe('2025-04-20');
        expect(ymd(domingoDePascua(2026))).toBe('2026-04-05');
        expect(ymd(domingoDePascua(2027))).toBe('2027-03-28');
        expect(ymd(domingoDePascua(2030))).toBe('2030-04-21');
        expect(ymd(domingoDePascua(2038))).toBe('2038-04-25');
    });

    it('CAL-MPPE-02: el de 2025-2026 sale como el que publicó el Ministerio', () => {
        const c = calendarioComoElMPPE(2025);
        expect(c.nombre).toBe('2025-2026');
        expect(c.inicioDelPersonal).toBe('2025-09-08');
        expect(c.inicio).toBe('2025-09-15');
        expect(c.fin).toBe('2026-07-31');
        expect(c.lapsos[0]).toEqual({
            nombre: 'Primer Lapso', inicio: '2025-09-15', fin: '2025-12-12', inicioDelPlan: '2025-10-15', nombreAntesDelPlan: 'Diagnóstico',
        });
        expect(c.lapsos[1]).toMatchObject({ nombre: 'Segundo Lapso', inicio: '2026-01-12', fin: '2026-03-27' });
        expect(c.lapsos[2]).toMatchObject({ nombre: 'Tercer Lapso', inicio: '2026-04-06', fin: '2026-07-31' });
        const feriado = (n: string) => c.feriados.find((f) => f.nombre === n);
        expect(feriado('Carnaval')).toMatchObject({ desde: '2026-02-16', hasta: '2026-02-17' });
        expect(feriado('Semana Santa')).toMatchObject({ desde: '2026-04-02', hasta: '2026-04-03' });
        expect(feriado('Vacaciones de Navidad')).toMatchObject({ desde: '2025-12-13', hasta: '2026-01-11' });
    });

    it('CAL-MPPE-03: veinte años seguidos, los lapsos van en orden y sin pisarse', () => {
        for (let anio = 2020; anio <= 2040; anio++) {
            const c = calendarioComoElMPPE(anio);
            expect(c.inicio).toBe(c.lapsos[0].inicio);
            expect(c.fin).toBe(c.lapsos[2].fin);
            for (const [i, l] of c.lapsos.entries()) {
                expect(l.inicio < l.fin).toBe(true);
                expect(diaDeLaSemana(l.inicio)).toBe(1); // empieza un lunes
                if (i < 2) {
                    expect(diaDeLaSemana(l.fin)).toBe(5); // acaba un viernes
                    expect(l.fin < c.lapsos[i + 1].inicio).toBe(true);
                }
                if (l.inicioDelPlan) expect(l.inicioDelPlan > l.inicio && l.inicioDelPlan < l.fin).toBe(true);
            }
            // Semana Santa cae entre el 2º y el 3er lapso.
            const santa = c.feriados.find((f) => f.nombre === 'Semana Santa')!;
            expect(santa.desde > c.lapsos[1].fin && santa.hasta < c.lapsos[2].inicio).toBe(true);
            // El carnaval, dentro del 2º.
            const carnaval = c.feriados.find((f) => f.nombre === 'Carnaval')!;
            expect(carnaval.desde >= c.lapsos[1].inicio && carnaval.hasta <= c.lapsos[1].fin).toBe(true);
        }
    });
});
