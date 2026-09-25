import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import net from 'net';
import { TENANT_SLUG } from './helpers';

/**
 * CON EL SERVIDOR APAGADO, EL TELÉFONO SIGUE ENSEÑANDO LO ÚLTIMO
 *
 * No es lo mismo que «sin internet» (eso lo prueba `sin-conexion.spec.ts`
 * cortando la red del navegador). Aquí el navegador TIENE red —`navigator.
 * onLine` dice que sí— y lo que no hay es servidor: el PC apagado, el
 * servidor reiniciándose. Era el caso real que dejaba el teléfono sin nada.
 *
 * Para apagar el servidor de verdad sin tocar los que están corriendo, la web
 * se abre a través de una puerta propia (un repartidor TCP en otro puerto) que
 * esta prueba cierra y vuelve a abrir; y la API, que el navegador llama
 * directo, se corta con `connectionrefused`, que es exactamente lo que ve un
 * teléfono cuando el PC está apagado.
 */

const PUERTO = 3107;
const WEB = `http://localhost:${PUERTO}`;
const API = 'http://localhost:3001';
/** El servidor de pantallas que se «apaga»: el de desarrollo, o uno compilado (WEB_DESTINO=3108). */
const DESTINO = Number(process.env.WEB_DESTINO || 3000);

function abrirPuerta(puerto: number, destino: number) {
    const conexiones = new Set<net.Socket>();
    const servidor = net.createServer((cliente) => {
        const hacia = net.connect(destino, '127.0.0.1');
        for (const s of [cliente, hacia]) {
            conexiones.add(s);
            s.on('close', () => conexiones.delete(s));
            s.on('error', () => {
                cliente.destroy();
                hacia.destroy();
            });
        }
        cliente.pipe(hacia).pipe(cliente);
    });
    return new Promise<{ cerrar: () => Promise<void> }>((resolver) =>
        servidor.listen(puerto, '127.0.0.1', () =>
            resolver({
                cerrar: () =>
                    new Promise<void>((listo) => {
                        conexiones.forEach((s) => s.destroy());
                        servidor.close(() => listo());
                    }),
            })
        )
    );
}

async function apagarLaApi(contexto: BrowserContext) {
    await contexto.route(`${API}/**`, (r) => r.abort('connectionrefused'));
}

async function lleganDatosGuardados(page: Page) {
    return page.evaluate(
        () =>
            new Promise<boolean>((ok) => {
                const p = indexedDB.open('gestiedu', 1);
                p.onerror = () => ok(false);
                p.onsuccess = () => {
                    const bd = p.result;
                    if (!bd.objectStoreNames.contains('lo-descargado')) return ok(false);
                    const r = bd.transaction('lo-descargado', 'readonly').objectStore('lo-descargado').get('react-query');
                    r.onsuccess = () => ok(!!r.result?.estado?.queries?.length);
                    r.onerror = () => ok(false);
                };
            })
    ).catch(() => false);
}

test.describe('Con el servidor apagado', () => {
    test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

    test('APAGADO-01: se sigue viendo lo último, se avisa, guardar dice que falta conexión, y al volver se recupera', async ({ page, context }) => {
        test.setTimeout(180_000);

        // Contra el servidor de DESARROLLO esto no se puede comprobar, y no es
        // un fallo del producto: el cliente de desarrollo de Next no arranca
        // la app si no puede hablar con su servidor (medido: la página sale
        // pintada pero muerta). Se salta diciéndolo, no se da por bueno.
        // Cómo correrla: CLAUDE.md, «Sin señal se mira, no se toca».
        const html = await (await fetch(`http://127.0.0.1:${DESTINO}/login`)).text().catch(() => '');
        test.skip(
            html.includes('hmr-client') || html.includes('webpack-hmr'),
            'Necesita la web COMPILADA: npm run build && npx next start -p 3108, y WEB_DESTINO=3108'
        );

        let puerta = await abrirPuerta(PUERTO, DESTINO);

        try {
            // ── Con servidor: entrar y mirar ────────────────────────────
            await page.goto(`${WEB}/login?slug=${TENANT_SLUG}`);
            await page.fill('input[type="email"]', 'admin@testing.edu.ve');
            await page.fill('input[type="password"]', '123456');
            await Promise.all([
                page.waitForURL('**/dashboard**', { timeout: 60_000 }),
                page.getByRole('button', { name: /^Ingresar$/ }).click(),
            ]);
            await expect(page.getByText('Estudiantes').first()).toBeVisible({ timeout: 30_000 });

            // El ayudante toma el control, y con él al mando se vuelve a cargar
            // una vez: así la cáscara del panel queda guardada.
            await page.waitForFunction(() => !!navigator.serviceWorker?.controller, null, { timeout: 60_000 });
            await page.reload();
            await expect(page.getByText('Estudiantes').first()).toBeVisible({ timeout: 30_000 });
            await expect.poll(() => lleganDatosGuardados(page), { timeout: 20_000 }).toBe(true);
            const cifras = await page.locator('main').innerText();

            // ── Se apaga el servidor ───────────────────────────────────
            await puerta.cerrar();
            await apagarLaApi(context);
            expect(await page.evaluate(() => navigator.onLine)).toBe(true); // hay red: falta el servidor

            await page.reload();

            // Lo mismo que se veía, y el aviso de que es lo de antes.
            await expect(page.getByText('Sin conexión con el liceo').first()).toBeVisible({ timeout: 20_000 });
            await expect(page.getByText('Estudiantes').first()).toBeVisible();
            const primeraCifra = cifras.match(/\d+/)?.[0];
            if (primeraCifra) await expect(page.locator('main')).toContainText(primeraCifra);

            // Guardar algo: se dice que falta conexión, no un error cualquiera.
            await page.locator('header button').first().click();
            await page.getByRole('button', { name: /Cambiar mi contraseña/i }).click();
            await page.getByPlaceholder('Contraseña actual').fill('123456');
            await page.getByPlaceholder(/Contraseña nueva/).fill('otraclave123');
            await page.getByPlaceholder(/Repite/).fill('otraclave123');
            await page.getByRole('button', { name: /Guardar la contraseña nueva/i }).click();
            await expect(page.getByText(/Sin conexión con el liceo\. Esto necesita conexión/).first()).toBeVisible({ timeout: 25_000 });
            await page.keyboard.press('Escape');

            // Abrir la app por la entrada, sin servidor: va a lo guardado.
            await page.goto(`${WEB}/login?slug=${TENANT_SLUG}`);
            await page.waitForURL('**/dashboard**', { timeout: 20_000 });
            await expect(page.getByText('Estudiantes').first()).toBeVisible({ timeout: 20_000 });

            // ── Vuelve el servidor ─────────────────────────────────────
            puerta = await abrirPuerta(PUERTO, DESTINO);
            await context.unroute(`${API}/**`);
            await expect(page.getByText('Sin conexión con el liceo')).toHaveCount(0, { timeout: 30_000 });
        } finally {
            await puerta.cerrar().catch(() => undefined);
            await context.unroute(`${API}/**`).catch(() => undefined);
        }
    });

    /**
     * Sin ayudante: es lo que pasa en una APK de pruebas por http (los
     * navegadores solo registran el ayudante por https o en localhost). La app
     * ya estaba abierta cuando se fue el servidor: tiene que seguir igual.
     */
    test.describe('sin el ayudante (APK de pruebas por http)', () => {
        test.use({ serviceWorkers: 'block' });

        test('APAGADO-02: con la app abierta, el servidor se va y todo sigue a la vista, con el aviso', async ({ page, context }) => {
            test.setTimeout(120_000);
            let puerta = await abrirPuerta(PUERTO, DESTINO);
            try {
                await page.goto(`${WEB}/login?slug=${TENANT_SLUG}`);
                await page.fill('input[type="email"]', 'admin@testing.edu.ve');
                await page.fill('input[type="password"]', '123456');
                await Promise.all([
                    page.waitForURL('**/dashboard**', { timeout: 60_000 }),
                    page.getByRole('button', { name: /^Ingresar$/ }).click(),
                ]);
                await expect(page.getByText('Estudiantes').first()).toBeVisible({ timeout: 30_000 });
                const antes = await page.locator('main').innerText();

                await puerta.cerrar();
                await apagarLaApi(context);

                // Sin tocar nada: el canal de tiempo real se corta, se pregunta,
                // y sale el aviso.
                await expect(page.getByText('Sin conexión con el liceo').first()).toBeVisible({ timeout: 20_000 });
                expect(await page.locator('main').innerText()).toBe(antes);

                // Y guardar lo dice.
                await page.locator('header button').first().click();
                await page.getByRole('button', { name: /Cambiar mi contraseña/i }).click();
                await page.getByPlaceholder('Contraseña actual').fill('123456');
                await page.getByPlaceholder(/Contraseña nueva/).fill('otraclave123');
                await page.getByPlaceholder(/Repite/).fill('otraclave123');
                await page.getByRole('button', { name: /Guardar la contraseña nueva/i }).click();
                await expect(page.getByText(/Sin conexión con el liceo\. Esto necesita conexión/).first()).toBeVisible({ timeout: 25_000 });
            } finally {
                await puerta.cerrar().catch(() => undefined);
                await context.unroute(`${API}/**`).catch(() => undefined);
            }
        });
    });
});
