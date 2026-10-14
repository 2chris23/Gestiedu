import { test, expect, type Page, type Browser } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { WEB_BASE, loginApi, injectSessionCookies, captureEvidence, representanteConUnHijo } from './helpers';

/**
 * EL ORDENADOR: MARCO AZUL, BARRA QUE SE RECOGE Y TU NOMBRE ABAJO (octubre 2026)
 *
 * Lo que pidió Cristian, comprobado donde se ve:
 *
 *   LATERAL-01     el botón recoge la barra en iconos (76 px) con el contenido
 *                  detrás, los enlaces se siguen llamando igual y, al recargar,
 *                  sigue recogida; sin arrastre de lado.
 *   LATERAL-02     Ctrl+B la recoge y la abre, salvo escribiendo en un campo
 *                  (ahí Ctrl+B es la negrita).
 *   LATERAL-03     recogida, al pasar el ratón por un icono sale su nombre.
 *   LATERAL-04     el contraste (axe) con el menú de tu nombre abierto y con la
 *                  barra recogida y su globo: las cajas son de cristal, y el
 *                  cristal baja el contraste de lo que lleva encima.
 *   PERFIL-UI-01   abajo, el primer nombre y el rol; el menú trae solo
 *                  Configuración y Cerrar sesión (como Rial). Allí, el color
 *                  y la contraseña; lo del liceo, solo al admin.
 *   INICIO-ESC-01  cada rol tiene su franja azul con la cifra y sus tarjetas, la
 *                  hoja empieza debajo, no hay «Ir a» (repetía la barra) y la
 *                  cifra es LA MISMA que en el teléfono.
 *   INICIO-ESC-02  el ojo oculta el promedio y se recuerda.
 *   TEMA-UI-01     el color cambia la barra entera (el amarillo, con la letra
 *                  oscura) y los botones; el modo oscuro se elige en el mismo
 *                  menú, sigue al recargar desde el primer HTML (sin fogonazo
 *                  blanco) y el papel sigue claro.
 *
 * «Cerrar sesión» desde el menú lo prueba BOTON-06.
 */

const PORTATIL = { width: 1366, height: 768 };
test.use({ viewport: PORTATIL, deviceScaleFactor: 1 });

async function entrarComo(page: Page, correo: string, ruta = '/dashboard') {
    const sesion = await loginApi(correo, '123456');
    await injectSessionCookies(page, sesion);
    await page.goto(`${WEB_BASE}${ruta}`);
    await expect(page.locator('#barra-lateral')).toBeVisible({ timeout: 30000 });
}

const anchoDeLaBarra = async (page: Page) => (await page.locator('#barra-lateral').boundingBox())?.width ?? 0;

test.describe('La barra lateral del ordenador', () => {
    test('LATERAL-01: se recoge en iconos, el contenido la sigue y al recargar sigue recogida', async ({ page }, testInfo) => {
        try {
            await entrarComo(page, 'admin@testing.edu.ve');
            const barra = page.locator('#barra-lateral');
            expect(await anchoDeLaBarra(page)).toBe(264);

            await barra.getByRole('button', { name: 'Ocultar la barra' }).click();
            await expect.poll(() => anchoDeLaBarra(page)).toBe(76);
            // El contenido va detrás, no debajo: la barra y 8 px de marco a cada lado.
            await expect.poll(() => page.evaluate(() => getComputedStyle(document.querySelector('main')!).marginLeft)).toBe('92px');
            // Los enlaces se llaman igual: el nombre sigue ahí para el lector de pantalla.
            await expect(barra.getByRole('link', { name: 'Académico' })).toBeVisible();
            expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

            await page.reload();
            await expect(page.locator('#barra-lateral')).toBeVisible({ timeout: 30000 });
            expect(await page.evaluate(() => document.documentElement.dataset.lateral)).toBe('recogida');
            expect(await anchoDeLaBarra(page)).toBe(76);

            await page.locator('#barra-lateral').getByRole('button', { name: 'Mostrar la barra' }).click();
            await expect.poll(() => anchoDeLaBarra(page)).toBe(264);
        } catch (error) {
            await captureEvidence(testInfo, page, 'LATERAL-01', 'La barra se recoge', error);
            throw error;
        }
    });

    test('LATERAL-02: Ctrl+B la recoge y la abre, pero no mientras se escribe', async ({ page }, testInfo) => {
        try {
            await entrarComo(page, 'admin@testing.edu.ve', '/dashboard/usuarios');
            await page.locator('body').click({ position: { x: 700, y: 20 } });
            await page.keyboard.press('Control+b');
            await expect.poll(() => anchoDeLaBarra(page)).toBe(76);
            await page.keyboard.press('Control+b');
            await expect.poll(() => anchoDeLaBarra(page)).toBe(264);

            const buscar = page.getByPlaceholder(/Buscar/).first();
            await buscar.click();
            await page.keyboard.press('Control+b');
            await page.waitForTimeout(400);
            expect(await anchoDeLaBarra(page)).toBe(264);
        } catch (error) {
            await captureEvidence(testInfo, page, 'LATERAL-02', 'Ctrl+B', error);
            throw error;
        }
    });

    test('LATERAL-03: recogida, cada icono dice su nombre al pasar el ratón', async ({ page }, testInfo) => {
        try {
            await entrarComo(page, 'admin@testing.edu.ve');
            const barra = page.locator('#barra-lateral');
            await barra.getByRole('button', { name: 'Ocultar la barra' }).click();
            await expect.poll(() => anchoDeLaBarra(page)).toBe(76);
            await barra.getByRole('link', { name: 'Académico' }).hover();
            await expect(page.locator('[data-globo-lateral]')).toHaveText('Académico');
        } catch (error) {
            await captureEvidence(testInfo, page, 'LATERAL-03', 'El globo de cada icono', error);
            throw error;
        }
    });
});

test('LATERAL-04: se lee bien con el menú abierto y con la barra recogida', async ({ page }, testInfo) => {
    const fallos = async () =>
        (await new AxeBuilder({ page }).withRules(['color-contrast']).analyze()).violations.flatMap((v) =>
            v.nodes.map((n) => `${n.target.join(' ')} → ${n.any[0]?.message ?? v.help}`)
        );
    try {
        await entrarComo(page, 'admin@testing.edu.ve');
        await page.locator('#barra-lateral [data-recorrido="mi-cuenta"]').click();
        await expect(page.getByRole('menu')).toBeVisible();
        const conElMenu = await fallos();
        expect(conElMenu, conElMenu.join('\n')).toEqual([]);

        await page.keyboard.press('Escape');
        await page.locator('#barra-lateral').getByRole('button', { name: 'Ocultar la barra' }).click();
        await expect.poll(() => anchoDeLaBarra(page)).toBe(76);
        await page.locator('#barra-lateral').getByRole('link', { name: 'Usuarios' }).hover();
        await expect(page.locator('[data-globo-lateral]')).toBeVisible();
        const recogida = await fallos();
        expect(recogida, recogida.join('\n')).toEqual([]);
    } catch (error) {
        await captureEvidence(testInfo, page, 'LATERAL-04', 'Contraste del menú y de la barra recogida', error);
        throw error;
    }
});

test.describe('Tu nombre, abajo de la barra', () => {
    test('PERFIL-UI-01: nombre y rol abajo; el menú trae Configuración y Cerrar sesión (como Rial); lo del liceo, solo al admin', async ({ page, browser }, testInfo) => {
        try {
            await entrarComo(page, 'admin@testing.edu.ve');
            const yo = page.locator('#barra-lateral [data-recorrido="mi-cuenta"]');
            await expect(yo).toContainText('Administrador');

            await yo.click();
            const menu = page.getByRole('menu');
            await expect(menu.getByRole('menuitem', { name: 'Cerrar sesión' })).toBeVisible();
            // Solo lo principal: el color y la contraseña viven en Configuración.
            await expect(menu.getByRole('menuitemradio')).toHaveCount(0);
            await menu.getByRole('menuitem', { name: 'Configuración' }).click();
            await page.waitForURL('**/dashboard/configuracion**');

            // El color cambia al instante, desde «Color y modo».
            await page.getByRole('button', { name: 'Color y modo' }).click();
            await page.getByRole('radio', { name: 'Violeta' }).click();
            await expect
                .poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--acento').trim().toUpperCase()))
                .toBe('#7C3AED');
            // Y la contraseña, en «Contraseña y acceso» (en el ordenador no había cómo cambiarla).
            await page.getByRole('button', { name: 'Contraseña y acceso' }).click();
            await expect(page.getByPlaceholder('Contraseña actual')).toBeVisible();
            await expect(page.getByRole('button', { name: 'Información General' })).toBeVisible();

            // El profesor: su rol, Configuración, y nada del liceo dentro.
            const otra = await browser.newContext({ viewport: PORTATIL, deviceScaleFactor: 1 });
            const profe = await otra.newPage();
            await entrarComo(profe, 'profesor.ciencias@tuapp.com');
            const suyo = profe.locator('#barra-lateral [data-recorrido="mi-cuenta"]');
            await expect(suyo).toContainText('Profesor');
            await suyo.click();
            await profe.getByRole('menuitem', { name: 'Configuración' }).click();
            await expect(profe.getByRole('button', { name: 'Contraseña y acceso' })).toBeVisible({ timeout: 30000 });
            await expect(profe.getByRole('button', { name: 'Información General' })).toHaveCount(0);
            await otra.close();
        } catch (error) {
            await captureEvidence(testInfo, page, 'PERFIL-UI-01', 'El menú de tu nombre', error);
            throw error;
        }
    });

    test('TEMA-UI-01: el color cambia la barra y los botones; el modo oscuro sigue al recargar y el papel sigue claro', async ({ page }, testInfo) => {
        const fondo = (selector: string) => page.evaluate((s) => getComputedStyle(document.querySelector(s)!).backgroundColor, selector);
        try {
            await entrarComo(page, 'admin@testing.edu.ve');
            expect(await fondo('#barra-lateral')).toBe('rgb(13, 71, 161)'); // el azul de siempre

            await page.goto(`${WEB_BASE}/dashboard/configuracion?seccion=color`);
            await page.getByRole('radio', { name: 'Amarillo' }).click();
            // La barra, amarilla de verdad, y su letra oscura para que se lea.
            await expect.poll(() => fondo('#barra-lateral')).toBe('rgb(251, 192, 45)');
            expect(await page.evaluate(() => getComputedStyle(document.querySelector('#barra-lateral [data-recorrido="mi-cuenta"] span span')!).color)).toBe('rgb(11, 27, 51)');
            // Los botones (`indigo-600`) toman el color: el ámbar hondo.
            expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--indigo-600-f').trim())).toBe('180 83 9');

            await page.locator('[data-modo="oscuro"]').click();
            await expect.poll(() => page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(true);
            // A lo Spotify: la barra es una caja #121212 y las tarjetas también.
            await expect.poll(() => fondo('#barra-lateral')).toBe('rgb(18, 18, 18)');

            // Al recargar, el primer HTML ya sale oscuro: el guion del <head> corre antes de pintar.
            await page.goto(`${WEB_BASE}/dashboard`, { waitUntil: 'commit' });
            await page.waitForFunction(() => document.body !== null);
            expect(await page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(true);
            expect(await page.evaluate(() => document.documentElement.dataset.acento)).toBe('amarillo');

            // El papel no se oscurece: una hoja impresa con el modo oscuro puesto.
            await page.goto(`${WEB_BASE}/dashboard/carnets`);
            await expect(page.locator('.modo-claro').first()).toBeVisible({ timeout: 30000 });
            expect(await fondo('.modo-claro')).toBe('rgb(243, 244, 246)'); // bg-gray-100 de siempre
            await page.emulateMedia({ media: 'print' });
            expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(255, 255, 255)');
        } catch (error) {
            await captureEvidence(testInfo, page, 'TEMA-UI-01', 'El color y el modo oscuro', error);
            throw error;
        } finally {
            await page.evaluate(() => {
                localStorage.removeItem('gestiedu:color-de-la-app');
                localStorage.removeItem('gestiedu:modo-de-la-app');
            }).catch(() => {});
        }
    });
});

/** La cifra grande, en el ordenador (la franja) o en el teléfono (`InicioMovil`). */
async function laCifra(page: Page, enElTelefono: boolean): Promise<string> {
    const donde = enElTelefono ? 'p[data-recorrido="inicio-cifras"]' : 'div[data-recorrido="inicio-cifras"] p';
    const p = page.locator(donde).first();
    await expect(p).toBeVisible({ timeout: 30000 });
    return ((await p.textContent()) ?? '').replace(/\s+/g, ' ').trim();
}

async function enElTelefono(browser: Browser, correo: string): Promise<string> {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
    try {
        const page = await ctx.newPage();
        await injectSessionCookies(page, await loginApi(correo, '123456'));
        await page.goto(`${WEB_BASE}/dashboard`);
        return await laCifra(page, true);
    } finally {
        await ctx.close();
    }
}

test.describe('El Inicio del ordenador, como el del teléfono', () => {
    test('INICIO-ESC-01: cada rol tiene su franja azul, la hoja debajo, sin «Ir a», y la misma cifra que en el teléfono', async ({ page, browser }, testInfo) => {
        test.setTimeout(240000);
        const representante = await representanteConUnHijo();
        try {
            for (const [correo, franja] of [
                ['admin@testing.edu.ve', 'El liceo hoy'],
                ['profesor.ciencias@tuapp.com', 'Mis clases hoy'],
                ['est0575@testing.edu.ve', 'Mi inicio escolar'],
                [representante.correo, 'Inicio del representante'],
            ] as const) {
                await page.context().clearCookies();
                await entrarComo(page, correo);
                const azul = page.getByRole('region', { name: franja });
                await expect(azul, `${correo}: la franja azul`).toBeVisible({ timeout: 30000 });
                await expect(azul).toContainText('/ 20');

                // La hoja clara empieza debajo del azul.
                const abajoDelAzul = (await azul.boundingBox())!;
                const hoja = await page.evaluate(() => document.querySelector('main > div:nth-child(2)')!.getBoundingClientRect().top);
                expect(hoja, `${correo}: la hoja empieza debajo de las cifras`).toBeGreaterThanOrEqual(abajoDelAzul.y + abajoDelAzul.height - 1);

                // Sin «Ir a»: la barra lateral ya tiene todo.
                await expect(page.getByRole('heading', { name: 'Ir a' })).toHaveCount(0);

                // Lo mismo que en el teléfono.
                expect(await laCifra(page, false), `${correo}: la cifra del ordenador y la del teléfono`).toBe(await enElTelefono(browser, correo));
            }
        } catch (error) {
            await captureEvidence(testInfo, page, 'INICIO-ESC-01', 'El Inicio del ordenador', error);
            throw error;
        } finally {
            await representante.quitar();
        }
    });

    test('INICIO-ESC-02: el ojo oculta el promedio y se recuerda', async ({ page }, testInfo) => {
        try {
            await entrarComo(page, 'admin@testing.edu.ve');
            const ojo = page.getByRole('region', { name: 'El liceo hoy' }).getByRole('button', { name: /Promedio general/ });
            await ojo.click();
            await expect(ojo).toHaveAttribute('aria-pressed', 'true');
            expect(await laCifra(page, false)).toContain('••.•');

            await page.reload();
            expect(await laCifra(page, false)).toContain('••.•');

            await page.getByRole('region', { name: 'El liceo hoy' }).getByRole('button', { name: /Promedio general/ }).click();
            expect(await laCifra(page, false)).not.toContain('••.•');
        } catch (error) {
            await captureEvidence(testInfo, page, 'INICIO-ESC-02', 'El ojo del promedio', error);
            throw error;
        }
    });
});
