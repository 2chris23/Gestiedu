import { estadoDelMes, mesesDelCiclo, nombreDelMes, porcentaje, porMes, rejillaDelMes } from './calendario-del-ciclo';

/** EL CICLO COMO CALENDARIO (2026-10-01): las cuentas sin pantalla. */
describe('El calendario del ciclo', () => {
    it('los meses de un ciclo, de agosto a julio', () => {
        const meses = mesesDelCiclo('2026-08-15', '2027-07-31');
        expect(meses).toHaveLength(12);
        expect(meses[0]).toBe('2026-08');
        expect(meses[11]).toBe('2027-07');
        expect(nombreDelMes('2027-01')).toBe('Enero 2027');
    });

    it('un mes en semanas, lunes primero, siempre filas de siete', () => {
        // 1 de octubre de 2026 es jueves: tres huecos antes (L, M, X).
        const octubre = rejillaDelMes('2026-10');
        expect(octubre.slice(0, 4)).toEqual([null, null, null, '2026-10-01']);
        expect(octubre.length % 7).toBe(0);
        expect(octubre.filter(Boolean)).toHaveLength(31);
        // Febrero de 2027 empieza en lunes y tiene 28 días: cuatro semanas justas.
        expect(rejillaDelMes('2027-02')).toHaveLength(28);
    });

    it('el porcentaje no divide por cero ni pasa de 100', () => {
        expect(porcentaje(0, 0)).toBe(0);
        expect(porcentaje(62, 100)).toBe(62);
        expect(porcentaje(150, 100)).toBe(100);
    });

    it('qué mes es: pasado, el de hoy o por venir', () => {
        expect(estadoDelMes('2026-09', '2026-10-01')).toBe('pasado');
        expect(estadoDelMes('2026-10', '2026-10-01')).toBe('actual');
        expect(estadoDelMes('2026-11', '2026-10-01')).toBe('futuro');
    });

    it('agrupa por mes', () => {
        const m = porMes([{ f: '2026-10-05' }, { f: '2026-10-20' }, { f: '2026-11-01' }], (x) => x.f);
        expect(m.get('2026-10')).toHaveLength(2);
        expect(m.get('2026-11')).toHaveLength(1);
    });
});
