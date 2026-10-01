import { test, expect } from '@playwright/test';
import axios from 'axios';
import { API_BASE, WEB_BASE, TENANT_SLUG, loginApi, loginViaUI, captureEvidence, queryTenantDb } from './helpers';

/**
 * SUSPENDER Y REEMPLAZAR, EN EL NAVEGADOR
 *
 * El servidor ya lo prueba (`reemplazar-clase-suspendida.test.ts`). Aquí:
 *   · el profesor NO ve el botón de suspender;
 *   · el admin abre el diálogo propio (ya no el `prompt` del navegador), elige
 *     otra materia y queda el reemplazo;
 *   · el profesor que entra lo ve en su lista.
 *
 * Fecha lejana (lunes 1-3-2027) para no tocar los días de uso del liceo de
 * pruebas; se limpia al terminar.
 */

const LUNES = '2027-03-01';

test.describe('Suspender y reemplazar una clase', () => {
    let caso: { classroom_id: string; sale_id: string; entra_id: string; entra_nombre: string; profe_email: string; profe_id: string };

    const api = (token: string) =>
        axios.create({
            baseURL: API_BASE,
            headers: { Authorization: `Bearer ${token}`, 'X-Institute-Slug': TENANT_SLUG },
            validateStatus: () => true,
        });

    test.beforeAll(async () => {
        // Una clase del lunes y otra materia de la MISMA sección cuyo profesor
        // está libre a esa hora (ni clase ni hora personal que se solape).
        [caso] = await queryTenantDb(
            `SELECT b."classroomId" AS classroom_id, cs."subjectId" AS sale_id,
                    otra."subjectId" AS entra_id, s.name AS entra_nombre, u.email AS profe_email, u.id AS profe_id
             FROM schedule_blocks b
             JOIN classroom_subjects cs ON cs.id = b."classroomSubjectId"
             JOIN classrooms cl ON cl.id = b."classroomId"
             JOIN academic_years ay ON ay.id = cl."academicYearId" AND ay.status = 'ACTIVE'
             JOIN classroom_subjects otra ON otra."classroomId" = b."classroomId" AND otra."subjectId" <> cs."subjectId" AND otra."teacherId" IS NOT NULL
             JOIN subjects s ON s.id = otra."subjectId"
             JOIN users u ON u.id = otra."teacherId" AND u."isActive" = true
             WHERE b."dayOfWeek" = 1 AND b."blockType" = 'CLASS'
               AND NOT EXISTS (
                 SELECT 1 FROM schedule_blocks x
                 LEFT JOIN classroom_subjects xc ON xc.id = x."classroomSubjectId"
                 WHERE x."dayOfWeek" = 1
                   AND (xc."teacherId" = otra."teacherId" OR x."teacherId" = otra."teacherId")
                   AND EXISTS (
                     SELECT 1 FROM schedule_blocks y
                     WHERE y."classroomId" = b."classroomId" AND y."classroomSubjectId" = cs.id AND y."dayOfWeek" = 1
                       AND x."startTime" < y."endTime" AND y."startTime" < x."endTime"))
             LIMIT 1`
        );
    });

    test.afterAll(async () => {
        if (!caso) return;
        await queryTenantDb(`DELETE FROM class_replacements WHERE "classroomId" = $1 AND date = $2`, [caso.classroom_id, LUNES]);
        await queryTenantDb(`DELETE FROM class_sessions WHERE "classroomId" = $1 AND date = $2`, [caso.classroom_id, LUNES]);
        await queryTenantDb(`DELETE FROM notifications WHERE type = 'CLASS_REPLACEMENT' AND message LIKE $1`, [`%${LUNES}%`]);
    });

    test('SUSP-UI-01: el profesor no ve "Suspender"', async ({ page }, testInfo) => {
        try {
            expect(caso, 'hace falta una clase con un posible reemplazo libre en la base de pruebas').toBeTruthy();
            const [profe] = await queryTenantDb(
                `SELECT u.email FROM classroom_subjects cs JOIN users u ON u.id = cs."teacherId"
                 WHERE cs."classroomId" = $1 AND cs."subjectId" = $2`,
                [caso.classroom_id, caso.sale_id]
            );
            await loginViaUI(page, profe.email, '123456');
            await page.goto(`${WEB_BASE}/dashboard/clase-en-vivo/${caso.classroom_id}/${caso.sale_id}?date=${LUNES}`);
            // (El botón «Guardar» ya no existe: la clase se guarda sola.)
            await expect(page.getByRole('button', { name: /Observación/i }).first()).toBeVisible({ timeout: 30000 });
            await expect(page.getByRole('button', { name: /Suspender/i })).toHaveCount(0);
        } catch (error) {
            await captureEvidence(testInfo, page, 'SUSP-UI-01', 'Profesor sin botón', error);
            throw error;
        }
    });

    test('SUSP-UI-02: el admin suspende poniendo otra materia y el profesor que entra lo ve', async ({ page }, testInfo) => {
        try {
            await loginViaUI(page, 'admin@testing.edu.ve', '123456');
            await page.goto(`${WEB_BASE}/dashboard/clase-en-vivo/${caso.classroom_id}/${caso.sale_id}?date=${LUNES}`);

            await page.getByRole('button', { name: /Suspender/i }).first().click();
            const dialogo = page.getByRole('dialog');
            await expect(dialogo).toBeVisible();
            await dialogo.getByPlaceholder(/reposo/).fill('Prueba automática');
            await dialogo.getByRole('radio', { name: new RegExp(caso.entra_nombre) }).click();
            await page.screenshot({ path: 'test-results/evidencia/suspender-dialogo.png' });
            await dialogo.getByRole('button', { name: 'Suspender y reemplazar' }).click();
            await expect(dialogo).toBeHidden({ timeout: 15000 });

            const filas = await queryTenantDb(
                `SELECT "subjectId", "teacherId" FROM class_replacements WHERE "classroomId" = $1 AND date = $2`,
                [caso.classroom_id, LUNES]
            );
            expect(filas.length).toBeGreaterThan(0);
            expect(filas.every((f: any) => f.subjectId === caso.entra_id && f.teacherId === caso.profe_id)).toBe(true);

            const profe = await loginApi(caso.profe_email, '123456');
            const suyos = await api(profe.accessToken).get('/class-replacements', {
                params: { teacherId: caso.profe_id, from: LUNES, to: LUNES },
            });
            expect(suyos.status).toBe(200);
            expect(suyos.data.replacements.length).toBe(filas.length);
        } catch (error) {
            await captureEvidence(testInfo, page, 'SUSP-UI-02', 'Suspender y reemplazar', error);
            throw error;
        }
    });
});

/**
 * El carril "Horario en vivo" enseña el día de HOY, así que esta prueba usa la
 * fecha del liceo de hoy y lo deja todo como estaba al terminar.
 */
test.describe('El reemplazo en el horario en vivo', () => {
    let hoy: string;
    let caso: any;

    test.beforeAll(async () => {
        const admin = await loginApi('admin@testing.edu.ve', '123456');
        const tiempo = await axios.get(`${API_BASE}/time`, {
            headers: { Authorization: `Bearer ${admin.accessToken}`, 'X-Institute-Slug': TENANT_SLUG },
        });
        hoy = tiempo.data.date;
        const dow = new Date(`${hoy}T00:00:00Z`).getUTCDay();
        [caso] = await queryTenantDb(
            `SELECT b."classroomId" AS classroom_id, cs."subjectId" AS sale_id, sale.name AS sale_nombre,
                    otra."subjectId" AS entra_id, s.name AS entra_nombre, cl.slug AS seccion, ay.name AS ciclo
             FROM schedule_blocks b
             JOIN classroom_subjects cs ON cs.id = b."classroomSubjectId"
             JOIN subjects sale ON sale.id = cs."subjectId"
             JOIN classrooms cl ON cl.id = b."classroomId"
             JOIN academic_years ay ON ay.id = cl."academicYearId" AND ay.status = 'ACTIVE'
             JOIN classroom_subjects otra ON otra."classroomId" = b."classroomId" AND otra."subjectId" <> cs."subjectId" AND otra."teacherId" IS NOT NULL
             JOIN subjects s ON s.id = otra."subjectId"
             WHERE b."dayOfWeek" = $1 AND b."blockType" = 'CLASS'
             LIMIT 1`,
            [dow]
        );
    });

    test.afterAll(async () => {
        if (!caso) return;
        await queryTenantDb(`DELETE FROM class_replacements WHERE "classroomId" = $1 AND date = $2 AND reason = 'e2e'`, [caso.classroom_id, hoy]);
    });

    test('SUSP-UI-03: la tarjeta muestra la materia que entra y a quién reemplaza', async ({ page }, testInfo) => {
        test.skip(!caso, 'Hoy no hay clases en el horario (fin de semana)');
        try {
            // Se inserta directo: lo que se prueba aquí es cómo se VE, no las
            // reglas de crear (esas las prueba el servidor).
            const [prof] = await queryTenantDb(
                `SELECT "teacherId" FROM classroom_subjects WHERE "classroomId" = $1 AND "subjectId" = $2`,
                [caso.classroom_id, caso.entra_id]
            );
            const [bloque] = await queryTenantDb(
                `SELECT b."startTime", b."endTime" FROM schedule_blocks b JOIN classroom_subjects cs ON cs.id = b."classroomSubjectId"
                 WHERE b."classroomId" = $1 AND cs."subjectId" = $2 AND b."dayOfWeek" = $3 ORDER BY b."startTime" LIMIT 1`,
                [caso.classroom_id, caso.sale_id, new Date(`${hoy}T00:00:00Z`).getUTCDay()]
            );
            await queryTenantDb(
                `INSERT INTO class_replacements (id, "classroomId", date, "startTime", "endTime", "suspendedSubjectId", "subjectId", "teacherId", reason, "updatedAt")
                 VALUES ('e2e-' || md5(random()::text), $1, $2, $3, $4, $5, $6, $7, 'e2e', now())`,
                [caso.classroom_id, hoy, bloque.startTime, bloque.endTime, caso.sale_id, caso.entra_id, prof.teacherId]
            );

            await loginViaUI(page, 'admin@testing.edu.ve', '123456');
            await page.goto(`${WEB_BASE}/dashboard/academico/${caso.ciclo}/${caso.seccion}`);
            const marca = page.getByText(`Reemplaza a ${caso.sale_nombre}`).first();
            await expect(marca).toBeVisible({ timeout: 30000 });
            await marca.scrollIntoViewIfNeeded();
            await page.screenshot({ path: 'test-results/evidencia/reemplazo-en-vivo.png' });
        } catch (error) {
            await captureEvidence(testInfo, page, 'SUSP-UI-03', 'Reemplazo en el carril', error);
            throw error;
        }
    });
});
