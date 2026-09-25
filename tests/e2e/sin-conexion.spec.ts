import { test, expect, type Page } from '@playwright/test';
import { TENANT_SLUG, loginViaUI, captureEvidence } from './helpers';

/**
 * SIN SEÑAL SE MIRA, NO SE TOCA
 *
 * El teléfono guarda lo último que se descargó. Sin conexión, la app enseña
 * eso —el horario de la mañana, la lista de la sección, las notas— con un
 * aviso de que es lo de antes. Lo que NO se puede es cambiar nada: eso
 * necesita hablar con el servidor y se dice en el acto.
 *
 * Lo que se comprueba aquí es lo que, al romperse, no da ningún error:
 *
 *   SIN-01  lo que se ve se guarda de verdad en el teléfono, y con dueño;
 *   SIN-02  sin señal se sigue viendo, y se avisa de que es lo de antes;
 *   SIN-03  al cerrar sesión, el teléfono lo olvida.
 *
 * Nota: aquí NO se recarga la página sin señal. El ayudante (`sw.js`), que es
 * quien hace que la app abra sin internet, solo se registra en producción; en
 * desarrollo una recarga sin red da «ERR_INTERNET_DISCONNECTED» y eso no dice
 * nada del producto. Lo que sí se puede comprobar en los dos sitios es lo de
 * arriba: que el dato está guardado, que se sigue viendo y que se borra.
 */

const MEMORIA = { base: 'gestiedu', almacen: 'lo-descargado', llave: 'react-query' };

/**
 * Lo que devuelve cuando NO se ha podido preguntar: el navegador estaba a
 * mitad de una navegación y el contexto se destruyó bajo los pies. No es
 * «no hay nada guardado» —eso es `null`— y por eso no vale confundirlos:
 * devolviendo `null` ahí, SIN-03 se pondría verde sin haber comprobado nada.
 * Con este valor, la espera sigue esperando y, si nunca se puede preguntar,
 * acaba en rojo diciendo la verdad.
 */
const NO_SE_PUDO_PREGUNTAR = 'no-se-pudo-preguntar';

/**
 * Para las esperas: si justo ahora no se puede preguntar, se dice, y la espera
 * vuelve a intentarlo.
 */
async function siSePuede(page: Page) {
    return loGuardado(page).catch(() => NO_SE_PUDO_PREGUNTAR as unknown as null);
}

/** Lee la memoria del teléfono desde dentro del navegador. */
function loGuardado(page: Page) {
    return page.evaluate(({ base, almacen, llave }) => {
        return new Promise<{ dueno: string; cuando: number; claves: string[] } | null>((resolver) => {
            let peticion: IDBOpenDBRequest;
            try {
                peticion = indexedDB.open(base, 1);
            } catch {
                return resolver(null);
            }
            peticion.onerror = () => resolver(null);
            peticion.onsuccess = () => {
                const bd = peticion.result;
                if (!bd.objectStoreNames.contains(almacen)) return resolver(null);
                const lectura = bd.transaction(almacen, 'readonly').objectStore(almacen).get(llave);
                lectura.onsuccess = () => {
                    const v = lectura.result;
                    if (!v) return resolver(null);
                    const consultas = v?.estado?.queries ?? [];
                    resolver({
                        dueno: v.dueno,
                        cuando: v.cuando,
                        claves: consultas.map((c: { queryKey: unknown }) => JSON.stringify(c.queryKey)),
                    });
                };
                lectura.onerror = () => resolver(null);
            };
        });
    }, MEMORIA);
}

test.describe('Sin conexión', () => {
    test('SIN-01: lo descargado se guarda en el teléfono, y con dueño', async ({ page }, testInfo) => {
        try {
            await loginViaUI(page, 'admin@testing.edu.ve');
            await page.waitForURL('**/dashboard**');

            // Que llegue el panel: los cuatro números del liceo.
            await expect(page.getByText('Estudiantes', { exact: false }).first()).toBeVisible({ timeout: 20000 });

            const guardado = await expect
                .poll(async () => await siSePuede(page), { timeout: 20000 })
                .not.toBeNull()
                .then(() => loGuardado(page));

            // De quién es: el liceo y la cédula de quien lo descargó. Sin esto,
            // un teléfono prestado enseñaría lo del anterior.
            expect(guardado?.dueno).toContain(TENANT_SLUG);
            expect(guardado?.dueno.split(':')[1]?.length).toBeGreaterThan(3);

            // Y que lo guardado es lo de la pantalla, no una caja vacía.
            expect(guardado?.claves.length ?? 0).toBeGreaterThan(0);
            expect(guardado?.claves.join(' ')).toContain('adminDashboard');
        } catch (error) {
            await captureEvidence(testInfo, page, 'SIN-01', 'Lo descargado se guarda en el teléfono', error);
            throw error;
        }
    });

    test('SIN-02: sin señal se sigue viendo, y se avisa', async ({ page, context }, testInfo) => {
        try {
            await loginViaUI(page, 'admin@testing.edu.ve');
            await page.waitForURL('**/dashboard**');
            await expect(page.getByText('Estudiantes', { exact: false }).first()).toBeVisible({ timeout: 20000 });

            const aviso = page.getByText('Estás viendo lo último que se descargó', { exact: false });
            await expect(aviso).toHaveCount(0);

            await context.setOffline(true);

            // El aviso escucha al navegador: sale sin recargar nada.
            await expect(aviso.first()).toBeVisible({ timeout: 10000 });
            // Y lo que ya estaba, sigue estando: no se vacía la pantalla.
            await expect(page.getByText('Estudiantes', { exact: false }).first()).toBeVisible();

            await context.setOffline(false);
            await expect(aviso).toHaveCount(0, { timeout: 10000 });
        } catch (error) {
            await captureEvidence(testInfo, page, 'SIN-02', 'El aviso de sin conexión', error);
            throw error;
        } finally {
            await context.setOffline(false);
        }
    });

    test('SIN-03: al cerrar sesión, el teléfono lo olvida', async ({ page }, testInfo) => {
        try {
            // En el teléfono se sale por la foto de arriba, no por una cortina.
            await page.setViewportSize({ width: 390, height: 844 });
            await loginViaUI(page, 'admin@testing.edu.ve');
            await page.waitForURL('**/dashboard**');

            await expect
                .poll(async () => (await siSePuede(page))?.dueno ?? null, { timeout: 20000 })
                .not.toBeNull();

            await page.locator('header button').first().click();
            await page.getByRole('button', { name: /Cerrar sesión/i }).click();
            await page.waitForURL('**/login**', { timeout: 20000 });
            // La pantalla de entrar tiene que estar pintada antes de preguntarle
            // nada al navegador: si se pregunta a mitad de la navegación, la
            // consulta se cae sola y no dice nada del producto.
            await expect(page.locator('input[type="email"]')).toBeVisible({ timeout: 20000 });

            // Lo de la persona anterior no se queda en el teléfono.
            await expect.poll(async () => await siSePuede(page), { timeout: 20000 }).toBeNull();
        } catch (error) {
            await captureEvidence(testInfo, page, 'SIN-03', 'Al salir se borra lo guardado', error);
            throw error;
        }
    });
});
