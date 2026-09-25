import { cn, TAMANOS_DE_LETRA, SOMBRAS, RADIOS } from './utils';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const config = require('../../tailwind.config.js');

/**
 * `cn` NO PUEDE BORRAR EL COLOR DEL TEXTO
 *
 * Así salió el botón "Ingresar" con letras oscuras sobre índigo: `cn` tomaba
 * `text-cuerpo` (un tamaño) por un color y se comía `text-indigo-encima`.
 */
describe('cn con los nombres propios del diseño', () => {
    it('CN-01: un tamaño propio no borra el color del texto', () => {
        const clases = cn('bg-indigo text-indigo-encima', 'h-11 px-5 text-cuerpo').split(' ');
        expect(clases).toContain('text-indigo-encima');
        expect(clases).toContain('text-cuerpo');
    });

    it('CN-02: dos tamaños propios sí chocan, y gana el último', () => {
        expect(cn('text-micro', 'text-titulo')).toBe('text-titulo');
    });

    it('CN-03: una sombra propia no borra el color de la sombra ni al revés', () => {
        expect(cn('shadow-1', 'shadow-3')).toBe('shadow-3');
    });

    it('CN-04: todos los tamaños, sombras y radios del tailwind.config están enseñados a cn', () => {
        const extend = config.theme.extend;
        expect([...TAMANOS_DE_LETRA].sort()).toEqual(Object.keys(extend.fontSize).sort());
        expect([...SOMBRAS].sort()).toEqual(Object.keys(extend.boxShadow).filter((k) => k !== 'none').sort());
        for (const r of RADIOS) expect(Object.keys(extend.borderRadius)).toContain(r);
        // Cada tamaño propio, junto a un color, deja los dos.
        for (const t of TAMANOS_DE_LETRA) {
            expect(cn('text-coral-hondo', `text-${t}`).split(' ')).toHaveLength(2);
        }
    });
});
