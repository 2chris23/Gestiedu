import { test, expect } from '@playwright/test';
import { loginViaUI, queryTenantDb, captureEvidence } from './helpers';

/**
 * SELECTOR DE LAPSO EN PANTALLAS ACADÉMICAS (AÑO, SECCIÓN, MATERIA)
 *
 * Verifica que al cambiar el selector «Ver: Primer/Segundo Lapso»:
 * 1. En /dashboard/academico/<ciclo>: las cifras cambian y coinciden con las del servidor.
 * 2. En /dashboard/academico/<ciclo>/<sección>: las cifras cambian y con lapso sin notas
 *    muestra «—» y «Sin notas» (nunca 0 ni «Sin calificar»).
 * 3. En /dashboard/academico/<ciclo>/<sección>/<materia>: las cifras cambian y con lapso
 *    sin notas muestra «—» y «Sin notas».
 */

test.describe.serial('Selector de lapso en pantallas académicas', () => {
    const cycleId = 'ay-2026-2027-testing';
    const sectionSlug = '2026-2027-1-a';
    const subjectSlug = 'materia-mate';

    test.beforeEach(async ({ page }) => {
        await loginViaUI(page, 'admin@testing.edu.ve', '123456');
        await page.waitForLoadState('networkidle');
    });

    test('1. Pantalla del año (/dashboard/academico/<ciclo>): las cifras cambian al cambiar de lapso', async ({ page }, testInfo) => {
        try {
            await page.goto(`/dashboard/academico/${cycleId}`);
            await page.waitForLoadState('networkidle');

            const selector = page.getByRole('combobox', { name: 'Selector de lapso / momento' });
            await expect(selector).toBeVisible({ timeout: 15000 });

            // Cambiar a Primer Lapso
            const resLapso1 = page.waitForResponse(
                (r) => r.url().includes(`/api/academic-years/${cycleId}/stats`) && r.url().includes('periodId=') && r.status() === 200
            );
            await selector.click();
            await page.getByRole('option', { name: 'Primer Lapso' }).click();
            await resLapso1;
            await page.waitForTimeout(500);

            // Resumen de cifras superiores (Primer Lapso)
            const resumen = page.getByRole('region', { name: 'Resumen' });
            await expect(resumen).toBeVisible();
            await expect(resumen.getByText('En riesgo')).toBeVisible();
            await expect(resumen.getByText('257')).toBeVisible(); // 257 alumnos en riesgo
            await expect(resumen.getByText('93%')).toBeVisible(); // 93% asistencia
            await expect(resumen.getByText('193')).toBeVisible(); // 193 observaciones

            // Cambiar a Segundo Lapso (sin notas ni asistencia aún)
            const resLapso2 = page.waitForResponse(
                (r) => r.url().includes(`/api/academic-years/${cycleId}/stats`) && r.url().includes('periodId=') && r.status() === 200
            );
            await selector.click();
            await page.getByRole('option', { name: 'Segundo Lapso' }).click();
            await resLapso2;
            await page.waitForTimeout(500);

            // En Segundo Lapso: promedio no es 0 sino "—", 0 en riesgo, 0% asistencia, 0 observaciones
            await expect(resumen.getByText('—')).toBeVisible();
            await expect(resumen.getByText('0', { exact: true })).toHaveCount(2); // 0 observaciones / riesgo
            await expect(resumen.getByText('0%')).toBeVisible();
        } catch (e) {
            await captureEvidence(testInfo, page, 'LAPSO-ANO', 'Fallo en selector de lapso en año', e);
            throw e;
        }
    });

    test('2. Pantalla de la sección (/dashboard/academico/<ciclo>/<sección>): cifras cambian y lapso vacío muestra «—» y «Sin notas»', async ({ page }, testInfo) => {
        try {
            await page.goto(`/dashboard/academico/${cycleId}/${sectionSlug}`);
            await page.waitForLoadState('networkidle');

            const selector = page.getByRole('combobox', { name: 'Selector de lapso / momento' });
            await expect(selector).toBeVisible({ timeout: 15000 });

            // Cambiar a Primer Lapso
            const resLapso1 = page.waitForResponse(
                (r) => r.url().includes('/stats') && r.url().includes('periodId=') && r.status() === 200
            );
            await selector.click();
            await page.getByRole('option', { name: 'Primer Lapso' }).click();
            await resLapso1;
            await page.waitForTimeout(500);

            const resumen = page.getByRole('region', { name: 'Resumen' });
            await expect(resumen).toBeVisible();
            await expect(resumen.getByText('13.1')).toBeVisible(); // Promedio 1er Año A
            await expect(resumen.getByText('14', { exact: true })).toBeVisible();   // 14 en riesgo
            await expect(resumen.getByText('91%')).toBeVisible();  // 91% asistencia
            await expect(resumen.getByText('83')).toBeVisible();   // 83 observaciones

            // Cambiar a Segundo Lapso
            const resLapso2 = page.waitForResponse(
                (r) => r.url().includes('/stats') && r.url().includes('periodId=') && r.status() === 200
            );
            await selector.click();
            await page.getByRole('option', { name: 'Segundo Lapso' }).click();
            await resLapso2;
            await page.waitForTimeout(500);

            // Debe mostrar «—», nunca 0
            await expect(resumen.getByText('—')).toBeVisible();
            await expect(resumen.getByText('0%')).toBeVisible();

            // En la lista de estudiantes debe mostrar «Sin notas» y nunca «Sin calificar» ni «0»
            await expect(page.getByText('Sin notas').first()).toBeVisible();
            await expect(page.getByText('Sin calificar')).toHaveCount(0);
        } catch (e) {
            await captureEvidence(testInfo, page, 'LAPSO-SECCION', 'Fallo en selector de lapso en sección', e);
            throw e;
        }
    });

    test('3. Pantalla de la materia (/dashboard/academico/<ciclo>/<sección>/<materia>): cifras cambian y lapso vacío muestra «—» y «Sin notas»', async ({ page }, testInfo) => {
        try {
            await page.goto(`/dashboard/academico/${cycleId}/${sectionSlug}/${subjectSlug}`);
            await page.waitForLoadState('networkidle');

            const selector = page.getByRole('combobox', { name: 'Selector de lapso / momento' });
            await expect(selector).toBeVisible({ timeout: 15000 });

            // Cambiar a Primer Lapso
            const resLapso1 = page.waitForResponse(
                (r) => r.url().includes('/subjects') && r.url().includes('stats=true') && r.url().includes('periodId=') && r.status() === 200
            );
            await selector.click();
            await page.getByRole('option', { name: 'Primer Lapso' }).click();
            await resLapso1;
            await page.waitForTimeout(500);

            const resumen = page.getByRole('region', { name: 'Resumen' });
            await expect(resumen).toBeVisible();
            await expect(resumen.getByText('14.1')).toBeVisible(); // Promedio Matemática 1er Año A

            // Cambiar a Segundo Lapso
            const resLapso2 = page.waitForResponse(
                (r) => r.url().includes('/subjects') && r.url().includes('stats=true') && r.url().includes('periodId=') && r.status() === 200
            );
            await selector.click();
            await page.getByRole('option', { name: 'Segundo Lapso' }).click();
            await resLapso2;
            await page.waitForTimeout(500);

            // Debe mostrar «—» en lugar de 0
            await expect(resumen.getByText('—')).toBeVisible();

            // En la lista de estudiantes debe mostrar «Sin notas» y nunca «Sin calificar»
            await expect(page.getByText('Sin notas').first()).toBeVisible();
            await expect(page.getByText('Sin calificar')).toHaveCount(0);
        } catch (e) {
            await captureEvidence(testInfo, page, 'LAPSO-MATERIA', 'Fallo en selector de lapso en materia', e);
            throw e;
        }
    });
});
