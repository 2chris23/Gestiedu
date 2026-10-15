import { test, expect } from '@playwright/test';
import { WEB_BASE, captureEvidence, loginViaUI } from './helpers';

/**
 * CONFIGURACIÓN EN EL TELÉFONO: LAS FLECHAS (2026-10-14)
 *
 * Cristian: «entras a Configuración, eliges Comedor, le das a la flecha y vas
 * a Configuración, bien; pero le das a la flecha otra vez y te vuelve a llevar
 * a Comedor». La flecha de un apartado empujaba la lista otra vez en el
 * historial; la de la lista hacía «atrás» y caía en el apartado.
 *
 * CONFIG-VOLVER-01: Inicio → Configuración → Comedor → flecha → flecha = Inicio.
 */
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

test('CONFIG-VOLVER-01: la flecha de un apartado vuelve a la lista, y la de la lista sale de Configuración', async ({ page }, testInfo) => {
    try {
        await loginViaUI(page, 'admin@testing.edu.ve', '123456');
        await page.goto(`${WEB_BASE}/dashboard`);
        await page.goto(`${WEB_BASE}/dashboard/configuracion`);
        await page.locator('[data-recorrido="config-pae"]').click({ timeout: 30000 });
        await expect(page).toHaveURL(/seccion=pae/);

        await page.getByRole('link', { name: 'Volver a Configuración' }).click();
        await expect(page).toHaveURL(/\/dashboard\/configuracion$/);

        await page.getByRole('button', { name: 'Volver', exact: true }).click();
        await expect(page).toHaveURL(/\/dashboard$/, { timeout: 15000 });
    } catch (e) {
        await captureEvidence(testInfo, page, 'CONFIG-VOLVER-01', 'Las flechas de Configuración', e);
        throw e;
    }
});
