import { test, expect } from '@playwright/test';
import { WEB_BASE, captureEvidence, loginViaUI, queryTenantDb } from './helpers';

/**
 * EL CUADRO DE HONOR, EN LA PANTALLA (CUADRO-UI-01/02, 2026-10-04)
 *
 * El admin ve el podio con su selector de lapso o ciclo y de año; el alumno ve
 * en su Inicio SU puntaje y cuántos puestos subió, sin puesto ni compañeros.
 *
 * La foto la saca el servidor solo (90 s después de arrancar y cada 6 h): si
 * todavía no está, se espera a que salga.
 */

async function hayFoto(): Promise<boolean> {
    const [r] = await queryTenantDb<{ n: number }>(`SELECT count(*)::int AS n FROM cuadro_de_honor`);
    return r.n > 0;
}

test.describe.serial('Cuadro de honor', () => {
    test.beforeAll(async () => {
        test.setTimeout(240000);
        const hasta = Date.now() + 200000;
        while (!(await hayFoto()) && Date.now() < hasta) await new Promise((r) => setTimeout(r, 5000));
    });

    test('CUADRO-UI-01: el admin ve el podio, elige un lapso y un año, y entra a la ficha', async ({ page }, testInfo) => {
        try {
            expect(await hayFoto(), 'la foto del sábado no salió').toBe(true);
            await loginViaUI(page, 'admin@testing.edu.ve', '123456');
            await page.goto(`${WEB_BASE}/dashboard`);
            const cuadro = page.getByRole('region', { name: 'Cuadro de honor' });
            await expect(cuadro).toBeVisible({ timeout: 30000 });
            await expect(cuadro.getByText(/Se actualiza cada sábado · última: sáb \d\d\/\d\d/)).toBeVisible();
            await expect(cuadro.getByRole('list', { name: 'Los tres primeros' }).getByRole('link').first()).toBeVisible();

            await cuadro.getByRole('combobox', { name: 'Todo el liceo o un año' }).click();
            await page.getByRole('option', { name: '1.º año' }).click();
            await expect(cuadro.getByRole('combobox', { name: 'Todo el liceo o un año' })).toContainText('1.º año');
            await cuadro.getByRole('combobox', { name: 'Lapso o ciclo completo' }).click();
            await page.getByRole('option').first().click();

            await page.screenshot({ path: 'test-results/evidencia/cuadro-de-honor-admin.png', fullPage: true });
            const primero = cuadro.getByRole('list', { name: 'Los tres primeros' }).getByRole('link').first();
            if (await primero.count()) {
                await primero.click();
                await expect(page).toHaveURL(/\/dashboard\/usuarios\/[^/]+$/, { timeout: 15000 });
            }
        } catch (e) {
            await captureEvidence(testInfo, page, 'CUADRO-UI-01', 'Cuadro de honor del admin', e);
            throw e;
        }
    });

    test('CUADRO-UI-02: el alumno ve SU puntaje y cuántos puestos subió, sin puesto ni compañeros', async ({ page }, testInfo) => {
        try {
            const [alumno] = await queryTenantDb<{ email: string }>(
                `SELECT u.email FROM cuadro_de_honor c JOIN users u ON u.id = c."studentId"
                  WHERE u."isActive" = true ORDER BY c.fecha DESC, c."puestoLiceo" DESC LIMIT 1`
            );
            expect(alumno, 'hace falta un alumno en el cuadro').toBeTruthy();
            await loginViaUI(page, alumno.email, '123456');
            await page.goto(`${WEB_BASE}/dashboard`);
            const suyo = page.getByRole('region', { name: 'Cuadro de honor' });
            await expect(suyo).toBeVisible({ timeout: 30000 });
            await expect(suyo.getByText('puntos').first()).toBeVisible();
            await expect(suyo.getByText(/Primera semana en el cuadro|Igual que el sábado pasado|Subiste|Bajaste/).first()).toBeVisible();
            // Nada de puestos ni de podio.
            await expect(suyo.getByText(/puesto \d|\d\.° (Oro|Plata|Bronce)/i)).toHaveCount(0);
            await expect(page.getByRole('list', { name: 'Los tres primeros' })).toHaveCount(0);
            await page.screenshot({ path: 'test-results/evidencia/cuadro-de-honor-alumno.png', fullPage: true });
        } catch (e) {
            await captureEvidence(testInfo, page, 'CUADRO-UI-02', 'Puntaje del alumno', e);
            throw e;
        }
    });
});
