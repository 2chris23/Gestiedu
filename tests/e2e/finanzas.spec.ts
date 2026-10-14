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
        // Cada tanda le paga un mes: a la duodécima ya no quedaba nada por
        // pagarle y FIN-UI-02 salía en rojo. Lo de las tandas anteriores se
        // anula (nada se borra), y vuelve a deberse.
        await queryTenantDb(
            `UPDATE pagos_al_personal SET "anuladoEn" = now(), "motivoAnulacion" = 'Prueba: se empieza de nuevo'
              WHERE "anuladoEn" IS NULL AND "personalId" IN (SELECT id FROM personal WHERE "userId" = $1)`,
            [profe.id]
        );
    });

    test('FIN-UI-01: un ingreso y un egreso desde el «+» cambian el saldo', async ({ page }, testInfo) => {
        try {
            await loginViaUI(page, 'admin@testing.edu.ve', '123456');
            await page.goto(`${WEB_BASE}/dashboard/pagos`);
            const saldo = page.locator('p', { hasText: /^-?\$/ }).first();
            await expect(page.getByText('Fondos disponibles')).toBeVisible({ timeout: 30000 });
            const antes = dineroDe(await saldo.innerText());

            // Se añade por el «+» que flota abajo (como Rial): ingreso o egreso,
            // el monto en su calculadora y luego de qué es.
            await page.getByRole('button', { name: 'Añadir', exact: true }).click();
            await page.getByRole('menuitem', { name: /Ingreso/ }).click();
            const panel = page.getByRole('dialog', { name: 'Nuevo movimiento' });
            const calculadora = panel.getByRole('group', { name: 'Calculadora' });
            for (const n of ['1', '0', '0', '00']) await calculadora.getByRole('button', { name: n, exact: true }).click();
            await expect(panel.getByLabel('Monto: $ 100.00')).toBeVisible();
            await panel.getByRole('button', { name: 'Donación' }).click();
            await panel.getByRole('button', { name: 'Guardar el ingreso' }).click();
            await expect(page.getByText('Ingreso anotado')).toBeVisible({ timeout: 15000 });
            await expect.poll(async () => dineroDe(await saldo.innerText()), { timeout: 15000 }).toBeCloseTo(antes + 100, 2);

            await page.getByRole('button', { name: 'Añadir', exact: true }).click();
            await page.getByRole('menuitem', { name: /Egreso/ }).click();
            for (const n of ['4', '0', '00']) await calculadora.getByRole('button', { name: n, exact: true }).click();
            await panel.getByRole('button', { name: 'Compras' }).click();
            // La descripción, de último y opcional.
            await panel.getByPlaceholder('Opcional').fill('Tablero de básquet (prueba)');
            await panel.getByRole('button', { name: 'Guardar el egreso' }).click();
            await expect(page.getByText('Egreso anotado')).toBeVisible({ timeout: 15000 });
            await expect.poll(async () => dineroDe(await saldo.innerText()), { timeout: 15000 }).toBeCloseTo(antes + 60, 2);
            await expect(page.getByRole('list', { name: /Movimientos de/ })).toContainText('Tablero de básquet (prueba)');
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

    test('REPORTE-UI-01: de los movimientos del mes a su reporte para imprimir, que cuadra', async ({ page }, testInfo) => {
        try {
            await loginViaUI(page, 'admin@testing.edu.ve', '123456');
            await page.goto(`${WEB_BASE}/dashboard/pagos`);
            await expect(page.getByText('Fondos disponibles')).toBeVisible({ timeout: 30000 });
            const disponibles = await page.locator('p', { hasText: /^-?\$/ }).first().innerText();
            // Los movimientos abren en el mes en curso, con su reporte.
            await expect(page.getByRole('heading', { name: 'Movimientos' })).toBeVisible();
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

    test('FIN-UI-03: cobrar a un estudiante desde «Ingreso»: año, sección y su fila con la mensualidad', async ({ page }, testInfo) => {
        try {
            await loginViaUI(page, 'admin@testing.edu.ve', '123456');
            await page.goto(`${WEB_BASE}/dashboard/pagos`);
            await expect(page.getByText('Fondos disponibles')).toBeVisible({ timeout: 30000 });
            await page.getByRole('button', { name: 'Añadir', exact: true }).click();
            await page.getByRole('menuitem', { name: /Ingreso/ }).click();
            const panel = page.getByRole('dialog', { name: 'Nuevo movimiento' });
            await panel.getByRole('button', { name: 'Estudiante', exact: true }).click();
            // Mientras se busca a quién, la calculadora se aparta.
            await expect(panel.getByRole('group', { name: 'Calculadora' })).toHaveCount(0);
            await panel.getByRole('button', { name: '1er Año' }).click();
            await panel.getByRole('button', { name: /^Sección / }).first().click();
            const filas = panel.getByRole('list', { name: 'Estudiantes' }).getByRole('button');
            await expect(filas.first()).toBeVisible({ timeout: 15000 });
            // Cada fila: nombre, mensualidad y lo pagado.
            await expect(filas.first()).toContainText('$');
            await filas.first().click();
            await expect(panel.getByRole('button', { name: 'Cambiar', exact: true })).toBeVisible();
            const calculadora = panel.getByRole('group', { name: 'Calculadora' });
            for (const n of ['1', '00']) await calculadora.getByRole('button', { name: n, exact: true }).click();
            await panel.getByRole('button', { name: 'Guardar el ingreso' }).click();
            await expect(page.getByText(/Cobrado · comprobante Nº/)).toBeVisible({ timeout: 15000 });
        } catch (e) {
            await captureEvidence(testInfo, page, 'FIN-UI-03', 'Cobrar desde Ingreso', e);
            throw e;
        }
    });

    test('FIN-UI-04: en Personal se crea un área y se le añade una persona con solo su nombre', async ({ page }, testInfo) => {
        const area = `Cocina QA ${Date.now() % 100000}`;
        try {
            await loginViaUI(page, 'admin@testing.edu.ve', '123456');
            await page.goto(`${WEB_BASE}/dashboard/pagos?vista=personal`);
            await page.getByRole('button', { name: 'Crear área' }).click({ timeout: 30000 });
            await page.getByLabel('Nombre del área').fill(area);
            await page.getByRole('button', { name: 'Crear', exact: true }).click();
            await expect(page.getByRole('button', { name: `${area} (0)` })).toHaveAttribute('aria-pressed', 'true', { timeout: 15000 });
            await page.getByRole('button', { name: 'Añadir persona' }).click();
            await page.getByLabel('Nombre y apellido').fill('Rosa Prueba QA');
            await page.getByRole('button', { name: 'Agregar', exact: true }).click();
            await expect(page.getByText(/Rosa Prueba QA agregado a/)).toBeVisible({ timeout: 15000 });
            await page.keyboard.press('Escape');
            await expect(page.getByRole('button', { name: `${area} (1)` })).toBeVisible({ timeout: 15000 });
        } catch (e) {
            await captureEvidence(testInfo, page, 'FIN-UI-04', 'Áreas del personal', e);
            throw e;
        } finally {
            await queryTenantDb(`DELETE FROM personal WHERE nombre = 'Rosa Prueba QA'`).catch(() => 0);
            await queryTenantDb(`UPDATE payment_settings SET "areasDelPersonal" = COALESCE((SELECT jsonb_agg(x) FROM jsonb_array_elements("areasDelPersonal") x WHERE x #>> '{}' NOT LIKE 'Cocina QA %'), '[]'::jsonb)`).catch(() => 0);
        }
    });

    test('FIN-UI-05: un egreso guardado como recurrente se repite de un toque; bolívares con la tasa del BCV', async ({ page }, testInfo) => {
        const nombre = `Internet QA ${Date.now() % 100000}`;
        try {
            await loginViaUI(page, 'admin@testing.edu.ve', '123456');
            await page.goto(`${WEB_BASE}/dashboard/pagos`);
            const saldo = page.locator('p', { hasText: /^-?\$/ }).first();
            await expect(page.getByText('Fondos disponibles')).toBeVisible({ timeout: 30000 });
            const panel = page.getByRole('dialog', { name: 'Nuevo movimiento' });
            const calculadora = panel.getByRole('group', { name: 'Calculadora' });

            await page.getByRole('button', { name: 'Añadir', exact: true }).click();
            await page.getByRole('menuitem', { name: /Egreso/ }).click();
            for (const n of ['2', '5', '00']) await calculadora.getByRole('button', { name: n, exact: true }).click();
            await panel.getByRole('button', { name: 'Servicios' }).click();
            // La factura y la descripción, opcionales.
            await expect(panel.getByLabel('Foto de la factura')).toBeAttached();
            await panel.getByPlaceholder('Opcional').last().fill(nombre);
            await panel.getByRole('checkbox', { name: /Guardar como recurrente/ }).check();
            await panel.getByRole('button', { name: 'Guardar el egreso' }).click();
            await expect(page.getByText(`«${nombre}» guardado como recurrente`)).toBeVisible({ timeout: 15000 });
            const antes = dineroDe(await saldo.innerText());

            // La próxima vez: un toque y queda lleno.
            await page.getByRole('button', { name: 'Añadir', exact: true }).click();
            await page.getByRole('menuitem', { name: /Egreso/ }).click();
            await panel.getByRole('button', { name: new RegExp(nombre) }).first().click();
            await expect(panel.getByLabel('Monto: $ 25.00')).toBeVisible();
            await expect(panel.getByRole('button', { name: 'Servicios' })).toHaveAttribute('aria-pressed', 'true');
            await panel.getByRole('button', { name: 'Guardar el egreso' }).click();
            await expect(page.getByText('Egreso anotado')).toBeVisible({ timeout: 15000 });
            await expect.poll(async () => dineroDe(await saldo.innerText()), { timeout: 15000 }).toBeCloseTo(antes - 25, 2);

            // En bolívares, la tasa se pone sola (la del BCV, o la última que se supo).
            await page.getByRole('button', { name: 'Añadir', exact: true }).click();
            await page.getByRole('menuitem', { name: /Egreso/ }).click();
            await panel.getByRole('radio', { name: /Bolívares/ }).click();
            await expect(panel.getByText(/Tasa BCV del|Escribe la tasa del día/)).toBeVisible({ timeout: 15000 });
            // Con Pago Móvil se pide la referencia; con efectivo, no.
            await panel.getByRole('button', { name: 'Personal', exact: true }).click();
            await page.keyboard.press('Escape');
        } catch (e) {
            await captureEvidence(testInfo, page, 'FIN-UI-05', 'Recurrentes y tasa', e);
            throw e;
        } finally {
            await queryTenantDb(
              `UPDATE payment_settings SET recurrentes = COALESCE((SELECT jsonb_agg(x) FROM jsonb_array_elements(recurrentes) x WHERE x->>'nombre' NOT LIKE 'Internet QA %'), '[]'::jsonb)`
            ).catch(() => 0);
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
