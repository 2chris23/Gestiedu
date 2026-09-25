import { test, expect } from '@playwright/test';
import { WEB_BASE, loginApi, injectSessionCookies, captureEvidence } from './helpers';

/**
 * LAS CONSTANCIAS, EN EL NAVEGADOR
 *
 *   CONS-UI-01  el alumno saca su constancia de estudio desde «Mi boleta»;
 *   CONS-UI-02  el admin saca la de buena conducta desde el perfil del alumno;
 *   CONS-UI-03  el alumno no puede sacar la de buena conducta (lo dice).
 */

test.describe('Las constancias', () => {
    test('CONS-UI-01: el alumno saca su constancia de estudio desde su boleta', async ({ page }, testInfo) => {
        try {
            const alumno = await loginApi('est0575@testing.edu.ve', '123456');
            await injectSessionCookies(page, alumno);
            await page.goto(`${WEB_BASE}/dashboard/boleta/mia`);
            await page.getByRole('link', { name: /Constancia de estudio/ }).click();
            await expect(page).toHaveURL(/\/dashboard\/constancia\/mia/);
            const hoja = page.getByRole('article', { name: 'Constancia de estudio' });
            await expect(hoja).toBeVisible({ timeout: 30000 });
            await expect(hoja.getByText('Estudiante Prueba')).toBeVisible();
            await expect(hoja).toContainText('hace constar');
            await expect(hoja).toContainText('cursa estudios');
        } catch (error) {
            await captureEvidence(testInfo, page, 'CONS-UI-01', 'Constancia de estudio', error);
            throw error;
        }
    });

    test('CONS-UI-02: el admin saca la de buena conducta desde el perfil', async ({ page }, testInfo) => {
        try {
            const admin = await loginApi('admin@testing.edu.ve', '123456');
            await injectSessionCookies(page, admin);
            await page.goto(`${WEB_BASE}/dashboard/usuarios/V-20000575`);
            await page.getByRole('link', { name: /Constancia de buena conducta/ }).click();
            const hoja = page.getByRole('article', { name: 'Constancia de buena conducta' });
            await expect(hoja).toBeVisible({ timeout: 30000 });
            await expect(hoja).toContainText('buena conducta');
        } catch (error) {
            await captureEvidence(testInfo, page, 'CONS-UI-02', 'Constancia de conducta', error);
            throw error;
        }
    });

    test('CONS-UI-03: el alumno no puede sacar la de buena conducta', async ({ page }, testInfo) => {
        try {
            const alumno = await loginApi('est0575@testing.edu.ve', '123456');
            await injectSessionCookies(page, alumno);
            await page.goto(`${WEB_BASE}/dashboard/constancia/mia?tipo=BUENA_CONDUCTA`);
            await expect(page.getByText('No tienes permiso para sacar esta constancia.')).toBeVisible({ timeout: 30000 });
            await expect(page.getByRole('article')).toHaveCount(0);
        } catch (error) {
            await captureEvidence(testInfo, page, 'CONS-UI-03', 'Constancia ajena', error);
            throw error;
        }
    });
});
