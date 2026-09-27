import { test, expect } from '@playwright/test';
import { WEB_BASE, loginApi, injectSessionCookies, captureEvidence, queryTenantDb } from './helpers';

/**
 * EL FIN DEL AÑO ESCOLAR, EN LA PANTALLA
 *
 * Se recorren los pasos del año en curso SIN crear ni cerrar nada: la base de
 * desarrollo la usan las demás pruebas. Lo que escribe cada paso lo prueban
 * CIERRE-01…10 contra su propia base.
 */

test.describe('Fin del año escolar', () => {
    let anio: { id: string; name: string };

    test.beforeAll(async () => {
        [anio] = await queryTenantDb(`SELECT id, name FROM academic_years WHERE status = 'ACTIVE' ORDER BY "startDate" DESC LIMIT 1`);
    });

    test('CIERRE-UI-01: el admin recorre los pasos; cada uno dice cómo va', async ({ page }, testInfo) => {
        try {
            const admin = await loginApi('admin@testing.edu.ve', '123456');
            await injectSessionCookies(page, admin);
            await page.goto(`${WEB_BASE}/dashboard/academico/${anio.name}/cierre`);
            await expect(page.getByRole('heading', { name: `Fin del año escolar ${anio.name}` })).toBeVisible({ timeout: 60000 });

            // 1. Lo que falta por cargar del último lapso.
            await page.getByRole('button', { name: /¿Está todo cargado\?/ }).click();
            await expect(page.getByText(/Todo cargado|sin notas del|sin (nota|apreciación)/).first()).toBeVisible({ timeout: 60000 });

            // 2. El resultado, con el Resumen Final de cada sección.
            await page.getByRole('button', { name: /Resultado final/ }).click();
            await expect(page.getByText('Promovidos', { exact: true })).toBeVisible({ timeout: 60000 });
            await expect(page.getByRole('link', { name: /Año/ }).first()).toBeVisible();

            // 4. La decisión por alumno, con las reglas del liceo.
            await page.getByRole('button', { name: /Decisión por alumno/ }).click();
            await expect(page.getByRole('combobox', { name: 'Último año con pendientes' })).toBeVisible({ timeout: 60000 });

            // 5. El año siguiente: con el calendario del MPPE (no se crea aquí).
            await page.getByRole('button', { name: /El año siguiente/ }).click();
            await expect(page.getByRole('button', { name: /^Crear \d{4}-\d{4}$/ }).or(page.getByText(/^Ya existe/))).toBeVisible({ timeout: 60000 });
            await page.screenshot({ path: 'test-results/evidencia/fin-de-ano.png', fullPage: true });
        } catch (error) {
            await captureEvidence(testInfo, page, 'CIERRE-UI-01', 'Recorrer los pasos del fin de año', error);
            throw error;
        }
    });

    test('CIERRE-UI-02: el profesor no entra al fin de año; ve la revisión de su materia', async ({ page }, testInfo) => {
        try {
            const [clase] = await queryTenantDb(
                `SELECT c.slug, s.slug AS materia, u.email
                   FROM classroom_subjects cs
                   JOIN users u ON u.id = cs."teacherId" AND u."isActive"
                   JOIN classrooms c ON c.id = cs."classroomId" AND c."academicYearId" = $1
                   JOIN subjects s ON s.id = cs."subjectId" AND s.evaluacion = 'NUMERICA'
                  ORDER BY c.grade, c.section LIMIT 1`,
                [anio.id]
            );
            const profe = await loginApi(clase.email, '123456');
            await injectSessionCookies(page, profe);
            await page.goto(`${WEB_BASE}/dashboard/academico/${anio.name}/cierre`);
            await expect(page).toHaveURL(/sinPermiso=1/, { timeout: 30000 });

            await page.goto(`${WEB_BASE}/dashboard/academico/${anio.name}/${clase.slug}/${clase.materia}`);
            await page.getByRole('button', { name: 'Revisión' }).click({ timeout: 60000 });
            await expect(page.getByRole('heading', { name: 'Revisión' })).toBeVisible({ timeout: 60000 });
            await expect(page.getByText(/reprobaron|Nadie reprobó/).first()).toBeVisible();
        } catch (error) {
            await captureEvidence(testInfo, page, 'CIERRE-UI-02', 'La revisión desde la materia', error);
            throw error;
        }
    });
});
