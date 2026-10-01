import { test, expect } from '@playwright/test';
import { WEB_BASE, loginApi, injectSessionCookies, captureEvidence, queryTenantDb } from './helpers';

/**
 * EL COMEDOR (PAE), EN LA PANTALLA
 *
 * Se activa en Configuración → «Comedor (PAE)»; entonces aparece «Comedor» en
 * el menú, se anota un día y sale en el mes y en el resumen para imprimir.
 * Las reglas del servidor: PAE-01…04.
 */
const hoyEnCaracas = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Caracas' });

test.afterAll(async () => {
    await queryTenantDb(`DELETE FROM pae_registros WHERE menu = 'Menú e2e'`);
    await queryTenantDb(`UPDATE pae_config SET enabled = false`);
});

test('PAE-UI-01: activar el comedor, anotar un día y ver el resumen', async ({ page }, testInfo) => {
    try {
        await injectSessionCookies(page, await loginApi('admin@testing.edu.ve', '123456'));
        await page.goto(`${WEB_BASE}/dashboard/configuracion`);
        await page.getByRole('button', { name: 'Comedor (PAE)' }).click({ timeout: 60000 });
        const interruptor = page.getByRole('switch', { name: 'Usar el comedor' });
        await expect(interruptor).toBeVisible({ timeout: 30000 });
        if ((await interruptor.getAttribute('aria-checked')) !== 'true') await interruptor.click();
        await page.getByRole('button', { name: 'Guardar' }).click();
        await expect(page.getByText('Comedor activado')).toBeVisible();

        // Ya sale en el menú.
        await page.goto(`${WEB_BASE}/dashboard`);
        await page.getByRole('link', { name: 'Comedor' }).first().click({ timeout: 60000 });
        await expect(page.getByRole('heading', { name: 'Comedor (PAE)' })).toBeVisible({ timeout: 30000 });

        await page.getByLabel('Raciones recibidas').fill('300');
        await page.getByLabel('Raciones servidas').fill('310');
        await page.getByLabel('Menú').fill('Menú e2e');
        await page.getByRole('button', { name: 'Guardar' }).click();
        // Más servidas que recibidas: se guarda y se avisa.
        await expect(page.getByText(/10 raciones más de las recibidas/)).toBeVisible({ timeout: 15000 });
        const tabla = page.getByRole('table', { name: 'Lo anotado este mes' });
        await expect(tabla.getByRole('cell', { name: 'Menú e2e' })).toBeVisible();
        const [fila] = await queryTenantDb(`SELECT recibidas, servidas FROM pae_registros WHERE menu = 'Menú e2e' AND fecha = $1::date`, [hoyEnCaracas()]);
        expect(fila).toEqual({ recibidas: 300, servidas: 310 });
        await page.screenshot({ path: 'test-results/evidencia/comedor.png', fullPage: true });

        await page.getByRole('link', { name: 'Resumen del mes' }).click();
        await expect(page.getByRole('table', { name: 'Resumen por comida' })).toBeVisible({ timeout: 30000 });
        await page.emulateMedia({ media: 'print' });
        await page.screenshot({ path: 'test-results/evidencia/comedor-resumen-impreso.png', fullPage: true });
    } catch (error) {
        await captureEvidence(testInfo, page, 'PAE-UI-01', 'Comedor: activar, anotar y resumen', error);
        throw error;
    }
});
