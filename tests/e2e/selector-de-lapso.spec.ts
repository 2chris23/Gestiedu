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
            const delLapso1 = await (await resLapso1).json();
            await page.waitForTimeout(500);

            // Resumen de cifras superiores (Primer Lapso). Los en riesgo, los que
            // dice el servidor (la cifra oficial, MAPA §0): antes eran 257 contados
            // con la media a pelo de la tabla de notas.
            const enRiesgo = (Array.isArray(delLapso1) ? delLapso1 : []).reduce((a: number, g: any) => a + (g.stats?.riskCount ?? 0), 0);
            expect(enRiesgo).toBeGreaterThan(0);
            const resumen = page.getByRole('region', { name: 'Resumen' });
            await expect(resumen).toBeVisible();
            await expect(resumen.getByText('En riesgo')).toBeVisible();
            await expect(resumen.getByText(String(enRiesgo), { exact: true })).toBeVisible();
            await expect(resumen.getByText('93%')).toBeVisible(); // 93% asistencia
            // Las observaciones, las que dice el servidor (otras pruebas añaden: un número fijo no sirve).
            const observaciones = (Array.isArray(delLapso1) ? delLapso1 : []).reduce((a: number, g: any) => a + (g.stats?.observations ?? 0), 0);
            await expect(resumen.getByText(String(observaciones), { exact: true })).toBeVisible();

            // Cambiar a Segundo Lapso (sin notas ni asistencia aún)
            const resLapso2 = page.waitForResponse(
                (r) => r.url().includes(`/api/academic-years/${cycleId}/stats`) && r.url().includes('periodId=') && r.status() === 200
            );
            await selector.click();
            await page.getByRole('option', { name: 'Segundo Lapso' }).click();
            await resLapso2;
            await page.waitForTimeout(500);

            // El Segundo Lapso aún no empieza: «Sin registrar» en promedio,
            // riesgo, asistencia y observaciones, nunca un 0 ni un 0 %. La
            // ocupación sí se ve.
            await expect(resumen.getByText('Sin registrar')).toHaveCount(4);
            await expect(resumen.getByText('0%')).toHaveCount(0);
            await expect(resumen.getByText('0', { exact: true })).toHaveCount(0);
            const ocupados = (Array.isArray(delLapso1) ? delLapso1 : []).reduce((a: number, g: any) => a + Number(String(g.stats?.occupancy ?? '0/0').split('/')[0]), 0);
            const puestos = (Array.isArray(delLapso1) ? delLapso1 : []).reduce((a: number, g: any) => a + Number(String(g.stats?.occupancy ?? '0/0').split('/')[1]), 0);
            await expect(resumen.getByText(`${ocupados}/${puestos}`)).toBeVisible();
        } catch (e) {
            await captureEvidence(testInfo, page, 'LAPSO-ANO', 'Fallo en selector de lapso en año', e);
            throw e;
        }
    });

    test('2. Pantalla de la sección (/dashboard/academico/<ciclo>/<sección>): cifras cambian y lapso sin empezar muestra «Sin registrar» y «Sin notas»', async ({ page }, testInfo) => {
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
            const seccion = await (await resLapso1).json();
            await page.waitForTimeout(500);

            // Lo que dice el servidor (la cifra oficial, MAPA §0), no números fijos:
            // otras pruebas añaden datos y la cuenta oficial cambió el 19-oct-2026.
            const resumen = page.getByRole('region', { name: 'Resumen' });
            await expect(resumen).toBeVisible();
            await expect(resumen.getByText(String(seccion.average), { exact: true }).first()).toBeVisible();
            await expect(resumen.getByText(String(seccion.riskCount), { exact: true }).first()).toBeVisible();
            await expect(resumen.getByText(seccion.attendance)).toBeVisible();
            await expect(resumen.getByText(String(seccion.observations), { exact: true }).first()).toBeVisible();

            // Cambiar a Segundo Lapso
            const resLapso2 = page.waitForResponse(
                (r) => r.url().includes('/stats') && r.url().includes('periodId=') && r.status() === 200
            );
            await selector.click();
            await page.getByRole('option', { name: 'Segundo Lapso' }).click();
            await resLapso2;
            await page.waitForTimeout(500);

            // Aún no empieza: «Sin registrar», nunca 0 ni 0%
            await expect(resumen.getByText('Sin registrar')).toHaveCount(4);
            await expect(resumen.getByText('0%')).toHaveCount(0);

            // En la lista de estudiantes debe mostrar «Sin notas» y nunca «Sin calificar» ni «0»
            await expect(page.getByText('Sin notas').first()).toBeVisible();
            await expect(page.getByText('Sin calificar')).toHaveCount(0);
        } catch (e) {
            await captureEvidence(testInfo, page, 'LAPSO-SECCION', 'Fallo en selector de lapso en sección', e);
            throw e;
        }
    });

    test('3. Pantalla de la materia (/dashboard/academico/<ciclo>/<sección>/<materia>): cifras cambian y lapso sin empezar muestra «Sin registrar» y «Sin notas»', async ({ page }, testInfo) => {
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
            const materia = await (await resLapso1).json();
            await page.waitForTimeout(500);

            const resumen = page.getByRole('region', { name: 'Resumen' });
            await expect(resumen).toBeVisible();
            const deLaSeccion = (materia.subjects ?? materia.data?.subjects ?? []) as any[];
            const esta = deLaSeccion.find((m) => m.slug === subjectSlug || m.subject?.slug === subjectSlug) ?? {};
            const prom = esta.stats?.average ?? esta.average;
            expect(prom, 'la materia trae su promedio').not.toBeUndefined();
            await expect(resumen.getByText(String(prom), { exact: true }).first()).toBeVisible();

            // Cambiar a Segundo Lapso
            const resLapso2 = page.waitForResponse(
                (r) => r.url().includes('/subjects') && r.url().includes('stats=true') && r.url().includes('periodId=') && r.status() === 200
            );
            await selector.click();
            await page.getByRole('option', { name: 'Segundo Lapso' }).click();
            await resLapso2;
            await page.waitForTimeout(500);

            // Aún no empieza: «Sin registrar» en lugar de 0
            await expect(resumen.getByText('Sin registrar').first()).toBeVisible();

            // En la lista de estudiantes debe mostrar «Sin notas» y nunca «Sin calificar»
            await expect(page.getByText('Sin notas').first()).toBeVisible();
            await expect(page.getByText('Sin calificar')).toHaveCount(0);
        } catch (e) {
            await captureEvidence(testInfo, page, 'LAPSO-MATERIA', 'Fallo en selector de lapso en materia', e);
            throw e;
        }
    });
});
