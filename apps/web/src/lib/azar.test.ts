import { conAzar, escalonar, esperaQuePide } from './azar';

/**
 * EL AZAR DE LAS ESPERAS (ESTAMPIDA-01, 2026-10-04): cuando vuelve la luz,
 * cada teléfono llama en su momento, no todos en el mismo segundo.
 */
describe('Las esperas con azar (ESTAMPIDA-01)', () => {
    it('conAzar queda dentro del margen, y dos teléfonos no esperan lo mismo', () => {
        expect(conAzar(15000, 0.3, () => 0)).toBe(10500);
        expect(conAzar(15000, 0.3, () => 1)).toBe(19500);
        const muchas = Array.from({ length: 200 }, () => conAzar(15000));
        expect(Math.min(...muchas)).toBeGreaterThanOrEqual(10500);
        expect(Math.max(...muchas)).toBeLessThanOrEqual(19500);
        expect(new Set(muchas).size).toBeGreaterThan(50);
    });

    it('escalonar reparte entre 0 y el tope', () => {
        expect(escalonar(4000, () => 0)).toBe(0);
        expect(escalonar(4000, () => 0.5)).toBe(2000);
    });

    it('Retry-After en segundos o en fecha; sin ella, nada', () => {
        expect(esperaQuePide('30')).toBe(30000);
        expect(esperaQuePide(new Date(10_000 + 5000).toUTCString(), 10_000)).toBeGreaterThanOrEqual(4000);
        expect(esperaQuePide('99999')).toBe(3_600_000);
        expect(esperaQuePide(null)).toBeNull();
        expect(esperaQuePide('mañana')).toBeNull();
    });
});
