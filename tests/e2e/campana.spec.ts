import { test, expect } from '@playwright/test';
import { WEB_BASE, loginApi, injectSessionCookies, captureEvidence, queryTenantDb } from './helpers';

/**
 * LA CAMPANA DE AVISOS
 *
 * Un aviso para el representante sale en su campana con el número de no
 * leídos; al tocarlo se marca leído y lleva adonde diga. Las reglas del
 * servidor: NOTI-01…06.
 */

test.describe('La campana', () => {
    let tutorId = '';
    test.afterAll(async () => {
        if (tutorId) await queryTenantDb(`DELETE FROM notifications WHERE "recipientId" = $1 AND type = 'PRUEBA'`, [tutorId]);
    });

    test('NOTI-UI-01: el aviso sale en la campana, se abre y queda leído', async ({ page }, testInfo) => {
        try {
            const tutor = await loginApi('tutor.prueba@testing.edu.ve', '123456');
            [{ id: tutorId }] = await queryTenantDb(`SELECT id FROM users WHERE email = 'tutor.prueba@testing.edu.ve'`);
            await queryTenantDb(`UPDATE notifications SET "readAt" = now() WHERE "recipientId" = $1 AND "readAt" IS NULL`, [tutorId]);
            await queryTenantDb(
                `INSERT INTO notifications (id, title, message, type, priority, "recipientId", "actionUrl", "createdAt", "updatedAt")
                 VALUES ($1, 'Citación del liceo', 'Martes 14, 8:00 a. m.', 'PRUEBA', 'NORMAL', $2, '/dashboard', now(), now())`,
                [`c${Date.now()}aviso`, tutorId]
            );
            await injectSessionCookies(page, tutor);
            await page.goto(`${WEB_BASE}/dashboard`);

            const campana = page.getByRole('button', { name: 'Avisos: 1 sin leer' }).first();
            await expect(campana).toBeVisible({ timeout: 60000 });
            await campana.click();
            await expect(page.getByRole('list', { name: 'Lista de avisos' })).toContainText('Citación del liceo');
            await page.waitForTimeout(400); // que acabe de aparecer (se abre con un fundido)
            await page.screenshot({ path: 'test-results/evidencia/campana.png' });
            await page.getByRole('button', { name: /Citación del liceo/ }).click();
            await expect.poll(async () => (await queryTenantDb(`SELECT count(*)::int AS n FROM notifications WHERE "recipientId" = $1 AND "readAt" IS NULL`, [tutorId]))[0].n).toBe(0);
            await expect(page.getByRole('button', { name: 'Avisos', exact: true }).first()).toBeVisible();
        } catch (error) {
            await captureEvidence(testInfo, page, 'NOTI-UI-01', 'La campana de avisos', error);
            throw error;
        }
    });

    test('NOTI-UI-02: si el navegador bloquea los avisos, la campana dice dónde se activan (y no se ofrece)', async ({ page }, testInfo) => {
        // El Chromium sin ventana de las pruebas tiene las notificaciones
        // bloqueadas siempre (ni concediéndolas cambia): aquí se prueba ese
        // caso. El aviso de verdad con la app cerrada se prueba en el
        // emulador (Pixel_10), con la PWA instalada.
        try {
            const tutor = await loginApi('tutor.prueba@testing.edu.ve', '123456');
            await injectSessionCookies(page, tutor);
            await page.goto(`${WEB_BASE}/dashboard`);
            await page.getByRole('button', { name: /^Avisos/ }).first().click({ timeout: 60000 });
            await expect(page.getByText('Este teléfono tiene los avisos bloqueados para Gestiedu')).toBeVisible();
            await expect(page.getByRole('region', { name: 'Avisos en el teléfono' })).toHaveCount(0);
        } catch (error) {
            await captureEvidence(testInfo, page, 'NOTI-UI-02', 'Avisos bloqueados en el navegador', error);
            throw error;
        }
    });
});
