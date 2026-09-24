import { test, expect } from '@playwright/test';
import { WEB_BASE, loginApi, injectSessionCookies, captureEvidence, queryTenantDb } from './helpers';

/**
 * LA BOLETA, EN EL NAVEGADOR
 *
 *   BOL-UI-01  el alumno abre «Mi boleta» desde su inicio y ve sus materias;
 *   BOL-UI-02  el representante la abre desde su representado;
 *   BOL-UI-03  un alumno no ve la boleta de otro (lo dice, no sale vacía).
 */

test.describe('La boleta', () => {
    test('BOL-UI-01: el alumno abre «Mi boleta» desde su inicio', async ({ page }, testInfo) => {
        try {
            const alumno = await loginApi('est0575@testing.edu.ve', '123456');
            await injectSessionCookies(page, alumno);
            await page.goto(`${WEB_BASE}/dashboard`);
            await page.getByRole('link', { name: /Mi boleta/ }).first().click();
            await expect(page).toHaveURL(/\/dashboard\/boleta\/mia/);
            const boleta = page.getByRole('article', { name: 'Boleta de calificaciones' });
            await expect(boleta).toBeVisible({ timeout: 30000 });
            await expect(boleta.getByText('Prueba, Estudiante')).toBeVisible();
            // Sus materias, con una fila por materia.
            const [{ n }] = await queryTenantDb(
                `SELECT count(*)::int AS n FROM classroom_subjects cs
                   JOIN student_classrooms sc ON sc."classroomId" = cs."classroomId" AND sc."isActive"
                  WHERE sc."studentId" = 'V-20000575'`
            );
            await expect(boleta.locator('tbody tr')).toHaveCount(n + 2); // + promedio e inasistencias
        } catch (error) {
            await captureEvidence(testInfo, page, 'BOL-UI-01', 'Mi boleta', error);
            throw error;
        }
    });

    test('BOL-UI-02: el representante la abre desde su representado', async ({ page }, testInfo) => {
        try {
            const tutor = await loginApi('tutor.prueba@testing.edu.ve', '123456');
            await injectSessionCookies(page, tutor);
            await page.goto(`${WEB_BASE}/dashboard`);
            await page.getByRole('link', { name: /Ver la boleta/ }).first().click();
            await expect(page.getByRole('article', { name: 'Boleta de calificaciones' })).toBeVisible({ timeout: 30000 });
        } catch (error) {
            await captureEvidence(testInfo, page, 'BOL-UI-02', 'Boleta del representado', error);
            throw error;
        }
    });

    test('BOL-UI-03: un alumno no ve la boleta de otro', async ({ page }, testInfo) => {
        try {
            const alumno = await loginApi('est0575@testing.edu.ve', '123456');
            const [otro] = await queryTenantDb(
                `SELECT id FROM users WHERE role = 'STUDENT' AND id <> 'V-20000575' LIMIT 1`
            );
            await injectSessionCookies(page, alumno);
            await page.goto(`${WEB_BASE}/dashboard/boleta/${otro.id}`);
            await expect(page.getByText('No tienes permiso para ver esta boleta.')).toBeVisible({ timeout: 30000 });
            await expect(page.getByRole('article', { name: 'Boleta de calificaciones' })).toHaveCount(0);
        } catch (error) {
            await captureEvidence(testInfo, page, 'BOL-UI-03', 'Boleta ajena', error);
            throw error;
        }
    });
});
