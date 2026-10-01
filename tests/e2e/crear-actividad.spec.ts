import { test, expect, Page } from '@playwright/test';
import { WEB_BASE, loginViaUI, captureEvidence, queryTenantDb } from './helpers';

/**
 * CREAR UNA ACTIVIDAD PULSANDO «NUEVA ACTIVIDAD», COMO EL PROFESOR
 *
 * Cristian (2026-09-27): «no puedo crear actividades». El servidor respondía
 * 201, pero la actividad no salía: un día sin asistencia guardada no tenía
 * sesión, y sin sesión la actividad se fechaba por su creación en UTC. Ninguna
 * prueba pulsaba el botón: la que había la creaba por la API con una fecha de
 * entrega que la ventana real nunca manda. Aquí se pulsa, hoy y un día pasado.
 */

let clase: { classroom_id: string; subject_id: string; profe_email: string };
const creadas: string[] = [];
const sesionesNuevas: string[] = [];

const hoyEnCaracas = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Caracas' });
const haceDias = (n: number) => {
    const [y, m, d] = hoyEnCaracas().split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d - n)).toISOString().slice(0, 10);
};

test.beforeAll(async () => {
    [clase] = await queryTenantDb(
        `SELECT cs."classroomId" AS classroom_id, cs."subjectId" AS subject_id, u.email AS profe_email
           FROM classroom_subjects cs
           JOIN users u ON u.id = cs."teacherId" AND u."isActive" = true
           JOIN classrooms c ON c.id = cs."classroomId"
           JOIN academic_years ay ON ay.id = c."academicYearId" AND ay.status = 'ACTIVE'
          WHERE EXISTS (SELECT 1 FROM student_classrooms sc WHERE sc."classroomId" = cs."classroomId" AND sc."isActive" = true)
          LIMIT 1`
    );
});

test.afterAll(async () => {
    if (creadas.length) await queryTenantDb(`DELETE FROM class_activities WHERE title = ANY($1)`, [creadas]);
    if (sesionesNuevas.length) await queryTenantDb(`DELETE FROM class_sessions WHERE id = ANY($1)`, [sesionesNuevas]);
});

async function sesionDe(dia: string): Promise<string | null> {
    const [s] = await queryTenantDb(
        `SELECT id FROM class_sessions WHERE "classroomId" = $1 AND "subjectId" = $2 AND date::date = $3::date`,
        [clase.classroom_id, clase.subject_id, dia]
    );
    return s?.id ?? null;
}

async function crearPulsando(page: Page, dia: string | null, titulo: string) {
    const antes = await sesionDe(dia ?? hoyEnCaracas());
    await loginViaUI(page, clase.profe_email, '123456');
    await page.goto(`${WEB_BASE}/dashboard/clase-en-vivo/${clase.classroom_id}/${clase.subject_id}${dia ? `?date=${dia}` : ''}`);
    await page.getByRole('button', { name: 'Nueva Actividad' }).click({ timeout: 30000 });
    const ventana = page.getByRole('dialog', { name: /Nueva actividad/i });
    await ventana.getByPlaceholder(/Ej: Tarea 1/).fill(titulo);
    // Si la semana tiene varias evaluaciones en el plan, se elige la primera.
    const elegir = ventana.getByLabel(/A qué evaluación del plan suma/);
    if (await elegir.count()) await elegir.selectOption({ index: 1 });
    await ventana.getByRole('button', { name: 'Crear Actividad' }).click();
    creadas.push(titulo);
    await expect(ventana).toBeHidden({ timeout: 15000 });
    // Sale en «Clase de hoy» de ESA clase, que es lo que no pasaba.
    await expect(page.getByRole('heading', { name: titulo })).toBeVisible({ timeout: 15000 });
    const despues = await sesionDe(dia ?? hoyEnCaracas());
    if (!antes && despues) sesionesNuevas.push(despues);
    const [guardada] = await queryTenantDb(`SELECT "classSessionId" AS s FROM class_activities WHERE title = $1`, [titulo]);
    expect(guardada.s).toBe(despues);
}

test('CLASE-UI-06: pulsar «Nueva Actividad» en la clase de hoy y verla en la lista', async ({ page }, testInfo) => {
    try {
        await crearPulsando(page, null, `Hoy e2e ${Date.now()}`);
        await page.screenshot({ path: 'test-results/evidencia/crear-actividad-hoy.png' });
    } catch (error) {
        await captureEvidence(testInfo, page, 'CLASE-UI-06', 'Crear actividad hoy', error);
        throw error;
    }
});

test('CLASE-UI-07: pulsar «Nueva Actividad» en una clase pasada y verla en ESA clase', async ({ page }, testInfo) => {
    try {
        await crearPulsando(page, haceDias(6), `Pasada e2e ${Date.now()}`);
        await page.screenshot({ path: 'test-results/evidencia/crear-actividad-dia-pasado.png' });
    } catch (error) {
        await captureEvidence(testInfo, page, 'CLASE-UI-07', 'Crear actividad en un día pasado', error);
        throw error;
    }
});
