import { test, expect, type BrowserContext } from '@playwright/test';
import { loginViaUI } from './helpers';

/**
 * LA APP SIN GOOGLE PLAY (decidido por Cristian, 2026-10-06)
 *
 *   APPDESC-UI-01  en el navegador de un Android, al entrar sale «Descarga la
 *                  app» con la última versión del liceo; la X la esconde;
 *   APPDESC-UI-02  en un ordenador no sale (una APK no le sirve);
 *   APPDESC-UI-03  dentro de la APK no sale, y con una versión nueva sale la
 *                  ventana «Actualización de versión» (V nueva, lo nuevo
 *                  numerado, «Actualizar», el enlace y la versión actual).
 *
 * Usa la ficha publicada de verdad (`apks/com.gestiedu.institutotesting.json`).
 */

const ANDROID =
    'Mozilla/5.0 (Linux; Android 13; moto g13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36';

const aviso = (page: import('@playwright/test').Page) => page.locator('[data-descargar-la-app]');

test.describe('La app sin Google Play', () => {
    test.describe('en un Android', () => {
        test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, userAgent: ANDROID });

        test('APPDESC-UI-01: al entrar, «Descarga la app» con la última versión; la X la esconde', async ({ page }) => {
            await loginViaUI(page, 'est0575@testing.edu.ve');
            await expect(aviso(page)).toBeVisible({ timeout: 20000 });
            await expect(aviso(page)).toContainText(/V\d+\.\d+/);
            const enlace = aviso(page).getByRole('link', { name: 'Descargar' });
            await expect(enlace).toHaveAttribute('href', /\/api\/app-movil\/com\.gestiedu\.institutotesting\/apk$/);
            // El enlace baja la APK de verdad.
            const r = await page.request.get((await enlace.getAttribute('href'))!);
            expect(r.status()).toBe(200);
            expect(r.headers()['content-type']).toContain('android.package-archive');

            await aviso(page).getByRole('button', { name: 'Ahora no' }).click();
            await expect(aviso(page)).toHaveCount(0);
            await page.reload();
            await page.waitForTimeout(4000);
            await expect(aviso(page)).toHaveCount(0);
        });
    });

    test('APPDESC-UI-02: en un ordenador no sale', async ({ page }) => {
        await loginViaUI(page, 'est0575@testing.edu.ve');
        await page.waitForTimeout(5000);
        await expect(aviso(page)).toHaveCount(0);
    });

    test.describe('dentro de la APK', () => {
        test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, userAgent: ANDROID });

        async function comoLaApk(context: BrowserContext) {
            await context.addInitScript(() => {
                const oyente = () => ({ remove: () => undefined });
                (window as any).Capacitor = {
                    isNativePlatform: () => true,
                    getPlatform: () => 'android',
                    Plugins: {
                        // Una APK vieja: la 1.1 (build 1).
                        App: { addListener: oyente, getInfo: async () => ({ id: 'com.gestiedu.institutotesting', build: '1', version: '1.1' }) },
                        SplashScreen: { hide: () => undefined },
                        ActualizarApp: {
                            puedeInstalar: async () => ({ puede: true }),
                            pedirPermiso: async () => undefined,
                            descargarEInstalar: async () => undefined,
                            descargar: async () => ({ lista: false }),
                            yaBajada: async () => ({ lista: false }),
                            instalar: async () => undefined,
                            addListener: oyente,
                        },
                    },
                };
            });
        }

        test('APPDESC-UI-03: no ofrece descargarla; con versión nueva, «Actualización de versión»', async ({ page, context }) => {
            await comoLaApk(context);
            await loginViaUI(page, 'est0575@testing.edu.ve');
            const ventana = page.locator('[data-actualizar-la-app]');
            await expect(ventana).toBeVisible({ timeout: 20000 });
            await expect(ventana.getByRole('heading', { name: 'Actualización de versión' })).toBeVisible();
            await expect(ventana).toContainText(/V\d+\.\d+/);
            await expect(ventana.locator('ol li').first()).toBeVisible();
            await expect(ventana.getByRole('button', { name: 'Actualizar' })).toBeVisible();
            await expect(ventana.getByRole('link')).toHaveAttribute('href', /\/apk$/);
            await expect(ventana).toContainText('Versión actual: 1.1');
            await expect(aviso(page)).toHaveCount(0);
        });
    });
});
