import { test, expect } from '@playwright/test';
import axios from 'axios';
import { API_BASE, WEB_BASE, TENANT_SLUG, loginApi, loginViaUI, captureEvidence, queryTenantDb } from './helpers';

/**
 * ASIGNAR REPRESENTANTE, EN EL NAVEGADOR
 *
 * El servidor ya tiene sus pruebas (`asignar-representantes.test.ts`). Esta
 * comprueba lo que el servidor no puede: que el admin **encuentra el botón**,
 * busca al representante, toca el parentesco y lo ve aparecer; y que al
 * quitarlo, con confirmación, desaparece.
 */

test.describe('Representantes de un alumno', () => {
    let admin: any;
    let alumno: { id: string };
    let tutor: { id: string; firstName: string; lastName: string };

    const api = (token: string) =>
        axios.create({
            baseURL: API_BASE,
            headers: { Authorization: `Bearer ${token}`, 'X-Institute-Slug': TENANT_SLUG },
            validateStatus: () => true,
        });

    test.beforeAll(async () => {
        admin = await loginApi('admin@testing.edu.ve', '123456');

        // Un alumno sin representantes y un representante activo: se buscan en
        // la base para no depender de nombres escritos a mano.
        [alumno] = await queryTenantDb(
            `SELECT u.id FROM users u
             WHERE u.role = 'STUDENT' AND u.status = 'ACTIVE'
               AND NOT EXISTS (SELECT 1 FROM student_tutors st WHERE st."studentId" = u.id)
             ORDER BY u.id LIMIT 1`
        );
        [tutor] = await queryTenantDb(
            `SELECT id, "firstName", "lastName" FROM users
             WHERE role = 'TUTOR' AND status = 'ACTIVE' ORDER BY id LIMIT 1`
        );
    });

    test.afterAll(async () => {
        if (alumno && tutor) await api(admin.accessToken).delete(`/users/${alumno.id}/tutors/${tutor.id}`);
    });

    test('REPR-UI-01: el admin asigna un representante desde el perfil y luego lo quita', async ({ page }, testInfo) => {
        try {
            expect(alumno?.id, 'hace falta un alumno sin representante en la base de pruebas').toBeTruthy();
            expect(tutor?.id, 'hace falta un representante en la base de pruebas').toBeTruthy();

            await loginViaUI(page, 'admin@testing.edu.ve', '123456');
            await page.goto(`${WEB_BASE}/dashboard/usuarios/${alumno.id}`);
            await expect(page.getByText('Sin representante asignado')).toBeVisible({ timeout: 30000 });

            await page.getByRole('button', { name: 'Asignar representante' }).click();
            await page.getByPlaceholder('Nombre o cédula del representante').fill(tutor.id);
            await page.getByRole('button', { name: new RegExp(tutor.lastName) }).first().click();
            await page.getByRole('button', { name: 'Madre', exact: true }).click();

            const fila = page.locator('li', { hasText: `${tutor.firstName} ${tutor.lastName}` });
            await expect(fila).toBeVisible({ timeout: 15000 });
            await expect(fila).toContainText('Madre');

            // Lo que importa de verdad: el representante ya ve al alumno.
            const vinculos = await queryTenantDb(
                `SELECT 1 FROM student_tutors WHERE "studentId" = $1 AND "tutorId" = $2`,
                [alumno.id, tutor.id]
            );
            expect(vinculos).toHaveLength(1);

            // Quitar pide confirmación.
            await fila.getByRole('button', { name: 'Quitar representante' }).click();
            await page.getByRole('button', { name: 'Quitar', exact: true }).click();
            await expect(page.getByText('Sin representante asignado')).toBeVisible({ timeout: 15000 });

            const quedan = await queryTenantDb(
                `SELECT 1 FROM student_tutors WHERE "studentId" = $1 AND "tutorId" = $2`,
                [alumno.id, tutor.id]
            );
            expect(quedan).toHaveLength(0);
        } catch (error) {
            await captureEvidence(testInfo, page, 'REPR-UI-01', 'Asignar y quitar representante', error);
            throw error;
        }
    });
});
