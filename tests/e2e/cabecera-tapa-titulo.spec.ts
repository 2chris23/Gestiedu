import { test, expect } from '@playwright/test';
import { WEB_BASE, loginApi, injectSessionCookies } from './helpers';

/**
 * CAB-01  en el teléfono, al ir de una pantalla bajada a otra con la barra de
 *         abajo, el título de la nueva no queda debajo de la cabecera
 *         (Cristian, 18-oct-2026: en Horarios solo se veía media línea gris).
 */
test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

test('CAB-01: el título no queda debajo de la cabecera al cambiar de pantalla', async ({ page }) => {
    const admin = await loginApi('admin@testing.edu.ve', '123456');
    await injectSessionCookies(page, admin);
    await page.goto(`${WEB_BASE}/dashboard/configuracion?seccion=color`);
    await page.waitForLoadState('networkidle');
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(300);
    await page.getByRole('navigation', { name: 'Navegación principal' }).getByRole('link', { name: 'Horarios' }).click();
    const titulo = page.getByRole('heading', { level: 1 }).first();
    await expect(titulo).toBeVisible({ timeout: 60000 });
    await page.waitForTimeout(800);
    const cabecera = await page.locator('header').first().boundingBox();
    const caja = await titulo.boundingBox();
    console.log('cabecera abajo', cabecera && cabecera.y + cabecera.height, 'título arriba', caja?.y, 'scrollY', await page.evaluate(() => window.scrollY));
    expect(caja!.y).toBeGreaterThanOrEqual(cabecera!.y + cabecera!.height - 1);
});
