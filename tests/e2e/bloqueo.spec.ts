import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import { loginViaUI, loginApi, API_BASE, TENANT_SLUG, queryTenantDb } from './helpers';

/**
 * LA PANTALLA DE BLOQUEO DE LA APP (`components/arranque/ArranqueYCandado.tsx`)
 *
 * En la APK, «Ingresar» pide la huella o el bloqueo del teléfono (el diálogo
 * de Android). Aquí, en el navegador, se enciende con
 * `gestiedu:candado-en-el-navegador` y se le da una huella de mentira
 * (`window.Capacitor.Plugins.NativeBiometric`), como la cámara de mentira de
 * las pruebas del QR.
 *
 *   BLOQUEO-UI-01  al abrir la app con alguien dentro, sale el bloqueo con su
 *                  nombre y su rol, y lo de detrás no se puede tocar;
 *   BLOQUEO-UI-02  «Ingresar» con la huella abre; si se cancela, no;
 *   BLOQUEO-UI-03  al volver a la app: a los 30 s sigue abierta, al minuto pide;
 *   BLOQUEO-UI-04  sin bloqueo en el teléfono: el PIN de la app (crear, fallar, acertar);
 *   BLOQUEO-UI-05  «Cerrar sesión» desde el bloqueo lleva al login y olvida a quién enseñaba;
 *   BLOQUEO-UI-06  con un Capacitor como el de la APK (sus addListener no son promesas), la app no se cae;
 *   BLOQUEO-UI-07  al abrir, el esqueleto del Inicio no se ve antes del libro (la cortina de antes de pintar);
 *   BLOQUEO-UI-08  sin nadie dentro, ni libro ni esqueleto: el login, ya entero.
 */

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

type Huella = 'si' | 'cancela' | 'sin-bloqueo';

async function conHuellaDeMentira(context: BrowserContext, huella: Huella) {
    await context.addInitScript((modo: Huella) => {
        try {
            localStorage.setItem('gestiedu:candado-en-el-navegador', '1');
        } catch {
            /* nada */
        }
        (window as any).__huella = modo;
        (window as any).Capacitor = {
            Plugins: {
                NativeBiometric: {
                    isAvailable: async () => ({ isAvailable: (window as any).__huella !== 'sin-bloqueo' }),
                    verifyIdentity: async () => {
                        (window as any).__vecesQueSePidio = ((window as any).__vecesQueSePidio ?? 0) + 1;
                        if ((window as any).__huella !== 'si') throw new Error('Cancelado');
                    },
                },
            },
        };
    }, huella);
}

const bloqueo = (page: Page) => page.locator('[data-pantalla-de-bloqueo]');

/** Una apertura nueva de la app: otra pestaña (su `sessionStorage` empieza vacío). */
async function abrirLaApp(context: BrowserContext): Promise<Page> {
    const p = await context.newPage();
    await p.goto('/dashboard');
    return p;
}

async function irseYVolver(page: Page, segundos: number) {
    await page.evaluate(() => {
        Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
        document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.clock.fastForward(segundos * 1000);
    await page.evaluate(() => {
        Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
        document.dispatchEvent(new Event('visibilitychange'));
    });
}

test.describe('La pantalla de bloqueo', () => {
    test('BLOQUEO-UI-01: al abrir, el bloqueo con su nombre y su rol; lo de detrás no se toca', async ({ page, context }) => {
        await conHuellaDeMentira(context, 'si');
        await loginViaUI(page, 'admin@testing.edu.ve');
        // Entrar con la contraseña ya prueba quién es: no se pide nada.
        await expect(bloqueo(page)).toHaveCount(0);

        const otra = await abrirLaApp(context);
        await expect(bloqueo(otra)).toBeVisible({ timeout: 15000 });
        await expect(bloqueo(otra).getByText('Administrador', { exact: true })).toBeVisible();
        await expect(bloqueo(otra).getByRole('button', { name: 'Ingresar' })).toBeVisible();
        await expect(bloqueo(otra).getByRole('button', { name: 'Cerrar sesión' })).toBeVisible();
        // Lo de detrás: inerte.
        const inertes = await otra.evaluate(() =>
            Array.from(document.body.children).filter((e) => !(e as HTMLElement).dataset.capaDelCandado).every((e) => e.hasAttribute('inert'))
        );
        expect(inertes).toBe(true);
    });

    test('BLOQUEO-UI-02: «Ingresar» con la huella abre; cancelada, no', async ({ page, context }) => {
        await conHuellaDeMentira(context, 'cancela');
        await loginViaUI(page, 'admin@testing.edu.ve');
        const otra = await abrirLaApp(context);
        await bloqueo(otra).getByRole('button', { name: 'Ingresar' }).click();
        await expect(bloqueo(otra).getByText('No se comprobó que seas tú')).toBeVisible();

        await otra.evaluate(() => ((window as any).__huella = 'si'));
        await bloqueo(otra).getByRole('button', { name: 'Ingresar' }).click();
        await expect(bloqueo(otra)).toHaveCount(0);
        await expect(otra.locator('main')).toBeVisible();
    });

    test('BLOQUEO-UI-03: al volver a la app, a los 30 s sigue abierta; pasado el minuto, pide', async ({ page, context }) => {
        await conHuellaDeMentira(context, 'si');
        await page.clock.install();
        await loginViaUI(page, 'admin@testing.edu.ve');
        await expect(bloqueo(page)).toHaveCount(0);

        await irseYVolver(page, 30);
        await expect(bloqueo(page)).toHaveCount(0);

        await irseYVolver(page, 61);
        await expect(bloqueo(page)).toBeVisible();
    });

    test('BLOQUEO-UI-04: sin bloqueo en el teléfono, el PIN de la app', async ({ page, context, request }) => {
        // Un profesor sin PIN (se le quita por si quedó de otra tanda).
        const [fila] = await queryTenantDb<{ email: string }>(
            `SELECT email FROM users WHERE role = 'TEACHER' AND "isActive" = true AND email LIKE '%@testing.edu.ve' ORDER BY email LIMIT 1`
        );
        const correo = fila.email;
        const admin = await loginApi('admin@testing.edu.ve');
        const profe = await loginApi(correo);
        await request.delete(`${API_BASE}/users/${profe.user.id}/pin`, {
            headers: { Authorization: `Bearer ${admin.accessToken}`, 'X-Institute-Slug': TENANT_SLUG },
        });

        await conHuellaDeMentira(context, 'sin-bloqueo');
        await loginViaUI(page, correo);
        const otra = await abrirLaApp(context);
        await bloqueo(otra).getByRole('button', { name: 'Ingresar' }).click();
        await expect(bloqueo(otra).getByText('Crea un PIN de 4 números')).toBeVisible();
        await otra.keyboard.type('2468');
        await expect(bloqueo(otra).getByText('Repite tu PIN')).toBeVisible();
        await otra.keyboard.type('2468');
        await expect(bloqueo(otra)).toHaveCount(0);

        // Otra apertura: ahora se comprueba (con lo guardado en el teléfono).
        const tercera = await abrirLaApp(context);
        await bloqueo(tercera).getByRole('button', { name: 'Ingresar' }).click();
        await expect(bloqueo(tercera).getByText('Escribe tu PIN de la app')).toBeVisible();
        await tercera.keyboard.type('1111');
        await expect(bloqueo(tercera).getByText('PIN incorrecto.')).toBeVisible();
        await tercera.keyboard.type('2468');
        await expect(bloqueo(tercera)).toHaveCount(0);
    });

    test('BLOQUEO-UI-05: «Cerrar sesión» desde el bloqueo lleva al login y olvida a quién enseñaba', async ({ page, context }) => {
        await conHuellaDeMentira(context, 'si');
        await loginViaUI(page, 'admin@testing.edu.ve');
        await page.waitForTimeout(2000);
        const otra = await abrirLaApp(context);
        await bloqueo(otra).getByRole('button', { name: 'Cerrar sesión' }).click();
        await bloqueo(otra).getByRole('alertdialog').getByRole('button', { name: 'Cerrar sesión' }).click();
        await expect(otra.locator('input[type="email"]')).toBeVisible({ timeout: 20000 });
        expect(await otra.evaluate(() => localStorage.getItem('gestiedu:perfil-recordado'))).toBeNull();
        await expect(bloqueo(otra)).toHaveCount(0);
    });

    test('BLOQUEO-UI-06: con un Capacitor como el de la APK (addListener sin promesa), la app abre sin caerse', async ({ page, context }) => {
        // En la APK, `addListener` devuelve el oyente, NO una promesa, y
        // `SplashScreen.hide` puede no devolver nada. La 1.10 hacía `.then`
        // sobre eso y la app entera caía al abrir («This page couldn't load»).
        await context.addInitScript(() => {
            const oyente = () => ({ remove: () => undefined });
            (window as any).Capacitor = {
                isNativePlatform: () => true,
                getPlatform: () => 'android',
                Plugins: {
                    App: { addListener: oyente, getInfo: async () => ({ version: '1.10', build: '10' }) },
                    SplashScreen: { hide: () => undefined },
                    PushNotifications: {
                        addListener: oyente,
                        checkPermissions: async () => ({ receive: 'prompt' }),
                        requestPermissions: async () => ({ receive: 'denied' }),
                        register: async () => undefined,
                    },
                    NativeBiometric: { isAvailable: async () => ({ isAvailable: true }), verifyIdentity: async () => undefined },
                },
            };
        });
        const caidas: string[] = [];
        context.on('page', (p) => p.on('pageerror', (e) => caidas.push(e.message)));
        page.on('pageerror', (e) => caidas.push(e.message));

        await loginViaUI(page, 'admin@testing.edu.ve');
        const otra = await abrirLaApp(context);
        await otra.waitForTimeout(5000);
        await expect(otra.getByText(/couldn.t load/i)).toHaveCount(0);
        expect(caidas, caidas.join('\n')).toEqual([]);
    });

    test('BLOQUEO-UI-07: al abrir la app, el esqueleto del Inicio no se ve antes del libro', async ({ page, context }) => {
        // Lo vio Cristian en su teléfono: la página llega pintada del servidor
        // y el libro sale cuando arranca React. Se retrasa el javascript 3 s
        // (un teléfono lento) y en ese hueco no debe verse nada del Inicio.
        await conHuellaDeMentira(context, 'si');
        await loginViaUI(page, 'admin@testing.edu.ve');
        const otra = await context.newPage();
        await otra.route('**/_next/static/chunks/**', async (ruta) => {
            await new Promise((r) => setTimeout(r, 3000));
            await ruta.continue();
        });
        await otra.goto('/dashboard', { waitUntil: 'domcontentloaded' });
        expect(await otra.evaluate(() => document.documentElement.hasAttribute('data-arrancando'))).toBe(true);
        await expect(otra.locator('main').first()).toBeHidden();
        // Y en cuanto arranca, el libro y luego el bloqueo: nunca el Inicio a medias.
        await expect(bloqueo(otra)).toBeVisible({ timeout: 30000 });
        expect(await otra.evaluate(() => document.documentElement.hasAttribute('data-arrancando'))).toBe(false);
    });

    test('BLOQUEO-UI-08: sin nadie dentro, al abrir no sale el libro ni un esqueleto: el login, ya entero', async ({ context }) => {
        // Lo vio Cristian: libro → «Gestiedu» → esqueleto del login → login.
        // Ahora el libro es solo la descarga de después de entrar, y el login
        // sale cuando ya tiene su liceo (en la APK, el icono de Android tapa la espera).
        await conHuellaDeMentira(context, 'si');
        const page = await context.newPage();
        const fases: string[] = [];
        await page.exposeFunction('apuntarFase', (f: string) => fases.push(f));
        await page.addInitScript(() => {
            new MutationObserver(() => {
                const f = document.querySelector('[data-candado]')?.getAttribute('data-candado');
                if (f) (window as any).apuntarFase(f);
            }).observe(document, { subtree: true, childList: true, attributes: true });
        });
        // El liceo tarda en contestar: mientras, nada a la vista.
        await page.route('**/api/instituto/*/info', async (ruta) => {
            await new Promise((r) => setTimeout(r, 2500));
            await ruta.continue();
        });
        await page.goto('/login?slug=instituto-testing', { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(1200);
        expect(await page.evaluate(() => document.documentElement.hasAttribute('data-arrancando'))).toBe(true);
        await expect(page.locator('input[type="email"]')).toBeVisible({ timeout: 20000 });
        expect(await page.evaluate(() => document.documentElement.hasAttribute('data-arrancando'))).toBe(false);
        expect(fases.filter((f) => f === 'libro' || f === 'logo')).toEqual([]);
        await expect(page.locator('.libro')).toHaveCount(0);
    });
});
