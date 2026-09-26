import { test, expect } from '@playwright/test';
import { WEB_BASE, loginViaUI, captureEvidence, queryTenantDb } from './helpers';

/**
 * CUÁNDO EMPIEZA EL PLAN EN CADA LAPSO (EDITOR DEL CICLO)
 *
 * Libre, por lapso: «El plan de evaluación empieza el…» y cómo se llaman las
 * semanas de antes. El servidor lo prueba en `inicio-del-plan.test.ts`; aquí,
 * que el admin lo puede poner desde la pantalla y que queda guardado. Al
 * acabar se deja como estaba.
 */
test.describe('Inicio del plan en el editor del ciclo', () => {
    test('PLANINI-UI-01: el admin pone que el plan del 1er lapso empieza dos semanas después, con su nombre', async ({ page }, testInfo) => {
        const [ciclo] = await queryTenantDb(
            `SELECT ay.id, p.id AS lapso, to_char(p."startDate", 'YYYY-MM-DD') AS inicio,
                    to_char(p."startDate" + interval '14 day', 'YYYY-MM-DD') AS plan
               FROM academic_years ay JOIN periods p ON p."academicYearId" = ay.id
              WHERE ay.status = 'ACTIVE' ORDER BY p."startDate" LIMIT 1`
        );
        test.skip(!ciclo, 'hace falta un ciclo activo con lapsos');
        try {
            await loginViaUI(page, 'admin@testing.edu.ve', '123456');
            await page.goto(`${WEB_BASE}/dashboard/academico/${ciclo.id}`);
            await page.getByRole('button', { name: 'Más opciones del ciclo' }).click();
            await page.getByRole('menuitem', { name: /Editar el ciclo/ }).click();

            const plan = page.locator('#period-plan-0');
            await expect(plan).toBeVisible({ timeout: 15000 });
            await plan.fill(ciclo.plan);
            await expect(page.getByText(/Antes: 2 semanas con contenido del profesor/)).toBeVisible();
            await page.locator('#period-antes-0').fill('Adaptación');
            await page.screenshot({ path: 'test-results/evidencia/inicio-del-plan.png' });
            await page.getByRole('button', { name: 'Guardar Cambios' }).click();
            await expect(page.getByText(/actualizados exitosamente/)).toBeVisible({ timeout: 15000 });

            const [guardado] = await queryTenantDb(
                `SELECT to_char("inicioDelPlan", 'YYYY-MM-DD') AS plan, "nombreAntesDelPlan" AS nombre FROM periods WHERE id = $1`,
                [ciclo.lapso]
            );
            expect(guardado).toEqual({ plan: ciclo.plan, nombre: 'Adaptación' });
        } catch (error) {
            await captureEvidence(testInfo, page, 'PLANINI-UI-01', 'Inicio del plan en el editor del ciclo', error);
            throw error;
        } finally {
            await queryTenantDb(`UPDATE periods SET "inicioDelPlan" = NULL, "nombreAntesDelPlan" = NULL WHERE id = $1`, [ciclo.lapso]);
        }
    });
});
