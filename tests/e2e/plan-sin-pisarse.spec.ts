import { test, expect } from '@playwright/test';
import axios from 'axios';
import { API_BASE, WEB_BASE, TENANT_SLUG, loginApi, loginViaUI, captureEvidence, queryTenantDb } from './helpers';

/**
 * EL PLAN DE EVALUACIÓN, EDITADO EN DOS SITIOS A LA VEZ
 *
 * Antes pasaban dos cosas, las dos sin ningún aviso:
 *
 *   · Mientras el profesor editaba, cualquier lectura nueva del plan —y llega
 *     una tras CUALQUIER guardado del sistema, o con cada aviso de tiempo
 *     real— copiaba lo del servidor encima de lo que estaba escribiendo.
 *   · Si guardaba desde una pestaña vieja, borraba lo que había añadido en la
 *     nueva.
 *
 * Aquí el profesor tiene el editor abierto, «otra pestaña» guarda por la API, y
 * al guardar él: sale el aviso, su trabajo sigue en pantalla y no se ha pisado
 * nada. Luego elige cargar lo guardado y ve lo de la otra pestaña.
 */

const PROFE = 'profesor3@testing.edu.ve';
const MATERIA = 'materia-mate';

test.describe('El plan no se pisa', () => {
    let ciclo: string;
    let seccion: string;
    let classroomId: string;
    let subjectId: string;
    let token: string;

    const api = () =>
        axios.create({
            baseURL: API_BASE,
            headers: { Authorization: `Bearer ${token}`, 'X-Institute-Slug': TENANT_SLUG },
            validateStatus: () => true,
        });

    test.beforeAll(async () => {
        token = (await loginApi(PROFE, '123456')).accessToken;
        const filas = await queryTenantDb(
            `SELECT ay.name AS ciclo, cl.slug AS seccion, cl.id AS "classroomId", s.id AS "subjectId"
             FROM classroom_subjects cs
             JOIN classrooms cl ON cl.id = cs."classroomId"
             JOIN subjects s ON s.id = cs."subjectId"
             JOIN academic_years ay ON ay.id = cl."academicYearId"
             JOIN users u ON u.id = cs."teacherId"
             WHERE ay.status = 'ACTIVE' AND u.email = $1 AND s.slug = $2
             ORDER BY cl.grade, cl.section
             LIMIT 1`,
            [PROFE, MATERIA]
        );
        ({ ciclo, seccion, classroomId, subjectId } = filas[0] ?? {});
    });

    test('PLANUI-01: si otra pestaña guardó, se avisa y no se pierde ni se pisa nada', async ({ page }, testInfo) => {
        let lapso = '1';
        let original: any[] = [];
        try {
            expect(classroomId).toBeTruthy();

            await loginViaUI(page, PROFE, '123456');
            const lectura = page.waitForResponse((r) => r.url().includes('/evaluation-plan/rows') && r.request().method() === 'GET');
            await page.goto(`${WEB_BASE}/dashboard/academico/${ciclo}/${seccion}/${MATERIA}`);
            await page.getByRole('button', { name: /Plan de Evaluaci.n \/ Calificaciones/i }).click();
            lapso = new URL((await lectura).url()).searchParams.get('lapso') || '1';

            const antes = (await api().get('/evaluation-plan/rows', { params: { classroomId, subjectId, lapso } })).data;
            original = antes.rows ?? [];

            // El profesor abre el editor.
            await page.getByRole('button', { name: /Editar Plan/i }).click();
            await expect(page.getByRole('button', { name: /Guardar y Cerrar/i })).toBeVisible({ timeout: 20000 });

            // «Otra pestaña» guarda: un criterio que dice de dónde viene.
            const marca = `Otra pestaña ${Date.now()}`;
            // En la fila EVALUATION: es la que la pantalla enseña en la columna
            // «Actividad» (las HEADER/TEXT/FIELD de la misma semana se funden
            // con ella y la de EVALUATION va la última).
            const primera = original.findIndex((r: any) => r.rowType === 'EVALUATION');
            const deLaOtra = primera >= 0
                ? original.map((r: any, i: number) => (i === primera ? { ...r, actividadEval: marca } : r))
                : [{ id: 'new_1', rowType: 'EVALUATION', weekNumber: 1, actividadEval: marca, puntos: 20 }];
            const otra = await api().post('/evaluation-plan/rows/batch', {
                classroomId, subjectId, lapso, rows: deLaOtra, version: antes.version,
            });
            expect(otra.status).toBe(200);

            // Él guarda lo suyo, que era lo de antes.
            await page.getByRole('button', { name: /Guardar y Cerrar/i }).click();

            // Sale el aviso, y el editor sigue abierto con su trabajo.
            const aviso = page.getByRole('alert').filter({ hasText: /otro sitio/i });
            await expect(aviso).toBeVisible({ timeout: 20000 });
            await expect(page.getByRole('button', { name: /Guardar y Cerrar/i })).toBeVisible();

            // En la base sigue lo de la otra pestaña: no se pisó.
            const tras = (await api().get('/evaluation-plan/rows', { params: { classroomId, subjectId, lapso } })).data;
            expect(tras.rows.map((r: any) => r.actividadEval)).toContain(marca);

            // Elige cargar lo guardado, y lo ve.
            await page.getByRole('button', { name: /cargar lo guardado/i }).click();
            await expect(page.getByText(marca).first()).toBeVisible({ timeout: 20000 });
        } catch (error) {
            await captureEvidence(testInfo, page, 'PLANUI-01', 'El plan no se pisa', error);
            throw error;
        } finally {
            // Se deja el plan como estaba: lo usan otras pruebas.
            if (classroomId) {
                const ahora = (await api().get('/evaluation-plan/rows', { params: { classroomId, subjectId, lapso } })).data;
                await api().post('/evaluation-plan/rows/batch', {
                    classroomId, subjectId, lapso, rows: original, version: ahora.version,
                });
            }
        }
    });
});
