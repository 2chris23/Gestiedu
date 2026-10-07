import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import { API_BASE, TENANT_SLUG, loginApi, loginViaUI, queryTenantDb, representanteConUnHijo, WEB_BASE } from './helpers';

/**
 * PRECARGA: SIN CONEXIÓN, TODO — EN UN PAQUETE (`lib/precarga.ts`)
 *
 * Cristian no pudo enseñarle la app a un profesor sin conexión: había
 * pantallas que «no se habían cargado». Aquí se mide lo que importa, con la
 * web compilada (el ayudante `sw.js` solo guarda páginas en producción):
 *
 *   1. entra como cada rol en un teléfono y deja que la precarga termine;
 *   2. corta la conexión;
 *   3. abre CADA pantalla del plan de esa persona (y cada pestaña) y exige
 *      que salga entera: ni «no está guardada», ni una sola lectura que
 *      faltara (`window.__lecturasSinGuardar`).
 *
 *   PRECARGA-01 profesor · 02 alumno · 03 representante · 04 admin
 *   PRECARGA-05 se corta la conexión a media descarga: «esperando», sin
 *               poder seguir (solo «Cerrar sesión»); vuelve y termina sola
 *   PRECARGA-06 la segunda vez que entra, la pantalla de carga no sale
 *   PRECARGA-07 la primera vez, el libro sale antes que el esqueleto del Inicio
 *
 * El admin baja TODO (600 y pico fichas): su prueba abre sin conexión todas
 * las pantallas que no son fichas y 25 fichas al azar (de cada tipo de persona).
 */

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

async function profesorDeVerdad(): Promise<string> {
    const [fila] = await queryTenantDb<{ email: string }>(
        `SELECT u.email FROM classroom_subjects cs JOIN users u ON u.id = cs."teacherId"
          WHERE u."isActive" = true GROUP BY u.email ORDER BY count(*) DESC, u.email LIMIT 1`
    );
    return fila?.email ?? 'profesor.ciencias@tuapp.com';
}

const conPrecarga = (page: Page) =>
    page.addInitScript(() => {
        try {
            localStorage.setItem('gestiedu:precarga-en-el-navegador', '1');
        } catch {
            /* nada */
        }
    });

const estado = (page: Page) =>
    page.evaluate(() => {
        const h = JSON.parse(localStorage.getItem('gestiedu:precarga') || 'null');
        return h?.completa ? 'listo' : (document.querySelector('[data-precarga]')?.getAttribute('data-precarga') ?? 'oculta');
    });

async function conLaPrecarga(page: Page, correo: string, tope: number): Promise<number> {
    await conPrecarga(page);
    const inicio = Date.now();
    await loginViaUI(page, correo);
    await expect(page.locator('[data-precarga]')).toBeVisible({ timeout: 30_000 });
    await expect.poll(() => estado(page), { timeout: tope, intervals: [250] }).toBe('listo');
    return Date.now() - inicio;
}

/** Las pantallas del plan de esa persona (las mismas que la precarga). */
async function lasPantallas(correo: string, menu: string[]): Promise<Array<{ url: string; molde: string; variante: string | null }>> {
    const s = await loginApi(correo);
    const r = await fetch(`${API_BASE}/precarga/plan`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${s.accessToken}`, 'X-Institute-Slug': TENANT_SLUG, 'Content-Type': 'application/json' },
        body: JSON.stringify({ menu, conContexto: true }),
    });
    return ((await r.json()) as { pantallas: Array<{ url: string; molde: string; variante: string | null }> }).pantallas;
}

async function elMenu(page: Page): Promise<string[]> {
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
    const hrefs = await page.$$eval('a[href^="/dashboard"]', (as) => as.map((a) => (a as HTMLAnchorElement).getAttribute('href') || ''));
    return [...new Set(hrefs.filter((h) => /^\/dashboard(\/[a-z0-9-]+)*$/.test(h)))];
}

async function medir(nombre: string, ms: number, page: Page) {
    const bytes = await page.evaluate(() => JSON.parse(localStorage.getItem('gestiedu:precarga') || '{}').bytes ?? 0);
    console.log(`PRECARGA ${nombre}: ${(ms / 1000).toFixed(0)} s, ${(bytes / 1e6).toFixed(1)} MB de datos`);
}

async function sinConexionSeVe(page: Page, context: BrowserContext, urls: string[]) {
    await context.setOffline(true);
    const faltas: string[] = [];
    try {
        for (const url of urls) {
            await page.evaluate(() => ((window as unknown as { __lecturasSinGuardar?: string[] }).__lecturasSinGuardar = []));
            await page.goto(url, { waitUntil: 'load' }).catch(() => undefined);
            await page.waitForTimeout(1200);
            const donde = new URL(page.url());
            if (donde.searchParams.get('sin-guardar') || donde.pathname !== url.split('?')[0]) {
                faltas.push(`${url}: la página no estaba guardada (acabó en ${donde.pathname}${donde.search})`);
                continue;
            }
            const pestanas = page.locator('[data-pestana]');
            const n = Math.min(await pestanas.count(), 12);
            for (let i = 0; i < n; i++) {
                await pestanas.nth(i).click({ timeout: 3000 }).catch(() => undefined);
                await page.waitForTimeout(500);
            }
            const sinGuardar = (await page.evaluate(() => (window as unknown as { __lecturasSinGuardar?: string[] }).__lecturasSinGuardar ?? [])).filter(
                // La hora y la salud no se guardan nunca, a propósito.
                (c) => !/^\/?(health|time)\b/.test(c)
            );
            if (sinGuardar.length) faltas.push(`${url}: ${[...new Set(sinGuardar)].join(', ')}`);
            if (await page.getByText(/no está guardad|no se ha abierto nunca con internet|no se había abierto antes/i).count()) {
                faltas.push(`${url}: dice que algo no está guardado`);
            }
        }
    } finally {
        await context.setOffline(false);
    }
    expect(faltas, faltas.join('\n')).toEqual([]);
}

test.describe('Precarga: sin conexión, todo', () => {
    test.describe.configure({ timeout: 45 * 60 * 1000 });

    test('PRECARGA-01: el profesor, sin conexión, abre todo lo suyo', async ({ page, context }) => {
        test.setTimeout(600_000);
        const correo = await profesorDeVerdad();
        await medir('profesor', await conLaPrecarga(page, correo, 15 * 60 * 1000), page);
        const pantallas = await lasPantallas(correo, await elMenu(page));
        const fichas = pantallas.filter((p) => p.molde === '/dashboard/usuarios/{id}');
        await sinConexionSeVe(page, context, [
            ...pantallas.filter((p) => p.molde !== '/dashboard/usuarios/{id}').map((p) => p.url),
            ...fichas.slice(0, 8).map((p) => p.url),
        ]);
    });

    test('PRECARGA-02: el alumno, sin conexión, abre todo lo suyo', async ({ page, context }) => {
        await medir('alumno', await conLaPrecarga(page, 'est0575@testing.edu.ve', 10 * 60 * 1000), page);
        await sinConexionSeVe(page, context, (await lasPantallas('est0575@testing.edu.ve', await elMenu(page))).map((p) => p.url));
    });

    test('PRECARGA-03: el representante, sin conexión, abre todo lo suyo', async ({ page, context }) => {
        const { correo, quitar } = await representanteConUnHijo();
        try {
            await medir('representante', await conLaPrecarga(page, correo, 10 * 60 * 1000), page);
            await sinConexionSeVe(page, context, (await lasPantallas(correo, await elMenu(page))).map((p) => p.url));
        } finally {
            await quitar();
        }
    });

    test('PRECARGA-04: el admin baja todo; sin conexión, todo lo que no es ficha y 25 fichas', async ({ page, context }) => {
        test.setTimeout(40 * 60 * 1000);
        await medir('admin', await conLaPrecarga(page, 'admin@testing.edu.ve', 40 * 60 * 1000), page);
        const pantallas = await lasPantallas('admin@testing.edu.ve', await elMenu(page));
        const fichas = pantallas.filter((p) => p.molde === '/dashboard/usuarios/{id}');
        expect(fichas.length).toBeGreaterThan(500);
        const muestra = [
            ...fichas.filter((p) => p.variante !== 'STUDENT').slice(0, 5),
            ...[...fichas.filter((p) => p.variante === 'STUDENT')].sort(() => Math.random() - 0.5).slice(0, 20),
        ];
        // Las boletas (una por alumno, la misma página): 10 al azar.
        const boletas = pantallas.filter((p) => p.molde === '/dashboard/boleta/{alumno}');
        const muchas = new Set(['/dashboard/usuarios/{id}', '/dashboard/boleta/{alumno}']);
        await sinConexionSeVe(page, context, [
            ...pantallas.filter((p) => !muchas.has(p.molde)).map((p) => p.url),
            ...muestra.map((p) => p.url),
            ...[...boletas].sort(() => Math.random() - 0.5).slice(0, 10).map((p) => p.url),
        ]);
    });

    test('PRECARGA-05: sin conexión a media descarga espera y no deja seguir; al volver, termina', async ({ page }) => {
        // Se corta el paquete (como si se fuera la señal) hasta que se diga.
        let cortado = true;
        await page.route('**/api/precarga/paquete', (ruta) => ruta.fulfill({ status: 404, contentType: 'application/json', body: '{}' }));
        await page.route('**/api/precarga/bloque', (ruta) => (cortado ? ruta.abort('internetdisconnected') : ruta.continue()));
        await conPrecarga(page);
        await loginViaUI(page, 'est0575@testing.edu.ve');
        const pantalla = page.locator('[data-precarga]');
        await expect(pantalla).toHaveAttribute('data-precarga', 'esperando', { timeout: 60_000 });
        await expect(pantalla.getByText('Esperando para seguir descargando', { exact: false })).toBeVisible();
        // Dice cuánto es, en MB o KB.
        await expect(pantalla.getByText(/\d+(,\d)? (MB|KB) de \d+(,\d)? (MB|KB)/)).toBeVisible();
        // No deja seguir: ni «Usar la app» ni nada detrás que se pueda tocar.
        await expect(pantalla.getByRole('button', { name: /usar la app/i })).toHaveCount(0);
        await expect(pantalla.getByRole('button', { name: 'Cerrar sesión' })).toBeVisible();
        cortado = false;
        await expect.poll(() => estado(page), { timeout: 2 * 60 * 1000, intervals: [2000] }).toBe('listo');
    });

    test('PRECARGA-06: la segunda vez, la pantalla de carga no sale', async ({ page }) => {
        await conLaPrecarga(page, 'est0575@testing.edu.ve', 10 * 60 * 1000);
        await page.reload();
        await page.waitForTimeout(4000);
        await expect(page.locator('[data-precarga]')).toHaveCount(0);
    });

    test('PRECARGA-07: la primera vez sale el libro, no el esqueleto del Inicio, aunque el servidor tarde', async ({ page }) => {
        // Cristian lo vio en su teléfono: primero el esqueleto y luego el
        // libro. El servidor tarda 4 s en todo lo que no es entrar (datos
        // del teléfono): el libro tiene que estar antes de que conteste.
        await conPrecarga(page);
        await page.route('**/api/**', async (ruta) => {
            const url = ruta.request().url();
            if (ruta.request().method() === 'GET' && !/\/(auth|instituto|institutes\/(current|public))/.test(url)) {
                await new Promise((r) => setTimeout(r, 4000));
            }
            await ruta.continue().catch(() => undefined);
        });
        await loginViaUI(page, 'est0575@testing.edu.ve');
        await expect(page.locator('[data-precarga]')).toBeVisible({ timeout: 1500 });
        // Una sola hoja que pasa, siempre encima: con cuatro en bucle, la de
        // abajo caía bajo la que ya estaba a la izquierda y desaparecía.
        await expect(page.locator('[data-precarga] .libro-hoja')).toHaveCount(1);
        // Ninguna oferta («¿Te avisamos?») encima del libro.
        await expect(page.getByRole('region', { name: /Avisos en el teléfono|Descarga la app|Recorrido/ })).toHaveCount(0);
    });

    test('PRECARGA-08: con el paquete en 404, baja por el camino de reserva (plan y bloques) y termina en listo', async ({ page }) => {
        await conPrecarga(page);
        let intentoPaquete = false;
        await page.route('**/api/precarga/paquete', (ruta) => {
            intentoPaquete = true;
            return ruta.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'No hay paquete' }) });
        });
        await loginViaUI(page, 'est0575@testing.edu.ve');
        await expect(page.locator('[data-precarga]')).toBeVisible({ timeout: 30_000 });
        await expect.poll(() => estado(page), { timeout: 3 * 60 * 1000, intervals: [2000] }).toBe('listo');
        expect(intentoPaquete).toBe(true);
    });

    test('PRECARGA-09: descarga del admin a 38 Mbps con CPU ×4 tarda ≤ 10 s y sin aviso de conexión', async ({ browser }) => {
        test.setTimeout(180_000);
        // 1. Que el paquete esté armado de antemano
        const s = await loginApi('admin@testing.edu.ve');
        const h = { Authorization: `Bearer ${s.accessToken}`, 'X-Institute-Slug': TENANT_SLUG };
        const t0 = Date.now();
        for (;;) {
            const r = await fetch(`${API_BASE}/precarga/paquete`, { headers: h });
            if (r.status === 200) { break; }
            if (Date.now() - t0 > 240_000) throw new Error('el paquete no se armó');
            await new Promise((x) => setTimeout(x, 2000));
        }

        // Contexto de navegador completamente limpio y nuevo (Punto 1: sin ayudante ni caché previa)
        const context = await browser.newContext({
            serviceWorkers: 'allow',
        });
        const page = await context.newPage();

        try {
            await context.addInitScript(() => localStorage.setItem('gestiedu:precarga-en-el-navegador', '1'));
            const cdp = await context.newCDPSession(page);
            await page.goto(`${WEB_BASE}/login?slug=${TENANT_SLUG}`);
            await page.waitForSelector('input[type="email"]');
            await cdp.send('Network.enable');
            await cdp.send('Network.emulateNetworkConditions', {
                offline: false,
                latency: 70,
                downloadThroughput: 38e6 / 8,
                uploadThroughput: 4.8e6 / 8,
            });
            await cdp.send('Emulation.setCPUThrottlingRate', { rate: Number(process.env.CPU || 4) });

            let salioAvisoSinConexion = false;
            page.on('console', (m) => {
                console.log('BROWSER:', m.text());
            });

            await page.fill('input[type="email"]', 'admin@testing.edu.ve');
            await page.fill('input[type="password"]', '123456');
            const inicio = Date.now();
            await page.locator('button[type="submit"]').click();
            await expect(page.locator('[data-precarga]')).toBeVisible({ timeout: 30_000 });

            let ultima = '';
            await expect.poll(async () => {
                const e = await page.evaluate(() => {
                    const h = JSON.parse(localStorage.getItem('gestiedu:precarga') || 'null');
                    const av = document.querySelector('[data-aviso="sin-conexion"]') ? '+AVISO' : '';
                    return (h?.completa ? 'listo' : (document.querySelector('[data-precarga]')?.getAttribute('data-precarga') ?? 'oculta')) + av;
                });
                if (e.includes('+AVISO')) salioAvisoSinConexion = true;
                if (e !== ultima) { console.log('FASE', e, ((Date.now() - inicio) / 1000).toFixed(1), 's'); ultima = e; }
                return e;
            }, { timeout: 30_000, intervals: [100] }).toBe('listo');

            const duracionMs = Date.now() - inicio;
            const duracionS = duracionMs / 1000;
            console.log(`PRECARGA-09 COMPLETADA en ${duracionS.toFixed(2)} s (meta ≤ 10 s)`);

            const metricas = await page.evaluate(() => (window as any).__medicionPrecarga);
            console.log('PRECARGA-09 METRICAS DETALLE:', JSON.stringify(metricas));

            expect(salioAvisoSinConexion).toBe(false);
            expect(duracionS).toBeLessThanOrEqual(10);
        } finally {
            await context.close();
        }
    });
});
