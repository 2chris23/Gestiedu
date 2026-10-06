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
 *   BLOQUEO-UI-05  «Cerrar sesión» desde el bloqueo lleva al login y olvida a quién enseñaba.
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
});
