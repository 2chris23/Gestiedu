import { test, expect } from '@playwright/test';
import { WEB_BASE, TENANT_SLUG, captureEvidence } from './helpers';

/**
 * LO QUE HACE FALTA PARA QUE SE PUEDA INSTALAR
 *
 * Un teléfono solo ofrece «instalar aplicación» si encuentra tres cosas: la
 * ficha (`manifest.webmanifest`), iconos que se puedan bajar de verdad y un
 * ayudante (`sw.js`). Si falta una, no sale el botón —y no avisa de por qué—.
 *
 * Y la ficha tiene que ser la DEL LICEO: el alumno instala «San Miguel» con el
 * escudo de su liceo, no «GestiEdu». Además su `start_url` lleva el liceo a
 * cuestas, porque sin él la app recién instalada abriría en «no existe».
 *
 * La APK (Capacitor, `apps/movil`) sale de esto mismo: nombre, icono y color.
 */

test.describe('La app del teléfono', () => {
    test('APP-01: la ficha es la del liceo y sus iconos se bajan', async ({ page, request }, testInfo) => {
        try {
            await page.goto(`${WEB_BASE}/login?slug=${TENANT_SLUG}`);

            const enlace = page.locator("link[rel='manifest']");
            await expect(enlace).toHaveCount(1);
            // El liceo va en la dirección: quien instala desde el portal todavía
            // no ha entrado, así que no hay cookie que lo diga.
            await expect(enlace).toHaveAttribute('href', new RegExp(`liceo=${TENANT_SLUG}`));

            const ficha = await (await request.get(`${WEB_BASE}/manifest.webmanifest?liceo=${TENANT_SLUG}`)).json();

            expect(ficha.display).toBe('standalone');
            expect(ficha.start_url).toContain(`slug=${TENANT_SLUG}`);
            expect(ficha.name).not.toBe('GestiEdu'); // es la del liceo, no la genérica
            expect(ficha.short_name.length).toBeLessThanOrEqual(12);
            expect(ficha.theme_color).toMatch(/^#[0-9a-f]{6}$/i);

            // Los iconos existen de verdad: una ficha con iconos rotos no
            // instala nada, y eso no se ve mirando el JSON.
            const cuadrados = ficha.icons.filter((i: any) => i.purpose === 'maskable');
            expect(cuadrados.length).toBeGreaterThan(0);

            for (const icono of ficha.icons) {
                const url = icono.src.startsWith('http') ? icono.src : `${WEB_BASE}${icono.src}`;
                const r = await request.get(url);
                expect(r.status(), `no se pudo bajar ${icono.src}`).toBe(200);
                expect(r.headers()['content-type']).toContain('image/');
            }
        } catch (error) {
            await captureEvidence(testInfo, page, 'APP-01', 'La ficha de la app', error);
            throw error;
        }
    });

    test('APP-02: el ayudante y la pantalla sin conexión se sirven sin haber entrado', async ({ request }) => {
        // El navegador los pide por su cuenta, antes de que nadie tenga sesión.
        const ayudante = await request.get(`${WEB_BASE}/sw.js`);
        expect(ayudante.status()).toBe(200);
        expect(ayudante.headers()['content-type']).toContain('javascript');
        /**
         * LO QUE GUARDA, Y LO QUE NO
         *
         * Ahora sí guarda la CÁSCARA —la página, el javascript, los estilos—,
         * que es lo que hace que la app abra sin internet. Lo que sigue sin
         * tocar son los datos del liceo, y el motivo no es técnico: lo que
         * guarda un ayudante de estos es del NAVEGADOR, no de la persona. En un
         * teléfono prestado, el siguiente que entrara vería las notas del
         * anterior servidas desde ahí.
         *
         * Los datos se guardan en el otro sitio, donde la llave lleva el liceo
         * y la cédula de quien los descargó (`lib/lo-guardado-en-el-telefono.ts`).
         */
        const codigo = await ayudante.text();
        expect(codigo).toMatch(/esDelServidor/);
        expect(codigo).toMatch(/pathname\.startsWith\('\/api\/'\)/);
        expect(codigo).toMatch(/pathname\.startsWith\('\/uploads\/'\)/);

        const sinConexion = await request.get(`${WEB_BASE}/sin-conexion.html`);
        expect(sinConexion.status()).toBe(200);
        expect(await sinConexion.text()).toContain('No hay conexión');
    });

    test('APP-03: sin liceo, la ficha es la de la plataforma', async ({ request }) => {
        const ficha = await (await request.get(`${WEB_BASE}/manifest.webmanifest`)).json();
        expect(ficha.name).toBe('GestiEdu');
        expect(ficha.start_url).toBe('/');
    });
});
