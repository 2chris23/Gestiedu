import { test, expect } from '@playwright/test';
import { WEB_BASE, TENANT_SLUG, captureEvidence } from './helpers';

/**
 * LA APP NO SE QUEDA NUNCA EN BLANCO (2026-09-30)
 *
 * Visto en el teléfono de Cristian fuera de casa: la página guardada se pintaba
 * pero la app no arrancaba encima, y se quedaba una hoja vacía para siempre.
 * El guardián del arranque (`lib/guardian-del-arranque.ts`) va escrito en la
 * propia página: si la app no arranca y la web no contesta, lleva a la
 * pantalla de sin conexión, que dice qué pasa y enseña lo guardado.
 */
test('NUNCA-BLANCO-01: la app no arranca y no hay servidor → pantalla de sin conexión, no una hoja vacía', async ({ page }, testInfo) => {
    try {
        // Ningún archivo de la app llega (lo que pasa cuando falta lo guardado),
        // y la web no contesta a «¿estás?».
        await page.route('**/_next/static/chunks/**', (r) => r.abort('connectionrefused'));
        await page.route('**/api/estoy', (r) => r.abort('connectionrefused'));
        await page.goto(`${WEB_BASE}/login?slug=${TENANT_SLUG}`, { waitUntil: 'commit' });

        await expect(page).toHaveURL(/\/sin-conexion\.html\?desde=%2Flogin/, { timeout: 25_000 });
        await expect(page.getByRole('heading', { name: 'No hay conexión con el liceo' })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Reintentar' })).toBeVisible();
        await page.screenshot({ path: testInfo.outputPath('nunca-en-blanco.png') });
    } catch (e) {
        await captureEvidence(testInfo, page, 'NUNCA-BLANCO-01', 'La app en blanco no llevó a la pantalla de sin conexión', e);
        throw e;
    }
});

test('NUNCA-BLANCO-02: la app va lenta pero la web contesta → se la deja arrancar', async ({ page }, testInfo) => {
    try {
        await page.route('**/_next/static/chunks/**', (r) => r.abort('connectionrefused'));
        await page.goto(`${WEB_BASE}/login?slug=${TENANT_SLUG}`, { waitUntil: 'commit' });
        // Pasado el tope del guardián (8 s + 4 s), sigue en su sitio.
        await page.waitForTimeout(14_000);
        expect(page.url()).toContain('/login');
    } catch (e) {
        await captureEvidence(testInfo, page, 'NUNCA-BLANCO-02', 'El guardián se llevó una app lenta con servidor', e);
        throw e;
    }
});
