import { test, expect } from '@playwright/test';
import { WEB_BASE, captureEvidence, loginViaUI } from './helpers';

/**
 * «DESCARGAR TODOS LOS DATOS» EN LA PANTALLA (19-oct-2026)
 *
 * El director pone una contraseña dos veces, el archivo se prepara de fondo
 * (con su barra) y se baja un ZIP. Que se abre y trae los datos lo mide
 * MISDATOS-01 (servidor); aquí, que el camino del botón funciona.
 *
 *   MISDATOS-UI-01 preparar y bajar el archivo desde Configuración
 */
test.use({ viewport: { width: 1280, height: 800 } });

test('MISDATOS-UI-01: el admin prepara y baja todos los datos del liceo', async ({ page }, testInfo) => {
    test.setTimeout(10 * 60_000);
    try {
        await loginViaUI(page, 'admin@testing.edu.ve');
        await page.goto(`${WEB_BASE}/dashboard/configuracion?seccion=mis-datos`);
        await expect(page.getByText('Todos los datos del liceo, en tus manos')).toBeVisible({ timeout: 30000 });
        const preparar = page.getByRole('button', { name: 'Preparar el archivo con contraseña' });
        await page.getByLabel('Contraseña del archivo (8 o más caracteres)').fill('clave-del-director-1');
        await page.getByLabel('Repítela').fill('otra-distinta-123');
        await expect(page.getByText('No coinciden.')).toBeVisible();
        await expect(preparar).toBeDisabled();
        await page.getByLabel('Repítela').fill('clave-del-director-1');
        await preparar.click();

        await expect(page.getByText('Listo para bajar')).toBeVisible({ timeout: 8 * 60_000 });
        const [bajada] = await Promise.all([page.waitForEvent('download', { timeout: 5 * 60_000 }), page.getByRole('button', { name: 'Descargar', exact: true }).click()]);
        expect(bajada.suggestedFilename()).toMatch(/^datos-del-liceo-\d{4}-\d{2}-\d{2}\.zip$/);
        const ruta = await bajada.path();
        const tamano = require('fs').statSync(ruta).size;
        console.log(`MISDATOS-UI-01: ${(tamano / 1048576).toFixed(1)} MB`);
        expect(tamano).toBeGreaterThan(10_000);
    } catch (e) {
        await captureEvidence(testInfo, page, 'MISDATOS-UI-01', 'Descargar todos los datos', e);
        throw e;
    }
});
