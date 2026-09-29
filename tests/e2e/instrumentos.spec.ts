import { test, expect, Page } from '@playwright/test';
import { WEB_BASE, loginViaUI, captureEvidence, queryTenantDb } from './helpers';

/**
 * LOS INSTRUMENTOS DE EVALUACIÓN, COMO LOS USA EL PROFESOR
 *
 *   INSTR-UI-01  en el plan, «Armar instrumento» → lista de cotejo → guardado
 *   INSTR-UI-02  en la clase en vivo, «Dar Nota» → marcar casillas → la nota sale sola y se guarda
 *   INSTR-UI-03  el papel: los instrumentos con las notas y el acta de socialización, limpios
 */

let c: { ciclo: string; seccion: string; seccion_slug: string; materia: string; materia_slug: string; profe: string; fila: string; actividad: string };
// Fijo: si una prueba cae, el trabajador vuelve a cargar el archivo y un título
// con la hora sería otro. Lo que quede de una tanda anterior se limpia antes.
const TITULO = 'Cuaderno e2e (instrumentos)';

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
    [c] = await queryTenantDb(
        `SELECT ay.name AS ciclo, cl.id AS seccion, cl.slug AS seccion_slug, s.id AS materia, s.slug AS materia_slug, u.email AS profe,
                r.id AS fila, COALESCE(r."actividadEval", 'Evaluación') AS actividad
           FROM evaluation_plan_rows r
           JOIN classroom_subjects cs ON cs."classroomId" = r."classroomId" AND cs."subjectId" = r."subjectId"
           JOIN users u ON u.id = cs."teacherId" AND u."isActive"
           JOIN classrooms cl ON cl.id = r."classroomId"
           JOIN academic_years ay ON ay.id = cl."academicYearId" AND ay.status = 'ACTIVE'
           JOIN subjects s ON s.id = r."subjectId"
          WHERE r."rowType" = 'EVALUATION' AND r.puntos > 0 AND r.lapso = '1'
            AND EXISTS (SELECT 1 FROM student_classrooms sc WHERE sc."classroomId" = cl.id AND sc."isActive")
            AND NOT EXISTS (SELECT 1 FROM instrumentos_de_evaluacion i WHERE i."planRowId" = r.id)
          ORDER BY r."weekNumber" LIMIT 1`
    );
    await queryTenantDb(`DELETE FROM class_activities WHERE title = $1`, [TITULO]);
});

test.afterAll(async () => {
    if (!c) return;
    await queryTenantDb(`DELETE FROM class_activities WHERE title = $1`, [TITULO]);
    await queryTenantDb(`DELETE FROM instrumentos_de_evaluacion WHERE "planRowId" = $1`, [c.fila]);
});

async function alPlan(page: Page) {
    await loginViaUI(page, c.profe, '123456');
    await page.goto(`${WEB_BASE}/dashboard/academico/${c.ciclo}/${c.seccion_slug}/${c.materia_slug}`);
    await page.getByRole('button', { name: /Plan de Evaluación/ }).first().click({ timeout: 60000 });
}

test('INSTR-UI-01: armar una lista de cotejo en el plan', async ({ page }, testInfo) => {
    try {
        await alPlan(page);
        const seccion = page.getByRole('region', { name: 'Instrumentos de evaluación' });
        await expect(seccion).toBeVisible({ timeout: 60000 });
        await seccion.getByRole('button', { name: 'Armar instrumento' }).first().click();
        const ventana = page.getByRole('dialog', { name: 'Instrumento de evaluación' });
        await ventana.getByRole('radio', { name: 'Lista de cotejo' }).click();
        await expect(ventana.getByText(/Vale 20 puntos en total/)).toBeVisible();
        await ventana.getByRole('button', { name: 'Guardar instrumento' }).click();
        await expect(ventana).toBeHidden({ timeout: 15000 });
        await expect(seccion.getByText(/Lista de cotejo · 5 criterios · vale 20/).first()).toBeVisible({ timeout: 15000 });
        // La evaluación que se armó (la primera sin instrumento de la lista).
        const [i] = await queryTenantDb(
            `SELECT i.tipo, i."planRowId" AS fila FROM instrumentos_de_evaluacion i JOIN evaluation_plan_rows r ON r.id = i."planRowId"
              WHERE r."classroomId" = $1 AND r."subjectId" = $2 ORDER BY i."createdAt" DESC LIMIT 1`,
            [c.seccion, c.materia]
        );
        expect(i?.tipo).toBe('COTEJO');
        c.fila = i.fila;
        await page.screenshot({ path: 'test-results/evidencia/instrumento-en-el-plan.png', fullPage: true });
    } catch (error) {
        await captureEvidence(testInfo, page, 'INSTR-UI-01', 'Armar un instrumento en el plan', error);
        throw error;
    }
});

test('INSTR-UI-02: calificar en la tabla de la clase, arrastrando cada indicador de 0 a lo que vale', async ({ page }, testInfo) => {
    try {
        // Una actividad de hoy de esa evaluación (la semana de hoy puede ser otra).
        await queryTenantDb(
            `INSERT INTO class_activities (id, title, type, target, tag, "maxScore", scores, "classroomId", "subjectId", "planRowId", "createdAt", "updatedAt")
             VALUES ('e2e' || floor(random()*1e12)::text, $1, 'TAREA', 'CURRENT', 'Tarea', 20, '{}'::jsonb, $2, $3, $4, now(), now())`,
            [TITULO, c.seccion, c.materia, c.fila]
        );
        await loginViaUI(page, c.profe, '123456');
        await page.goto(`${WEB_BASE}/dashboard/clase-en-vivo/${c.seccion}/${c.materia}`);
        const tarjeta = page.getByRole('heading', { name: TITULO }).locator('xpath=ancestor::div[.//button[normalize-space()="Dar Nota"]][1]');
        await tarjeta.getByRole('button', { name: 'Dar Nota' }).click({ timeout: 60000 });
        const calificar = page.getByRole('region', { name: 'Calificar con el instrumento' });
        await expect(calificar).toBeVisible({ timeout: 30000 });
        // La tabla de la clase cambia: una columna por indicador, y la nota al final.
        const tabla = calificar.getByRole('table', { name: 'Notas con el instrumento' });
        const primero = tabla.locator('tbody tr').first();
        // La portada está pero mal hecha: 1,5 de 2. Y la pulcritud, completa.
        await primero.getByRole('slider', { name: /Portada \(de 0 a 2\)/ }).fill('1.5');
        await primero.getByRole('slider', { name: /Pulcritud.*\(de 0 a 3\)/ }).fill('3');
        await expect(primero.getByText('4.5', { exact: true })).toBeVisible();
        await expect(primero.getByText('1,5', { exact: true })).toBeVisible();
        // Con el teclado también: «Fin» la lleva a lo que vale, y no más.
        await primero.getByRole('slider', { name: /Portada \(de 0 a 2\)/ }).press('End');
        await expect(primero.getByText('5', { exact: true })).toBeVisible();
        // Y la tabla de siempre no está debajo.
        await expect(page.getByText('NOTA DE ACTIVIDAD', { exact: false })).toHaveCount(0);
        await expect(calificar.getByText(/Guardado \d/)).toBeVisible({ timeout: 15000 });
        const [a] = await queryTenantDb(`SELECT scores, "detalleDelInstrumento" AS d FROM class_activities WHERE title = $1`, [TITULO]);
        expect(Object.values(a.scores)).toEqual([5]);
        await page.screenshot({ path: 'test-results/evidencia/calificar-con-instrumento.png', fullPage: true });
    } catch (error) {
        await captureEvidence(testInfo, page, 'INSTR-UI-02', 'Calificar con el instrumento', error);
        throw error;
    }
});

test('INSTR-UI-03: los instrumentos con las notas y el acta de socialización, en papel limpio', async ({ page }, testInfo) => {
    try {
        await loginViaUI(page, c.profe, '123456');
        await page.goto(`${WEB_BASE}/dashboard/instrumentos-de-evaluacion/${c.seccion}/${c.materia}?lapso=1&conNotas=1`);
        await expect(page.getByRole('article', { name: 'Instrumentos de evaluación' }).getByText(TITULO)).toBeVisible({ timeout: 60000 });
        await page.emulateMedia({ media: 'print' });
        await expect(page.getByRole('navigation', { name: 'Navegación principal' })).toHaveCount(0);
        await page.screenshot({ path: 'test-results/evidencia/instrumentos-impresos.png', fullPage: true });

        await page.emulateMedia({ media: 'screen' });
        await page.goto(`${WEB_BASE}/dashboard/acta-de-socializacion/${c.seccion}/${c.materia}?lapso=1`);
        const acta = page.getByRole('article', { name: 'Acta de socialización del plan' });
        await expect(acta.getByText(/firman conforme/)).toBeVisible({ timeout: 60000 });
        await expect(acta.getByRole('table').first().getByRole('row')).toHaveCount(21);
        await page.emulateMedia({ media: 'print' });
        await page.screenshot({ path: 'test-results/evidencia/acta-de-socializacion.png', fullPage: true });
    } catch (error) {
        await captureEvidence(testInfo, page, 'INSTR-UI-03', 'Papeles del plan', error);
        throw error;
    }
});
