import { test, expect } from '@playwright/test';
import { WEB_BASE, loginApi, injectSessionCookies, captureEvidence, queryTenantDb } from './helpers';

/**
 * EL PANEL DE OBSERVACIONES Y LA CITACIÓN AL REPRESENTANTE
 *
 * El admin escribe una observación sin estar en una clase, cita desde ella al
 * representante, al representante le llega a la campana y abre la hoja, y el
 * admin marca que vino. Las reglas del servidor: OBS-PANEL-*, CITA-*.
 */

test.describe('Citaciones', () => {
    let par: { id: string; firstName: string; lastName: string; email: string };
    const titulo = `Prueba de citación ${Date.now()}`;

    let pusoElVinculo = false;

    test.beforeAll(async () => {
        // El alumno y el representante de las pruebas (`cuentas-de-las-pruebas.seed.ts`);
        // si alguien quitó el vínculo, se pone aquí y se quita al acabar.
        [par] = await queryTenantDb(
            `SELECT s.id, s."firstName", s."lastName", t.email, t.id AS "tutorId",
                    EXISTS (SELECT 1 FROM student_tutors st WHERE st."studentId" = s.id AND st."tutorId" = t.id) AS vinculado
               FROM users s, users t
              WHERE s.email = 'est0575@testing.edu.ve' AND t.email = 'tutor.prueba@testing.edu.ve'`
        );
        if (par && !(par as any).vinculado) {
            await queryTenantDb(
                `INSERT INTO student_tutors (id, "studentId", "tutorId", relationship, "createdAt", "updatedAt") VALUES ($1, $2, $3, 'Madre', now(), now())`,
                [`c${Date.now()}vinculo`, par.id, (par as any).tutorId]
            );
            pusoElVinculo = true;
        }
    });

    test.afterAll(async () => {
        await queryTenantDb(`DELETE FROM notifications WHERE type = 'CITACION' AND title LIKE 'Citación:%' AND "createdAt" > now() - interval '1 hour'`).catch(() => undefined);
        await queryTenantDb(`DELETE FROM observations WHERE title = $1`, [titulo]).catch(() => undefined);
        if (pusoElVinculo) await queryTenantDb(`DELETE FROM student_tutors WHERE "studentId" = $1 AND "tutorId" = $2`, [par.id, (par as any).tutorId]).catch(() => undefined);
    });

    test('CITA-UI-01: observar, citar, que le llegue al representante y marcar que vino', async ({ page, browser }, testInfo) => {
        test.skip(!par, 'hace falta un alumno inscrito con representante');
        try {
            const admin = await loginApi('admin@testing.edu.ve', '123456');
            await injectSessionCookies(page, admin);
            await page.goto(`${WEB_BASE}/dashboard/observaciones`);
            await page.getByRole('button', { name: 'Nueva observación' }).click({ timeout: 60000 });
            await page.getByLabel('Alumno', { exact: true }).fill(par.firstName);
            await page.getByRole('list', { name: 'Alumnos encontrados' }).getByRole('button', { name: new RegExp(`${par.firstName} ${par.lastName}`) }).first().click({ timeout: 15000 });
            await page.getByLabel('Qué pasó').fill(titulo);
            await page.getByRole('button', { name: 'Guardar observación' }).click();
            await expect(page.getByText('Observación guardada')).toBeVisible({ timeout: 15000 });

            const tarjeta = page.getByRole('listitem').filter({ hasText: titulo }).first();
            await tarjeta.getByRole('button', { name: 'Citar al representante' }).click({ timeout: 30000 });
            const manana = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
            await page.getByLabel('Día').fill(manana);
            await page.getByLabel('Hora').fill('09:30');
            await page.screenshot({ path: 'test-results/evidencia/citar-al-representante.png' });
            await page.getByRole('button', { name: 'Citar', exact: true }).click();
            await expect(page.getByText(/Citación hecha/)).toBeVisible({ timeout: 15000 });
            await expect(tarjeta).toContainText('Pendiente');
            await page.screenshot({ path: 'test-results/evidencia/panel-de-observaciones.png', fullPage: true });

            // Al representante le llega a la campana, y abre la hoja.
            const otra = await browser.newContext();
            const suya = await otra.newPage();
            const tutor = await loginApi(par.email, '123456');
            await injectSessionCookies(suya, tutor);
            await suya.goto(`${WEB_BASE}/dashboard`);
            await suya.getByRole('button', { name: /^Avisos: \d+ sin leer/ }).first().click({ timeout: 60000 });
            await suya.getByRole('button', { name: new RegExp(`Citación: ${par.firstName}`) }).first().click();
            const hoja = suya.getByRole('article', { name: 'Citación al representante' });
            await expect(hoja).toContainText(`representante del (la) estudiante ${par.firstName} ${par.lastName}`, { timeout: 60000 });
            await expect(hoja).toContainText('9:30 a. m.');
            await expect(suya.getByRole('button', { name: '¿Vino?' })).toHaveCount(0);
            await suya.screenshot({ path: 'test-results/evidencia/citacion-del-representante.png', fullPage: true });
            await otra.close();

            // El admin marca que vino.
            await tarjeta.getByRole('button', { name: '¿Vino?' }).click();
            await page.getByRole('radio', { name: 'Sí, vino' }).click();
            await page.getByLabel('Lo que se habló').fill('Se acordó revisar la agenda cada viernes.');
            await page.getByRole('button', { name: 'Guardar', exact: true }).click();
            await expect(tarjeta).toContainText('Vino', { timeout: 15000 });
            await expect(tarjeta).toContainText('Se acordó revisar la agenda cada viernes.');
        } catch (error) {
            await captureEvidence(testInfo, page, 'CITA-UI-01', 'Citar al representante desde una observación', error);
            throw error;
        }
    });
});
