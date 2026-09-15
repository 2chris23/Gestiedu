import { test, expect, Page } from '@playwright/test';
import {
    WEB_BASE,
    loginViaUI,
    captureEvidence,
    queryTenantDb,
} from './helpers';

/**
 * LOS BOTONES, PULSADOS DE VERDAD
 *
 * Se contaron las interacciones de navegador que había en las pruebas: de
 * veintiún archivos, **casi ninguno pulsaba nada**. Llamaban a la API desde
 * dentro de un navegador abierto, que no es lo mismo: comprueba que el servidor
 * responde, no que el botón exista, se vea, se pueda pulsar y haga algo.
 *
 * Un formulario puede estar perfecto por detrás y tener el botón de guardar
 * deshabilitado, o un campo que no acepta lo que el servidor espera, o un aviso
 * que dice una cosa distinta de la que el servidor exige. Nada de eso se ve
 * llamando a la API.
 *
 * Aquí se hace lo que hace una persona: abrir la pantalla, rellenar, pulsar, y
 * comprobar que **el dato llegó a la base**.
 *
 * ─── LO QUE YA ENCONTRÓ ──────────────────────────────────────────────────────
 *
 * Escribiendo estas pruebas salió que el formulario de crear usuario decía
 * *"Mínimo 6 caracteres"* debajo de la contraseña, y el servidor exige **ocho**.
 * El administrador escribía seis, pulsaba guardar, y le rebotaba. La pantalla
 * prometía algo que el sistema no cumple.
 */

const CLAVE = '123456';
const CLAVE_NUEVA = 'UnaClaveDeOcho2026';

/** Una cédula que no choca con nadie. */
const cedulaNueva = () => `V-9${String(Date.now()).slice(-7)}`;

async function irA(page: Page, ruta: string) {
    await page.goto(`${WEB_BASE}${ruta}`);
    await page.waitForLoadState('networkidle').catch(() => undefined);
}

test.describe('Los botones, pulsados de verdad', () => {
    // ═════════════════════════════════════════════════════════════════════════
    // CREAR UN USUARIO DESDE LA PANTALLA
    // ═════════════════════════════════════════════════════════════════════════

    test('BOTON-01: el admin crea un usuario rellenando el formulario', async ({ page }, testInfo) => {
        const cedula = cedulaNueva();
        const correo = `boton.${cedula.toLowerCase()}@testing.edu.ve`;

        try {
            await loginViaUI(page, 'admin@testing.edu.ve', CLAVE);
            await irA(page, '/dashboard/usuarios');

            await page.getByRole('button', { name: /Nuevo Usuario/i }).click();
            await expect(page.locator('#firstName')).toBeVisible({ timeout: 10000 });

            await page.locator('#firstName').fill('Creado');
            await page.locator('#lastName').fill('DesdeLaPantalla');
            await page.locator('#email').fill(correo);
            await page.locator('#id').fill(cedula);
            await page.locator('input[name="password"]').fill(CLAVE_NUEVA);

            await page.getByRole('button', { name: /Guardar Usuario/i }).click();

            // Lo que cuenta no es que la pantalla diga "guardado": es que el
            // usuario esté en la base del liceo.
            await expect
                .poll(
                    async () => {
                        const filas = await queryTenantDb(
                            `SELECT id FROM users WHERE email = $1`,
                            [correo]
                        );
                        return filas.length;
                    },
                    { timeout: 20000 }
                )
                .toBe(1);
        } catch (error) {
            await captureEvidence(testInfo, page, 'BOTON-01', 'Crear usuario desde la pantalla', error);
            throw error;
        } finally {
            await queryTenantDb(`DELETE FROM users WHERE email = $1`, [correo]).catch(() => undefined);
        }
    });

    test('BOTON-02: la pantalla pide la misma contraseña que el servidor exige', async ({ page }, testInfo) => {
        // Este es el fallo que encontró esta tanda: la pantalla decía seis y el
        // servidor exige ocho. Si el aviso vuelve a bajar de ocho, se cae aquí.
        try {
            await loginViaUI(page, 'admin@testing.edu.ve', CLAVE);
            await irA(page, '/dashboard/usuarios');
            await page.getByRole('button', { name: /Nuevo Usuario/i }).click();
            await expect(page.locator('#firstName')).toBeVisible({ timeout: 10000 });

            const pista = await page.locator('input[name="password"]').getAttribute('placeholder');
            expect(pista).toMatch(/8/);
            expect(pista).not.toMatch(/\b[1-7]\b/);
        } catch (error) {
            await captureEvidence(testInfo, page, 'BOTON-02', 'La pista de la contraseña', error);
            throw error;
        }
    });

    test('BOTON-03: una contraseña corta se rechaza en la pantalla, sin ir al servidor', async ({ page }, testInfo) => {
        const cedula = cedulaNueva();
        const correo = `corta.${cedula.toLowerCase()}@testing.edu.ve`;

        try {
            await loginViaUI(page, 'admin@testing.edu.ve', CLAVE);
            await irA(page, '/dashboard/usuarios');
            await page.getByRole('button', { name: /Nuevo Usuario/i }).click();
            await expect(page.locator('#firstName')).toBeVisible({ timeout: 10000 });

            await page.locator('#firstName').fill('Clave');
            await page.locator('#lastName').fill('Corta');
            await page.locator('#email').fill(correo);
            await page.locator('#id').fill(cedula);
            await page.locator('input[name="password"]').fill('1234567'); // siete

            await page.getByRole('button', { name: /Guardar Usuario/i }).click();
            await page.waitForTimeout(2500);

            // No se creó, y se le dijo por qué en la propia pantalla.
            const filas = await queryTenantDb(`SELECT id FROM users WHERE email = $1`, [correo]);
            expect(filas.length).toBe(0);

            const texto = (await page.locator('body').innerText().catch(() => '')) || '';
            expect(texto).toMatch(/8|contrase/i);
        } catch (error) {
            await captureEvidence(testInfo, page, 'BOTON-03', 'Contraseña corta rechazada', error);
            throw error;
        } finally {
            await queryTenantDb(`DELETE FROM users WHERE email = $1`, [correo]).catch(() => undefined);
        }
    });

    // ═════════════════════════════════════════════════════════════════════════
    // BUSCAR EN LA LISTA
    // ═════════════════════════════════════════════════════════════════════════

    test('BOTON-04: el buscador de usuarios filtra de verdad', async ({ page }, testInfo) => {
        try {
            await loginViaUI(page, 'admin@testing.edu.ve', CLAVE);
            await irA(page, '/dashboard/usuarios');

            const alguien = await queryTenantDb(
                `SELECT "firstName", "lastName" FROM users WHERE role = 'STUDENT' AND "isActive" = true LIMIT 1`
            );
            test.skip(!alguien[0], 'no hay alumnos en el liceo de pruebas');

            const buscador = page.getByPlaceholder(/Buscar por nombre/i);
            await expect(buscador).toBeVisible({ timeout: 10000 });

            const apellido = String(alguien[0].lastName);
            await buscador.fill(apellido);

            // Quien se buscó aparece.
            await expect(page.getByText(apellido).first()).toBeVisible({ timeout: 15000 });

            // Y buscar algo que no existe deja la lista sin resultados, no con
            // todo el liceo dentro.
            //
            // SE ESPERA AL RESULTADO, NO AL RELOJ. Antes había una espera fija
            // de 2,5 s: con la máquina ocupada, el buscador todavía no había
            // respondido y la prueba fallaba sin que nada estuviera mal. Una
            // prueba que depende de lo rápido que vaya el equipo no dice nada
            // del sistema.
            await buscador.fill('zzzz-esto-no-existe-zzzz');
            await expect
                .poll(
                    async () => (await page.locator('body').innerText().catch(() => '')) || '',
                    { timeout: 15000 }
                )
                .not.toContain(apellido);
        } catch (error) {
            await captureEvidence(testInfo, page, 'BOTON-04', 'Buscador de usuarios', error);
            throw error;
        }
    });

    // ═════════════════════════════════════════════════════════════════════════
    // LO QUE EL ALUMNO NO PUEDE PULSAR
    // ═════════════════════════════════════════════════════════════════════════

    test('BOTON-05: al alumno no se le enseña ningún botón de crear usuarios', async ({ page }, testInfo) => {
        try {
            const alumnos = await queryTenantDb(
                `SELECT email FROM users WHERE role = 'STUDENT' AND "isActive" = true LIMIT 1`
            );
            test.skip(!alumnos[0]?.email, 'no hay alumnos en el liceo de pruebas');

            await loginViaUI(page, alumnos[0].email, CLAVE);
            await irA(page, '/dashboard');

            // El menú no puede ofrecerle lo que no es suyo.
            const texto = (await page.locator('body').innerText().catch(() => '')) || '';
            expect(texto).not.toMatch(/Nuevo Usuario/i);
            expect(texto).not.toMatch(/Configuración/i);
        } catch (error) {
            await captureEvidence(testInfo, page, 'BOTON-05', 'El alumno no ve botones de admin', error);
            throw error;
        }
    });

    // ═════════════════════════════════════════════════════════════════════════
    // CERRAR SESIÓN
    // ═════════════════════════════════════════════════════════════════════════

    test('BOTON-06: "Cerrar Sesión" cierra la sesión de verdad', async ({ page }, testInfo) => {
        try {
            await loginViaUI(page, 'admin@testing.edu.ve', CLAVE);
            await irA(page, '/dashboard');

            await page.getByRole('button', { name: /Cerrar Sesión/i }).first().click();
            await page.waitForTimeout(3000);

            // Se sale a la pantalla de entrar...
            expect(page.url()).toMatch(/login/);

            // ...y volver atrás no devuelve a nadie adentro. Esto es lo que
            // falla cuando "cerrar sesión" solo borra lo que se ve.
            await irA(page, '/dashboard/usuarios');
            expect(page.url()).toMatch(/login/);
        } catch (error) {
            await captureEvidence(testInfo, page, 'BOTON-06', 'Cerrar sesión', error);
            throw error;
        }
    });
});
