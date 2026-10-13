import { test, expect, Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { WEB_BASE, loginViaUI } from './helpers';

/**
 * CONTRASTE: QUE NADA SE LEA MAL
 *
 * El botón "Ingresar" salió con letras oscuras sobre índigo. Los colores
 * estaban bien medidos en el papel; lo que falló fue el CÓDIGO que los juntaba
 * (`cn` se comía la clase del color). Medir la paleta no lo habría visto:
 * hay que medir lo que el navegador pinta de verdad.
 *
 * Esto usa axe (Deque), el mismo motor de las herramientas de accesibilidad de
 * Chrome, con la regla de contraste WCAG AA: 4,5:1 para texto normal y 3:1 para
 * texto grande. Se revisa en modo claro Y oscuro, en teléfono y escritorio.
 */

/**
 * Desde octubre 2026 TODA la app tiene modo oscuro (lib/modo-de-la-app.ts,
 * paleta-de-colores.js): en «oscuro» se elige el modo como lo haría la
 * persona, antes de abrir la pantalla.
 */
type Pantalla = { nombre: string; ruta: string; conSesion: boolean };

const PANTALLAS: Pantalla[] = [
    // Con el liceo en la dirección: sin slug, la pantalla de entrar no se pinta
    // —responde "no existe"— y se estaría midiendo el 404, no el formulario.
    { nombre: 'entrar', ruta: '/login?slug=instituto-testing', conSesion: false },
    { nombre: 'guía de diseño', ruta: '/diseno', conSesion: false },
    { nombre: 'panel', ruta: '/dashboard', conSesion: true },
    { nombre: 'usuarios', ruta: '/dashboard/usuarios', conSesion: true },
    { nombre: 'académico', ruta: '/dashboard/academico', conSesion: true },
    { nombre: 'configuración', ruta: '/dashboard/configuracion', conSesion: true },
    { nombre: 'ciclo', ruta: '/dashboard/academico/2026-2027', conSesion: true },
    { nombre: 'finanzas', ruta: '/dashboard/pagos', conSesion: true },
];

/** El modo y el color que eligió la persona, puestos antes de que la página arranque. */
async function elegir(page: Page, modo: 'claro' | 'oscuro', color = 'azul') {
    await page.addInitScript(
        ([m, c]) => {
            localStorage.setItem('gestiedu:modo-de-la-app', m);
            localStorage.setItem('gestiedu:color-de-la-app', c);
        },
        [modo, color]
    );
}

async function fallosDeContraste(page: Page) {
    const r = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze();
    return r.violations.flatMap((v) =>
        v.nodes.map((n) => `${n.target.join(' ')} → ${n.any[0]?.message ?? v.help}`)
    );
}

for (const esquema of ['light', 'dark'] as const) {
    for (const vista of [
        { nombre: 'teléfono', viewport: { width: 390, height: 844 } },
        { nombre: 'escritorio', viewport: { width: 1366, height: 900 } },
    ]) {
        test.describe(`Contraste · ${esquema === 'light' ? 'claro' : 'oscuro'} · ${vista.nombre}`, () => {
            test.use({ colorScheme: esquema, viewport: vista.viewport });

            for (const p of PANTALLAS) {
                test(`CONTRASTE: ${p.nombre}`, async ({ page }) => {
                    await elegir(page, esquema === 'dark' ? 'oscuro' : 'claro');
                    if (p.conSesion) await loginViaUI(page, 'admin@testing.edu.ve', '123456');
                    await page.goto(`${WEB_BASE}${p.ruta}`);
                    await page.waitForLoadState('networkidle');
                    if (esquema === 'dark' && p.ruta === '/diseno') {
                        await page.evaluate(() => document.documentElement.classList.add('dark'));
                    }
                    // Las animaciones de entrada pintan con opacidad parcial: se
                    // mide cuando ya terminaron, no a mitad.
                    await page.waitForTimeout(1500);

                    const fallos = await fallosDeContraste(page);
                    expect(fallos, fallos.join('\n')).toEqual([]);
                });
            }
        });
    }
}

/**
 * CADA COLOR DE LA APP (TEMA-UI-02). El color cambia la cabecera y los
 * botones: el amarillo lleva la letra oscura en la barra; los demás, blanca.
 * Se mide el Inicio y el ciclo, en claro y en oscuro, en el ordenador.
 */
for (const color of ['turquesa', 'violeta', 'amarillo', 'coral']) {
    for (const modo of ['claro', 'oscuro'] as const) {
        test.describe(`Contraste · color ${color} · ${modo}`, () => {
            test.use({ viewport: { width: 1366, height: 900 } });
            for (const ruta of ['/dashboard', '/dashboard/academico/2026-2027']) {
                test(`CONTRASTE: ${ruta}`, async ({ page }) => {
                    await elegir(page, modo, color);
                    await loginViaUI(page, 'admin@testing.edu.ve', '123456');
                    await page.goto(`${WEB_BASE}${ruta}`);
                    await page.waitForLoadState('networkidle');
                    await page.waitForTimeout(1500);
                    expect(await page.evaluate(() => document.documentElement.dataset.acento)).toBe(color);
                    const fallos = await fallosDeContraste(page);
                    expect(fallos, fallos.join('\n')).toEqual([]);
                });
            }
        });
    }
}
