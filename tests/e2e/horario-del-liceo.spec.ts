import { test, expect } from '@playwright/test';
import { WEB_BASE, loginViaUI, captureEvidence } from './helpers';

/**
 * EL HORARIO DEL LICEO, A PRUEBA DE ERRORES (EN LA PANTALLA)
 *
 * Por turno se pone el inicio, el fin, cuánto dura una hora de clase y los
 * recreos; el sistema cuenta las horas y las enseña. Si sobran minutos, lo
 * dice en rojo con la hora a la que tendría que acabar. El servidor lo
 * comprueba otra vez al guardar (`horario-del-liceo.test.ts`).
 *
 * No se guarda nada: la configuración es de todo el liceo de pruebas.
 */
test.describe('Horario del liceo en Configuración', () => {
    test('HORARIO-CFG-01: se ven la mañana y la tarde con su fin, y un horario que no cuadra lo dice', async ({ page }, testInfo) => {
        try {
            await loginViaUI(page, 'admin@testing.edu.ve', '123456');
            await page.goto(`${WEB_BASE}/dashboard/configuracion`);
            await page.getByRole('button', { name: /Configuración Académica/ }).click();

            const manana = page.getByRole('region', { name: /Turno de la mañana/ });
            const tarde = page.getByRole('region', { name: /Turno de la tarde/ });
            await expect(manana).toBeVisible({ timeout: 30000 });
            await expect(tarde).toBeVisible();
            // Las dos horas de fin se pueden tocar (antes solo había inicio).
            await expect(manana.getByLabel('Acaba a las')).toBeEditable();
            await expect(tarde.getByLabel('Empieza a las')).toBeEditable();
            await expect(tarde.getByLabel('Acaba a las')).toBeEditable();
            await expect(manana.getByText(/Caben \d+ horas de clase/)).toBeVisible();

            // Horas de 40 minutos en un día que acaba a las 12:30: no cuadra.
            const duracion = manana.getByLabel(/Cada hora de clase dura/);
            const antes = await duracion.inputValue();
            await duracion.fill('40');
            await expect(manana.getByRole('alert')).toContainText('sobran');
            await expect(manana.getByText(/Caben \d+ horas de clase/)).toHaveCount(0);

            await page.getByRole('heading', { name: /Configuración de Horario/ }).scrollIntoViewIfNeeded();
            await manana.locator('..').screenshot({ path: 'test-results/evidencia/horario-del-liceo.png' });

            await duracion.fill(antes);
            await expect(manana.getByText(/Caben \d+ horas de clase/)).toBeVisible();
        } catch (error) {
            await captureEvidence(testInfo, page, 'HORARIO-CFG-01', 'Panel del horario del liceo', error);
            throw error;
        }
    });
});
