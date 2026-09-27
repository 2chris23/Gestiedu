import { test, expect } from '@playwright/test';
import { WEB_BASE, loginApi, injectSessionCookies, captureEvidence, queryTenantDb } from './helpers';

/**
 * EL CONSEJO DE SECCIÓN, EN LA PANTALLA
 *
 * Desde la sección: el acta del primer lapso con los alumnos que propone el
 * sistema, guardarla e imprimirla. Las reglas del servidor: CONSEJO-01…04.
 */
test.describe('Consejo de sección', () => {
    let s: { id: string; slug: string; ciclo: string; lapso: string };
    let habia = false;
    test.beforeAll(async () => {
        [s] = await queryTenantDb(
            `SELECT c.id, c.slug, ay.name AS ciclo,
                    (SELECT p.id FROM periods p WHERE p."academicYearId" = ay.id ORDER BY p."startDate" LIMIT 1) AS lapso
               FROM classrooms c JOIN academic_years ay ON ay.id = c."academicYearId" AND ay.status = 'ACTIVE'
              ORDER BY c.grade, c.section LIMIT 1`
        );
        habia = (await queryTenantDb(`SELECT 1 FROM consejos_de_seccion WHERE "classroomId" = $1 AND "periodId" = $2`, [s.id, s.lapso])).length > 0;
    });
    test.afterAll(async () => {
        if (!habia) await queryTenantDb(`DELETE FROM consejos_de_seccion WHERE "classroomId" = $1 AND "periodId" = $2`, [s.id, s.lapso]).catch(() => undefined);
    });

    test('CONSEJO-UI-01: escribir el acta del lapso e imprimirla', async ({ page }, testInfo) => {
        test.skip(habia, 'esa sección ya tiene acta en el primer lapso');
        try {
            const admin = await loginApi('admin@testing.edu.ve', '123456');
            await injectSessionCookies(page, admin);
            await page.goto(`${WEB_BASE}/dashboard/academico/${s.ciclo}/${s.slug}`);
            await page.getByRole('link', { name: 'Consejo de sección' }).click({ timeout: 60000 });
            await expect(page.getByText('Este lapso todavía no tiene acta')).toBeVisible({ timeout: 60000 });
            await page.getByLabel('Acuerdos generales').fill('Reforzar la lectura en todas las materias.');
            await page.screenshot({ path: 'test-results/evidencia/consejo-de-seccion.png', fullPage: true });
            await page.getByRole('button', { name: 'Guardar el acta' }).click();
            await expect(page.getByText('Acta guardada')).toBeVisible({ timeout: 15000 });
            await page.getByRole('link', { name: 'Imprimir el acta' }).click();
            const acta = page.getByRole('article', { name: 'Acta del consejo de sección' });
            await expect(acta).toContainText('se reunió el consejo de sección', { timeout: 60000 });
            await expect(acta).toContainText('Reforzar la lectura en todas las materias.');
            await page.screenshot({ path: 'test-results/evidencia/acta-del-consejo.png', fullPage: true });
        } catch (error) {
            await captureEvidence(testInfo, page, 'CONSEJO-UI-01', 'Acta del consejo de sección', error);
            throw error;
        }
    });
});
