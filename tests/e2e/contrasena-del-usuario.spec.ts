import { test, expect } from '@playwright/test';
import axios from 'axios';
import { API_BASE, WEB_BASE, TENANT_SLUG, loginApi, loginViaUI, captureEvidence, queryTenantDb } from './helpers';

/**
 * EL ADMIN LE PONE UNA CONTRASEÑA NUEVA A QUIEN LA PERDIÓ
 *
 *   CONTRA-UI-01  en la ficha, «Cambiar contraseña» → «Generar una» →
 *                 «Guardar»: sale para copiarla, y con ella se entra. Al
 *                 editar el usuario ya no hay un campo de contraseña que no
 *                 hacía nada.
 *
 * Con un alumno creado para la prueba: las cuentas de prueba no se tocan.
 */

test.describe('La contraseña de un usuario', () => {
    const cedula = `V-4${String(Math.floor(1000000 + Math.random() * 8999999))}`;
    const correo = `contrasena_${Date.now()}@testing.edu.ve`;

    test.beforeAll(async () => {
        const admin = await loginApi('admin@testing.edu.ve', '123456');
        await axios.post(
            `${API_BASE}/users`,
            { id: cedula, email: correo, firstName: 'Olvido', lastName: 'Contraseña QA', role: 'STUDENT', password: 'password123', gender: 'FEMENINO' },
            { headers: { Authorization: `Bearer ${admin.accessToken}`, 'X-Institute-Slug': TENANT_SLUG } }
        );
    });

    test.afterAll(async () => {
        await queryTenantDb(`DELETE FROM users WHERE id = $1`, [cedula]);
    });

    test('CONTRA-UI-01: el admin genera una contraseña nueva, la copia y con ella se entra', async ({ page }, testInfo) => {
        try {
            await loginViaUI(page, 'admin@testing.edu.ve', '123456');
            await page.goto(`${WEB_BASE}/dashboard/usuarios/${encodeURIComponent(cedula)}`);
            const bloque = page.locator('[data-contrasena-del-usuario]');
            await bloque.getByRole('button', { name: 'Cambiar contraseña' }).click({ timeout: 30000 });
            await bloque.getByRole('button', { name: 'Generar una' }).click();
            const nueva = await bloque.getByLabel(/Contraseña nueva/).inputValue();
            expect(nueva).toMatch(/^[A-Z][a-z]{3}-[A-Z][a-z]{3}-\d{4}$/);
            await bloque.getByRole('button', { name: 'Guardar' }).click();

            // Sale para copiarla y dársela.
            await expect(bloque.getByRole('status')).toContainText(nueva);
            await expect(bloque.getByRole('button', { name: 'Copiar' })).toBeVisible();

            // Con la nueva se entra; con la vieja, no.
            const r = await axios.post(`${API_BASE}/auth/login`, { email: correo, password: nueva }, { headers: { 'X-Institute-Slug': TENANT_SLUG } });
            expect(r.status).toBe(200);
            const vieja = await axios
                .post(`${API_BASE}/auth/login`, { email: correo, password: 'password123' }, { headers: { 'X-Institute-Slug': TENANT_SLUG }, validateStatus: () => true });
            expect(vieja.status).toBe(401);

            // Y en la ficha del propio admin no sale (la suya va en «Mi cuenta»).
            const yo = await loginApi('admin@testing.edu.ve', '123456');
            await page.goto(`${WEB_BASE}/dashboard/usuarios/${encodeURIComponent(yo.user.id)}`);
            await expect(page.getByRole('heading').first()).toBeVisible({ timeout: 30000 });
            await expect(page.locator('[data-contrasena-del-usuario]')).toHaveCount(0);
        } catch (error) {
            await captureEvidence(testInfo, page, 'CONTRA-UI-01', 'Cambiar la contraseña de un usuario', error);
            throw error;
        }
    });
});
