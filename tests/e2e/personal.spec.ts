import { test, expect } from '@playwright/test';
import { WEB_BASE, loginApi, injectSessionCookies, captureEvidence, queryTenantDb } from './helpers';

/**
 * EL PERSONAL: LA HOJA DE CARGA HORARIA Y LA CONSTANCIA DE TRABAJO
 *
 * Desde la ficha de un profesor. Las reglas del servidor: PERS-01…03.
 */
test('PERS-UI-01: la carga horaria y la constancia de trabajo de un profesor', async ({ page }, testInfo) => {
    try {
        const [profe] = await queryTenantDb(
            `SELECT u.id FROM users u JOIN classroom_subjects cs ON cs."teacherId" = u.id WHERE u.role = 'TEACHER' AND u."isActive" GROUP BY u.id ORDER BY count(*) DESC LIMIT 1`
        );
        const admin = await loginApi('admin@testing.edu.ve', '123456');
        await injectSessionCookies(page, admin);
        await page.goto(`${WEB_BASE}/dashboard/usuarios/${encodeURIComponent(profe.id)}`);
        await page.getByRole('link', { name: 'Hoja de carga horaria' }).click({ timeout: 60000 });
        const hoja = page.getByRole('article', { name: 'Carga horaria' });
        await expect(hoja.getByRole('table', { name: 'Carga horaria' })).toContainText('Total', { timeout: 60000 });
        await expect(hoja).toContainText('que recomienda el liceo');
        await page.screenshot({ path: 'test-results/evidencia/carga-horaria.png', fullPage: true });

        await page.goto(`${WEB_BASE}/dashboard/usuarios/${encodeURIComponent(profe.id)}`);
        await page.getByRole('link', { name: 'Constancia de trabajo' }).click({ timeout: 60000 });
        await expect(page.getByRole('article', { name: 'Constancia de trabajo' })).toContainText('presta sus servicios en esta institución', { timeout: 60000 });
        await page.screenshot({ path: 'test-results/evidencia/constancia-de-trabajo.png', fullPage: true });
    } catch (error) {
        await captureEvidence(testInfo, page, 'PERS-UI-01', 'Carga horaria y constancia de trabajo', error);
        throw error;
    }
});
