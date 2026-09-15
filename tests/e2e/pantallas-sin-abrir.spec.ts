import { test, expect, Page } from '@playwright/test';
import axios from 'axios';
import {
    API_BASE,
    WEB_BASE,
    TENANT_SLUG,
    loginApi,
    loginViaUI,
    captureEvidence,
    queryTenantDb,
} from './helpers';

/**
 * LAS PANTALLAS QUE NADIE HABÍA ABIERTO EN UNA PRUEBA
 *
 * Se contaron las pantallas del sistema (40) y se buscó cada una en las pruebas
 * de navegador: **diecisiete no aparecían en ninguna**. El sistema las ofrece y
 * nadie había comprobado nunca que abran.
 *
 * Una pantalla que no abre no es un detalle: es un profesor delante de una
 * página en blanco a mitad de clase.
 *
 * ─── QUÉ SE COMPRUEBA ────────────────────────────────────────────────────────
 *
 * Tres cosas por pantalla, que son las que importan:
 *
 *   1. **que abra de verdad** — no una página en blanco, no un error de
 *      programa, no "algo salió mal";
 *   2. **que no la abra quien no debe** — el guardián de pantallas no es la
 *      caja fuerte (esa es el servidor), pero es la puerta de la casa;
 *   3. **que no se escape nada** — ni credenciales ni datos de la base en lo
 *      que se ve.
 *
 * ─── POR QUÉ NO SE COMPRUEBA EL CONTENIDO AL DETALLE ─────────────────────────
 *
 * Porque eso ya lo hacen las pruebas del servidor, que son 667 y miran el dato.
 * Lo que faltaba era lo de arriba: que la pantalla exista y se pinte.
 */

const CLAVE = '123456';

/** Lo que delata que una pantalla se rompió en vez de pintarse. */
const SEÑALES_DE_ROTO = [
    /Application error/i,
    /Unhandled Runtime Error/i,
    /ReferenceError/i,
    /TypeError:/i,
    /Cannot read propert/i,
    /Internal Server Error/i,
    /^\s*$/,
];

async function abreDeVerdad(page: Page, ruta: string): Promise<{ ok: boolean; motivo?: string }> {
    const respuesta = await page.goto(`${WEB_BASE}${ruta}`, { waitUntil: 'domcontentloaded' });
    if (respuesta && respuesta.status() >= 500) {
        return { ok: false, motivo: `el servidor respondió ${respuesta.status()}` };
    }

    await page.waitForLoadState('networkidle').catch(() => undefined);
    const texto = (await page.locator('body').innerText().catch(() => '')) || '';

    if (texto.trim().length < 20) {
        return { ok: false, motivo: 'la pantalla salió prácticamente vacía' };
    }
    for (const señal of SEÑALES_DE_ROTO) {
        if (señal.test(texto)) return { ok: false, motivo: `la pantalla muestra un error: ${texto.slice(0, 120)}` };
    }
    return { ok: true };
}

/** Ni credenciales ni tripas de la base a la vista. */
async function noSeEscapaNada(page: Page) {
    const texto = (await page.locator('body').innerText().catch(() => '')) || '';
    expect(texto).not.toMatch(/postgres:\/\//i);
    expect(texto).not.toMatch(/databasePassword/i);
    expect(texto).not.toMatch(/eyJhbGciOi/); // una credencial JWT a la vista
}

test.describe('Las pantallas que nadie había abierto', () => {
    let ciclo: string;
    let seccion: string;
    let materia: string;
    let profesorDeLaMateria: string;
    let sesionDeClase: string;
    let sesionPublica: string;
    let profesorDeLaSesion: string;

    test.beforeAll(async () => {
        const filas = await queryTenantDb(
            `SELECT ay.name AS ciclo, cl.slug AS seccion, s.slug AS materia, u.email AS profesor
             FROM classroom_subjects cs
             JOIN classrooms cl ON cl.id = cs."classroomId"
             JOIN subjects s ON s.id = cs."subjectId"
             JOIN academic_years ay ON ay.id = cl."academicYearId"
             JOIN users u ON u.id = cs."teacherId"
             WHERE ay.status = 'ACTIVE'
             ORDER BY cl.grade, cl.section
             LIMIT 1`
        );
        ciclo = filas[0]?.ciclo;
        seccion = filas[0]?.seccion;
        materia = filas[0]?.materia;
        profesorDeLaMateria = filas[0]?.profesor;

        const sesiones = await queryTenantDb(
            `SELECT cs.id, cs."publicId", u.email AS profesor
             FROM class_sessions cs
             JOIN classroom_subjects x ON x."classroomId" = cs."classroomId" AND x."subjectId" = cs."subjectId"
             JOIN users u ON u.id = x."teacherId"
             ORDER BY cs."createdAt" DESC
             LIMIT 1`
        );
        sesionDeClase = sesiones[0]?.id;
        sesionPublica = sesiones[0]?.publicId;
        profesorDeLaSesion = sesiones[0]?.profesor;
    });

    // ═════════════════════════════════════════════════════════════════════════
    // 1. LAS DEL LICEO
    // ═════════════════════════════════════════════════════════════════════════

    test('ABRE-01: la promoción de fin de ciclo abre para el admin', async ({ page }, testInfo) => {
        try {
            await loginViaUI(page, 'admin@testing.edu.ve', CLAVE);
            const r = await abreDeVerdad(page, `/dashboard/academico/${ciclo}/promocion`);
            expect(r.ok, r.motivo).toBe(true);
            await noSeEscapaNada(page);
        } catch (error) {
            await captureEvidence(testInfo, page, 'ABRE-01', 'Promoción de fin de ciclo', error);
            throw error;
        }
    });

    test('ABRE-02: un profesor NO entra en la promoción de fin de ciclo', async ({ page }, testInfo) => {
        try {
            // Cerrar un ciclo decide quién pasa de año. No es del profesor.
            await loginViaUI(page, profesorDeLaMateria, CLAVE);
            await page.goto(`${WEB_BASE}/dashboard/academico/${ciclo}/promocion`);
            await page.waitForLoadState('networkidle').catch(() => undefined);

            const texto = (await page.locator('body').innerText().catch(() => '')) || '';
            const fueraDeLaPantalla = !page.url().includes('/promocion');
            const seLeDice = /no tienes permiso|acceso denegado|no autorizado/i.test(texto);

            expect(fueraDeLaPantalla || seLeDice).toBe(true);
        } catch (error) {
            await captureEvidence(testInfo, page, 'ABRE-02', 'Promoción cerrada al profesor', error);
            throw error;
        }
    });

    test('ABRE-03: el horario de una sección abre', async ({ page }, testInfo) => {
        try {
            await loginViaUI(page, 'admin@testing.edu.ve', CLAVE);
            const r = await abreDeVerdad(page, `/dashboard/horario/${ciclo}/${seccion}`);
            expect(r.ok, r.motivo).toBe(true);
            await noSeEscapaNada(page);
        } catch (error) {
            await captureEvidence(testInfo, page, 'ABRE-03', 'Horario de la sección', error);
            throw error;
        }
    });

    test('ABRE-04: la ficha de una materia del ciclo abre', async ({ page }, testInfo) => {
        try {
            await loginViaUI(page, 'admin@testing.edu.ve', CLAVE);
            const r = await abreDeVerdad(page, `/dashboard/materias/${ciclo}/${materia}`);
            expect(r.ok, r.motivo).toBe(true);
            await noSeEscapaNada(page);
        } catch (error) {
            await captureEvidence(testInfo, page, 'ABRE-04', 'Ficha de materia', error);
            throw error;
        }
    });

    // ═════════════════════════════════════════════════════════════════════════
    // 2. LA PORTADA PÚBLICA DEL LICEO
    //
    // Se ve SIN haber entrado. Es lo primero que ve cualquiera, y por eso es
    // donde más importa que no se escape nada.
    // ═════════════════════════════════════════════════════════════════════════

    test('ABRE-05: la portada del liceo abre sin estar identificado', async ({ page }, testInfo) => {
        try {
            const r = await abreDeVerdad(page, `/instituto/${TENANT_SLUG}`);
            expect(r.ok, r.motivo).toBe(true);
        } catch (error) {
            await captureEvidence(testInfo, page, 'ABRE-05', 'Portada del liceo', error);
            throw error;
        }
    });

    test('ABRE-06: la portada NO enseña las credenciales de la base del liceo', async ({ page }, testInfo) => {
        try {
            await page.goto(`${WEB_BASE}/instituto/${TENANT_SLUG}`);
            await page.waitForLoadState('networkidle').catch(() => undefined);

            // Ni a la vista ni escondido en el código de la página: lo que llega
            // al navegador lo puede leer cualquiera.
            const todo = await page.content();
            expect(todo).not.toMatch(/postgres:\/\//i);
            expect(todo).not.toMatch(/databasePassword/i);
            expect(todo).not.toMatch(/databaseUser/i);
        } catch (error) {
            await captureEvidence(testInfo, page, 'ABRE-06', 'La portada no filtra credenciales', error);
            throw error;
        }
    });

    test('ABRE-07: la pantalla de entrar del liceo abre', async ({ page }, testInfo) => {
        try {
            const r = await abreDeVerdad(page, `/instituto/${TENANT_SLUG}/login`);
            expect(r.ok, r.motivo).toBe(true);
            await expect(page.locator('input[type="password"]')).toBeVisible();
        } catch (error) {
            await captureEvidence(testInfo, page, 'ABRE-07', 'Entrar por el liceo', error);
            throw error;
        }
    });

    test('ABRE-08: un liceo que no existe no revienta la pantalla', async ({ page }, testInfo) => {
        try {
            await page.goto(`${WEB_BASE}/instituto/no-existe-este-liceo`);
            await page.waitForLoadState('networkidle').catch(() => undefined);

            const texto = (await page.locator('body').innerText().catch(() => '')) || '';
            // Se le dice que no existe; no se le enseña un error de programa.
            expect(texto).not.toMatch(/Application error|Unhandled Runtime Error|TypeError:/i);
            expect(texto.trim().length).toBeGreaterThan(20);
        } catch (error) {
            await captureEvidence(testInfo, page, 'ABRE-08', 'Liceo inexistente', error);
            throw error;
        }
    });

    // ═════════════════════════════════════════════════════════════════════════
    // 3. EL PANEL DEL SUPERADMIN
    //
    // Desde aquí se gobiernan TODOS los liceos. Lo que más importa de estas
    // pantallas no es que abran: es que no abran para quien no debe.
    // ═════════════════════════════════════════════════════════════════════════

    const DEL_SUPERADMIN = [
        '/superadmin/dashboard',
        '/superadmin/institutes',
        '/superadmin/institutes/new',
        '/superadmin/metrics',
        '/superadmin/migraciones',
        '/superadmin/plans',
    ];

    test('ABRE-09: la pantalla de entrar del superadmin abre', async ({ page }, testInfo) => {
        try {
            const r = await abreDeVerdad(page, '/superadmin/login');
            expect(r.ok, r.motivo).toBe(true);
            await expect(page.locator('input[type="password"]')).toBeVisible();
        } catch (error) {
            await captureEvidence(testInfo, page, 'ABRE-09', 'Entrar como superadmin', error);
            throw error;
        }
    });

    for (const ruta of DEL_SUPERADMIN) {
        test(`ABRE-10: ${ruta} no se abre sin ser superadmin`, async ({ page }, testInfo) => {
            try {
                await page.goto(`${WEB_BASE}${ruta}`);
                await page.waitForLoadState('networkidle').catch(() => undefined);

                // O se le manda a entrar, o se le dice que no. Lo que no puede
                // es enseñarle el panel que gobierna todos los liceos.
                const enLaPantalla = page.url().includes(ruta);
                const texto = (await page.locator('body').innerText().catch(() => '')) || '';
                const seLeDice = /iniciar sesión|entrar|no autorizado|acceso denegado/i.test(texto);

                expect(!enLaPantalla || seLeDice, `entró en ${ruta} sin credenciales`).toBe(true);

                // Y desde luego, ni rastro de los liceos ni de sus credenciales.
                expect(texto).not.toMatch(/postgres:\/\//i);
                expect(texto).not.toMatch(/databasePassword/i);
            } catch (error) {
                await captureEvidence(testInfo, page, 'ABRE-10', `Sin superadmin: ${ruta}`, error);
                throw error;
            }
        });
    }

    test('ABRE-11: el token de un admin de liceo no abre el panel del superadmin', async ({ page }, testInfo) => {
        try {
            // Un admin es la persona más poderosa de SU liceo. Del panel que
            // gobierna todos los liceos, no tiene nada — y probarlo desde el
            // navegador es distinto de probarlo contra la API: aquí se mira lo
            // que se le llega a PINTAR.
            const admin = await loginApi('admin@testing.edu.ve', CLAVE);

            await page.context().addCookies([
                {
                    name: 'superadmin_access_token',
                    value: admin.accessToken,
                    domain: 'localhost',
                    path: '/',
                    httpOnly: false,
                    secure: false,
                    sameSite: 'Lax',
                },
            ]);

            await page.goto(`${WEB_BASE}/superadmin/institutes`);
            await page.waitForLoadState('networkidle').catch(() => undefined);

            const texto = (await page.locator('body').innerText().catch(() => '')) || '';
            expect(texto).not.toMatch(/postgres:\/\//i);
            expect(texto).not.toMatch(/databasePassword/i);

            // Y por si la pantalla se pintara: la API tiene que negarse igual.
            const res = await axios.get(`${API_BASE}/superadmin/institutes`, {
                headers: { Authorization: `Bearer ${admin.accessToken}` },
                validateStatus: () => true,
            });
            expect(res.status).toBeGreaterThanOrEqual(400);
        } catch (error) {
            await captureEvidence(testInfo, page, 'ABRE-11', 'Admin de liceo en el panel superadmin', error);
            throw error;
        }
    });

    // ═════════════════════════════════════════════════════════════════════════
    // 4. LA CLASE EN VIVO
    //
    // Es donde el profesor pasa la hora. Si esta pantalla no abre, no abre a
    // mitad de clase, con treinta alumnos delante.
    // ═════════════════════════════════════════════════════════════════════════

    test('ABRE-12: la pantalla de una clase abre para su profesor', async ({ page }, testInfo) => {
        try {
            test.skip(!sesionDeClase, 'no hay ninguna sesión de clase en el liceo de pruebas');

            await loginViaUI(page, profesorDeLaSesion, CLAVE);
            const r = await abreDeVerdad(page, `/dashboard/clases/${sesionDeClase}`);
            expect(r.ok, r.motivo).toBe(true);
            await noSeEscapaNada(page);
        } catch (error) {
            await captureEvidence(testInfo, page, 'ABRE-12', 'Pantalla de la clase', error);
            throw error;
        }
    });

    test('ABRE-13: un alumno NO abre la pantalla de gestión de la clase', async ({ page }, testInfo) => {
        try {
            test.skip(!sesionDeClase, 'no hay ninguna sesión de clase en el liceo de pruebas');

            const alumnos = await queryTenantDb(
                `SELECT email FROM users WHERE role = 'STUDENT' AND "isActive" = true LIMIT 1`
            );
            test.skip(!alumnos[0]?.email, 'no hay alumnos en el liceo de pruebas');

            await loginViaUI(page, alumnos[0].email, CLAVE);
            await page.goto(`${WEB_BASE}/dashboard/clases/${sesionDeClase}`);
            await page.waitForLoadState('networkidle').catch(() => undefined);

            const texto = (await page.locator('body').innerText().catch(() => '')) || '';
            const fuera = !page.url().includes('/dashboard/clases/');
            const seLeDice = /no tienes permiso|acceso denegado|no autorizado/i.test(texto);

            expect(fuera || seLeDice).toBe(true);
        } catch (error) {
            await captureEvidence(testInfo, page, 'ABRE-13', 'Clase cerrada al alumno', error);
            throw error;
        }
    });

    test('ABRE-14: la vista pública de una clase abre sin reventar', async ({ page }, testInfo) => {
        try {
            test.skip(!sesionPublica, 'esa sesión no tiene identificador público');

            // Esta es la que se proyecta o se comparte. Abre sin identificarse,
            // así que lo que importa es que no enseñe de más.
            const r = await abreDeVerdad(page, `/clase/${sesionPublica}`);
            expect(r.ok, r.motivo).toBe(true);

            const todo = await page.content();
            expect(todo).not.toMatch(/postgres:\/\//i);
            expect(todo).not.toMatch(/databasePassword/i);
            expect(todo).not.toMatch(/eyJhbGciOi/);
        } catch (error) {
            await captureEvidence(testInfo, page, 'ABRE-14', 'Vista pública de la clase', error);
            throw error;
        }
    });

    test('ABRE-15: el panel del liceo por su dirección propia abre', async ({ page }, testInfo) => {
        try {
            await loginViaUI(page, 'admin@testing.edu.ve', CLAVE);
            const r = await abreDeVerdad(page, `/instituto/${TENANT_SLUG}/dashboard`);
            expect(r.ok, r.motivo).toBe(true);
            await noSeEscapaNada(page);
        } catch (error) {
            await captureEvidence(testInfo, page, 'ABRE-15', 'Panel por dirección del liceo', error);
            throw error;
        }
    });
});
