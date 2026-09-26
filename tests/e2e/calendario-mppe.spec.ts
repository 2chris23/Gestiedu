import { test, expect } from '@playwright/test';
import { WEB_BASE, loginApi, injectSessionCookies, captureEvidence } from './helpers';

/**
 * UN CICLO NUEVO NACE CON EL CALENDARIO DEL MPPE
 *
 * Antes, «Nuevo ciclo» ponía del 20 de agosto al 15 de julio y partía el año
 * en tres trozos iguales: fechas inventadas que el liceo tenía que corregir a
 * mano. Ahora salen las del calendario del Ministerio para el año elegido (la
 * cuenta la prueban CAL-MPPE-01…03). No se crea nada: se mira y se cancela.
 */

test('CAL-UI-01: «Nuevo ciclo» propone las fechas del MPPE, lapso por lapso', async ({ page }, testInfo) => {
    try {
        const admin = await loginApi('admin@testing.edu.ve', '123456');
        await injectSessionCookies(page, admin);
        await page.goto(`${WEB_BASE}/dashboard/academico`);
        await page.getByRole('button', { name: 'Nuevo Ciclo' }).click({ timeout: 30000 });

        const ventana = page.getByRole('dialog', { name: 'Nuevo Ciclo Escolar' });
        await expect(ventana).toBeVisible({ timeout: 15000 });
        // Al año 2025-2026, el que publicó el Ministerio.
        const actual = Number((await ventana.locator('.tabular-nums').first().innerText()).match(/\d{4}/)![0]);
        for (let i = actual; i > 2025; i--) await ventana.getByRole('button', { name: 'Año anterior' }).click();
        for (let i = actual; i < 2025; i++) await ventana.getByRole('button', { name: 'Año siguiente' }).click();

        await expect(ventana.getByText('15 sep 2025').first()).toBeVisible();
        await expect(ventana.getByText('31 jul 2026').first()).toBeVisible();
        await expect(ventana.getByText('15 sep 2025 → 12 dic 2025')).toBeVisible();
        await expect(ventana.getByText('12 ene 2026 → 27 mar 2026')).toBeVisible();
        await expect(ventana.getByText('06 abr 2026 → 31 jul 2026')).toBeVisible();
        // El 1er lapso trae el mes de diagnóstico.
        await expect(ventana.getByLabel('El plan de evaluación empieza el').first()).toHaveValue('2025-10-15');
        await page.screenshot({ path: 'test-results/evidencia/calendario-mppe.png' });

        await ventana.getByRole('button', { name: 'Cancelar' }).click();
    } catch (error) {
        await captureEvidence(testInfo, page, 'CAL-UI-01', 'Nuevo ciclo con el calendario del MPPE', error);
        throw error;
    }
});
