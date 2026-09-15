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
 *   - un profesor tampoco entra a usuarios ni a configuración;
 *   - nadie que no sea administrador puede cambiar datos personales;
 *   - si alguien manipula la cookie del navegador para hacerse pasar por
 *     administrador, la pantalla se abre pero SIN datos: el servidor los niega.
 */

const PANTALLAS_DE_ADMIN = ['/dashboard/usuarios', '/dashboard/configuracion', '/dashboard/eventos'];
const PANTALLAS_DE_PERSONAL = ['/dashboard/academico', '/dashboard/materias', '/dashboard/horarios'];

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

            for (const ruta of ['/dashboard/usuarios', '/dashboard/configuracion']) {
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

    test('ROL-03: los datos personales no los cambia ni el estudiante ni el profesor', async ({}, testInfo) => {
        try {
            const casos = [
                { quien: 'estudiante', email: 'est0575@testing.edu.ve', ruta: '/students/profile/me' },
                { quien: 'profesor', email: 'profesor.ciencias@tuapp.com', ruta: '/teachers/profile/me' },
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
