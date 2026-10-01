import { test, expect } from '@playwright/test';
import { WEB_BASE, loginApi, injectSessionCookies, queryTenantDb } from './helpers';

/**
 * EL EDITOR DEL PLAN: ORDENAR LAS COLUMNAS (29-09-2026)
 *
 * Lo pidió el dueño: una columna nueva se arrastra hasta donde el profesor la
 * quiera. Con el ratón, por su manija; con el teclado, flechas sobre ella.
 * No guarda nada: sale del editor sin «Guardar».
 */
test('PLAN-EDIT-01: una columna nueva se arrastra a su sitio, y con las flechas también', async ({ page }, testInfo) => {
    const [f] = await queryTenantDb<{ ciclo: string; seccion: string; materia: string; profe: string }>(
        `SELECT ay.name AS ciclo, cl.slug AS seccion, s.slug AS materia, u.email AS profe
           FROM classroom_subjects cs JOIN users u ON u.id = cs."teacherId" AND u."isActive"
           JOIN classrooms cl ON cl.id = cs."classroomId"
           JOIN academic_years ay ON ay.id = cl."academicYearId" AND ay.status = 'ACTIVE'
           JOIN subjects s ON s.id = cs."subjectId" ORDER BY cl.grade, cl.section, s.name LIMIT 1`
    );
    await page.setViewportSize({ width: 1400, height: 900 });
    await injectSessionCookies(page, await loginApi(f.profe, '123456'));
    await page.goto(`${WEB_BASE}/dashboard/academico/${f.ciclo}/${f.seccion}/${f.materia}`);
    await page.getByRole('tab', { name: /Plan de Evaluación/ }).or(page.getByRole('button', { name: /Plan de Evaluación/ })).first().click({ timeout: 60000 });
    await page.getByRole('button', { name: /Editar Plan/ }).first().click({ timeout: 60000 });
    const editor = page.getByRole('dialog', { name: /Editor Inmersivo/ });
    await expect(editor).toBeVisible({ timeout: 30000 });

    const nombres = () => editor.locator('thead th textarea').evaluateAll((ts) => ts.map((t) => (t as HTMLTextAreaElement).value));
    const antes = await nombres();
    await editor.getByRole('button', { name: 'Columna', exact: true }).click();
    expect((await nombres()).at(-1)).toBe('Nueva Columna');

    // Con el ratón: la manija de la nueva, soltada tres columnas a la izquierda.
    const n = antes.length;
    const manija = editor.getByRole('button', { name: 'Mover la columna Nueva Columna (flechas izquierda y derecha)' });
    await manija.dragTo(editor.locator('thead th').nth(n - 2)); // +1 por «Semana»
    await expect.poll(nombres).toEqual([...antes.slice(0, n - 3), 'Nueva Columna', ...antes.slice(n - 3)]);

    // Con el teclado: dos veces a la izquierda.
    await manija.focus();
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await expect.poll(nombres).toEqual([...antes.slice(0, n - 5), 'Nueva Columna', ...antes.slice(n - 5)]);
    await page.screenshot({ path: testInfo.outputPath('editor-del-plan.png') });
});
