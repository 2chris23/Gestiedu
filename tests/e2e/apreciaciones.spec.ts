import { test, expect } from '@playwright/test';
import axios from 'axios';
import { API_BASE, WEB_BASE, TENANT_SLUG, loginApi, injectSessionCookies, captureEvidence, queryTenantDb } from './helpers';

/**
 * UNA MATERIA SIN NOTA, EN LA PANTALLA
 *
 * El admin crea «Orientación» con apreciación y se la da a un profesor; el
 * profesor, en su materia, pone «Consolidado» a un alumno desde la pestaña
 * Apreciaciones, y la boleta del alumno la enseña aparte, sin nota. Las
 * reglas del servidor las prueban CUALI-01…05.
 */

test.describe('Apreciaciones', () => {
    const nombre = `Orientación QA ${Date.now()}`;
    let materia: { id: string; slug: string };
    let clase: { classroomId: string; slug: string; anio: string; profeId: string; profeEmail: string };
    let alumno: { id: string; firstName: string; lastName: string };

    test.beforeAll(async () => {
        [clase] = await queryTenantDb(
            `SELECT c.id AS "classroomId", c.slug, ay.name AS anio, u.id AS "profeId", u.email AS "profeEmail"
               FROM classroom_subjects cs
               JOIN users u ON u.id = cs."teacherId" AND u."isActive"
               JOIN classrooms c ON c.id = cs."classroomId"
               JOIN academic_years ay ON ay.id = c."academicYearId" AND ay.status = 'ACTIVE'
              WHERE (SELECT count(*) FROM student_classrooms sc WHERE sc."classroomId" = c.id AND sc."isActive") >= 1
              ORDER BY c.grade, c.section
              LIMIT 1`
        );
        [alumno] = await queryTenantDb(
            `SELECT u.id, u."firstName", u."lastName"
               FROM student_classrooms sc JOIN users u ON u.id = sc."studentId"
              WHERE sc."classroomId" = $1 AND sc."isActive" AND u."isActive"
              ORDER BY u."lastName", u."firstName" LIMIT 1`,
            [clase.classroomId]
        );
        const admin = await loginApi('admin@testing.edu.ve', '123456');
        const como = { headers: { Authorization: `Bearer ${admin.accessToken}`, 'X-Institute-Slug': TENANT_SLUG } };
        await axios.post(`${API_BASE}/subjects`, { name: nombre, evaluacion: 'CUALITATIVA' }, como);
        [materia] = await queryTenantDb(`SELECT id, slug FROM subjects WHERE name = $1`, [nombre]);
        await axios.post(`${API_BASE}/classrooms/${clase.classroomId}/subjects`, { subjectId: materia.id, teacherId: clase.profeId }, como);
    });

    test.afterAll(async () => {
        if (!materia) return;
        await queryTenantDb(`DELETE FROM apreciaciones WHERE "subjectId" = $1`, [materia.id]);
        await queryTenantDb(`DELETE FROM classroom_subjects WHERE "subjectId" = $1`, [materia.id]);
        await queryTenantDb(`DELETE FROM subjects WHERE id = $1`, [materia.id]);
    });

    test('CUALI-UI-01: el profesor pone la apreciación y la boleta la enseña sin nota', async ({ page }, testInfo) => {
        try {
            const profe = await loginApi(clase.profeEmail, '123456');
            await injectSessionCookies(page, profe);
            await page.goto(`${WEB_BASE}/dashboard/academico/${clase.anio}/${clase.slug}/${materia.slug}`);
            await page.getByRole('button', { name: 'Apreciaciones' }).click({ timeout: 30000 });

            const quien = `${alumno.lastName}, ${alumno.firstName}`;
            await page.getByRole('combobox', { name: `Apreciación de ${quien}` }).click({ timeout: 30000 });
            await page.getByRole('option', { name: 'Consolidado' }).click();

            await expect
                .poll(async () => (await queryTenantDb(`SELECT valor FROM apreciaciones WHERE "subjectId" = $1 AND "studentId" = $2`, [materia.id, alumno.id]))[0]?.valor, { timeout: 15000 })
                .toBe('Consolidado');
            await page.screenshot({ path: 'test-results/evidencia/apreciaciones-profesor.png' });

            const admin = await loginApi('admin@testing.edu.ve', '123456');
            await injectSessionCookies(page, admin);
            await page.goto(`${WEB_BASE}/dashboard/boleta/${alumno.id}`);
            const tabla = page.getByRole('table', { name: 'Áreas que se evalúan con apreciación' });
            await expect(tabla).toBeVisible({ timeout: 30000 });
            await expect(tabla.getByRole('row', { name: new RegExp(nombre) })).toContainText('Consolidado');
            await page.screenshot({ path: 'test-results/evidencia/apreciaciones-boleta.png', fullPage: true });
        } catch (error) {
            await captureEvidence(testInfo, page, 'CUALI-UI-01', 'Apreciación del profesor en la boleta', error);
            throw error;
        }
    });
});
