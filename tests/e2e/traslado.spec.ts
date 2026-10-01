import { test, expect } from '@playwright/test';
import { readFile } from 'fs/promises';
import { WEB_BASE, loginApi, injectSessionCookies, captureEvidence, queryTenantDb } from './helpers';

/**
 * EL TRASLADO, DE PUNTA A PUNTA
 *
 * El admin retira a un alumno, imprime sus notas parciales y baja su archivo
 * de traslado; el alumno «se va» (se borra de esta base, que hace de otro
 * liceo) y se importa con el archivo en una sección. Las reglas del servidor:
 * TRAS-01…08.
 */

test.describe('Traslado', () => {
    const cedula = `V-7${String(Date.now()).slice(-7)}`;
    let aula: { id: string; name: string; yearId: string };

    test.beforeAll(async () => {
        [aula] = await queryTenantDb(
            `SELECT c.id, c.name, c."academicYearId" AS "yearId" FROM classrooms c JOIN academic_years ay ON ay.id = c."academicYearId" AND ay.status = 'ACTIVE' ORDER BY c.grade, c.section LIMIT 1`
        );
        await queryTenantDb(
            `INSERT INTO users (id, email, password, "firstName", "lastName", role, "isActive", status, gender, "lugarDeNacimiento", "joinDate", "createdAt", "updatedAt")
             VALUES ($1, $2, 'sin-clave', 'Trasladada', 'Deprueba', 'STUDENT', true, 'ACTIVE', 'FEMENINO', 'Barquisimeto', now(), now(), now())`,
            [cedula, `traslado.${cedula.toLowerCase()}@testing.edu.ve`]
        );
        await queryTenantDb(
            `INSERT INTO student_classrooms (id, "studentId", "classroomId", "academicYearId", "enrollmentDate", "isActive", "createdAt", "updatedAt")
             VALUES ($1, $2, $3, $4, now(), true, now(), now())`,
            [`c${Date.now()}tras`, cedula, aula.id, aula.yearId]
        );
    });

    test.afterAll(async () => {
        await queryTenantDb(`DELETE FROM users WHERE id = $1`, [cedula]).catch(() => undefined);
    });

    test('TRAS-UI-01: retirar, imprimir sus notas, bajar el archivo e importarlo en otra sección', async ({ page }, testInfo) => {
        try {
            const admin = await loginApi('admin@testing.edu.ve', '123456');
            await injectSessionCookies(page, admin);
            await page.goto(`${WEB_BASE}/dashboard/usuarios/${encodeURIComponent(cedula)}`);
            // En la cabecera de la ficha: «Retiro» y «Traslado», cada uno con su ventana.
            await page.getByRole('button', { name: 'Retiro', exact: true }).click({ timeout: 60000 });
            await page.getByLabel('A qué liceo (opcional)').fill('U.E. Simón Rodríguez');
            await page.getByRole('button', { name: 'Retirar', exact: true }).click();
            await expect(page.getByText(/Retirado\./)).toBeVisible({ timeout: 15000 });
            const [inscripcion] = await queryTenantDb(`SELECT "isActive", "motivoDeRetiro" FROM student_classrooms WHERE "studentId" = $1`, [cedula]);
            expect(inscripcion).toEqual({ isActive: false, motivoDeRetiro: 'Traslado a U.E. Simón Rodríguez' });

            await expect(page.getByRole('button', { name: 'Retirado' })).toBeDisabled({ timeout: 15000 });
            await page.getByRole('button', { name: 'Traslado', exact: true }).click();
            const descarga = page.waitForEvent('download');
            await page.getByRole('region', { name: 'Traslado y retiro' }).getByRole('button', { name: 'Archivo de traslado' }).click();
            const archivo = await descarga;
            expect(archivo.suggestedFilename()).toMatch(/\.gestiedu$/);
            const ruta = testInfo.outputPath('traslado.gestiedu');
            await archivo.saveAs(ruta);
            expect(JSON.parse(await readFile(ruta, 'utf-8')).datos.alumno).toMatchObject({ cedula, nombres: 'Trasladada' });

            await page.getByRole('region', { name: 'Traslado y retiro' }).getByRole('link', { name: 'Notas parciales' }).click();
            await expect(page.getByRole('article', { name: 'Notas parciales' })).toContainText('Trasladada Deprueba', { timeout: 60000 });
            await page.screenshot({ path: 'test-results/evidencia/notas-parciales.png', fullPage: true });

            // «Se va»: en esta base ya no está, y la importamos como si llegara.
            await queryTenantDb(`DELETE FROM users WHERE id = $1`, [cedula]);
            await page.goto(`${WEB_BASE}/dashboard/importar-alumno`);
            await page.getByLabel('Archivo de traslado').setInputFiles(ruta);
            await expect(page.getByText('Firma comprobada')).toBeVisible({ timeout: 30000 });
            await page.getByRole('combobox', { name: 'Su sección aquí' }).click();
            await page.getByRole('option', { name: aula.name, exact: true }).click();
            await page.getByLabel('Contraseña').fill('UnaClaveDeOcho2026');
            await page.screenshot({ path: 'test-results/evidencia/importar-alumno.png', fullPage: true });
            await page.getByRole('button', { name: 'Importar alumno' }).click();
            await expect(page.getByRole('region', { name: 'Alumno importado' })).toContainText(`Trasladada Deprueba, en ${aula.name}`, { timeout: 30000 });
            const [nueva] = await queryTenantDb(`SELECT u."lugarDeNacimiento" AS lugar, sc."plantelDeOrigen" AS origen FROM users u JOIN student_classrooms sc ON sc."studentId" = u.id AND sc."isActive" WHERE u.id = $1`, [cedula]);
            expect(nueva.lugar).toBe('Barquisimeto');
            expect(nueva.origen).toBeTruthy();
        } catch (error) {
            await captureEvidence(testInfo, page, 'TRAS-UI-01', 'Traslado de punta a punta', error);
            throw error;
        }
    });
});
