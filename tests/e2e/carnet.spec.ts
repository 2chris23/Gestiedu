import { test, expect } from '@playwright/test';
import { WEB_BASE, loginApi, injectSessionCookies, captureEvidence, queryTenantDb } from './helpers';

/**
 * LOS CARNETS, EN LA PANTALLA
 *
 * Desde la sección, los de todos sus alumnos para imprimir. Las reglas del
 * servidor: CARNET-01/02.
 */
test('CARNET-UI-01: los carnets de una sección', async ({ page }, testInfo) => {
    try {
        const [s] = await queryTenantDb(
            `SELECT c.slug, ay.name AS ciclo, (SELECT count(*)::int FROM student_classrooms sc WHERE sc."classroomId" = c.id AND sc."isActive") AS n
               FROM classrooms c JOIN academic_years ay ON ay.id = c."academicYearId" AND ay.status = 'ACTIVE' ORDER BY c.grade, c.section LIMIT 1`
        );
        const admin = await loginApi('admin@testing.edu.ve', '123456');
        await injectSessionCookies(page, admin);
        await page.goto(`${WEB_BASE}/dashboard/academico/${s.ciclo}/${s.slug}`);
        await page.getByRole('link', { name: 'Carnets de la sección' }).click({ timeout: 60000 });
        const lista = page.getByRole('list', { name: 'Carnets' });
        await expect(lista.getByRole('listitem').first()).toContainText('Carnet estudiantil', { timeout: 60000 });
        expect(await lista.getByRole('listitem').count()).toBeGreaterThan(0);
        await page.screenshot({ path: 'test-results/evidencia/carnets.png' });
        await page.emulateMedia({ media: 'print' });
        await page.screenshot({ path: 'test-results/evidencia/carnets-impresos.png', fullPage: true });
    } catch (error) {
        await captureEvidence(testInfo, page, 'CARNET-UI-01', 'Carnets de la sección', error);
        throw error;
    }
});
