import { test, expect } from '@playwright/test';
import { WEB_BASE, loginApi, injectSessionCookies, captureEvidence, queryTenantDb } from './helpers';

/**
 * LA MATERIA PENDIENTE, EN LA PANTALLA (como una clase, desde 2026-10-12)
 *
 * Una pendiente de prueba (nace al cerrar un año; aquí se pone a mano y se
 * quita al final) en la clase de su materia y grado. El profesor de esa clase
 * la abre en la pestaña «Pendientes» de la materia, reprueba la 1ª opción del
 * 1er momento y la aprueba en la 2ª; el guía (aquí, el admin) la ve en la
 * sección del alumno, y la boleta, el acta del momento y el acta de
 * compromiso lo dicen. Las reglas las prueban PEND-01…20.
 */

test.describe('Materias pendientes', () => {
    const id = `cpendqa${Date.now()}`;
    let caso: {
        alumnoId: string;
        firstName: string;
        lastName: string;
        claseId: string;
        ciclo: string;
        seccionDeLaClase: string;
        materiaSlug: string;
        profeId: string;
        profeEmail: string;
        seccionDelAlumno: string;
    };

    test.beforeAll(async () => {
        // Una clase de una materia con nota, con profesor, y un alumno de un grado más arriba.
        [caso] = await queryTenantDb(
            `SELECT u.id AS "alumnoId", u."firstName", u."lastName", cs.id AS "claseId", ay.name AS ciclo, c.slug AS "seccionDeLaClase",
                    COALESCE(s.slug, s.id) AS "materiaSlug", t.id AS "profeId", t.email AS "profeEmail", c2.slug AS "seccionDelAlumno",
                    cs."subjectId", c.grade, ay.id AS "cicloId"
               FROM classroom_subjects cs
               JOIN classrooms c ON c.id = cs."classroomId"
               JOIN academic_years ay ON ay.id = c."academicYearId" AND ay.status = 'ACTIVE'
               JOIN subjects s ON s.id = cs."subjectId" AND s.evaluacion = 'NUMERICA'
               JOIN users t ON t.id = cs."teacherId" AND t."isActive"
               JOIN classrooms c2 ON c2."academicYearId" = ay.id AND c2.grade = c.grade + 1
               JOIN student_classrooms sc ON sc."classroomId" = c2.id AND sc."isActive"
               JOIN users u ON u.id = sc."studentId" AND u."isActive"
              WHERE NOT EXISTS (SELECT 1 FROM materias_pendientes mp WHERE mp."studentId" = u.id AND mp."subjectId" = cs."subjectId")
              ORDER BY c.grade, c.section, u."lastName" LIMIT 1`
        );
        const [extra] = await queryTenantDb(
            `SELECT cs."subjectId", c.grade, c."academicYearId" FROM classroom_subjects cs JOIN classrooms c ON c.id = cs."classroomId" WHERE cs.id = $1`,
            [caso.claseId]
        );
        await queryTenantDb(
            `INSERT INTO materias_pendientes (id, "studentId", "subjectId", "gradoDeOrigen", "cicloDeOrigenId", "notaDeOrigen", "cicloId", "claseId", estado, "updatedAt")
             VALUES ($1, $2, $3, $4, $5, 7, $5, $6, 'PENDIENTE', now())`,
            [id, caso.alumnoId, extra.subjectId, extra.grade, extra.academicYearId, caso.claseId]
        );
    });

    test.afterAll(async () => {
        await queryTenantDb(`DELETE FROM opciones_de_pendientes WHERE "materiaPendienteId" = $1`, [id]);
        await queryTenantDb(`DELETE FROM evaluaciones_de_pendientes WHERE "materiaPendienteId" = $1`, [id]);
        await queryTenantDb(`DELETE FROM materias_pendientes WHERE id = $1`, [id]);
    });

    test('PEND-UI-01: el profesor la evalúa en su clase (1ª y 2ª opción), la sección y los papeles lo dicen', async ({ page }, testInfo) => {
        try {
            const quien = `${caso.lastName}, ${caso.firstName}`;
            const profe = await loginApi(caso.profeEmail, '123456');
            await injectSessionCookies(page, profe);
            await page.goto(`${WEB_BASE}/dashboard/academico/${caso.ciclo}/${caso.seccionDeLaClase}/${caso.materiaSlug}`);
            await page.getByRole('button', { name: 'Pendientes', exact: true }).click({ timeout: 60000 });

            // 1ª opción del 1er momento: 8 (reprueba). Se abre la 2ª.
            await page.getByRole('button', { name: `${quien}, momento 1, 1ª opción: sin poner` }).click({ timeout: 60000 });
            await page.getByRole('dialog').getByLabel('Nota (0 a 20)').fill('8');
            await page.getByRole('dialog').getByRole('button', { name: 'Guardar' }).click();
            await expect.poll(async () => (await queryTenantDb(`SELECT nota FROM opciones_de_pendientes WHERE "materiaPendienteId" = $1 AND opcion = 1`, [id]))[0]?.nota, { timeout: 15000 }).toBe(8);

            await page.getByRole('button', { name: `${quien}, momento 1, 2ª opción: sin poner` }).click({ timeout: 30000 });
            await page.getByRole('dialog').getByLabel('Nota (0 a 20)').fill('12');
            await page.getByRole('dialog').getByRole('button', { name: 'Guardar' }).click();
            await expect.poll(async () => (await queryTenantDb(`SELECT estado, "notaFinal" FROM materias_pendientes WHERE id = $1`, [id]))[0], { timeout: 15000 }).toMatchObject({ estado: 'APROBADA', notaFinal: 12 });
            await page.screenshot({ path: 'test-results/evidencia/pendientes-de-la-clase.png', fullPage: true });

            // El acta del momento: la 1ª, la 2ª y la del momento.
            await page.getByRole('tab', { name: 'Actas' }).click();
            await page.getByRole('link', { name: 'Acta de calificaciones' }).first().click();
            await expect(page.getByRole('heading', { name: 'Acta de evaluación de materia pendiente' })).toBeVisible({ timeout: 60000 });
            await expect(page.getByRole('article').getByRole('row', { name: new RegExp(caso.lastName) })).toContainText('12');

            // El admin la ve en la sección del alumno (como el guía).
            const admin = await loginApi('admin@testing.edu.ve', '123456');
            await injectSessionCookies(page, admin);
            await page.goto(`${WEB_BASE}/dashboard/academico/${caso.ciclo}/${caso.seccionDelAlumno}`);
            await page.getByRole('button', { name: 'Pendientes', exact: true }).click({ timeout: 60000 });
            await expect(page.getByText(quien)).toBeVisible({ timeout: 30000 });

            await page.goto(`${WEB_BASE}/dashboard/boleta/${caso.alumnoId}`);
            await expect(page.getByRole('table', { name: 'Materias pendientes' })).toContainText('Aprobada (12)', { timeout: 60000 });
            await page.goto(`${WEB_BASE}/dashboard/acta-de-compromiso/${caso.alumnoId}`);
            await expect(page.getByRole('heading', { name: 'Acta de compromiso' })).toBeVisible({ timeout: 60000 });
            const [p] = await queryTenantDb(`SELECT "firstName", "lastName" FROM users WHERE id = $1`, [caso.profeId]);
            await expect(page.getByRole('article')).toContainText(`${p.firstName} ${p.lastName}`);
        } catch (error) {
            await captureEvidence(testInfo, page, 'PEND-UI-01', 'Materia pendiente de punta a punta', error);
            throw error;
        }
    });
});
