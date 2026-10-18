import { test, expect } from '@playwright/test';
import { WEB_BASE, loginApi, injectSessionCookies, captureEvidence, queryTenantDb } from './helpers';

/**
 * LOS GRUPOS ESTABLES, EN LA PANTALLA
 *
 *   GRUPO-UI-01  el admin, en la materia «por grupos»: crea un grupo con su
 *                profesor y su cupo, ve quién está sin grupo y lo asigna.
 *
 * La materia es propia de la prueba (en dos secciones del año en curso) y se
 * quita al final con todo lo suyo: no toca las del liceo de pruebas.
 */

const MATERIA = 'Grupos de Creación (e2e)';
const GRUPO = 'Fútbol e2e';
let c: { materiaId: string; slug: string; ciclo: string; profe: string; profeNombre: string };

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
    await queryTenantDb(`DELETE FROM subjects WHERE name = $1`, [MATERIA]);
    const [s] = await queryTenantDb(
        `INSERT INTO subjects (id, name, slug, evaluacion, "porGrupos", "createdAt", "updatedAt")
         VALUES ('c' || md5(random()::text), $1, 'grupos-e2e', 'CUALITATIVA', true, now(), now()) RETURNING id, slug`,
        [MATERIA]
    );
    await queryTenantDb(
        `INSERT INTO classroom_subjects (id, "classroomId", "subjectId", "weeklyBlocks", "hoursPerWeek", "createdAt", "updatedAt")
         SELECT 'c' || md5(random()::text || cl.id), cl.id, $1, 2, 1.5, now(), now()
           FROM classrooms cl JOIN academic_years ay ON ay.id = cl."academicYearId" AND ay.status = 'ACTIVE'
          WHERE EXISTS (SELECT 1 FROM student_classrooms sc WHERE sc."classroomId" = cl.id AND sc."isActive")
          ORDER BY cl.grade, cl.name LIMIT 2`,
        [s.id]
    );
    const [p] = await queryTenantDb(`SELECT email, "firstName" || ' ' || "lastName" AS nombre FROM users WHERE role = 'TEACHER' AND "isActive" ORDER BY email LIMIT 1`);
    const [y] = await queryTenantDb(`SELECT name FROM academic_years WHERE status = 'ACTIVE' LIMIT 1`);
    c = { materiaId: s.id, slug: s.slug, ciclo: y.name, profe: p.email, profeNombre: p.nombre };
});

test.afterAll(async () => {
    // La cascada se lleva sus grupos, solicitudes y asignaciones a secciones.
    await queryTenantDb(`DELETE FROM subjects WHERE name = $1`, [MATERIA]);
});

test('GRUPO-UI-01: el admin crea un grupo, ve quién está sin grupo y lo asigna', async ({ page }, testInfo) => {
    try {
        const admin = await loginApi('admin@testing.edu.ve', '123456');
        await injectSessionCookies(page, admin);
        await page.goto(`${WEB_BASE}/dashboard/materias/${c.ciclo}/${c.slug}`);

        // Las tres partes de la materia por grupos.
        const partes = page.getByRole('navigation', { name: 'Partes de la materia' });
        await partes.getByRole('button', { name: 'Grupos' }).click({ timeout: 60000 });
        await expect(page.getByText(/Todavía no hay grupos/)).toBeVisible({ timeout: 30000 });

        // Un grupo nuevo, con su profesor y su cupo.
        await page.getByRole('button', { name: 'Nuevo grupo' }).click();
        const ventana = page.getByRole('dialog', { name: 'Nuevo grupo' });
        await ventana.getByLabel('Nombre del grupo').fill(GRUPO);
        await ventana.getByRole('radio', { name: 'Actividad física y deporte' }).click();
        await ventana.getByRole('button', { name: 'Elegir profesor' }).click();
        const hoja = page.getByRole('dialog', { name: 'Profesor del grupo' });
        await hoja.getByPlaceholder('Buscar profesor').fill(c.profeNombre.split(' ')[0]);
        await hoja.getByRole('button', { name: c.profeNombre }).first().click({ timeout: 30000 });
        await ventana.getByLabel('Cupo').fill('2');
        await ventana.getByRole('button', { name: 'Crear grupo' }).click();
        await expect(ventana).toBeHidden({ timeout: 15000 });
        const fila = page.getByRole('region', { name: 'Grupos' }).getByRole('listitem').filter({ hasText: GRUPO });
        await expect(fila).toContainText('0/2');
        await expect(fila).toContainText(c.profeNombre);
        await page.screenshot({ path: 'test-results/evidencia/grupos-de-la-materia.png', fullPage: true });

        // Sin grupo: todos los de las dos secciones; se asigna al primero.
        await partes.getByRole('button', { name: 'Sin grupo' }).click();
        await expect(page.getByText(/estudiantes? sin grupo/)).toBeVisible({ timeout: 30000 });
        // Cada sección es una fila que se abre (nunca más de 20 filas de golpe).
        await expect(page.getByRole('button', { name: 'Asignar' })).toHaveCount(0);
        await page.locator('section[aria-label] > button[aria-expanded]').first().click();
        const primero = page.getByRole('button', { name: 'Asignar' }).first();
        const nombre = (await primero.locator('xpath=..').getByText(/,/).first().textContent())?.trim() ?? '';
        await primero.click();
        await page.getByRole('dialog').getByRole('button', { name: new RegExp(GRUPO) }).click();
        await expect(page.getByText(`${nombre}: ${GRUPO}`)).toBeVisible({ timeout: 15000 });

        const [s] = await queryTenantDb(
            `SELECT sg.estado, sg."asignadaPorAdmin" FROM solicitudes_de_grupo sg JOIN grupos_estables g ON g.id = sg."grupoId" WHERE g.nombre = $1`,
            [GRUPO]
        );
        expect(s).toMatchObject({ estado: 'ACEPTADA', asignadaPorAdmin: true });

        await partes.getByRole('button', { name: 'Grupos' }).click();
        await expect(page.getByRole('region', { name: 'Grupos' }).getByRole('listitem').filter({ hasText: GRUPO })).toContainText('1/2');

        // En el teléfono: nada se sale de ancho.
        await page.setViewportSize({ width: 412, height: 915 });
        await page.waitForTimeout(400);
        const sobra = await page.evaluate(() => document.documentElement.scrollWidth - (window.visualViewport?.width ?? window.innerWidth));
        expect(sobra).toBeLessThanOrEqual(1);
        await page.screenshot({ path: 'test-results/evidencia/grupos-de-la-materia-telefono.png', fullPage: true });
        await partes.getByRole('button', { name: 'Sin grupo' }).click();
        await page.locator('section[aria-label] > button[aria-expanded]').first().click();
        await page.waitForTimeout(400);
        await page.screenshot({ path: 'test-results/evidencia/sin-grupo-telefono.png', fullPage: true });
    } catch (error) {
        await captureEvidence(testInfo, page, 'GRUPO-UI-01', 'El admin y los grupos de una materia', error);
        throw error;
    }
});
