import { test, expect } from '@playwright/test';
import { WEB_BASE, loginApi, injectSessionCookies, captureEvidence, queryTenantDb } from './helpers';

/**
 * CREAR CON LO MÍNIMO; LO DEMÁS, EN LA FICHA
 *
 * Crear un alumno pide nombre, apellido, correo, cédula, contraseña, rol y
 * sexo; nada de nacimiento ni teléfono. Después, en su ficha: «Editar datos»,
 * los recaudos que entrega y la planilla de inscripción. Las reglas del
 * servidor: CREAR-01 y REC-01…04 (`inscripcion.test.ts`).
 */

const cedulaNueva = () => `V-8${String(Date.now()).slice(-7)}`;

test.describe('Crear con lo mínimo', () => {
    test('CREAR-UI-01: se crea con siete datos y se completa en la ficha', async ({ page }, testInfo) => {
        const cedula = cedulaNueva();
        const correo = `minimo.${cedula.toLowerCase()}@testing.edu.ve`;
        try {
            const admin = await loginApi('admin@testing.edu.ve', '123456');
            await injectSessionCookies(page, admin);
            await page.goto(`${WEB_BASE}/dashboard/usuarios`);
            await page.getByRole('button', { name: /Nuevo Usuario/i }).click({ timeout: 60000 });
            await expect(page.locator('#firstName')).toBeVisible({ timeout: 15000 });
            // Lo que ya no se pide al crear.
            await expect(page.locator('#birthDate')).toHaveCount(0);
            await expect(page.locator('#phone')).toHaveCount(0);
            await expect(page.locator('#lugarDeNacimiento')).toHaveCount(0);

            await page.locator('#firstName').fill('Minima');
            await page.locator('#lastName').fill('Prueba');
            await page.locator('#email').fill(correo);
            await page.locator('#id').fill(cedula);
            await page.locator('input[name="password"]').fill('UnaClaveDeOcho2026');
            // Sin sexo no se guarda.
            await page.getByRole('button', { name: /Guardar Usuario/i }).click();
            await expect(page.getByText('Elige el sexo')).toBeVisible();
            await page.locator('#gender').click();
            await page.getByRole('option', { name: 'Femenino' }).click();
            await page.screenshot({ path: 'test-results/evidencia/crear-con-lo-minimo.png' });
            await page.getByRole('button', { name: /Guardar Usuario/i }).click();
            await expect.poll(async () => (await queryTenantDb(`SELECT id FROM users WHERE id = $1`, [cedula])).length, { timeout: 20000 }).toBe(1);

            // En la ficha: le falta de todo, y se completa.
            await page.goto(`${WEB_BASE}/dashboard/usuarios/${encodeURIComponent(cedula)}`);
            // La inscripción es un anillo en la cabecera que abre su ventana.
            const abrirInscripcion = () => page.getByRole('button', { name: /^Inscripción/ }).click({ timeout: 60000 });
            await abrirInscripcion();
            const inscripcion = page.getByRole('dialog', { name: 'Inscripción' });
            await expect(inscripcion).toContainText('Le falta: fecha de nacimiento', { timeout: 60000 });
            // click, no check(): la casilla cambia al volver a pintarse, un instante después.
            await inscripcion.getByLabel('Fotos tipo carnet').click();
            await expect(inscripcion.getByLabel('Fotos tipo carnet')).toBeChecked();
            await expect.poll(async () => (await queryTenantDb(`SELECT 1 FROM recaudos_entregados WHERE "studentId" = $1`, [cedula])).length).toBe(1);
            await page.keyboard.press('Escape');

            await page.getByRole('button', { name: 'Editar datos' }).click();
            await page.getByLabel('Fecha de nacimiento').fill('2013-02-14');
            await page.getByLabel('Lugar de nacimiento').fill('Maracay');
            await page.getByRole('button', { name: 'Guardar datos' }).click();
            await expect(page.getByText('Datos guardados')).toBeVisible({ timeout: 15000 });
            const [guardado] = await queryTenantDb(`SELECT to_char("birthDate", 'YYYY-MM-DD') AS nac, "lugarDeNacimiento" AS lugar FROM users WHERE id = $1`, [cedula]);
            expect(guardado).toEqual({ nac: '2013-02-14', lugar: 'Maracay' });
            await page.screenshot({ path: 'test-results/evidencia/ficha-inscripcion.png', fullPage: true });

            await abrirInscripcion();
            await inscripcion.getByRole('link', { name: 'Planilla de inscripción' }).click();
            const hoja = page.getByRole('article', { name: 'Planilla de inscripción' });
            await expect(hoja).toContainText('Maracay', { timeout: 60000 });
            await expect(hoja).toContainText('Declaro'.toLowerCase());
            await page.screenshot({ path: 'test-results/evidencia/planilla-de-inscripcion.png', fullPage: true });
        } catch (error) {
            await captureEvidence(testInfo, page, 'CREAR-UI-01', 'Crear con lo mínimo y completar en la ficha', error);
            throw error;
        } finally {
            await queryTenantDb(`DELETE FROM recaudos_entregados WHERE "studentId" = $1`, [cedula]).catch(() => undefined);
            await queryTenantDb(`DELETE FROM users WHERE id = $1`, [cedula]).catch(() => undefined);
        }
    });
});
