import { test, expect } from '@playwright/test';
import axios from 'axios';
import { API_BASE, TENANT_SLUG, WEB_BASE, loginApi, injectSessionCookies, captureEvidence, queryTenantDb } from './helpers';

/**
 * LA BOLETA, EN EL NAVEGADOR
 *
 *   BOL-UI-01  el alumno abre «Mi boleta» desde su inicio y ve sus materias;
 *   BOL-UI-02  el representante la abre desde su representado;
 *   BOL-UI-03  un alumno no ve la boleta de otro (lo dice, no sale vacía).
 */

test.describe('La boleta', () => {
    test('BOL-UI-01: el alumno abre «Mi boleta» desde su inicio', async ({ page }, testInfo) => {
        try {
            const alumno = await loginApi('est0575@testing.edu.ve', '123456');
            await injectSessionCookies(page, alumno);
            await page.goto(`${WEB_BASE}/dashboard`);
            await page.getByRole('link', { name: /Mi boleta/ }).first().click();
            await expect(page).toHaveURL(/\/dashboard\/boleta\/mia/);
            const boleta = page.getByRole('article', { name: 'Boleta de calificaciones' });
            await expect(boleta).toBeVisible({ timeout: 30000 });
            // El nombre, el que tenga en la base: el sembrado grande le pone otro.
            const [yo] = await queryTenantDb<{ firstName: string; lastName: string }>(
                `SELECT "firstName", "lastName" FROM users WHERE email = 'est0575@testing.edu.ve'`
            );
            await expect(boleta.getByText(`${yo.lastName}, ${yo.firstName}`)).toBeVisible();
            // Sus materias, con una fila por materia.
            const [{ n }] = await queryTenantDb(
                `SELECT count(*)::int AS n FROM classroom_subjects cs
                   JOIN student_classrooms sc ON sc."classroomId" = cs."classroomId" AND sc."isActive"
                  WHERE sc."studentId" = (SELECT id FROM users WHERE email = 'est0575@testing.edu.ve')`
            );
            await expect(boleta.locator('tbody tr')).toHaveCount(n + 2); // + promedio e inasistencias
        } catch (error) {
            await captureEvidence(testInfo, page, 'BOL-UI-01', 'Mi boleta', error);
            throw error;
        }
    });

    test('BOL-UI-02: el representante la abre desde su representado', async ({ page }, testInfo) => {
        let quitar: undefined | (() => Promise<void>);
        try {
            // Su representado, asignado por la API como lo hace el admin (así el
            // servidor olvida lo guardado del representante): la prueba no
            // depende de cómo quedó el sembrado.
            const [alumno] = await queryTenantDb<{ id: string }>(`SELECT id FROM users WHERE email = 'est0575@testing.edu.ve'`);
            const [rep] = await queryTenantDb<{ id: string }>(`SELECT id FROM users WHERE email = 'tutor.prueba@testing.edu.ve'`);
            const { accessToken } = await loginApi('admin@testing.edu.ve', '123456');
            const admin = { headers: { Authorization: `Bearer ${accessToken}`, 'X-Institute-Slug': TENANT_SLUG } };
            const r = await axios.post(`${API_BASE}/users/${encodeURIComponent(alumno.id)}/tutors`, { tutorId: rep.id, relationship: 'Madre' }, { ...admin, validateStatus: () => true });
            if (r.status === 201) quitar = async () => { await axios.delete(`${API_BASE}/users/${encodeURIComponent(alumno.id)}/tutors/${encodeURIComponent(rep.id)}`, admin); };
            const tutor = await loginApi('tutor.prueba@testing.edu.ve', '123456');
            await injectSessionCookies(page, tutor);
            await page.goto(`${WEB_BASE}/dashboard`);
            await page.getByRole('link', { name: /Ver la boleta/ }).first().click();
            await expect(page.getByRole('article', { name: 'Boleta de calificaciones' })).toBeVisible({ timeout: 30000 });
        } catch (error) {
            await captureEvidence(testInfo, page, 'BOL-UI-02', 'Boleta del representado', error);
            throw error;
        } finally {
            await quitar?.();
        }
    });

    test('BOL-UI-03: un alumno no ve la boleta de otro', async ({ page }, testInfo) => {
        try {
            const alumno = await loginApi('est0575@testing.edu.ve', '123456');
            const [otro] = await queryTenantDb(
                `SELECT id FROM users WHERE role = 'STUDENT' AND email <> 'est0575@testing.edu.ve' LIMIT 1`
            );
            await injectSessionCookies(page, alumno);
            await page.goto(`${WEB_BASE}/dashboard/boleta/${otro.id}`);
            await expect(page.getByText('No tienes permiso para ver esta boleta.')).toBeVisible({ timeout: 30000 });
            await expect(page.getByRole('article', { name: 'Boleta de calificaciones' })).toHaveCount(0);
        } catch (error) {
            await captureEvidence(testInfo, page, 'BOL-UI-03', 'Boleta ajena', error);
            throw error;
        }
    });
});
