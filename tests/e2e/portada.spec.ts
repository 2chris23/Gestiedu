import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { WEB_BASE } from './helpers';
import { MEDIR, BANDA_ARRIBA, BANDA_ABAJO, DEDO, LETRA, ZONAS_DE_UN_TELEFONO } from '../../scripts/reglas-del-telefono.mjs';

/**
 * LA PORTADA (`/`): LO QUE VE UN DIRECTOR ANTES DE ENTRAR
 *
 * No necesita sesión ni servidor de datos: es la puerta. Se comprueba que:
 *
 *   PORTADA-01  carga sin errores en la consola;
 *   PORTADA-02  no se sale de ancho ni hay que arrastrar nada de lado, del
 *               teléfono de 360 px al escritorio de 1920;
 *   PORTADA-03  en el teléfono, lo que se pulsa mide 44 px y la letra 12;
 *   PORTADA-04  los aparatos se mueven solos… y se paran con «Pausar»;
 *   PORTADA-05  con «menos movimiento», no se mueve nada;
 *   PORTADA-06  el botón abre el portal del liceo y lleva a su login;
 *   PORTADA-07  el contraste pasa axe (WCAG AA), en claro y en oscuro;
 *   PORTADA-08  lo decorativo está escondido a los lectores de pantalla y el
 *               mensaje es texto de verdad;
 *   PORTADA-09  en el teléfono, «Qué resuelve» enseña cuatro tarjetas y un
 *               «Ver 4 más» que abre el resto; desde la tableta, las ocho;
 *   PORTADA-10  sin contacto ni dirección del sitio configurados, no hay botón
 *               que no lleve a nadie ni imagen para compartir con `localhost`.
 *
 * Las bandas del teléfono (reloj y barra de gestos) no se miden aquí: la
 * portada es una página que se desplaza entera, sin barras fijas abajo, y lo
 * que pasa por detrás de la barra de gestos al desplazar es lo normal en
 * cualquier web. Arriba, la cabecera fija la tapa.
 */

const AJUSTES = { bandaArriba: BANDA_ARRIBA, bandaAbajo: BANDA_ABAJO, dedo: DEDO, letra: LETRA };

type Falta = { regla: string; detalle: string };

/**
 * El único error de consola que se da por bueno: quien llega sin sesión pide
 * una llave nueva (`/api/auth/refresh`) y le dicen que no. Lo hace el
 * proveedor de tiempo real, que vive en TODAS las páginas (layout), no la
 * portada. Anotado en `docs/nube/portada.md` como propuesta.
 */
const esLaLlaveSinSesion = (url: string) => url.includes('/api/auth/refresh');

async function abrir(page: Page) {
    await page.goto(`${WEB_BASE}/`);
    await page.locator('h1').waitFor();
}

/** Lo que se ve dentro de los aparatos, como texto: si cambia, se mueve. */
const loQueSeVe = (page: Page) => page.locator('[data-escaparate]').evaluate((el) => el.innerHTML.length + ':' + el.textContent);

test.describe('Portada', () => {
    test('PORTADA-01: carga sin errores en la consola', async ({ page }) => {
        const errores: string[] = [];
        page.on('pageerror', (e) => errores.push(`pageerror: ${e.message}`));
        page.on('console', (m) => {
            if (m.type() !== 'error') return;
            if (esLaLlaveSinSesion(m.location().url)) return;
            errores.push(`console: ${m.text()} (${m.location().url})`);
        });
        await abrir(page);
        await page.locator('[data-escaparate]').scrollIntoViewIfNeeded();
        await page.waitForTimeout(4000);
        expect(errores, errores.join('\n')).toEqual([]);
    });

    for (const [nombre, width, height, tactil] of [
        ['teléfono 360', 360, 780, true],
        ['teléfono 390', 390, 844, true],
        ['teléfono tumbado', 844, 390, true],
        ['tableta', 768, 1024, true],
        ['portátil', 1366, 768, false],
        ['escritorio', 1920, 1080, false],
    ] as const) {
        test(`PORTADA-02/03: ${nombre}`, async ({ browser }) => {
            const ctx = await browser.newContext({ viewport: { width, height }, isMobile: tactil, hasTouch: tactil });
            const page = await ctx.newPage();
            await abrir(page);
            await page.addStyleTag({ content: ZONAS_DE_UN_TELEFONO });
            // Se mide arriba del todo, con los aparatos a la vista y al final.
            const faltas: Falta[] = [];
            for (const y of [0, 0.35, 1]) {
                await page.evaluate((f) => window.scrollTo(0, f * document.documentElement.scrollHeight), y);
                await page.waitForTimeout(800);
                faltas.push(...((await page.evaluate(MEDIR, AJUSTES)) as Falta[]));
            }
            const queCuentan = tactil && width < 768 ? ['ancho', 'arrastre', 'dedo', 'letra'] : ['ancho', 'arrastre'];
            const malas = faltas.filter((f) => queCuentan.includes(f.regla));
            expect(malas, malas.map((f) => `${f.regla}: ${f.detalle}`).join('\n')).toEqual([]);
            await ctx.close();
        });
    }

    test('PORTADA-04: los aparatos se usan solos, y «Pausar» los para', async ({ page }) => {
        await abrir(page);
        const escaparate = page.locator('[data-escaparate]');
        await escaparate.scrollIntoViewIfNeeded();
        await expect(escaparate).toHaveAttribute('data-en-marcha', 'si', { timeout: 10000 });

        const antes = await loQueSeVe(page);
        await page.waitForTimeout(2500);
        expect(await loQueSeVe(page)).not.toEqual(antes);

        await page.getByRole('button', { name: 'Pausar' }).click();
        await expect(escaparate).toHaveAttribute('data-en-marcha', 'no');
        await page.waitForTimeout(600);
        const pausado = await loQueSeVe(page);
        await page.waitForTimeout(2500);
        expect(await loQueSeVe(page)).toEqual(pausado);

        // El nombre dice el estado; un `aria-pressed` encima se leía «Seguir, pulsado».
        await expect(page.getByRole('button', { name: 'Seguir' })).not.toHaveAttribute('aria-pressed', /.*/);

        // Y se puede saltar a una escena: el QR.
        await page.getByRole('button', { name: 'Seguir' }).click();
        await page.getByRole('button', { name: 'Asistencia por QR' }).click();
        await expect(page.getByRole('button', { name: 'Asistencia por QR' })).toHaveAttribute('aria-pressed', 'true');
        await expect(page.getByText('Los alumnos escanean un QR')).toBeVisible();
    });

    test('PORTADA-04b: fuera de la vista no se mueve', async ({ page }) => {
        await abrir(page);
        const escaparate = page.locator('[data-escaparate]');
        await escaparate.scrollIntoViewIfNeeded();
        await expect(escaparate).toHaveAttribute('data-en-marcha', 'si', { timeout: 10000 });
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
        await expect(escaparate).toHaveAttribute('data-en-marcha', 'no');
    });

    test.describe('con «menos movimiento»', () => {
        // Por `contextOptions`: `test.use({ reducedMotion })` a secas no llega al navegador (medido).
        test.use({ contextOptions: { reducedMotion: 'reduce' } });

        test('PORTADA-05: no se anima nada', async ({ page }) => {
            await abrir(page);
            const escaparate = page.locator('[data-escaparate]');
            await escaparate.scrollIntoViewIfNeeded();
            await page.waitForTimeout(1500);
            await expect(escaparate).toHaveAttribute('data-en-marcha', 'no');
            // Sin botón de pausa: no hay nada que pausar.
            await expect(page.getByRole('button', { name: 'Pausar' })).toHaveCount(0);

            // Dos fotos con tres segundos de diferencia: iguales píxel a píxel.
            const antes = await escaparate.screenshot();
            await page.waitForTimeout(3000);
            expect((await escaparate.screenshot()).equals(antes)).toBe(true);

            // Ninguna animación ni transición con duración de verdad.
            const moviendose = await page.evaluate(() =>
                document.getAnimations().filter((a) => {
                    const d = a.effect?.getComputedTiming().duration;
                    return typeof d === 'number' && d > 1 && a.playState === 'running';
                }).length
            );
            expect(moviendose).toBe(0);

            // La foto fija enseña las tres pantallas completas: 18 de 32.
            await expect(escaparate).toContainText('18');
        });
    });

    test('PORTADA-06: «Entrar a mi liceo» abre el portal y lleva a su login', async ({ page }) => {
        await abrir(page);
        await page.getByRole('button', { name: 'Entrar a mi liceo' }).first().click();
        const campo = page.locator('#school-slug');
        await expect(campo).toBeVisible();
        await campo.fill('instituto-testing');
        await page.getByRole('button', { name: 'Continuar al portal' }).click();
        await page.waitForURL(/instituto-testing.*\/login|\/login\?slug=instituto-testing/, { timeout: 15000 });
    });

    for (const esquema of ['light', 'dark'] as const) {
        for (const vista of [
            { nombre: 'teléfono', viewport: { width: 390, height: 844 } },
            { nombre: 'escritorio', viewport: { width: 1366, height: 900 } },
        ]) {
            test(`PORTADA-07: contraste · ${esquema === 'light' ? 'claro' : 'oscuro'} · ${vista.nombre}`, async ({ browser }) => {
                const ctx = await browser.newContext({ viewport: vista.viewport, colorScheme: esquema, reducedMotion: 'reduce' });
                const page = await ctx.newPage();
                await abrir(page);
                await page.waitForTimeout(1500);
                // Las respuestas de las preguntas también cuentan: se abren todas.
                await page.locator('details').evaluateAll((ds) => ds.forEach((d) => ((d as HTMLDetailsElement).open = true)));
                const r = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze();
                const fallos = r.violations.flatMap((v) => v.nodes.map((n) => `${n.target.join(' ')} → ${n.any[0]?.message ?? v.help}`));
                expect(fallos, fallos.join('\n')).toEqual([]);
                await ctx.close();
            });
        }
    }

    test('PORTADA-08: lo decorativo, escondido; el mensaje, en texto', async ({ page }) => {
        await abrir(page);
        await expect(page.locator('[data-escaparate]')).toHaveAttribute('aria-hidden', 'true');
        await expect(page.getByRole('heading', { level: 1 })).toContainText('Tu liceo al día');
        // Una sola h1 y cada sección con su título.
        await expect(page.locator('h1')).toHaveCount(1);
        const r = await new AxeBuilder({ page })
            .withRules(['aria-hidden-focus', 'button-name', 'link-name', 'heading-order', 'landmark-one-main', 'document-title', 'html-has-lang'])
            .analyze();
        const fallos = r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
        expect(fallos, fallos.join('\n')).toEqual([]);
        await expect(page).toHaveTitle(/GestiEdu/);
    });

    test('PORTADA-09: en el teléfono, cuatro tarjetas y «Ver 4 más»', async ({ browser }) => {
        const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
        const page = await ctx.newPage();
        await abrir(page);
        const tarjetas = page.locator('#funciones-lista > li');
        await expect(tarjetas).toHaveCount(8);
        await expect(tarjetas.filter({ visible: true })).toHaveCount(4);
        const boton = page.getByRole('button', { name: 'Ver 4 más' });
        await expect(boton).toHaveAttribute('aria-expanded', 'false');
        await expect(boton).toHaveAttribute('aria-controls', 'funciones-lista');
        const antes = await page.evaluate(() => document.documentElement.scrollHeight);
        await boton.click();
        await expect(tarjetas.filter({ visible: true })).toHaveCount(8);
        await expect(page.getByRole('button', { name: 'Ver menos' })).toHaveAttribute('aria-expanded', 'true');
        // Plegado ahorra de verdad: al abrir, la página crece más de mil píxeles.
        const despues = await page.evaluate(() => document.documentElement.scrollHeight);
        expect(despues - antes).toBeGreaterThan(1000);
        await ctx.close();

        const ctx2 = await browser.newContext({ viewport: { width: 768, height: 1024 } });
        const tableta = await ctx2.newPage();
        await abrir(tableta);
        await expect(tableta.locator('#funciones-lista > li').filter({ visible: true })).toHaveCount(8);
        await expect(tableta.getByRole('button', { name: /Ver 4 más/ })).toBeHidden();
        await ctx2.close();
    });

    test('PORTADA-10: sin configurar, ni botón vacío ni imagen con localhost', async ({ page }) => {
        // La web de las pruebas se compila sin NEXT_PUBLIC_CONTACTO_DEMO ni
        // NEXT_PUBLIC_SITIO_URL. Con ellos, lo cubre `contacto.test.ts`.
        test.skip(!!process.env.NEXT_PUBLIC_CONTACTO_DEMO || !!process.env.NEXT_PUBLIC_SITIO_URL, 'web compilada con contacto o sitio');
        await abrir(page);
        await expect(page.getByRole('link', { name: /Pide una demostración/ })).toHaveCount(0);
        await expect(page.locator('meta[property="og:image"]')).toHaveCount(0);
        await expect(page.locator('meta[property="og:title"]')).toHaveCount(1);
        const localhost = await page.locator('head').evaluate((h) => h.innerHTML.includes('localhost'));
        expect(localhost).toBe(false);
    });
});
