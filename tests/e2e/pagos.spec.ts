import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { WEB_BASE, loginViaUI, captureEvidence, queryTenantDb } from './helpers';

/**
 * PAGOS, EN EL NAVEGADOR, DE PRINCIPIO A FIN
 *
 * 1. El admin activa el control en Configuración → aparece "Pagos" en el menú.
 * 2. La pantalla avisa cuántos deben.
 * 3. Abre a un alumno, elige las cuotas vencidas, cobra, baja el comprobante.
 * 4. Lo anula con motivo.
 * 5. El representante de ese alumno lo ve en su Inicio.
 *
 * Al terminar deja el liceo de pruebas como estaba (módulo apagado, sin pagos).
 */

const EVIDENCIA = path.join(process.cwd(), 'test-results', 'evidencia');

test.describe.serial('Pagos', () => {
    let caso: { student_id: string; first_name: string; last_name: string; tutor_email: string };
    let configuracionAntes: any[] = [];

    test.beforeAll(async () => {
        fs.mkdirSync(EVIDENCIA, { recursive: true });
        configuracionAntes = await queryTenantDb(`SELECT * FROM payment_settings`);
        const [alumno] = await queryTenantDb(
            `SELECT u.id AS student_id, u."firstName" AS first_name, u."lastName" AS last_name
             FROM users u
             JOIN student_classrooms sc ON sc."studentId" = u.id AND sc."isActive" = true
             JOIN academic_years ay ON ay.id = sc."academicYearId" AND ay.status = 'ACTIVE'
             WHERE u.status = 'ACTIVE' AND NOT EXISTS (SELECT 1 FROM payments p WHERE p."studentId" = u.id)
             ORDER BY u."lastName" LIMIT 1`
        );
        /**
         * Un representante DEL LICEO DE PRUEBAS, no cualquiera: la base trae
         * cuentas de demostración con otra contraseña, y al tocarle el turno a
         * una de ellas la prueba fallaba al entrar, no en lo que mide.
         */
        const [tutor] = await queryTenantDb(
            `SELECT id, email FROM users
              WHERE role = 'TUTOR' AND "isActive" = true AND status = 'ACTIVE'
              ORDER BY (email LIKE '%@testing.edu.ve') DESC, id
              LIMIT 1`
        );
        // El liceo de pruebas no trae representantes asignados: se crea el vínculo y se quita al final.
        await queryTenantDb(
            `INSERT INTO student_tutors (id, "studentId", "tutorId", relationship, "updatedAt")
             VALUES ('e2e-pagos', $1, $2, 'Madre', now()) ON CONFLICT DO NOTHING`,
            [alumno.student_id, tutor.id]
        );
        caso = { ...alumno, tutor_email: tutor.email };
    });

    test.afterAll(async () => {
        await queryTenantDb(`DELETE FROM student_tutors WHERE id = 'e2e-pagos'`);
        if (!caso) return;
        await queryTenantDb(`DELETE FROM payments WHERE "studentId" = $1`, [caso.student_id]);
        await queryTenantDb(`DELETE FROM payment_settings`);
        for (const fila of configuracionAntes) {
            await queryTenantDb(`INSERT INTO payment_settings (id, enabled, "updatedAt") VALUES ($1, $2, now())`, [fila.id, fila.enabled]);
        }
    });

    test('PAGOS-UI-01: activar en Configuración hace aparecer "Pagos" en el menú', async ({ page }, testInfo) => {
        try {
            expect(caso, 'hace falta un alumno inscrito con representante en la base de pruebas').toBeTruthy();
            await loginViaUI(page, 'admin@testing.edu.ve', '123456');
            await page.goto(`${WEB_BASE}/dashboard/configuracion`);
            // La pestaña se pulsaba nada más cargar, a veces antes de que la
            // página estuviera viva (con el servidor de desarrollo compilando):
            // el clic se perdía y la prueba esperaba 15 s una casilla que no
            // iba a salir. Se pulsa hasta que la pestaña se abre de verdad.
            await expect(async () => {
                await page.getByRole('button', { name: 'Pagos', exact: true }).click();
                await expect(page.getByRole('checkbox').first()).toBeVisible({ timeout: 2000 });
            }).toPass({ timeout: 30000 });

            /**
             * SE DEJA ACTIVADO, NO SE "CAMBIA"
             *
             * Esto pulsaba la casilla a ciegas. Si el liceo de pruebas ya tenía
             * los pagos activados —porque otra tanda se quedó a medias—, el
             * pulsado los APAGABA, y entonces todo lo de debajo se deshabilita y
             * la prueba fallaba por algo que no tiene que ver con lo que mide.
             */
            const casilla = page.getByRole('checkbox').first();
            await casilla.check();
            await page.getByRole('radio', { name: 'Mensual' }).click();
            await page.getByLabel('Día del mes').fill('1');
            await page.getByLabel(/Monto de cada cuota/).fill('30');
            await page.screenshot({ path: path.join(EVIDENCIA, 'pagos-configuracion.png'), fullPage: true });
            await page.getByRole('button', { name: 'Guardar' }).click();
            await expect(page.getByText(/Pagos configurados/)).toBeVisible({ timeout: 15000 });

            await expect(page.getByRole('link', { name: 'Pagos' })).toBeVisible({ timeout: 15000 });
        } catch (error) {
            await captureEvidence(testInfo, page, 'PAGOS-UI-01', 'Activar pagos', error);
            throw error;
        }
    });

    test('PAGOS-UI-02: avisa cuántos deben, se cobra, se baja el comprobante y se anula', async ({ page }, testInfo) => {
        try {
            await loginViaUI(page, 'admin@testing.edu.ve', '123456');
            await page.goto(`${WEB_BASE}/dashboard/pagos`);
            await expect(page.getByText(/estudiantes? deben?/).first()).toBeVisible({ timeout: 30000 });
            await page.screenshot({ path: path.join(EVIDENCIA, 'pagos-resumen.png') });

            await page.getByPlaceholder('Buscar estudiante o cédula').fill(caso.student_id);
            await page.getByRole('button', { name: new RegExp(`${caso.last_name}, ${caso.first_name}`) }).click();

            const dialogo = page.getByRole('dialog');
            await expect(dialogo.getByRole('heading', { name: 'Cuotas' })).toBeVisible({ timeout: 15000 });
            await dialogo.getByRole('button', { name: 'Las vencidas' }).click();
            await dialogo.getByRole('radio', { name: 'Efectivo' }).click();
            await page.screenshot({ path: path.join(EVIDENCIA, 'pagos-ficha.png') });
            await dialogo.getByRole('button', { name: 'Registrar pago' }).click();
            await expect(page.getByText(/Pago registrado · comprobante Nº/)).toBeVisible({ timeout: 15000 });

            const [pago] = await queryTenantDb(`SELECT id, "amountBase" FROM payments WHERE "studentId" = $1 AND "annulledAt" IS NULL`, [caso.student_id]);
            expect(Number(pago.amountBase)).toBeGreaterThan(0);

            const [descarga] = await Promise.all([
                page.waitForEvent('download'),
                dialogo.getByRole('button', { name: 'Comprobante en imagen' }).first().click(),
            ]);
            const archivo = path.join(EVIDENCIA, descarga.suggestedFilename());
            await descarga.saveAs(archivo);
            expect(fs.readFileSync(archivo).subarray(0, 4).toString('hex')).toBe('89504e47');

            await dialogo.getByRole('button', { name: 'Anular pago' }).first().click();
            await dialogo.getByPlaceholder('Motivo de la anulación').fill('Prueba automática');
            await dialogo.getByRole('button', { name: 'Anular', exact: true }).click();
            await expect(page.getByText('Pago anulado')).toBeVisible({ timeout: 15000 });
            const [anulado] = await queryTenantDb(`SELECT "annulReason" FROM payments WHERE id = $1`, [pago.id]);
            expect(anulado.annulReason).toBe('Prueba automática');

            // Un segundo pago, que queda vigente para lo que ve el representante.
            await dialogo.getByRole('button', { name: 'Las vencidas' }).click();
            await dialogo.getByRole('radio', { name: 'Efectivo' }).click();
            await dialogo.getByRole('button', { name: 'Registrar pago' }).click();
            await expect(page.getByText(/Pago registrado · comprobante Nº/).first()).toBeVisible({ timeout: 15000 });
        } catch (error) {
            await captureEvidence(testInfo, page, 'PAGOS-UI-02', 'Cobrar y anular', error);
            throw error;
        }
    });

    test('PAGOS-UI-03: el representante ve el estado de pago en su Inicio, sin botones de cobrar', async ({ page }, testInfo) => {
        try {
            await loginViaUI(page, caso.tutor_email, '123456');
            await page.goto(`${WEB_BASE}/dashboard`);
            const seccion = page.getByRole('region', { name: 'Pagos' });
            await expect(seccion).toBeVisible({ timeout: 30000 });
            await seccion.getByRole('button', { name: new RegExp(caso.first_name) }).first().click();
            await expect(seccion.getByRole('heading', { name: 'Historial de pagos' })).toBeVisible();
            await expect(seccion.getByRole('button', { name: 'Registrar pago' })).toHaveCount(0);
            await expect(seccion.getByRole('button', { name: 'Anular pago' })).toHaveCount(0);
            await expect(seccion.getByRole('button', { name: 'Comprobante en imagen' }).first()).toBeVisible();
            await page.screenshot({ path: path.join(EVIDENCIA, 'pagos-representante.png'), fullPage: true });

            // Y no entra a la pantalla del admin.
            await page.goto(`${WEB_BASE}/dashboard/pagos`);
            await expect(page).not.toHaveURL(/\/dashboard\/pagos$/);
        } catch (error) {
            await captureEvidence(testInfo, page, 'PAGOS-UI-03', 'Vista del representante', error);
            throw error;
        }
    });
});
