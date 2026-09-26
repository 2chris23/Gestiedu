import { test, expect } from '@playwright/test';
import axios from 'axios';
import { API_BASE, WEB_BASE, TENANT_SLUG, loginApi, loginViaUI, captureEvidence, queryTenantDb } from './helpers';

/**
 * CAMBIAR LA CÉDULA DESDE LA FICHA
 *
 * El alumno se inscribió con cédula escolar y ya sacó la de identidad. El admin
 * abre su ficha, pulsa «Cambiar cédula», la escribe dos veces y la ficha pasa a
 * la nueva; la escolar queda guardada. La cuenta del servidor la prueban
 * CED-04…06; aquí, que la pantalla la usa de verdad.
 */

test.describe('Cambiar la cédula', () => {
    const escolar = `V1${String(Date.now()).slice(-2)}${String(Math.floor(10000000 + Math.random() * 89999999))}`;
    const identidad = `V-3${String(Math.floor(1000000 + Math.random() * 8999999))}`;

    test.beforeAll(async () => {
        const admin = await loginApi('admin@testing.edu.ve', '123456');
        await axios.post(
            `${API_BASE}/users`,
            {
                id: escolar,
                email: `cedula_${Date.now()}@testing.edu.ve`,
                firstName: 'Cédula',
                lastName: 'Escolar QA',
                role: 'STUDENT',
                password: 'password123',
                gender: 'FEMENINO',
            },
            { headers: { Authorization: `Bearer ${admin.accessToken}`, 'X-Institute-Slug': TENANT_SLUG } }
        );
    });

    test.afterAll(async () => {
        await queryTenantDb(`DELETE FROM users WHERE id = ANY($1)`, [[escolar, identidad]]);
    });

    test('CED-UI-01: el admin cambia la escolar por la de identidad y la ficha pasa a la nueva', async ({ page }, testInfo) => {
        try {
            const [antes] = await queryTenantDb(`SELECT "tipoDeCedula" FROM users WHERE id = $1`, [escolar]);
            expect(antes?.tipoDeCedula).toBe('ESCOLAR');

            await loginViaUI(page, 'admin@testing.edu.ve', '123456');
            await page.goto(`${WEB_BASE}/dashboard/usuarios/${escolar}`);
            await page.getByRole('button', { name: 'Cambiar cédula' }).click({ timeout: 30000 });

            const ventana = page.getByRole('dialog');
            await ventana.getByLabel('Cédula nueva').fill(identidad);
            await ventana.getByLabel('Escríbela otra vez').fill(identidad.replace('3', '4'));
            await expect(ventana.getByText('No coinciden.')).toBeVisible();
            await expect(ventana.getByRole('button', { name: 'Cambiar cédula' })).toBeDisabled();

            await ventana.getByLabel('Escríbela otra vez').fill(identidad);
            await ventana.getByRole('button', { name: 'Cambiar cédula' }).click();

            await expect(page).toHaveURL(new RegExp(`/dashboard/usuarios/${identidad}$`), { timeout: 30000 });
            await expect(page.getByText(`Cédula escolar: ${escolar}`)).toBeVisible({ timeout: 30000 });

            const [despues] = await queryTenantDb(`SELECT id, "tipoDeCedula", "cedulaEscolar" FROM users WHERE id = $1`, [identidad]);
            expect(despues).toMatchObject({ id: identidad, tipoDeCedula: 'IDENTIDAD', cedulaEscolar: escolar });
            expect(await queryTenantDb(`SELECT 1 FROM users WHERE id = $1`, [escolar])).toHaveLength(0);
            await page.screenshot({ path: 'test-results/evidencia/cambiar-cedula.png' });
        } catch (error) {
            await captureEvidence(testInfo, page, 'CED-UI-01', 'Cambiar la cédula desde la ficha', error);
            throw error;
        }
    });
});
