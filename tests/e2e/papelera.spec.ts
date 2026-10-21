import { test, expect } from '@playwright/test';
import { API_BASE, TENANT_SLUG, WEB_BASE, captureEvidence, loginApi, loginViaUI, queryTenantDb } from './helpers';

/**
 * LA PAPELERA EN LA PANTALLA (19-oct-2026)
 *
 * Cristian: «imagina que eres el admin y borraste sin querer un estudiante y
 * lo quieres recuperar». El admin borra a un alumno, entra en Configuración →
 * Papelera, lo ve con cuándo se va para siempre, pulsa Restaurar y el alumno
 * vuelve con su sección.
 *
 *   PAPELERA-UI-01 borrar un alumno y restaurarlo desde la pantalla
 */
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

test('PAPELERA-UI-01: el admin restaura desde la papelera a un alumno borrado sin querer', async ({ page }, testInfo) => {
    const s = await loginApi('admin@testing.edu.ve');
    const sinCuerpo = { Authorization: `Bearer ${s.accessToken}`, 'X-Institute-Slug': TENANT_SLUG };
    const cab = { ...sinCuerpo, 'Content-Type': 'application/json' };
    const cedula = `V9${String(Date.now()).slice(-7)}`;
    // Solo letras (el nombre no admite números): la hora escrita con letras.
    const nombre = 'Papelera' + String(Date.now()).slice(-5).replace(/\d/g, (d) => 'abcdefghij'[Number(d)]);
    try {
        const creado = await fetch(`${API_BASE}/users`, {
            method: 'POST',
            headers: cab,
            body: JSON.stringify({ id: cedula, email: `${nombre.toLowerCase()}${cedula}@testing.edu.ve`, password: 'Clave12345!', firstName: nombre, lastName: 'Sinquerer', role: 'STUDENT', gender: 'FEMENINO' }),
        });
        expect(creado.status, await creado.text()).toBeLessThan(300);
        const [sec] = await queryTenantDb<{ id: string; academicYearId: string }>(
            `SELECT c.id, c."academicYearId" FROM classrooms c JOIN academic_years y ON y.id = c."academicYearId" WHERE y.status = 'ACTIVE' ORDER BY c.grade, c.section LIMIT 1`
        );
        await queryTenantDb(
            `INSERT INTO student_classrooms (id, "studentId", "classroomId", "academicYearId", "isActive", "enrollmentDate", "updatedAt") VALUES ($1, $2, $3, $4, true, now(), now())`,
            [`c${String(Date.now())}papelera0001`.slice(0, 25), cedula, sec.id, sec.academicYearId]
        );
        // Se borra «sin querer».
        expect((await fetch(`${API_BASE}/users/${encodeURIComponent(cedula)}`, { method: 'DELETE', headers: sinCuerpo })).status).toBe(200);
        expect(await queryTenantDb(`SELECT 1 FROM users WHERE id = $1`, [cedula])).toHaveLength(0);

        await loginViaUI(page, 'admin@testing.edu.ve');
        await page.goto(`${WEB_BASE}/dashboard/configuracion?seccion=papelera`);
        const fila = page.locator('[data-papelera] li', { hasText: `Estudiante ${nombre} Sinquerer` });
        await expect(fila).toBeVisible({ timeout: 30000 });
        await expect(fila).toContainText('Se borra para siempre el');
        await fila.getByRole('button', { name: 'Restaurar' }).click();
        await page.getByRole('alertdialog').getByRole('button', { name: 'Restaurar' }).click(); // el «¿seguro?»
        await expect(page.getByText(`Restaurado: Estudiante ${nombre} Sinquerer`)).toBeVisible({ timeout: 15000 });
        await expect(fila).toHaveCount(0);

        // Vuelve con su sección.
        expect(await queryTenantDb(`SELECT 1 FROM users WHERE id = $1`, [cedula])).toHaveLength(1);
        expect(await queryTenantDb(`SELECT 1 FROM student_classrooms WHERE "studentId" = $1 AND "classroomId" = $2`, [cedula, sec.id])).toHaveLength(1);
    } catch (e) {
        await captureEvidence(testInfo, page, 'PAPELERA-UI-01', 'Restaurar desde la papelera', e);
        throw e;
    } finally {
        // La prueba no deja a nadie: fuera el alumno y su rastro en la papelera.
        await fetch(`${API_BASE}/users/${encodeURIComponent(cedula)}`, { method: 'DELETE', headers: sinCuerpo }).catch(() => undefined);
        await queryTenantDb(`DELETE FROM registros_borrados WHERE "registroId" = $1 OR "contenido"->>'studentId' = $1`, [cedula]).catch(() => undefined);
    }
});
