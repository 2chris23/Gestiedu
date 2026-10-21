import { test, expect } from '@playwright/test';
import { WEB_BASE, loginApi, injectSessionCookies, captureEvidence, queryTenantDb } from './helpers';

/**
 * LOS PROFESORES, EN LA PANTALLA
 *
 *   PROF-UI-01  el admin abre Profesores: cada uno con su barra de horas; en
 *               la ficha le fija las horas de su cargo (y cambia el estado),
 *               le asigna una clase sin profesor y su carga sube; nada se
 *               sale de ancho en el teléfono.
 *
 * Deja todo como estaba: la clase vuelve a su profesor y las horas, vacías.
 */

let c: { profe: string; nombre: string; classroomId: string; subjectId: string; antes: string | null; materia: string; seccion: string };

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
    // Una clase del año en curso con profesor: se le quita para que haya una «sin profesor».
    const [x] = await queryTenantDb(
        `SELECT cs."classroomId", cs."subjectId", cs."teacherId", s.name AS materia, cl.name AS seccion
           FROM classroom_subjects cs
           JOIN classrooms cl ON cl.id = cs."classroomId"
           JOIN academic_years ay ON ay.id = cl."academicYearId" AND ay.status = 'ACTIVE'
           JOIN subjects s ON s.id = cs."subjectId" AND NOT s."porGrupos"
          WHERE cs."teacherId" IS NOT NULL
          ORDER BY cl.grade DESC, cl.name, s.name LIMIT 1`
    );
    const [p] = await queryTenantDb(
        `SELECT id, "firstName" || ' ' || "lastName" AS nombre FROM users
          WHERE role = 'TEACHER' AND "isActive" AND id <> $1 ORDER BY "firstName", "lastName" LIMIT 1`,
        [x.teacherId]
    );
    await queryTenantDb(`UPDATE classroom_subjects SET "teacherId" = NULL WHERE "classroomId" = $1 AND "subjectId" = $2`, [x.classroomId, x.subjectId]);
    await queryTenantDb(`UPDATE users SET "horasDelCargo" = NULL WHERE id = $1`, [p.id]);
    c = { profe: p.id, nombre: p.nombre, classroomId: x.classroomId, subjectId: x.subjectId, antes: x.teacherId, materia: x.materia, seccion: x.seccion };
});

test.afterAll(async () => {
    if (!c) return;
    await queryTenantDb(`UPDATE classroom_subjects SET "teacherId" = $3 WHERE "classroomId" = $1 AND "subjectId" = $2`, [c.classroomId, c.subjectId, c.antes]);
    await queryTenantDb(`UPDATE users SET "horasDelCargo" = NULL WHERE id = $1`, [c.profe]);
});

test('PROF-UI-01: la carga de un profesor, sus horas y asignarle una clase', async ({ page }, testInfo) => {
    try {
        const admin = await loginApi('admin@testing.edu.ve', '123456');
        await injectSessionCookies(page, admin);
        await page.goto(`${WEB_BASE}/dashboard/profesores`);

        // La lista: cada profesor con su barra; arriba, las clases sin profesor.
        await expect(page.getByRole('heading', { name: 'Profesores' })).toBeVisible({ timeout: 60000 });
        await expect(page.getByRole('button', { name: /clases? sin profesor/ })).toBeVisible();
        await expect(page.getByRole('meter', { name: 'Horas de clase' }).first()).toBeVisible();
        await page.screenshot({ path: 'test-results/evidencia/profesores-lista.png', fullPage: true });

        await page.getByPlaceholder('Buscar profesor').fill(c.nombre);
        await page.getByRole('link', { name: new RegExp(c.nombre) }).first().click();
        await expect(page.getByRole('heading', { name: c.nombre })).toBeVisible({ timeout: 60000 });
        const cifras = page.getByRole('region', { name: 'Sus cifras' });
        const horasAntes = Number(((await cifras.locator('p').first().textContent()) ?? '').split('/')[0].trim().replace(',', '.'));

        // Las horas de su cargo: 1 h, para que pase a «Se pasa» si ya tiene clases.
        await page.getByRole('button', { name: 'Opciones del profesor' }).click();
        await page.getByRole('button', { name: /Horas de su cargo/ }).click();
        const ventana = page.getByRole('dialog', { name: 'Horas de su cargo' });
        await ventana.getByLabel('Horas a la semana').fill('1');
        await ventana.getByRole('button', { name: 'Guardar' }).click();
        await expect(ventana).toBeHidden({ timeout: 15000 });
        await expect(cifras).toContainText('/ 1 h');
        await expect(page.getByText(/1 h de cargo/)).toBeVisible();
        const [u] = await queryTenantDb(`SELECT "horasDelCargo" FROM users WHERE id = $1`, [c.profe]);
        expect(u.horasDelCargo).toBe(1);

        // Asignarle la clase sin profesor desde su ficha.
        await page.getByRole('button', { name: 'Opciones del profesor' }).click();
        await page.getByRole('button', { name: /Asignar clase/ }).click();
        const hoja = page.getByRole('dialog', { name: 'Asignar clase' });
        await hoja.getByRole('button', { name: new RegExp(c.seccion) }).first().click();
        await hoja.getByRole('button', { name: new RegExp(`${c.materia}.*Asignar`) }).first().click();
        const asignar = page.getByRole('dialog', { name: 'Asignar profesor' });
        await expect(asignar).toContainText(c.nombre);
        await expect(asignar).toContainText(/→/);
        await asignar.getByRole('button', { name: 'Asignar', exact: true }).click();
        await expect(asignar).toBeHidden({ timeout: 15000 });
        await expect(page.getByRole('link', { name: new RegExp(`${c.materia} · ${c.seccion}`) })).toBeVisible({ timeout: 15000 });
        const horasDespues = Number(((await cifras.locator('p').first().textContent()) ?? '').split('/')[0].trim().replace(',', '.'));
        expect(horasDespues).toBeGreaterThan(horasAntes);
        await expect(cifras).toContainText('Se pasa');
        await page.screenshot({ path: 'test-results/evidencia/profesor-ficha.png', fullPage: true });

        const [cs] = await queryTenantDb(`SELECT "teacherId" FROM classroom_subjects WHERE "classroomId" = $1 AND "subjectId" = $2`, [c.classroomId, c.subjectId]);
        expect(cs.teacherId).toBe(c.profe);

        // En el teléfono: nada se sale de ancho.
        await page.setViewportSize({ width: 412, height: 915 });
        await page.waitForTimeout(400);
        const sobra = await page.evaluate(() => document.documentElement.scrollWidth - (window.visualViewport?.width ?? window.innerWidth));
        expect(sobra).toBeLessThanOrEqual(1);
        await page.screenshot({ path: 'test-results/evidencia/profesor-ficha-telefono.png', fullPage: true });
        await page.goto(`${WEB_BASE}/dashboard/profesores`);
        await expect(page.getByRole('meter', { name: 'Horas de clase' }).first()).toBeVisible({ timeout: 60000 });
        await page.screenshot({ path: 'test-results/evidencia/profesores-lista-telefono.png', fullPage: true });
    } catch (error) {
        await captureEvidence(testInfo, page, 'PROF-UI-01', 'La carga de los profesores', error);
        throw error;
    }
});
