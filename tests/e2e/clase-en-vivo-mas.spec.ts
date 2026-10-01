import { test, expect } from '@playwright/test';
import axios from 'axios';
import { API_BASE, TENANT_SLUG, WEB_BASE, loginApi, loginViaUI, captureEvidence, queryTenantDb } from './helpers';

/**
 * LA CLASE EN VIVO: ELEGIR CÓMO PASAR ASISTENCIA (TELÉFONO) Y EVALUAR DE OTRA
 * FORMA A UN ALUMNO
 *
 *  · En el teléfono, «Pasar asistencia» pregunta cómo: a mano, enseñar el QR o
 *    escanear a cada alumno. Fuera de ese modo no hay botones de asistencia:
 *    nadie marca por accidente.
 *  · Al calificar una actividad, a un alumno se le puede evaluar de otra forma
 *    (el cuaderno de quien no puede hacer deporte). Su nota cuenta igual.
 */

let clase: { classroom_id: string; subject_id: string; profe_email: string };

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

test.describe('En el teléfono', () => {
    test.use({ viewport: { width: 412, height: 860 }, isMobile: true, hasTouch: true });

    test('CLASE-UI-05: «Pasar asistencia» ofrece las tres formas; fuera del modo no hay botones de asistencia', async ({ page }, testInfo) => {
        try {
            await loginViaUI(page, clase.profe_email, '123456');
            await page.goto(`${WEB_BASE}/dashboard/clase-en-vivo/${clase.classroom_id}/${clase.subject_id}`);

            const boton = page.getByRole('button', { name: /Pasar asistencia|Corregir asistencia/i });
            await expect(boton).toBeVisible({ timeout: 30000 });
            // Fuera del modo: la asistencia solo se ve.
            await expect(page.getByRole('button', { name: /^Ausente$/ })).toHaveCount(0);

            await boton.click();
            const elegir = page.getByRole('dialog', { name: /pasar asistencia/i });
            await expect(elegir).toBeVisible();
            await expect(elegir.getByRole('button', { name: /Marcar a mano/ })).toBeVisible();
            // El QR depende de que el liceo lo tenga encendido.
            const conQr = await elegir.getByRole('button', { name: /Enseñar el QR/ }).count();
            if (conQr) await expect(elegir.getByRole('button', { name: /Escanear el QR/ })).toBeVisible();

            await elegir.getByRole('button', { name: /Marcar a mano/ }).click();
            await expect(page.getByRole('button', { name: /Terminar asistencia/ })).toBeVisible();
        } catch (error) {
            await captureEvidence(testInfo, page, 'CLASE-UI-05', 'Elegir cómo pasar asistencia en el teléfono', error);
            throw error;
        }
    });
});

test.describe('Evaluar de otra forma', () => {
    const TITULO = `Circuito e2e ${Date.now()}`;
    let actividadId = '';

    // Por la API, como la crea el profesor: así se entera la memoria rápida
    // del servidor (un INSERT a mano no la invalida y la clase no la enseñaba).
    test.beforeAll(async () => {
        const { accessToken } = await loginApi(clase.profe_email);
        const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Caracas' });
        const { data } = await axios.post(
            `${API_BASE}/sessions/activities`,
            { classroomId: clase.classroom_id, subjectId: clase.subject_id, title: TITULO, type: 'ACTIVIDAD', target: 'CURRENT', dueDate: `${hoy}T12:00:00`, maxScore: 20 },
            { headers: { Authorization: `Bearer ${accessToken}`, 'X-Institute-Slug': TENANT_SLUG } }
        );
        actividadId = data?.activity?.id ?? data?.id;
    });

    test.afterAll(async () => {
        if (actividadId) await queryTenantDb(`DELETE FROM class_activities WHERE id = $1`, [actividadId]);
    });

    test('OTRA-UI-01: al calificar, a un alumno se le anota «Cuaderno» y se ve en su fila', async ({ page }, testInfo) => {
        try {
            await loginViaUI(page, clase.profe_email, '123456');
            await page.goto(`${WEB_BASE}/dashboard/clase-en-vivo/${clase.classroom_id}/${clase.subject_id}`);
            await page.getByRole('button', { name: new RegExp(TITULO) }).first().click({ timeout: 30000 });

            const otra = page.getByRole('button', { name: /de otra forma/ }).first();
            await expect(otra).toBeVisible();
            await otra.click();
            const dialogo = page.getByRole('dialog', { name: /Evaluar de otra forma/ });
            await dialogo.getByLabel('Cómo se le evalúa').fill('Cuaderno');
            await dialogo.getByLabel(/Por qué/).fill('Reposo médico');
            await dialogo.getByRole('button', { name: 'Guardar' }).click();

            await expect(page.getByRole('button', { name: /evaluado con Cuaderno/ }).first()).toBeVisible({ timeout: 15000 });
            const [guardada] = await queryTenantDb(`SELECT "evaluadoDeOtraForma" AS o FROM class_activities WHERE id = $1`, [actividadId]);
            expect(Object.values(guardada.o)).toEqual([{ metodo: 'Cuaderno', motivo: 'Reposo médico' }]);
            await page.screenshot({ path: 'test-results/evidencia/evaluar-de-otra-forma.png' });
        } catch (error) {
            await captureEvidence(testInfo, page, 'OTRA-UI-01', 'Evaluar de otra forma', error);
            throw error;
        }
    });
});
