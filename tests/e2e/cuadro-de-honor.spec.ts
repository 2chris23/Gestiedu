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
            await page.waitForLoadState('networkidle');
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

    test('CUADRO-UI-02: el alumno no ve el puesto si es el 11.º (ni en escritorio ni en móvil)', async ({ page }, testInfo) => {
        try {
            const [alumno11] = await queryTenantDb<{ email: string; puestoAno: number; puestoLiceo: number }>(
                `SELECT u.email, c."puestoAno", c."puestoLiceo" FROM cuadro_de_honor c JOIN users u ON u.id = c."studentId"
                  WHERE u."isActive" = true AND c."puestoAno" >= 11 AND c."puestoLiceo" >= 11 ORDER BY c.fecha DESC, c."puestoLiceo" ASC LIMIT 1`
            );
            // Si hay un alumno en puesto >= 11, lo usamos; si no, el de mayor puestoLiceo
            const alumno = alumno11 || (await queryTenantDb<{ email: string }>(
                `SELECT u.email FROM cuadro_de_honor c JOIN users u ON u.id = c."studentId"
                  WHERE u."isActive" = true ORDER BY c.fecha DESC, c."puestoLiceo" DESC LIMIT 1`
            ))[0];
            expect(alumno, 'hace falta un alumno en el cuadro').toBeTruthy();
            await loginViaUI(page, alumno.email, '123456');

            // 1. En escritorio
            await page.waitForLoadState('networkidle');
            const suyo = page.getByRole('region', { name: 'Cuadro de honor' });
            await expect(suyo).toBeVisible({ timeout: 30000 });
            await expect(suyo.getByText('puntos').first()).toBeVisible();
            await expect(suyo.getByText(/Primera semana en el cuadro|Igual que el sábado pasado|Subiste|Bajaste/).first()).toBeVisible();
            // Nada de puestos ni de podio para el 11.°
            await expect(suyo.getByText(/puesto \d|\d\.° (Oro|Plata|Bronce)|11[.°º]/i)).toHaveCount(0);
            await expect(page.getByRole('list', { name: 'Los tres primeros' })).toHaveCount(0);
            await page.screenshot({ path: 'test-results/evidencia/cuadro-de-honor-alumno.png', fullPage: true });

            // 2. En el teléfono
            await page.setViewportSize({ width: 390, height: 844 });
            await page.reload();
            await page.waitForLoadState('networkidle');
            // En móvil se muestra el promedio y puntaje, pero sin mención a puesto 11
            await expect(page.getByText(/11[.°º] de tu año|11[.°º] del liceo|puesto 11/i)).toHaveCount(0);
            await page.screenshot({ path: 'test-results/evidencia/cuadro-de-honor-alumno-movil.png', fullPage: true });
        } catch (e) {
            await captureEvidence(testInfo, page, 'CUADRO-UI-02', 'Puntaje del alumno sin puesto >= 11', e);
            throw e;
        }
    });

    test('CUADRO-UI-03: el profesor no ve el cuadro de honor en su panel (ni en escritorio ni en móvil)', async ({ page }, testInfo) => {
        try {
            const [profesor] = await queryTenantDb<{ email: string }>(
                `SELECT email FROM users WHERE role = 'TEACHER' AND "isActive" = true LIMIT 1`
            );
            expect(profesor, 'hace falta un profesor activo').toBeTruthy();
            await loginViaUI(page, profesor.email, '123456');

            // 1. En escritorio
            await page.setViewportSize({ width: 1280, height: 800 });
            await page.waitForLoadState('domcontentloaded');
            await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 20000 });
            await expect(page.getByRole('region', { name: 'Cuadro de honor' })).toHaveCount(0);
            await expect(page.getByText('Cuadro de honor')).toHaveCount(0);
            await expect(page.getByRole('list', { name: 'Los tres primeros' })).toHaveCount(0);
            await page.screenshot({ path: 'test-results/evidencia/cuadro-de-honor-profesor-escritorio.png', fullPage: true });

            // 2. En móvil
            await page.setViewportSize({ width: 390, height: 844 });
            await page.reload();
            await page.waitForLoadState('domcontentloaded');
            await expect(page.getByText('Promedio de mis clases')).toBeVisible({ timeout: 20000 });
            await expect(page.getByRole('region', { name: 'Cuadro de honor' })).toHaveCount(0);
            await expect(page.getByText('Cuadro de honor')).toHaveCount(0);
            await page.screenshot({ path: 'test-results/evidencia/cuadro-de-honor-profesor-movil.png', fullPage: true });
        } catch (e) {
            await captureEvidence(testInfo, page, 'CUADRO-UI-03', 'Profesor sin cuadro de honor', e);
            throw e;
        }
    });
});
