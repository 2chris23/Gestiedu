import { test, expect } from '@playwright/test';
import { WEB_BASE, loginApi, injectSessionCookies, captureEvidence, queryTenantDb } from './helpers';

/**
 * LA LABOR SOCIAL, EN LA PANTALLA
 *
 * El profesor guía de una sección de 5to marca a un alumno y le anota una
 * actividad; el alumno la ve en su Inicio, sin poder tocarla. Se quita al
 * final. Las reglas las prueban LABOR-01…07.
 */

test.describe('Labor social', () => {
    let fila: { studentId: string; firstName: string; lastName: string; email: string; guiaEmail: string };

    test.beforeAll(async () => {
        [fila] = await queryTenantDb(
            `SELECT u.id AS "studentId", u."firstName", u."lastName", u.email, g.email AS "guiaEmail"
               FROM student_classrooms sc
               JOIN users u ON u.id = sc."studentId" AND u."isActive"
               JOIN classrooms c ON c.id = sc."classroomId" AND c.grade = 5
               JOIN users g ON g.id = c."teacherId" AND g."isActive"
               JOIN academic_years ay ON ay.id = sc."academicYearId" AND ay.status = 'ACTIVE'
              WHERE sc."isActive"
              ORDER BY c.section, u."lastName" LIMIT 1`
        );
    });

    test.afterAll(async () => {
        if (fila) await queryTenantDb(`DELETE FROM actividades_de_labor_social WHERE "studentId" = $1`, [fila.studentId]);
    });

    test('LABOR-UI-01: el guía anota una actividad y el alumno la ve en su Inicio', async ({ page }, testInfo) => {
        try {
            expect(fila, 'hace falta una sección de 5to con guía y alumnos').toBeTruthy();
            const nombre = `${fila.lastName}, ${fila.firstName}`;
            const guia = await loginApi(fila.guiaEmail, '123456');
            await injectSessionCookies(page, guia);
            await page.goto(`${WEB_BASE}/dashboard/labor-social`);
            await page.getByRole('checkbox', { name: `Marcar a ${nombre}` }).click({ timeout: 60000 });
            await page.getByRole('button', { name: /Anotar actividad/ }).click();
            const ventana = page.getByRole('dialog');
            await ventana.getByLabel('Qué se hizo').fill('Jornada de reforestación');
            await ventana.getByLabel('Horas').fill('4');
            await ventana.getByLabel('Dónde').fill('Parque del sector');
            await ventana.getByRole('button', { name: 'Anotar' }).click();
            await expect
                .poll(async () => (await queryTenantDb(`SELECT horas, que FROM actividades_de_labor_social WHERE "studentId" = $1`, [fila.studentId]))[0], { timeout: 15000 })
                .toMatchObject({ horas: 4, que: 'Jornada de reforestación' });
            await page.screenshot({ path: 'test-results/evidencia/labor-social-guia.png', fullPage: true });

            const alumno = await loginApi(fila.email, '123456');
            await injectSessionCookies(page, alumno);
            await page.goto(`${WEB_BASE}/dashboard`);
            const tarjeta = page.getByRole('region', { name: 'Labor social' });
            await expect(tarjeta).toContainText(/4 de \d+ h/, { timeout: 60000 });
            await expect(tarjeta).toContainText('Jornada de reforestación');
            await expect(page.getByRole('button', { name: /Anotar actividad/ })).toHaveCount(0);
        } catch (error) {
            await captureEvidence(testInfo, page, 'LABOR-UI-01', 'Labor social del guía al alumno', error);
            throw error;
        }
    });
});
