import { test, expect } from '@playwright/test';
import { WEB_BASE, captureEvidence, loginViaUI, queryTenantDb } from './helpers';

/**
 * LAS FINANZAS DEL LICEO, EN LA PANTALLA (FIN-UI-*, MISPAGOS-UI-01; 2026-10-01)
 *
 * El admin agrega fondos y anota un gasto: el saldo cambia. Le pone sueldo a un
 * profesor y le paga: el profesor lo ve en «Mis pagos», y nada de nadie más.
 */

// Con su signo: con el liceo de pruebas en rojo, «-$180» se leía 180 y la cuenta salía al revés.
const dineroDe = (t: string) => (/[-−]/.test(t) ? -1 : 1) * Number(t.replace(/[^\d,]/g, '').replace(',', '.'));

test.describe.serial('Finanzas', () => {
    let profe: { email: string; id: string; nombre: string };

    test.beforeAll(async () => {
        await queryTenantDb(`UPDATE payment_settings SET enabled = true WHERE id = 'liceo'`);
        const [p] = await queryTenantDb(
            `SELECT u.email, u.id, u."firstName" || ' ' || u."lastName" AS nombre FROM users u
              WHERE u.role = 'TEACHER' AND u."isActive" AND u.email LIKE '%@testing.edu.ve' ORDER BY u.email LIMIT 1`
        );
        profe = p;
    });

    test('FIN-UI-01: agregar fondos y anotar un gasto cambian el saldo', async ({ page }, testInfo) => {
        try {
            await loginViaUI(page, 'admin@testing.edu.ve', '123456');
            await page.goto(`${WEB_BASE}/dashboard/pagos`);
            const saldo = page.locator('p', { hasText: /^-?\$/ }).first();
            await expect(page.getByText('Fondos disponibles')).toBeVisible({ timeout: 30000 });
            const antes = dineroDe(await saldo.innerText());

            await page.getByRole('button', { name: 'Agregar fondos' }).first().click();
            const fondo = page.getByRole('dialog', { name: 'Agregar fondos' });
            await fondo.getByRole('radio', { name: 'Donación' }).click();
            await fondo.getByLabel(/^Monto/).fill('100');
            await fondo.getByRole('button', { name: 'Agregar fondos' }).click();
            await expect(page.getByText('Fondos agregados')).toBeVisible({ timeout: 15000 });
            await expect.poll(async () => dineroDe(await saldo.innerText()), { timeout: 15000 }).toBeCloseTo(antes + 100, 2);

            await page.getByRole('button', { name: 'Anotar un gasto' }).click();
            const gasto = page.getByRole('dialog', { name: 'Anotar un gasto' });
            await gasto.getByLabel('¿Qué fue?').fill('Tablero de básquet (prueba)');
            await gasto.getByRole('radio', { name: 'Compras' }).click();
            await gasto.getByLabel(/^Cuánto costó/).fill('40');
            await gasto.getByRole('button', { name: 'Anotar gasto' }).click();
            await expect(page.getByText('Gasto anotado')).toBeVisible({ timeout: 15000 });
            await expect.poll(async () => dineroDe(await saldo.innerText()), { timeout: 15000 }).toBeCloseTo(antes + 60, 2);
            await page.screenshot({ path: testInfo.outputPath('finanzas-resumen.png') });
        } catch (e) {
            await captureEvidence(testInfo, page, 'FIN-UI-01', 'Fondos y gastos', e);
            throw e;
        }
    });

    test('FIN-UI-02: ponerle sueldo a un profesor y pagarle, con su recibo', async ({ page }, testInfo) => {
        try {
            await loginViaUI(page, 'admin@testing.edu.ve', '123456');
            await page.goto(`${WEB_BASE}/dashboard/pagos?vista=personal`);
            await page.getByRole('button', { name: new RegExp(profe.nombre) }).first().click({ timeout: 30000 });
            const ficha = page.getByRole('dialog');
            await ficha.getByRole('radio', { name: 'Mensual' }).click();
            await ficha.getByLabel(/^Cuánto al mes/).fill('250');
            await ficha.getByRole('button', { name: 'Guardar lo acordado' }).click();
            await expect(page.getByText('Guardado').first()).toBeVisible({ timeout: 15000 });

            await ficha.getByRole('button', { name: 'El próximo' }).click();
            await ficha.getByRole('radio', { name: 'Efectivo' }).click();
            await ficha.getByRole('button', { name: 'Registrar pago' }).click();
            await expect(page.getByText(/Pago registrado · recibo Nº/)).toBeVisible({ timeout: 15000 });
            const [pago] = await queryTenantDb(
                `SELECT p."montoBase" FROM pagos_al_personal p JOIN personal x ON x.id = p."personalId" WHERE x."userId" = $1 AND p."anuladoEn" IS NULL ORDER BY p.numero DESC LIMIT 1`,
                [profe.id]
            );
            expect(Number(pago.montoBase)).toBe(250);
        } catch (e) {
            await captureEvidence(testInfo, page, 'FIN-UI-02', 'Pagar al profesor', e);
            throw e;
        }
    });

    test('REPORTE-UI-01: del mes en el calendario a su reporte para imprimir, que cuadra', async ({ page }, testInfo) => {
        try {
            await loginViaUI(page, 'admin@testing.edu.ve', '123456');
            await page.goto(`${WEB_BASE}/dashboard/pagos`);
            await expect(page.getByText('Fondos disponibles')).toBeVisible({ timeout: 30000 });
            const disponibles = await page.locator('p', { hasText: /^-?\$/ }).first().innerText();
            await page.getByRole('button', { name: /Ver el mes en días/ }).filter({ hasText: 'Este mes' }).click();
            await page.getByRole('link', { name: 'Reporte del mes' }).click();
            await expect(page).toHaveURL(/\/dashboard\/pagos\/reporte\?mes=\d{4}-\d{2}/);
            const resumen = page.getByRole('table', { name: 'Resumen del mes' });
            await expect(resumen).toBeVisible({ timeout: 30000 });
            // El saldo al terminar el mes en curso es lo que hay hoy.
            await expect(resumen.getByRole('row', { name: /Saldo al terminar el mes/ })).toContainText(disponibles);
            await expect(page.getByRole('navigation', { name: 'Navegación principal' })).toHaveCount(0);
            await page.screenshot({ path: 'test-results/evidencia/reporte-del-mes.png', fullPage: true });
        } catch (e) {
            await captureEvidence(testInfo, page, 'REPORTE-UI-01', 'Reporte del mes', e);
            throw e;
        }
    });

    test('MISPAGOS-UI-01: el profesor ve lo suyo, y nada de las finanzas del liceo', async ({ page }, testInfo) => {
        try {
            await loginViaUI(page, profe.email, '123456');
            await page.goto(`${WEB_BASE}/dashboard/mis-pagos`);
            await expect(page.getByText('Tu próximo pago')).toBeVisible({ timeout: 30000 });
            await expect(page.getByRole('heading', { name: 'Tus recibos' })).toBeVisible();
            await expect(page.getByRole('button', { name: 'Recibo en imagen' }).first()).toBeVisible();
            // Finanzas del liceo: no.
            await page.goto(`${WEB_BASE}/dashboard/pagos`);
            await expect(page).not.toHaveURL(/\/dashboard\/pagos/);
        } catch (e) {
            await captureEvidence(testInfo, page, 'MISPAGOS-UI-01', 'Mis pagos del profesor', e);
            throw e;
        }
    });
});
