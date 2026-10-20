import { test, expect } from '@playwright/test';
import axios from 'axios';
import { API_BASE, WEB_BASE, TENANT_SLUG, loginApi, injectSessionCookies, captureEvidence } from './helpers';

/**
 * QUÉ PANTALLAS VE CADA ROL, EN EL NAVEGADOR
 *
 * Las reglas del liceo comprobadas donde las vive el usuario:
 *
 *   - un estudiante no entra a las pantallas de administración, ni escribiendo
 *     la dirección a mano;
 *   - un profesor tampoco entra a usuarios; en configuración solo ve lo suyo;
 *   - nadie que no sea administrador puede cambiar datos personales;
 *   - si alguien manipula la cookie del navegador para hacerse pasar por
 *     administrador, la pantalla se abre pero SIN datos: el servidor los niega.
 */

// Configuración ya no: es de todos (lo de cada uno vive ahí), y lo del liceo
// no se le enseña (ROL-03) y el servidor lo niega.
const PANTALLAS_DE_ADMIN = ['/dashboard/usuarios', '/dashboard/eventos'];
// Académico, Materias y Horarios ya son también del alumno (fase E, cada uno
// con lo suyo: lo ajeno lo niega el servidor). Del personal quedan estas.
const PANTALLAS_DE_PERSONAL = ['/dashboard/observaciones', '/dashboard/clase-en-vivo', '/dashboard/plan-de-evaluacion'];

async function entraA(page: any, ruta: string) {
    await page.goto(`${WEB_BASE}${ruta}`);
    await page.waitForLoadState('domcontentloaded');
    return page.url();
}

test.describe('Pantallas permitidas por rol', () => {
    test('ROL-01: el estudiante no entra a las pantallas de administración', async ({ page }, testInfo) => {
        try {
            const sesion = await loginApi('est0575@testing.edu.ve', '123456');
            await injectSessionCookies(page, sesion);

            for (const ruta of [...PANTALLAS_DE_ADMIN, ...PANTALLAS_DE_PERSONAL]) {
                const url = await entraA(page, ruta);
                expect(url, `debería salir de ${ruta}`).not.toContain(ruta);
            }
        } catch (error) {
            await captureEvidence(testInfo, page, 'ROL-01', 'Estudiante fuera de administración', error);
            throw error;
        }
    });

    test('ROL-02: el profesor no entra a usuarios ni a configuración', async ({ page }, testInfo) => {
        try {
            const sesion = await loginApi('profesor.ciencias@tuapp.com', '123456');
            await injectSessionCookies(page, sesion);

            for (const ruta of ['/dashboard/usuarios']) {
                const url = await entraA(page, ruta);
                expect(url, `debería salir de ${ruta}`).not.toContain(ruta);
            }

            // Lo suyo sí lo abre
            const academico = await entraA(page, '/dashboard/academico');
            expect(academico).toContain('/dashboard/academico');
        } catch (error) {
            await captureEvidence(testInfo, page, 'ROL-02', 'Profesor fuera de administración', error);
            throw error;
        }
    });

    test('ROL-03: en Configuración, el profesor y el alumno ven lo suyo y nada del liceo', async ({ page }, testInfo) => {
        try {
            for (const correo of ['profesor.ciencias@tuapp.com', 'est0575@testing.edu.ve']) {
                await page.context().clearCookies();
                await injectSessionCookies(page, await loginApi(correo, '123456'));
                // Aunque pida un apartado del liceo por la dirección.
                const url = await entraA(page, '/dashboard/configuracion?seccion=general');
                expect(url).toContain('/dashboard/configuracion');
                await expect(page.getByRole('button', { name: 'Contraseña y acceso' }).filter({ visible: true }).first()).toBeVisible({ timeout: 30000 });
                await expect(page.getByRole('button', { name: 'Información General' })).toHaveCount(0);
                await expect(page.getByText('Datos oficiales del plantel')).toHaveCount(0);
            }
        } catch (error) {
            await captureEvidence(testInfo, page, 'ROL-03', 'Configuración sin lo del liceo', error);
            throw error;
        }
    });

    test('ROL-03: los datos personales no los cambia ni el estudiante ni el profesor', async ({}, testInfo) => {
        try {
            const casos = [
                { quien: 'estudiante', email: 'est0575@testing.edu.ve', ruta: '/users/profile/me' },
                { quien: 'profesor', email: 'profesor.ciencias@tuapp.com', ruta: '/users/profile/me' },
            ];

            for (const caso of casos) {
                const sesion = await loginApi(caso.email, '123456');
                let rechazado = false;
                try {
                    await axios.put(
                        `${API_BASE}${caso.ruta}`,
                        { firstName: 'Nombre', lastName: 'Cambiado' },
                        {
                            headers: {
                                Authorization: `Bearer ${sesion.accessToken}`,
                                'X-Institute-Slug': TENANT_SLUG,
                            },
                        }
                    );
                } catch (err: any) {
                    rechazado = true;
                    expect([401, 403]).toContain(err.response?.status);
                }
                expect(rechazado, `${caso.quien} no debería poder editar su ficha`).toBeTruthy();
            }
        } catch (error) {
            await captureEvidence(testInfo, null, 'ROL-03', 'Datos personales solo del admin', error);
            throw error;
        }
    });

    test('ROL-04: falsear el rol en el navegador abre la pantalla pero no trae datos', async ({ page }, testInfo) => {
        try {
            const sesion = await loginApi('est0575@testing.edu.ve', '123456');
            await injectSessionCookies(page, sesion);

            // Lo que haría alguien desde las herramientas del navegador: editar la
            // cookie para decir que es administrador.
            await page.context().addCookies([
                {
                    name: 'user_data',
                    value: JSON.stringify({ ...sesion.user, role: 'ADMIN' }),
                    domain: 'localhost',
                    path: '/',
                    httpOnly: false,
                    secure: false,
                    sameSite: 'Lax',
                },
            ]);

            // La pantalla se abre (la cookie engaña al navegador)...
            const url = await entraA(page, '/dashboard/usuarios');
            expect(url).toContain('/dashboard/usuarios');

            // ...pero los datos los sigue negando el servidor, que mira el token
            let negado = false;
            try {
                await axios.get(`${API_BASE}/users?limit=5`, {
                    headers: {
                        Authorization: `Bearer ${sesion.accessToken}`,
                        'X-Institute-Slug': TENANT_SLUG,
                    },
                });
            } catch (err: any) {
                negado = true;
                expect([401, 403]).toContain(err.response?.status);
            }
            expect(negado, 'el servidor debe negar el listado de usuarios a un estudiante').toBeTruthy();
        } catch (error) {
            await captureEvidence(testInfo, page, 'ROL-04', 'Cookie falseada no da datos', error);
            throw error;
        }
    });
});
