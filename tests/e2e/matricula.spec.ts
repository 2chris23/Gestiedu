import { test, expect } from '@playwright/test';
import { WEB_BASE, loginApi, injectSessionCookies, captureEvidence, queryTenantDb } from './helpers';

/**
 * LA ESTADÍSTICA DE MATRÍCULA, EN LA PANTALLA
 *
 * Desde el ciclo: el movimiento (inicial, ingresos, retiros, final) por
 * sección y sexo, y la matrícula por edad, de un mes o de un lapso. Las
 * reglas del servidor: MAT-01…04.
 */
test('MAT-UI-01: la matrícula del ciclo, por mes', async ({ page }, testInfo) => {
    try {
        const [ciclo] = await queryTenantDb(`SELECT name FROM academic_years WHERE status = 'ACTIVE' ORDER BY "startDate" DESC LIMIT 1`);
        const admin = await loginApi('admin@testing.edu.ve', '123456');
        await injectSessionCookies(page, admin);
        await page.goto(`${WEB_BASE}/dashboard/academico/${ciclo.name}`);
        await page.getByRole('button', { name: 'Más opciones del ciclo' }).click({ timeout: 60000 });
        await page.getByRole('menuitem', { name: /Estadística de matrícula/ }).click();
        const tabla = page.getByRole('table', { name: 'Movimiento de la matrícula' });
        await expect(tabla).toContainText('Total del plantel', { timeout: 60000 });
        await expect(page.getByRole('table', { name: 'Matrícula por edad' })).toBeVisible();
        await page.getByRole('combobox', { name: 'Período' }).click();
        await page.getByRole('option').nth(1).click();
        await expect(page.getByRole('article', { name: 'Estadística de matrícula' })).toContainText(/del \d{2}\/\d{2}\/\d{4} al \d{2}\/\d{2}\/\d{4}/);
        await page.screenshot({ path: 'test-results/evidencia/matricula.png', fullPage: true });
    } catch (error) {
        await captureEvidence(testInfo, page, 'MAT-UI-01', 'Estadística de matrícula', error);
        throw error;
    }
});
