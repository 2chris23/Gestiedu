import { test, expect } from '@playwright/test';
import { loginViaUI, captureEvidence } from './helpers';

/**
 * LAS LLAVES DE LA SESIÓN, EN EL NAVEGADOR DE VERDAD
 *
 * Al entrar al sistema el navegador guarda dos llaves:
 *
 *   · la **llave corta** (`access_token`), que vale 15 minutos y es la que se
 *     enseña en cada petición;
 *   · la **llave larga** (`refresh_token`), que vale días o semanas y sirve para
 *     fabricar llaves cortas nuevas sin volver a pedir la contraseña.
 *
 * La llave larga es la de verdad importante: con ella se entra mañana, y pasado.
 *
 * ─── LO QUE PASABA ───────────────────────────────────────────────────────────
 *
 * El servidor entregaba la llave larga bien guardada: marcada `httpOnly`, que
 * significa "el navegador la manda pero ningún programa de la página puede
 * leerla". Y acto seguido la propia pantalla de entrar la **volvía a escribir**,
 * esta vez sin esa marca:
 *
 *     document.cookie = `refresh_token=${refreshToken}; path=/; max-age=...`;
 *
 * Con esa línea la llave larga quedaba a la vista de cualquier programa que
 * corriera en la página, y además perdía la marca `Secure`, o sea que volvía a
 * poder viajar por conexión sin cifrar — justo lo que se había arreglado antes.
 * La llave corta perdía `Secure` igual, y cada diez minutos, al renovarse.
 *
 * ─── QUÉ COMPRUEBA ESTA PRUEBA ───────────────────────────────────────────────
 *
 * Se entra como se entra de verdad, escribiendo correo y contraseña en la
 * pantalla, y después se pregunta desde la consola del navegador —lo mismo que
 * haría alguien en "modo desarrollador"— qué llaves puede leer.
 *
 * La llave larga no puede estar ahí.
 */

const CORREO = 'admin@testing.edu.ve';
const CLAVE = '123456';

/** Lo que un programa de la página puede leer de las cookies. */
async function cookiesQueSeVenDesdeLaPagina(page: any): Promise<Record<string, string>> {
    return page.evaluate(() => {
        const salida: Record<string, string> = {};
        for (const trozo of document.cookie.split(';')) {
            const [nombre, ...resto] = trozo.trim().split('=');
            if (nombre) salida[nombre] = resto.join('=');
        }
        return salida;
    });
}

test.describe('Las llaves de la sesión', () => {
    test('LLAVE-01: la llave larga no se puede leer desde la página', async ({ page }, testInfo) => {
        // Puede tocarle esperar a que se suelte el límite de intentos.
        test.setTimeout(150_000);
        try {
            await loginViaUI(page, CORREO, CLAVE);

            const aLaVista = await cookiesQueSeVenDesdeLaPagina(page);

            expect(
                aLaVista['refresh_token'],
                'la llave larga (refresh_token) quedó legible desde la página'
            ).toBeUndefined();
        } catch (error) {
            await captureEvidence(testInfo, page, 'LLAVE-01', 'La llave larga no se lee desde la página', error);
            throw error;
        }
    });

    test('LLAVE-02: el navegador sí tiene la llave larga, solo que guardada', async ({ page, context }, testInfo) => {
        // Puede tocarle esperar a que se suelte el límite de intentos.
        test.setTimeout(150_000);
        try {
            await loginViaUI(page, CORREO, CLAVE);

            const todas = await context.cookies();
            const larga = todas.find((c) => c.name === 'refresh_token');

            // Que exista es lo que mantiene la sesión viva: lo que no puede es
            // estar a la vista de la página.
            expect(larga, 'no se guardó ninguna llave larga').toBeDefined();
            expect(larga!.httpOnly, 'la llave larga tiene que estar marcada httpOnly').toBe(true);
        } catch (error) {
            await captureEvidence(testInfo, page, 'LLAVE-02', 'La llave larga está guardada', error);
            throw error;
        }
    });

    /**
     * ─── LA LLAVE CORTA TAMPOCO ──────────────────────────────────────────────
     *
     * La llave corta se guardaba **a propósito** en una cookie legible por la
     * página, y el código lo decía:
     *
     *     httpOnly: false, // Not HttpOnly so axios interceptor can read it
     *
     * Hacía falta para poder ponerla en cada petición. El problema es que
     * cualquier cosa que consiga ejecutar código en la página la lee con una
     * línea —`document.cookie`— y se la lleva; y fuera sirve quince minutos
     * desde cualquier parte del mundo.
     *
     * Ahora vive **solo en la memoria de la pestaña**
     * (`lib/credencial-en-memoria.ts`). No hay de dónde copiarla.
     */

    test('LLAVE-04: la llave corta tampoco se puede leer desde la página', async ({ page }, testInfo) => {
        // Puede tocarle esperar a que se suelte el límite de intentos.
        test.setTimeout(150_000);
        try {
            await loginViaUI(page, CORREO, CLAVE);

            const aLaVista = await cookiesQueSeVenDesdeLaPagina(page);

            expect(
                aLaVista['access_token'],
                'la llave corta (access_token) quedó legible desde la página'
            ).toBeUndefined();
        } catch (error) {
            await captureEvidence(testInfo, page, 'LLAVE-04', 'La llave corta no se lee desde la página', error);
            throw error;
        }
    });

    test('LLAVE-05: no queda ninguna credencial en el almacén del navegador', async ({ page }, testInfo) => {
        // Puede tocarle esperar a que se suelte el límite de intentos.
        test.setTimeout(150_000);
        try {
            await loginViaUI(page, CORREO, CLAVE);

            // `localStorage` y `sessionStorage` sobreviven a cerrar la pestaña
            // (el primero) y los lee cualquier programa de la página. Una
            // credencial ahí es una credencial por escrito.
            const sospechosos = await page.evaluate(() => {
                const encontrados: string[] = [];
                const mirar = (almacen: Storage, donde: string) => {
                    for (let i = 0; i < almacen.length; i++) {
                        const clave = almacen.key(i)!;
                        const valor = almacen.getItem(clave) || '';
                        // Un JWT: tres trozos separados por puntos, empezando por
                        // la cabecera típica.
                        if (/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\./.test(valor)) {
                            encontrados.push(`${donde}:${clave}`);
                        }
                    }
                };
                try { mirar(localStorage, 'localStorage'); } catch { /* bloqueado */ }
                try { mirar(sessionStorage, 'sessionStorage'); } catch { /* bloqueado */ }
                return encontrados;
            });

            expect(sospechosos, 'hay credenciales guardadas en el navegador').toEqual([]);
        } catch (error) {
            await captureEvidence(testInfo, page, 'LLAVE-05', 'Sin credenciales en el almacén', error);
            throw error;
        }
    });

    test('LLAVE-06: aun así el sistema funciona: recargar no echa a nadie', async ({ page }, testInfo) => {
        // Puede tocarle esperar a que se suelte el límite de intentos.
        test.setTimeout(150_000);
        try {
            await loginViaUI(page, CORREO, CLAVE);

            // Al recargar, la memoria de la pestaña se vacía: es justo lo que se
            // busca. Lo que no puede pasar es que eso eche al usuario. La llave
            // larga sigue en su cookie y se pide una corta nueva.
            await page.reload();
            await page.waitForLoadState('networkidle');

            await expect(page).toHaveURL(/.*dashboard/);
            // Y con datos dentro, no una pantalla vacía.
            await expect(page.locator('body')).not.toContainText(/sesión (ha )?expirad/i);
        } catch (error) {
            await captureEvidence(testInfo, page, 'LLAVE-06', 'Recargar no echa al usuario', error);
            throw error;
        }
    });

    test('LLAVE-03: ninguna llave de sesión se escribe desde la página', async ({ page }, testInfo) => {
        // Puede tocarle esperar a que se suelte el límite de intentos.
        test.setTimeout(150_000);
        /**
         * Esta es la que impide que vuelva a pasar.
         *
         * Da igual cómo se llame el archivo o quién lo escriba: si alguien vuelve
         * a poner una línea que guarda una llave de sesión desde el navegador, se
         * cae aquí. Las llaves las pone el servidor, que es quien puede marcarlas
         * `httpOnly` y `Secure`; el navegador no puede hacer ni lo uno ni lo otro.
         */
        const fs = require('fs');
        const path = require('path');

        const raiz = path.join(__dirname, '..', '..', 'apps', 'web', 'src');
        const LLAVES = ['access_token', 'refresh_token', 'superadmin_access_token', 'superadmin_refresh_token'];

        const soplones: string[] = [];

        const recorrer = (carpeta: string) => {
            for (const entrada of fs.readdirSync(carpeta, { withFileTypes: true })) {
                const completo = path.join(carpeta, entrada.name);
                if (entrada.isDirectory()) {
                    recorrer(completo);
                    continue;
                }
                if (!/\.(ts|tsx)$/.test(entrada.name)) continue;
                // Las rutas de `app/api` corren en el servidor: ahí sí se ponen.
                if (completo.includes(path.join('app', 'api'))) continue;

                const lineas: string[] = fs.readFileSync(completo, 'utf-8').split('\n');
                lineas.forEach((linea, i) => {
                    const limpia = linea.trim();
                    // Los comentarios que citan la línea vieja para explicar qué
                    // pasaba no guardan nada: no cuentan.
                    if (limpia.startsWith('*') || limpia.startsWith('//') || limpia.startsWith('/*')) return;
                    if (!/document\.cookie\s*=/.test(linea)) return;
                    // Borrarla (max-age=0) sí se puede: eso no guarda ninguna llave.
                    if (/max-age=0/.test(linea)) return;
                    for (const llave of LLAVES) {
                        if (linea.includes(`${llave}=`)) {
                            soplones.push(`${path.relative(raiz, completo)}:${i + 1}  ${linea.trim()}`);
                            break;
                        }
                    }
                });
            }
        };

        recorrer(raiz);

        expect(
            soplones,
            `Estas líneas guardan una llave de sesión desde el navegador, y así no se puede marcar ` +
                `httpOnly ni Secure. Las llaves las pone el servidor:\n  ${soplones.join('\n  ')}`
        ).toEqual([]);
    });
});
