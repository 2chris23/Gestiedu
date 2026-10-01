import { test, expect } from '@playwright/test';
import { WEB_BASE, loginApi, injectSessionCookies, captureEvidence, queryTenantDb } from './helpers';

/**
 * LOS GRADUANDOS, EN LA PANTALLA
 *
 * Desde el ciclo: la lista de graduandos del último año (por cerrar, antes
 * del cierre). El título y la constancia de título en trámite se prueban en
 * el servidor (TIT-01…03).
 */
test('TIT-UI-01: la lista de graduandos del ciclo en curso', async ({ page }, testInfo) => {
    try {
        const [ciclo] = await queryTenantDb(`SELECT name FROM academic_years WHERE status = 'ACTIVE' ORDER BY "startDate" DESC LIMIT 1`);
        const admin = await loginApi('admin@testing.edu.ve', '123456');
        await injectSessionCookies(page, admin);
        await page.goto(`${WEB_BASE}/dashboard/academico/${ciclo.name}`);
        await page.getByRole('button', { name: 'Más opciones del ciclo' }).click({ timeout: 60000 });
        await page.getByRole('menuitem', { name: /Graduandos y títulos/ }).click();
        const hoja = page.getByRole('article', { name: 'Lista de graduandos' });
        await expect(hoja).toContainText('el año no se ha cerrado todavía', { timeout: 60000 });
        await expect(hoja.getByRole('table', { name: 'Graduandos' })).toContainText('Por cerrar el año');
        await page.screenshot({ path: 'test-results/evidencia/graduandos.png', fullPage: true });
    } catch (error) {
        await captureEvidence(testInfo, page, 'TIT-UI-01', 'Lista de graduandos', error);
        throw error;
    }
});
