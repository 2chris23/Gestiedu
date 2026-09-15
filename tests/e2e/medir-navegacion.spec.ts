import { test, expect } from '@playwright/test';
import { WEB_BASE, loginApi, injectSessionCookies } from './helpers';

/**
 * CUÁNTO TARDA EN ABRIRSE CADA PANTALLA
 *
 * No decide si algo está bien o mal: es la regla con la que se mide, para poder
 * comparar antes y después de cada mejora.
 *
 * Se mide lo que de verdad hace el usuario: **pulsar en el menú**. Eso es una
 * navegación del lado del navegador, sin recargar la página. Medir con F5 (que es
 * lo que hace `page.goto`) da números mucho peores y no es lo que la gente vive.
 *
 * "Los datos están en pantalla" = pasan 350 ms sin ninguna llamada al servidor en
 * curso. OJO: no vale esperar a que desaparezca `animate-pulse`, porque hay
 * animaciones decorativas permanentes (la etiqueta "EN CURSO" del ciclo) y la
 * medición se queda esperando para siempre. Ya pasó.
 *
 * Se apunta también **cuántas llamadas** hace cada pantalla y cuánto suman: ahí
 * es donde suele estar el tiempo, no en el dibujado.
 *
 * Correr con:  npx playwright test tests/e2e/medir-navegacion.spec.ts
 */

const MENU = ['Inicio', 'Académico', 'Materias', 'Horarios', 'Eventos', 'Usuarios'];

const ESPERA_QUIETUD = 350;

interface Medida {
    ms: number;
    llamadas: number;
    msLlamadas: number;
}

test.describe('Medición: cuánto tarda en abrirse cada pantalla', () => {
    test('NAV-01: pulsar en el menú, ida y vuelta', async ({ page }) => {
        const sesion = await loginApi('admin@testing.edu.ve', '123456');
        await injectSessionCookies(page, sesion);

        let enVuelo = 0;
        let ultimaActividad = Date.now();
        let llamadas = 0;
        let msLlamadas = 0;
        const arranque = new Map<string, number>();

        const clave = (url: string, metodo: string) => `${metodo} ${url}`;

        page.on('request', (req) => {
            if (!req.url().includes('/api/')) return;
            enVuelo++;
            llamadas++;
            ultimaActividad = Date.now();
            arranque.set(clave(req.url(), req.method()), Date.now());
        });
        const cerrar = (url: string, metodo: string) => {
            const t0 = arranque.get(clave(url, metodo));
            if (t0) msLlamadas += Date.now() - t0;
            enVuelo--;
            ultimaActividad = Date.now();
        };
        page.on('requestfinished', (req) => {
            if (!req.url().includes('/api/')) return;
            cerrar(req.url(), req.method());
        });
        page.on('requestfailed', (req) => {
            if (!req.url().includes('/api/')) return;
            cerrar(req.url(), req.method());
        });

        const esperarQuietud = async (tope = 20000) => {
            const limite = Date.now() + tope;
            while (Date.now() < limite) {
                if (enVuelo === 0 && Date.now() - ultimaActividad >= ESPERA_QUIETUD) return;
                await page.waitForTimeout(25);
            }
        };

        const pulsarYMedir = async (nombre: string): Promise<Medida> => {
            llamadas = 0;
            msLlamadas = 0;
            enVuelo = 0;
            ultimaActividad = Date.now();

            const t0 = Date.now();
            await page.getByRole('link', { name: nombre, exact: true }).first().click();
            await esperarQuietud();
            return { ms: Date.now() - t0 - ESPERA_QUIETUD, llamadas, msLlamadas };
        };

        // Punto de partida: la aplicación ya abierta
        await page.goto(`${WEB_BASE}/dashboard`);
        await page.locator('main').first().waitFor({ state: 'visible', timeout: 30000 });
        await esperarQuietud();

        const primera: Record<string, Medida> = {};
        const segunda: Record<string, Medida> = {};

        for (const nombre of MENU) primera[nombre] = await pulsarYMedir(nombre);
        for (const nombre of MENU) segunda[nombre] = await pulsarYMedir(nombre);

        const filas = MENU.map((n) => ({
            Pantalla: n,
            'Primera vez (ms)': primera[n].ms,
            'Al volver (ms)': segunda[n].ms,
            Llamadas: segunda[n].llamadas,
            'Suma de llamadas (ms)': segunda[n].msLlamadas,
        }));

        // eslint-disable-next-line no-console
        console.log('\n' + JSON.stringify(filas, null, 1));

        const media = MENU.reduce((a, n) => a + segunda[n].ms, 0) / MENU.length;
        // eslint-disable-next-line no-console
        console.log(`\nMEDIA AL VOLVER: ${Math.round(media)} ms\n`);

        expect(MENU.length).toBeGreaterThan(0);
    });
});
