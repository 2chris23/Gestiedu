import { test, expect, type Page } from '@playwright/test';
import { WEB_BASE, TENANT_SLUG, loginViaUI, captureEvidence } from './helpers';
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
        } catch (error) {
            await captureEvidence(testInfo, page, 'MOVIL-02', 'La barra de abajo', error);
            throw error;
        }
    });
});
