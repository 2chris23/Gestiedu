import { test, expect } from '@playwright/test';
import { WEB_BASE, loginApi, loginViaUI, captureEvidence, queryTenantDb } from './helpers';

/**
 * LO QUE EL LICEO PIDIÓ Y AQUÍ SE COMPRUEBA EN EL NAVEGADOR
 *
 *  · el alumno ve SU horario con el tema de la semana y puede abrir la clase;
 *  · en la clase en vivo ya no está el botón de tres puntos que no hacía nada;
 *  · ya no hay que pulsar «Guardar»: la asistencia se guarda sola;
 *  · «Pasar asistencia» cambia la tabla entera y se marca de un toque;
 *  · en el teléfono hay barra abajo; en el escritorio, no.
 *
 * El servidor de todo esto se prueba en `horario-del-alumno.test.ts`.
 */

test.describe('El horario del alumno', () => {
    test('ALUM-UI-01: ve su horario con el tema de la semana y puede abrir una clase', async ({ page }, testInfo) => {
        try {
            const [alumno] = await queryTenantDb(
                `SELECT u.email, u.id
                   FROM users u
                   JOIN student_classrooms sc ON sc."studentId" = u.id AND sc."isActive" = true
                   JOIN classrooms c ON c.id = sc."classroomId"
                   JOIN academic_years ay ON ay.id = c."academicYearId" AND ay.status = 'ACTIVE'
                   JOIN schedule_blocks b ON b."classroomId" = c.id AND b."blockType" = 'CLASS'
                  WHERE u.role = 'STUDENT' AND u."isActive" = true
                  LIMIT 1`
            );
            expect(alumno, 'hace falta un alumno con horario en la base de pruebas').toBeTruthy();

            await loginViaUI(page, alumno.email, '123456');
            await page.goto(`${WEB_BASE}/dashboard`);

            // Su horario, con el turno dicho con todas las letras.
            const horario = page.getByText('Horario en Vivo').first();
            await expect(horario).toBeVisible({ timeout: 30000 });

            // Un bloque con materia: se abre y sale la ficha de esa hora.
            const bloque = page.locator('h4', { hasText: /\S/ }).first();
            await expect(bloque).toBeVisible({ timeout: 30000 });
            await bloque.click();

            const ficha = page.getByRole('dialog');
            await expect(ficha).toBeVisible({ timeout: 15000 });
            await expect(ficha.getByText(/Tema Generador|Para esta clase/i).first()).toBeVisible();

            // Y no hay nada que escribir: el alumno solo mira.
            await expect(ficha.getByRole('textbox')).toHaveCount(0);

            await page.screenshot({ path: 'test-results/evidencia/horario-del-alumno.png', fullPage: false });
        } catch (error) {
            await captureEvidence(testInfo, page, 'ALUM-UI-01', 'Horario del alumno con contenido', error);
            throw error;
        }
    });

    test('ALUM-UI-02: ve la lista de lo que le falta', async ({ page }, testInfo) => {
        try {
            const [alumno] = await queryTenantDb(
                `SELECT u.email FROM users u
                   JOIN student_classrooms sc ON sc."studentId" = u.id AND sc."isActive" = true
                  WHERE u.role = 'STUDENT' AND u."isActive" = true LIMIT 1`
            );
            await loginViaUI(page, alumno.email, '123456');
            await page.goto(`${WEB_BASE}/dashboard`);

            await expect(page.getByText('Mis actividades')).toBeVisible({ timeout: 30000 });
            await expect(page.getByRole('button', { name: /Pendientes \(/ })).toBeVisible();
            await expect(page.getByRole('button', { name: /Con nota \(/ })).toBeVisible();
        } catch (error) {
            await captureEvidence(testInfo, page, 'ALUM-UI-02', 'Actividades del alumno', error);
            throw error;
        }
    });
});

test.describe('La clase en vivo', () => {
    let clase: { classroom_id: string; subject_id: string; profe_email: string; alumno_id: string };

    test.beforeAll(async () => {
        [clase] = await queryTenantDb(
            `SELECT cs."classroomId" AS classroom_id, cs."subjectId" AS subject_id,
                    u.email AS profe_email,
                    (SELECT sc."studentId" FROM student_classrooms sc
                      WHERE sc."classroomId" = cs."classroomId" AND sc."isActive" = true LIMIT 1) AS alumno_id
               FROM classroom_subjects cs
               JOIN users u ON u.id = cs."teacherId" AND u."isActive" = true
               JOIN classrooms c ON c.id = cs."classroomId"
               JOIN academic_years ay ON ay.id = c."academicYearId" AND ay.status = 'ACTIVE'
              WHERE EXISTS (SELECT 1 FROM student_classrooms sc WHERE sc."classroomId" = cs."classroomId" AND sc."isActive" = true)
              LIMIT 1`
        );
    });

    test('CLASE-UI-01: no hay botón de tres puntos ni botón de guardar', async ({ page }, testInfo) => {
        try {
            expect(clase, 'hace falta una clase con profesor y alumnos').toBeTruthy();
            await loginViaUI(page, clase.profe_email, '123456');
            await page.goto(`${WEB_BASE}/dashboard/clase-en-vivo/${clase.classroom_id}/${clase.subject_id}`);

            await expect(page.getByRole('button', { name: /Pasar asistencia/i })).toBeVisible({ timeout: 30000 });
            // El que se quitó: abría un menú que no existía.
            await expect(page.getByRole('button', { name: 'Opciones' })).toHaveCount(0);
            // Y el de guardar: ahora se guarda solo.
            await expect(page.getByRole('button', { name: /^Guardar$/ })).toHaveCount(0);
            await expect(page.getByText(/Se guarda solo|Guardado/)).toBeVisible();
        } catch (error) {
            await captureEvidence(testInfo, page, 'CLASE-UI-01', 'Botones que sobraban', error);
            throw error;
        }
    });

    test('CLASE-UI-02: «Pasar asistencia» cambia la tabla y lo marcado se guarda solo', async ({ page }, testInfo) => {
        try {
            await loginViaUI(page, clase.profe_email, '123456');
            await page.goto(`${WEB_BASE}/dashboard/clase-en-vivo/${clase.classroom_id}/${clase.subject_id}`);

            const botonModo = page.getByRole('button', { name: /Pasar asistencia/i });
            await expect(botonModo).toBeVisible({ timeout: 30000 });

            // Antes de entrar en el modo, la tabla tiene sus columnas.
            await expect(page.getByRole('columnheader', { name: 'Observaciones' })).toBeVisible();

            await botonModo.click();

            // Dentro del modo, la tabla se queda en lo justo.
            await expect(page.getByRole('columnheader', { name: 'Observaciones' })).toHaveCount(0);
            await expect(page.getByRole('columnheader', { name: 'Calificaciones' })).toHaveCount(0);
            await expect(page.getByRole('columnheader', { name: 'Asistencia' })).toBeVisible();
            await page.screenshot({ path: 'test-results/evidencia/modo-asistencia.png', fullPage: false });

            // Marcar a alguien como ausente y NO pulsar nada más.
            await page.getByRole('button', { name: 'Ausente' }).first().click();
            await expect(page.getByText(/Guardado \d{1,2}:\d{2}/)).toBeVisible({ timeout: 20000 });

            /**
             * EL DÍA LO PONE EL SERVIDOR, NO `toISOString()`
             *
             * Esto preguntaba por `new Date().toISOString()`, que es la fecha en
             * UTC: en Caracas (UTC-4), a partir de las ocho de la noche eso ya
             * es el día siguiente, así que la consulta miraba un día vacío y la
             * prueba fallaba de noche y pasaba de día. `CURRENT_DATE` es el día
             * de la base, que es el mismo que el del liceo.
             *
             * Y se da un margen: «Guardado» puede ser el de la marca anterior,
             * y lo que se comprueba es que la de ahora LLEGÓ.
             */
            let marcas: any[] = [];
            for (let intento = 0; intento < 20 && marcas.length === 0; intento++) {
                marcas = await queryTenantDb(
                    `SELECT status FROM daily_attendance
                      WHERE "classroomId" = $1 AND date::date = CURRENT_DATE AND status = 'ABSENT'`,
                    [clase.classroom_id]
                );
                if (marcas.length === 0) await page.waitForTimeout(500);
            }
            expect(marcas.length).toBeGreaterThan(0);

            // Se deja como estaba: todos presentes.
            await page.getByRole('button', { name: /Todos presentes/i }).click();
            await expect(page.getByText(/Guardado \d{1,2}:\d{2}/)).toBeVisible({ timeout: 20000 });
        } catch (error) {
            await captureEvidence(testInfo, page, 'CLASE-UI-02', 'Modo asistencia', error);
            throw error;
        }
    });
});

test.describe('En el teléfono', () => {
    test.use({ viewport: { width: 390, height: 844 } });

    /**
     * EL SITIO DE HONOR ES INICIO, NO UN CAJÓN DE SASTRE
     *
     * En el centro había un botón de «Menú» que abría una cortina lateral con
     * todo. El sitio del medio —el más grande, el que se pulsa sin mirar— lo
     * ocupaba un cajón de sastre en vez de la pantalla a la que todo el mundo
     * vuelve. Ahora lo que estaba en la cortina vive en el propio panel de
     * inicio, así que la cortina sobra y el centro es Inicio.
     */
    test('MOVIL-UI-01: hay barra abajo, con Inicio en el centro', async ({ page }, testInfo) => {
        try {
            await loginViaUI(page, 'admin@testing.edu.ve', '123456');
            await page.goto(`${WEB_BASE}/dashboard`);

            const barra = page.getByRole('navigation', { name: 'Navegación principal' });
            await expect(barra).toBeVisible({ timeout: 30000 });
            await expect(barra.getByRole('link', { name: 'Inicio' })).toBeVisible();

            // Y lo que antes estaba detrás del «Menú», ahora está a la vista en
            // el propio panel.
            await expect(page.getByRole('link', { name: /Configuración/ }).first()).toBeVisible({ timeout: 30000 });

            await page.screenshot({ path: 'test-results/evidencia/barra-de-abajo.png', fullPage: false });
        } catch (error) {
            await captureEvidence(testInfo, page, 'MOVIL-UI-01', 'Barra inferior en el teléfono', error);
            throw error;
        }
    });

    test('MOVIL-UI-02: en el escritorio esa barra no existe', async ({ page }, testInfo) => {
        try {
            await page.setViewportSize({ width: 1440, height: 900 });
            await loginViaUI(page, 'admin@testing.edu.ve', '123456');
            await page.goto(`${WEB_BASE}/dashboard`);
            await expect(page.getByRole('link', { name: 'Inicio' }).first()).toBeVisible({ timeout: 30000 });
            await expect(page.getByRole('navigation', { name: 'Navegación principal' })).toBeHidden();
        } catch (error) {
            await captureEvidence(testInfo, page, 'MOVIL-UI-02', 'Sin barra en escritorio', error);
            throw error;
        }
    });
});

test.describe('Las fotos', () => {
    test('FOTO-UI-02: la foto del alumno sale también en la lista de su sección', async ({ page }, testInfo) => {
        try {
            const [caso] = await queryTenantDb(
                `SELECT u.id AS student_id, c.id AS classroom_id, ay.name AS year_name, c.slug
                   FROM users u
                   JOIN student_classrooms sc ON sc."studentId" = u.id AND sc."isActive" = true
                   JOIN classrooms c ON c.id = sc."classroomId"
                   JOIN academic_years ay ON ay.id = c."academicYearId" AND ay.status = 'ACTIVE'
                  WHERE u.role = 'STUDENT' AND u.avatar IS NOT NULL
                  LIMIT 1`
            );
            test.skip(!caso, 'ningún alumno con foto en la base de pruebas');

            await loginViaUI(page, 'admin@testing.edu.ve', '123456');
            await page.goto(`${WEB_BASE}/dashboard/academico/${caso.year_name}/${caso.slug}`);

            // La foto se trae con la credencial: cuando llega, hay un <img>.
            await expect(page.locator('table img').first()).toBeVisible({ timeout: 30000 });
        } catch (error) {
            await captureEvidence(testInfo, page, 'FOTO-UI-02', 'Foto en la lista de la sección', error);
            throw error;
        }
    });
});
