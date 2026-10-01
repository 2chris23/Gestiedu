import { test, expect } from '@playwright/test';
import { WEB_BASE, loginApi, injectSessionCookies, captureEvidence, queryTenantDb } from './helpers';

/**
 * LA MATERIA PENDIENTE, EN LA PANTALLA
 *
 * Una pendiente de prueba (nace al cerrar un año; aquí se pone a mano y se
 * quita al final): el admin le asigna el profesor, el profesor pone el
 * primer momento y la aprueba, y la boleta y el acta la enseñan. Las reglas
 * las prueban PEND-01…08.
 */

test.describe('Materias pendientes', () => {
    const id = `cpendqa${Date.now()}`;
    let alumno: { id: string; firstName: string; lastName: string };
    let profe: { id: string; email: string };

    test.beforeAll(async () => {
        const [fila] = await queryTenantDb(
            `SELECT u.id, u."firstName", u."lastName", sc."academicYearId", cs."subjectId", t.id AS "profeId", t.email AS "profeEmail"
               FROM student_classrooms sc
               JOIN users u ON u.id = sc."studentId" AND u."isActive"
               JOIN academic_years ay ON ay.id = sc."academicYearId" AND ay.status = 'ACTIVE'
               JOIN classroom_subjects cs ON cs."classroomId" = sc."classroomId"
               JOIN subjects s ON s.id = cs."subjectId" AND s.evaluacion = 'NUMERICA'
               JOIN users t ON t.id = cs."teacherId" AND t."isActive"
              WHERE sc."isActive"
              ORDER BY u."lastName", u."firstName" LIMIT 1`
        );
        alumno = { id: fila.id, firstName: fila.firstName, lastName: fila.lastName };
        profe = { id: fila.profeId, email: fila.profeEmail };
        await queryTenantDb(
            `INSERT INTO materias_pendientes (id, "studentId", "subjectId", "gradoDeOrigen", "cicloDeOrigenId", "notaDeOrigen", "cicloId", estado, "updatedAt")
             VALUES ($1, $2, $3, 1, $4, 7, $4, 'PENDIENTE', now())`,
            [id, fila.id, fila.subjectId, fila.academicYearId]
        );
    });

    test.afterAll(async () => {
        await queryTenantDb(`DELETE FROM evaluaciones_de_pendientes WHERE "materiaPendienteId" = $1`, [id]);
        await queryTenantDb(`DELETE FROM materias_pendientes WHERE id = $1`, [id]);
    });

    test('PEND-UI-01: el admin asigna el profesor, el profesor la aprueba y la boleta lo dice', async ({ page }, testInfo) => {
        try {
            const quien = `${alumno.lastName}, ${alumno.firstName}`;
            const admin = await loginApi('admin@testing.edu.ve', '123456');
            await injectSessionCookies(page, admin);
            await page.goto(`${WEB_BASE}/dashboard/materias-pendientes`);
            await page.getByLabel('Buscar').fill(alumno.lastName);
            await page.getByRole('combobox', { name: `Profesor que evalúa a ${quien}` }).click({ timeout: 60000 });
            const [p] = await queryTenantDb(`SELECT "firstName", "lastName" FROM users WHERE id = $1`, [profe.id]);
            await page.getByRole('option', { name: `${p.firstName} ${p.lastName}`, exact: true }).click();
            await expect.poll(async () => (await queryTenantDb(`SELECT "profesorId" FROM materias_pendientes WHERE id = $1`, [id]))[0]?.profesorId, { timeout: 15000 }).toBe(profe.id);

            const suyo = await loginApi(profe.email, '123456');
            await injectSessionCookies(page, suyo);
            await page.goto(`${WEB_BASE}/dashboard/materias-pendientes`);
            const momento = page.getByLabel(`Momento 1 de ${quien}`);
            await momento.fill('12', { timeout: 60000 });
            await momento.press('Enter');
            await expect.poll(async () => (await queryTenantDb(`SELECT estado, "notaFinal" FROM materias_pendientes WHERE id = $1`, [id]))[0], { timeout: 15000 }).toMatchObject({ estado: 'APROBADA', notaFinal: 12 });
            await page.screenshot({ path: 'test-results/evidencia/materias-pendientes.png', fullPage: true });

            await injectSessionCookies(page, admin);
            await page.goto(`${WEB_BASE}/dashboard/boleta/${alumno.id}`);
            await expect(page.getByRole('table', { name: 'Materias pendientes' })).toContainText('Aprobada (12)', { timeout: 60000 });
            await page.goto(`${WEB_BASE}/dashboard/acta-de-compromiso/${alumno.id}`);
            await expect(page.getByRole('heading', { name: 'Acta de compromiso' })).toBeVisible({ timeout: 60000 });
            await expect(page.getByRole('article')).toContainText(`${p.firstName} ${p.lastName}`);
        } catch (error) {
            await captureEvidence(testInfo, page, 'PEND-UI-01', 'Materia pendiente de punta a punta', error);
            throw error;
        }
    });
});
