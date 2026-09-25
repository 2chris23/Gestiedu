import { test, expect, type Page } from '@playwright/test';
import { WEB_BASE, TENANT_SLUG, loginViaUI, loginApi, injectSessionCookies, captureEvidence } from './helpers';
// Las reglas viven en un solo sitio y las usan dos: esta prueba y la auditoría
// que saca la hoja de contactos (`npm run movil`).
import {
    MEDIR,
    TELEFONO,
    BANDA_ARRIBA,
    BANDA_ABAJO,
    DEDO,
    LETRA,
    ZONAS_DE_UN_TELEFONO,
    QUE_SIGNIFICA,
} from '../../scripts/reglas-del-telefono.mjs';

/**
 * QUE NO VUELVA A ENTRAR POR LA PUERTA DE ATRÁS
 *
 * Seis cosas se rompen en un teléfono sin dar ningún error, solo «se ve raro»,
 * y cada una de las seis estuvo rota en 20 o 30 pantallas a la vez:
 *
 *   ancho        la pantalla se sale de ancho;
 *   arrastre     algo de dentro hay que arrastrarlo de lado;
 *   banda-arriba el reloj del teléfono tapa contenido;
 *   banda-abajo  la barra de gestos tapa contenido;
 *   dedo         lo que se pulsa mide menos de 44 px;
 *   letra        hay texto por debajo de 12 px.
 *
 * Aquí se mira un puñado de pantallas —las que más se usan— en cada tanda. El
 * recorrido completo, con foto de cada una, es `npm run movil`, que además
 * acepta `--exigir` para acabar en rojo.
 *
 * Lo de las bandas del sistema tiene truco: en un ordenador
 * `env(safe-area-inset-top)` vale 0, así que la app no lee `env()` a pelo sino
 * a través de dos variables, y aquí se les pone el valor de un Android de
 * verdad. Ver `globals.css`.
 */

const PANTALLAS: Array<[string, string]> = [
    ['Inicio', '/dashboard'],
    ['Usuarios', '/dashboard/usuarios'],
    ['Horarios', '/dashboard/horarios'],
    ['Calendario', '/dashboard/calendario'],
];

type Falta = { regla: string; detalle: string };

const AJUSTES = { bandaArriba: BANDA_ARRIBA, bandaAbajo: BANDA_ABAJO, dedo: DEDO, letra: LETRA };

async function esperarAQueTermine(page: Page, tope = 20000) {
    await page.waitForLoadState('networkidle', { timeout: tope }).catch(() => {});
    const hasta = Date.now() + tope;
    while (Date.now() < hasta) {
        const sigue = await page
            .evaluate(() => {
                const texto = document.body?.innerText || '';
                if (/\bCargando\b|\bLoading\b/i.test(texto)) return true;
                return Array.from(document.querySelectorAll('.animate-pulse, .animate-latir')).some((el) => {
                    if (el.textContent && el.textContent.trim().length > 0) return false;
                    const r = el.getBoundingClientRect();
                    return r.width >= 60 && r.height >= 12;
                });
            })
            .catch(() => false);
        if (!sigue) {
            await page.waitForTimeout(600);
            return;
        }
        await page.waitForTimeout(500);
    }
}

test.describe('En el teléfono', () => {
    test.use({ viewport: TELEFONO, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });

    test('MOVIL-01: las pantallas de todos los días cumplen las seis reglas', async ({ page }, testInfo) => {
        try {
            await loginViaUI(page, 'admin@testing.edu.ve');
            await page.waitForURL('**/dashboard**');

            const faltas: string[] = [];

            for (const [titulo, ruta] of PANTALLAS) {
                await page.goto(`${WEB_BASE}${ruta}`, { waitUntil: 'domcontentloaded' });
                await esperarAQueTermine(page);
                await page.addStyleTag({ content: ZONAS_DE_UN_TELEFONO });
                await page.waitForTimeout(300);

                const arriba = (await page.evaluate(MEDIR, AJUSTES)) as Falta[];
                await page.evaluate(() => window.scrollBy(0, 400));
                await page.waitForTimeout(400);
                const alBajar = (await page.evaluate(MEDIR, AJUSTES)) as Falta[];

                const todas: Falta[] = [...arriba];
                for (const f of alBajar) {
                    if (!todas.some((x) => x.regla === f.regla)) todas.push(f);
                }

                for (const f of todas) {
                    faltas.push(
                        `${titulo} (${ruta}) — ${QUE_SIGNIFICA[f.regla] ?? f.regla}: ${f.detalle}`
                    );
                }
            }

            expect(faltas, `\n${faltas.join('\n')}\n\nLa hoja completa: npm run movil`).toEqual([]);
        } catch (error) {
            await captureEvidence(testInfo, page, 'MOVIL-01', 'Las seis reglas del teléfono', error);
            throw error;
        }
    });

    test('MOVIL-02: la barra de abajo lleva Inicio en el centro, y se esconde al bajar', async ({ page }, testInfo) => {
        try {
            await loginViaUI(page, 'admin@testing.edu.ve', '123456', TENANT_SLUG);
            await page.waitForURL('**/dashboard**');

            const barra = page.getByRole('navigation', { name: 'Navegación principal' });
            await expect(barra).toBeVisible();

            // El sitio de honor —el del medio— es Inicio, no un cajón de sastre.
            await expect(barra.getByRole('link', { name: 'Inicio' })).toBeVisible();

            const dondeEstaba = await barra.boundingBox();

            // Al bajar se aparta, pero nunca del todo: la franja de la barra de
            // gestos se queda tapada.
            await page.evaluate(() => window.scrollBy(0, 600));
            await page.waitForTimeout(600);
            const escondida = await barra.boundingBox();

            expect(dondeEstaba).not.toBeNull();
            expect(escondida).not.toBeNull();
            expect(escondida!.y).toBeGreaterThan(dondeEstaba!.y);

            // Y la casita de Inicio, que sobresale por encima de la barra, no
            // se queda asomando: un medio círculo morado flotando sobre el
            // contenido (visto en un Motorola).
            const loQueAsoma = await barra.evaluate((nav) => {
                const alto = window.visualViewport?.height ?? window.innerHeight;
                let arriba = Infinity;
                for (const el of [nav, ...Array.from(nav.querySelectorAll('*'))]) {
                    let opacidad = 1;
                    for (let p: Element | null = el; p && p !== document.body; p = p.parentElement) {
                        opacidad *= parseFloat(getComputedStyle(p).opacity);
                    }
                    const caja = el.getBoundingClientRect();
                    if (opacidad < 0.05 || caja.height === 0) continue;
                    arriba = Math.min(arriba, caja.top);
                }
                const franja = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--zona-segura-abajo')) || 0;
                return alto - arriba - franja;
            });
            expect(loQueAsoma).toBeLessThanOrEqual(1);
        } catch (error) {
            await captureEvidence(testInfo, page, 'MOVIL-02', 'La barra de abajo', error);
            throw error;
        }
    });
});

/**
 * NO SOLO UN TELÉFONO DE PIE
 *
 * Todo lo de arriba se mide en UN aparato: un teléfono de 390×844, de pie. La
 * gente del liceo usa también el teléfono tumbado (para el horario y el plan
 * de evaluación, a propósito), tabletas, el portátil del profesor y el
 * ordenador de la secretaría, y ninguno se había medido nunca.
 *
 * En los cuatro se exige que nada se salga de ancho ni haya que arrastrar de
 * lado. El dedo y la letra solo en los táctiles: con ratón, un botón de 32 px
 * se acierta sin problema. Las bandas del reloj y de los gestos son cosa del
 * teléfono de pie y ya se miden arriba.
 */
const OTROS_APARATOS = [
    { nombre: 'teléfono tumbado', viewport: { width: 844, height: 390 }, tactil: true },
    { nombre: 'tableta', viewport: { width: 768, height: 1024 }, tactil: true },
    { nombre: 'portátil', viewport: { width: 1366, height: 768 }, tactil: false },
    { nombre: 'escritorio', viewport: { width: 1920, height: 1080 }, tactil: false },
];

test('MOVIL-03: en el teléfono tumbado, la tableta, el portátil y el escritorio, nada se sale ni hay que arrastrar', async ({ browser }, testInfo) => {
    const faltas: string[] = [];

    for (const aparato of OTROS_APARATOS) {
        const contexto = await browser.newContext({
            viewport: aparato.viewport,
            isMobile: aparato.tactil && aparato.viewport.width < 1024,
            hasTouch: aparato.tactil,
        });
        const page = await contexto.newPage();
        try {
            // Una sesión propia por aparato, como en la vida real. Prestar la
            // misma a los cuatro no vale: la llave de volver a entrar se
            // cambia en cada uso, y un aparato con la vieja es, para el
            // servidor, alguien que la robó (se cierra la sesión entera).
            const sesion = await loginApi('admin@testing.edu.ve', '123456', true, TENANT_SLUG, true);
            await injectSessionCookies(page, sesion);

            for (const [titulo, ruta] of PANTALLAS) {
                await page.goto(`${WEB_BASE}${ruta}`, { waitUntil: 'domcontentloaded' });
                await esperarAQueTermine(page);
                const medidas = (await page.evaluate(MEDIR, {
                    bandaArriba: 0,
                    bandaAbajo: 0,
                    dedo: aparato.tactil ? DEDO : 0,
                    letra: aparato.tactil ? LETRA : 0,
                })) as Falta[];
                // Las bandas del reloj y de los gestos solo existen en el
                // teléfono de pie (MOVIL-01): aquí no se miran.
                for (const f of medidas.filter((m) => !m.regla.startsWith('banda'))) {
                    faltas.push(`${aparato.nombre} ${aparato.viewport.width}×${aparato.viewport.height} · ${titulo} — ${QUE_SIGNIFICA[f.regla] ?? f.regla}: ${f.detalle}`);
                }
            }
        } catch (error) {
            await captureEvidence(testInfo, page, 'MOVIL-03', aparato.nombre, error);
            throw error;
        } finally {
            await contexto.close();
        }
    }

    expect(faltas, `\n${faltas.join('\n')}\n`).toEqual([]);
});

/**
 * EL TELÉFONO TUMBADO NO ES UNA TABLETA
 *
 * El Motorola G13 del dueño, de lado, mide 1075 × 484 px: pasa de 1024 de
 * ancho, y la barra lateral —que se decidía solo por el ancho— aparecía y se
 * comía un cuarto de una pantalla de 484 px de alto. La barra lateral es de
 * tableta y ordenador; el teléfono, tumbado o de pie, lleva la de abajo.
 */
test('MOVIL-04: el teléfono tumbado lleva la barra de abajo, no la lateral; la tableta tumbada, la lateral', async ({ browser }, testInfo) => {
    const casos = [
        { nombre: 'Motorola tumbado', viewport: { width: 1075, height: 484 }, lateral: false },
        { nombre: 'tableta tumbada', viewport: { width: 1280, height: 800 }, lateral: true },
    ];
    for (const caso of casos) {
        const contexto = await browser.newContext({ viewport: caso.viewport, hasTouch: true, isMobile: true });
        const page = await contexto.newPage();
        try {
            const sesion = await loginApi('admin@testing.edu.ve', '123456', true, TENANT_SLUG, true);
            await injectSessionCookies(page, sesion);
            await page.goto(`${WEB_BASE}/dashboard`, { waitUntil: 'domcontentloaded' });
            const barra = page.getByRole('navigation', { name: 'Navegación principal' });
            if (caso.lateral) {
                await expect(page.locator('aside').first()).toBeVisible({ timeout: 30000 });
                await expect(barra).toBeHidden();
            } else {
                await expect(barra).toBeVisible({ timeout: 30000 });
                await expect(page.locator('aside').first()).toBeHidden();
            }
        } catch (error) {
            await captureEvidence(testInfo, page, 'MOVIL-04', caso.nombre, error);
            throw error;
        } finally {
            await contexto.close();
        }
    }
});
