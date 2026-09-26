import { test, expect } from '@playwright/test';
import { WEB_BASE } from './helpers';

/**
 * LAS PANTALLAS NO SE DEJAN METER DENTRO DE OTRA PÁGINA
 *
 *   SEG-WEB-01  toda pantalla sale con sus cabeceras de protección (la API ya
 *               las tenía; las pantallas, ninguna);
 *   SEG-WEB-02  una página ajena que pone el login dentro de un marco no ve
 *               el formulario: el navegador se niega a pintarlo.
 */

const CABECERAS: Record<string, RegExp> = {
    'x-frame-options': /^DENY$/,
    'content-security-policy': /frame-ancestors 'none'/,
    'x-content-type-options': /^nosniff$/,
    'referrer-policy': /strict-origin-when-cross-origin/,
    'permissions-policy': /camera=\(self\).*geolocation=\(self\).*microphone=\(\)/,
};

test.describe('Seguridad de las pantallas', () => {
    test('SEG-WEB-01: cada pantalla trae las cabeceras de protección, y no dice con qué está hecha', async ({ request }) => {
        for (const ruta of ['/', '/login', '/dashboard', '/instituto/instituto-testing/login', '/manifest.webmanifest']) {
            const r = await request.get(`${WEB_BASE}${ruta}`, { maxRedirects: 0 });
            const h = r.headers();
            for (const [nombre, valor] of Object.entries(CABECERAS)) {
                expect(h[nombre], `${ruta}: ${nombre}`).toMatch(valor);
            }
            expect(h['x-powered-by'], `${ruta}: x-powered-by`).toBeUndefined();
        }
    });

    test('SEG-WEB-02: el login metido en un marco de otra página no se pinta', async ({ page }) => {
        await page.setContent(`<iframe id="trampa" src="${WEB_BASE}/login" width="800" height="600"></iframe>`);
        await page.waitForTimeout(3000);
        const marco = page.frames().find((f) => f !== page.mainFrame());
        expect(marco).toBeTruthy();
        // El navegador pone su página de error en vez del login: no hay campo de clave.
        await expect(marco!.locator('input[type="password"]')).toHaveCount(0);
    });
});
