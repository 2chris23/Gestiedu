import { test, expect } from '@playwright/test';
import axios from 'axios';
import { API_BASE, WEB_BASE, TENANT_SLUG, loginApi, injectSessionCookies, captureEvidence, queryTenantDb } from './helpers';

/**
 * LOS DOCUMENTOS OFICIALES, EN LA PANTALLA
 *
 * El admin cambia el texto de la constancia de estudio en Configuración →
 * Documentos y la constancia sale con él (y se deja como estaba); el Resumen
 * Final se ve en sus tres tipos con los datos que pide el MPPE; la
 * certificación sale con sus cinco años. Las reglas: DOC-01…08.
 */

test.describe('Documentos oficiales', () => {
    let alumno: { id: string; classroomId: string };

    test.beforeAll(async () => {
        [alumno] = await queryTenantDb(
            `SELECT sc."studentId" AS id, sc."classroomId"
               FROM student_classrooms sc
               JOIN users u ON u.id = sc."studentId" AND u."isActive"
               JOIN academic_years ay ON ay.id = sc."academicYearId" AND ay.status = 'ACTIVE'
              WHERE sc."isActive" ORDER BY u."lastName" LIMIT 1`
        );
    });

    test.afterAll(async () => {
        // La plantilla vuelve a la de siempre pase lo que pase.
        const admin = await loginApi('admin@testing.edu.ve', '123456');
        await axios
            .delete(`${API_BASE}/institutes/current/plantillas/ESTUDIO`, { headers: { Authorization: `Bearer ${admin.accessToken}`, 'X-Institute-Slug': TENANT_SLUG } })
            .catch(() => undefined);
    });

    test('DOC-UI-01: el liceo cambia el texto de la constancia y sale con él', async ({ page }, testInfo) => {
        try {
            const admin = await loginApi('admin@testing.edu.ve', '123456');
            await injectSessionCookies(page, admin);
            await page.goto(`${WEB_BASE}/dashboard/configuracion`);
            await page.getByRole('button', { name: 'Documentos' }).click({ timeout: 60000 });
            const titulo = page.getByLabel('Título');
            await expect(titulo).toHaveValue('Constancia de estudio', { timeout: 60000 });
            await titulo.fill('Constancia de estudios cursantes');
            await expect(page.getByRole('article', { name: 'Vista previa de la constancia' })).toContainText('María Pérez');
            await page.getByRole('button', { name: 'Guardar' }).click();
            await expect(page.getByText('Plantilla guardada')).toBeVisible({ timeout: 15000 });
            await page.screenshot({ path: 'test-results/evidencia/plantillas-de-documentos.png', fullPage: true });

            await page.goto(`${WEB_BASE}/dashboard/constancia/${alumno.id}`);
            await expect(page.getByRole('heading', { name: 'Constancia de estudios cursantes' })).toBeVisible({ timeout: 60000 });

            await page.goto(`${WEB_BASE}/dashboard/configuracion`);
            await page.getByRole('button', { name: 'Documentos' }).click();
            await page.getByRole('button', { name: 'Volver al texto de siempre' }).click({ timeout: 60000 });
            await expect(page.getByLabel('Título')).toHaveValue('Constancia de estudio', { timeout: 15000 });
        } catch (error) {
            await captureEvidence(testInfo, page, 'DOC-UI-01', 'Plantilla de la constancia', error);
            throw error;
        }
    });

    test('DOC-UI-02: el Resumen Final en sus tres tipos, con los datos del MPPE', async ({ page }, testInfo) => {
        try {
            const admin = await loginApi('admin@testing.edu.ve', '123456');
            await injectSessionCookies(page, admin);
            await page.goto(`${WEB_BASE}/dashboard/resumen-final/${alumno.classroomId}`);
            const hoja = page.getByRole('article', { name: 'Resumen final del rendimiento' });
            await expect(hoja).toContainText('Tipo de evaluación: FINAL', { timeout: 90000 });
            await expect(hoja.getByRole('columnheader', { name: 'Lugar de nac.' })).toBeVisible();
            await expect(hoja.getByRole('table', { name: 'Docentes' })).toBeVisible();
            await page.screenshot({ path: 'test-results/evidencia/resumen-final-mppe.png', fullPage: true });

            await page.getByRole('combobox', { name: 'Tipo de resumen' }).click();
            await page.getByRole('option', { name: 'Revisión' }).click();
            await expect(hoja).toContainText('Tipo de evaluación: REVISIÓN', { timeout: 90000 });
            await page.getByRole('combobox', { name: 'Tipo de resumen' }).click();
            await page.getByRole('option', { name: 'Materia pendiente' }).click();
            await expect(hoja).toContainText('Tipo de evaluación: MATERIA PENDIENTE', { timeout: 90000 });
        } catch (error) {
            await captureEvidence(testInfo, page, 'DOC-UI-02', 'Resumen final del MPPE', error);
            throw error;
        }
    });

    test('DOC-UI-03: la certificación de calificaciones, año por año', async ({ page }, testInfo) => {
        try {
            const admin = await loginApi('admin@testing.edu.ve', '123456');
            await injectSessionCookies(page, admin);
            await page.goto(`${WEB_BASE}/dashboard/certificacion/${alumno.id}`);
            const hoja = page.getByRole('article', { name: 'Certificación de calificaciones' });
            await expect(hoja).toBeVisible({ timeout: 60000 });
            for (const ano of ['Primer año', 'Segundo año', 'Tercer año', 'Cuarto año', 'Quinto año']) {
                await expect(hoja.getByRole('region', { name: ano })).toBeVisible();
            }
            await expect(page.getByRole('button', { name: 'Cargar un año' })).toBeVisible();
        } catch (error) {
            await captureEvidence(testInfo, page, 'DOC-UI-03', 'Certificación de calificaciones', error);
            throw error;
        }
    });
});
