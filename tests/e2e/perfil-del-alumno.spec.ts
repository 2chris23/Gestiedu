import { test, expect } from '@playwright/test';
import { WEB_BASE, loginApi, injectSessionCookies, captureEvidence, queryTenantDb } from './helpers';

/**
 * LA FICHA DEL ALUMNO, REORDENADA (28-09-2026)
 *
 * Lo pidió el dueño: en la cabecera, la inscripción como un anillo que se
 * llena, «Traslado», «Retiro» y «Documentos»; y las actividades, dentro de
 * cada ciclo: al pulsar el promedio (todas) o una materia (las suyas), en una
 * ventana que respeta el lapso elegido. En cada ciclo, la boleta del lapso
 * que se mira o la completa.
 */

test('PERFIL-UI-01: cabecera con inscripción, traslado, retiro y documentos; actividades y boleta por ciclo', async ({ page }, testInfo) => {
    try {
        // Un alumno del ciclo en curso con actividades en su sección.
        const [alumno] = await queryTenantDb<{ id: string }>(
            `SELECT sc."studentId" AS id
               FROM student_classrooms sc
               JOIN classrooms c ON c.id = sc."classroomId"
               JOIN academic_years y ON y.id = c."academicYearId" AND y.status = 'ACTIVE'
              WHERE sc."isActive" AND EXISTS (SELECT 1 FROM class_activities a WHERE a."classroomId" = c.id)
              ORDER BY sc."studentId" LIMIT 1`
        );
        await injectSessionCookies(page, await loginApi('admin@testing.edu.ve', '123456'));
        await page.goto(`${WEB_BASE}/dashboard/usuarios/${encodeURIComponent(alumno.id)}`);

        // La cabecera.
        const anillo = page.getByRole('button', { name: /^Inscripción: / });
        await expect(anillo).toBeVisible({ timeout: 60000 });
        await expect(page.getByRole('button', { name: 'Traslado', exact: true })).toBeVisible();
        await expect(page.getByRole('button', { name: /^(Retiro|Retirado)$/ })).toBeVisible();
        await page.getByRole('button', { name: 'Documentos', exact: true }).click();
        const documentos = page.getByRole('dialog', { name: 'Documentos' });
        await expect(documentos.getByRole('link', { name: 'Carnet' })).toBeVisible();
        await expect(documentos.getByRole('link', { name: 'Certificación de calificaciones' })).toBeVisible();
        await page.keyboard.press('Escape');

        // Ya no están en la columna de la izquierda.
        await expect(page.getByText(/actividades sin nota cuya fecha ya pasó/)).toHaveCount(0);

        // El ciclo: boleta completa, y al elegir un lapso, la de ese lapso.
        await page.getByText('Ciclo Actual').first().click();
        const boleta = page.getByRole('link', { name: 'Boleta completa' });
        await expect(boleta).toHaveAttribute('href', /\?ciclo=/, { timeout: 30000 });
        await page.getByRole('button', { name: /Primer/ }).first().click();
        await expect(page.getByRole('link', { name: /^Boleta · / })).toHaveAttribute('href', /&lapso=/);
        await page.getByRole('button', { name: 'Todo el ciclo escolar' }).click();

        // El promedio abre todas sus actividades.
        await page.getByRole('button', { name: /^Promedio .*ver sus actividades/ }).click({ timeout: 30000 });
        const ventana = page.getByRole('dialog', { name: 'Actividades' });
        await expect(ventana.getByRole('button', { name: /^Todas \(\d+\)$/ })).toBeVisible({ timeout: 30000 });
        await expect(ventana.getByRole('button', { name: /^Con nota \(\d+\)$/ })).toBeVisible();
        await expect(ventana.getByRole('button', { name: /^Pendientes \(\d+\)$/ })).toBeVisible();
        const todas = Number((await ventana.getByRole('button', { name: /^Todas/ }).innerText()).match(/\d+/)![0]);
        expect(todas).toBeGreaterThan(0);
        await page.screenshot({ path: testInfo.outputPath('actividades-del-ciclo.png') });
        await page.keyboard.press('Escape');

        // Una materia abre solo las suyas.
        const materia = page.getByRole('button', { name: /Ver sus actividades$/ }).first();
        const nombre = (await materia.getAttribute('aria-label'))!.split(':')[0];
        await materia.click();
        await expect(page.getByRole('dialog', { name: `Actividades de ${nombre}` })).toBeVisible({ timeout: 30000 });
        await page.keyboard.press('Escape');

        await page.screenshot({ path: testInfo.outputPath('ficha-del-alumno.png'), fullPage: true });
    } catch (e) {
        await captureEvidence(testInfo, page, 'PERFIL-UI-01', 'La ficha del alumno reordenada', e);
        throw e;
    }
});

test('PERFIL-UI-02: la boleta de un lapso trae ese lapso y los anteriores, sin definitiva', async ({ page }, testInfo) => {
    const [fila] = await queryTenantDb<{ alumno: string; ciclo: string; lapso: string }>(
        `SELECT sc."studentId" AS alumno, y.id AS ciclo,
                (SELECT p.id FROM periods p WHERE p."academicYearId" = y.id ORDER BY p."startDate" LIMIT 1 OFFSET 1) AS lapso
           FROM student_classrooms sc
           JOIN classrooms c ON c.id = sc."classroomId"
           JOIN academic_years y ON y.id = c."academicYearId" AND y.status = 'ACTIVE'
          WHERE sc."isActive" ORDER BY sc."studentId" LIMIT 1`
    );
    await injectSessionCookies(page, await loginApi('admin@testing.edu.ve', '123456'));
    await page.goto(`${WEB_BASE}/dashboard/boleta/${encodeURIComponent(fila.alumno)}?ciclo=${fila.ciclo}&lapso=${fila.lapso}`);
    const hoja = page.getByRole('article', { name: 'Boleta de calificaciones' });
    await expect(hoja).toBeVisible({ timeout: 60000 });
    const columnas = await hoja.locator('table').first().locator('thead th').allInnerTexts();
    // Materia + dos lapsos; nada de definitiva.
    expect(columnas).toHaveLength(3);
    expect(columnas.join(' ')).not.toMatch(/Definitiva/);
    await page.screenshot({ path: testInfo.outputPath('boleta-del-lapso.png'), fullPage: true });
});
