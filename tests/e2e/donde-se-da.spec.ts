import { test, expect } from '@playwright/test';
import { WEB_BASE, loginApi, injectSessionCookies, captureEvidence, queryTenantDb } from './helpers';

/**
 * DÓNDE SE DA UNA MATERIA, DESDE MATERIAS
 *
 *   SECC-MAT-UI-01  el admin marca «todo 1.er año» menos una sección y guarda:
 *                   la materia queda en esas secciones, sin profesor; en la
 *                   sección ya no hay «Asignar materia», sino «Cambiar en
 *                   Materias».
 *
 * La materia es de la prueba y se borra al final con lo suyo.
 */

const MATERIA = 'Robótica (e2e)';
let c: { slug: string; id: string; ciclo: string; secciones: Array<{ id: string; name: string; slug: string }> };

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
    await queryTenantDb(`DELETE FROM subjects WHERE name = $1`, [MATERIA]);
    const [s] = await queryTenantDb(
        `INSERT INTO subjects (id, name, slug, "createdAt", "updatedAt") VALUES ('c' || md5(random()::text), $1, 'robotica-e2e', now(), now()) RETURNING id, slug`,
        [MATERIA]
    );
    const [y] = await queryTenantDb(`SELECT id, name FROM academic_years WHERE status = 'ACTIVE' LIMIT 1`);
    const secciones = await queryTenantDb(`SELECT id, name, slug FROM classrooms WHERE "academicYearId" = $1 AND grade = 1 AND "isActive" ORDER BY name`, [y.id]);
    c = { slug: s.slug, id: s.id, ciclo: y.name, secciones };
});

test.afterAll(async () => {
    await queryTenantDb(`DELETE FROM subjects WHERE name = $1`, [MATERIA]);
});

test('SECC-MAT-UI-01: por año, menos una sección; la sección ya no añade materias', async ({ page }, testInfo) => {
    try {
        expect(c.secciones.length).toBeGreaterThan(1);
        const admin = await loginApi('admin@testing.edu.ve', '123456');
        await injectSessionCookies(page, admin);
        await page.goto(`${WEB_BASE}/dashboard/materias/${c.ciclo}/${c.slug}?dondeSeDa=1`);

        // Recién creada (con `?dondeSeDa=1`), abre la hoja sola.
        const hoja = page.getByRole('dialog', { name: 'Dónde se da' });
        await expect(hoja).toBeVisible({ timeout: 60000 });
        await hoja.getByRole('checkbox', { name: 'Todo Primer año' }).click();
        await hoja.getByRole('button', { name: /Primer año/ }).filter({ hasText: 'secciones' }).click();
        const ultima = c.secciones[c.secciones.length - 1];
        await hoja.getByRole('checkbox', { name: new RegExp(ultima.name) }).click();
        await expect(hoja.getByRole('checkbox', { name: 'Todo Primer año' })).toHaveAttribute('aria-checked', 'mixed');
        await page.screenshot({ path: 'test-results/evidencia/donde-se-da.png' });
        await hoja.getByRole('button', { name: /^Guardar/ }).click();
        await expect(hoja).toBeHidden({ timeout: 15000 });

        const filas = await queryTenantDb(`SELECT "classroomId", "teacherId" FROM classroom_subjects WHERE "subjectId" = $1`, [c.id]);
        expect(filas.map((f: any) => f.classroomId).sort()).toEqual(c.secciones.slice(0, -1).map((s) => s.id).sort());
        expect(filas.every((f: any) => f.teacherId === null)).toBe(true);
        await expect(page.getByText(`${c.secciones.length - 1} secciones · elegir por año`)).toBeVisible({ timeout: 15000 });

        // La sección: sus materias se ven; cambiarlas es en Materias.
        const s = c.secciones[0];
        const corto = s.slug.endsWith(`-${c.ciclo}`) ? s.slug.slice(0, -(c.ciclo.length + 1)) : s.slug;
        await page.goto(`${WEB_BASE}/dashboard/academico/${c.ciclo}/${corto}`);
        await page.getByRole('navigation').getByRole('button', { name: 'Materias' }).click({ timeout: 60000 });
        await expect(page.getByRole('link', { name: /Cambiar en Materias/ })).toBeVisible({ timeout: 30000 });
        await expect(page.getByRole('button', { name: /Asignar Materia/ })).toHaveCount(0);
    } catch (error) {
        await captureEvidence(testInfo, page, 'SECC-MAT-UI-01', 'Dónde se da una materia', error);
        throw error;
    }
});
