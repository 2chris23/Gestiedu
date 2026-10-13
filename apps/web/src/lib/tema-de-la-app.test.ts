import { ACENTOS, ACENTO_POR_DEFECTO, COLOR_ANTES_DE_PINTAR, acentoGuardado, elegirAcento } from './tema-de-la-app';
import { MODO_ANTES_DE_PINTAR, elegirModo, esOscuro, modoGuardado } from './modo-de-la-app';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const paleta = require('../../paleta-de-colores');

/**
 * EL COLOR DE LA APP Y EL MODO OSCURO
 *
 * El color que elige cada persona cambia la cabecera y todo lo que se pulsa
 * (`indigo-*`); el modo oscuro, el resto. Lo que se mide aquí es lo que no
 * se ve a simple vista: que la letra se siga leyendo (4,5:1) con cualquier
 * color y en los dos modos, y que las dos listas de colores sean la misma.
 */
describe('El color de la app', () => {
    beforeEach(() => {
        localStorage.clear();
        document.documentElement.removeAttribute('data-acento');
        document.documentElement.classList.remove('dark');
    });

    it('TEMA-01: los colores de la pantalla son los mismos que los de la paleta', () => {
        expect(Object.keys(ACENTOS)).toEqual(Object.keys(paleta.ACENTOS));
        expect(ACENTO_POR_DEFECTO).toBe(paleta.ACENTO_POR_DEFECTO);
        for (const [id, a] of Object.entries(ACENTOS)) {
            // La muestra del selector es la cabecera que va a salir.
            expect(a.color.toLowerCase()).toBe(paleta.ACENTOS[id].cabecera.fondo.toLowerCase());
        }
    });

    it('TEMA-02: «Azul» es lo de siempre, idéntico', () => {
        const azul = paleta.ACENTOS.azul;
        expect(azul.cabecera.fondo).toBe('#0D47A1');
        expect(azul.acento).toBe('#00BFA5');
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        expect(azul.escala).toEqual(require('tailwindcss/colors').indigo);
    });

    it('TEMA-03: con cada color, la letra de la cabecera y la de los botones se lee (4,5:1)', () => {
        for (const [id, a] of Object.entries<any>(paleta.ACENTOS)) {
            const c = a.cabecera;
            expect([id, 'texto', paleta.contraste(c.texto, c.fondo) >= 4.5]).toEqual([id, 'texto', true]);
            expect([id, 'suave', paleta.contraste(c.suave, c.fondo) >= 4.5]).toEqual([id, 'suave', true]);
            // Y sobre las tarjetas de cristal de la franja (blanco al 10 %; el 14 % es al pasar el ratón).
            const vidrio = paleta.mezcla('#FFFFFF', c.fondo, 0.1);
            expect([id, 'vidrio', paleta.contraste(c.suave, vidrio) >= 4.5]).toEqual([id, 'vidrio', true]);
            // La letra del color sobre blanco (enlaces, «Ver ranking completo»).
            expect([id, 'tinta', paleta.contraste(c.tinta, '#FFFFFF') >= 4.5]).toEqual([id, 'tinta', true]);
            // El botón (`bg-indigo-600 text-white`) y la letra `text-indigo-700`.
            expect([id, '600', paleta.contraste(a.escala['600'], '#FFFFFF') >= 4.5]).toEqual([id, '600', true]);
            expect([id, '700', paleta.contraste(a.escala['700'], '#FFFFFF') >= 4.5]).toEqual([id, '700', true]);
        }
    });

    it('TEMA-04: en oscuro, la letra gris y la de cada color se lee sobre las cajas (#121212)', () => {
        const caja = paleta.OSCURO.caja;
        for (const t of ['500', '600', '700', '800', '900']) {
            expect([t, paleta.contraste(paleta.NEUTRO_OSCURO.t[t], caja) >= 4.5]).toEqual([t, true]);
        }
        for (const f of paleta.DE_COLOR) {
            const oscuro = paleta.deColorOscuro(paleta.escalaDe(f));
            for (const t of ['600', '700']) {
                // Sobre la caja y sobre su propio tinte claro de fondo (la chapa «Aprobado»).
                expect([f, t, paleta.contraste(oscuro.t[t], caja) >= 4.5]).toEqual([f, t, true]);
                expect([f, t, 'tinte', paleta.contraste(oscuro.t[t], oscuro.f['100']) >= 4.5]).toEqual([f, t, 'tinte', true]);
            }
        }
    });

    it('TEMA-08: en oscuro, la franja del Inicio lleva el color elegido (como Rial) y su letra se lee', () => {
        for (const [id, a] of Object.entries<any>(paleta.ACENTOS)) {
            const { arriba, medio } = paleta.franjaOscura(a.cabecera.fondo);
            for (const [donde, fondo] of [['arriba', arriba], ['medio', medio]]) {
                expect([id, donde, 'blanca', paleta.contraste('#FFFFFF', fondo) >= 4.5]).toEqual([id, donde, 'blanca', true]);
                expect([id, donde, 'suave', paleta.contraste('#B3B3B3', fondo) >= 4.5]).toEqual([id, donde, 'suave', true]);
            }
            // Y no es negro: se ve el color.
            expect([id, arriba.toLowerCase() !== '#000000']).toEqual([id, true]);
        }
    });

    it('TEMA-05: elegir un color pone su marca en el <html> y se recuerda', () => {
        expect(acentoGuardado()).toBe('azul');
        elegirAcento('amarillo');
        expect(document.documentElement.dataset.acento).toBe('amarillo');
        expect(acentoGuardado()).toBe('amarillo');
        // El guion del <head> hace lo mismo antes de pintar.
        document.documentElement.removeAttribute('data-acento');
        new Function(COLOR_ANTES_DE_PINTAR)();
        expect(document.documentElement.dataset.acento).toBe('amarillo');
    });

    it('TEMA-06: el modo: claro la primera vez, oscuro si se elige, y «Como el teléfono» pregunta al sistema', () => {
        expect(modoGuardado()).toBe('claro');
        elegirModo('oscuro');
        expect(document.documentElement.classList.contains('dark')).toBe(true);
        elegirModo('claro');
        expect(document.documentElement.classList.contains('dark')).toBe(false);

        const original = window.matchMedia;
        window.matchMedia = ((q: string) => ({ matches: q.includes('dark'), addEventListener() {}, removeEventListener() {} })) as any;
        try {
            expect(esOscuro('sistema')).toBe(true);
            elegirModo('sistema');
            expect(document.documentElement.classList.contains('dark')).toBe(true);
            document.documentElement.classList.remove('dark');
            new Function(MODO_ANTES_DE_PINTAR)();
            expect(document.documentElement.classList.contains('dark')).toBe(true);
        } finally {
            window.matchMedia = original;
        }
    });

    it('TEMA-07: el papel nunca sale oscuro (lo oscuro es solo de pantalla y `.modo-claro` lo devuelve)', () => {
        const css = paleta.cssDeLaPaleta();
        expect(css['.dark']).toBeUndefined();
        expect(css['@media screen']['.dark']).toBeDefined();
        expect(css['@media screen']['.dark .modo-claro']['--blanco-f']).toBe('255 255 255');
    });
});
