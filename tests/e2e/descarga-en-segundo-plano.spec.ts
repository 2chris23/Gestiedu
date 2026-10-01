import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import net from 'net';
import { TENANT_SLUG, captureEvidence } from './helpers';

/**
 * SE BAJA SOLO, COMO WHATSAPP (2026-09-30)
 *
 * Con conexión, la app baja en segundo plano lo de cada uno
 * (`lib/lo-que-se-baja-solo.ts`): el profesor, sus clases de la semana; el
 * admin, Usuarios y Académico. Sin servidor se abre también lo que NUNCA se
 * abrió. Y lo que de verdad no está guardado no saca a nadie de la app: se
 * queda donde estaba, con un aviso pequeño.
 *
 * Necesita la web COMPILADA (como `servidor-apagado.spec.ts`): el cliente de
 * desarrollo de Next no arranca sin su servidor.
 */

const PUERTO = 3107;
const WEB = `http://localhost:${PUERTO}`;
const API = 'http://localhost:3001';
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

const apagarLaApi = (contexto: BrowserContext) => contexto.route(`${API}/**`, (r) => r.abort('connectionrefused'));

async function entrar(page: Page, correo: string) {
    await page.goto(`${WEB}/login?slug=${TENANT_SLUG}`);
    await page.fill('input[type="email"]', correo);
    await page.fill('input[type="password"]', '123456');
    await Promise.all([page.waitForURL('**/dashboard**', { timeout: 60_000 }), page.getByRole('button', { name: /^Ingresar$/ }).click()]);
    await page.waitForFunction(() => !!navigator.serviceWorker?.controller, null, { timeout: 60_000 });
}

/** Las pantallas que el ayudante tiene guardadas. */
const pantallasGuardadas = (page: Page) =>
    page.evaluate(async () => {
        const salida: string[] = [];
        for (const n of await caches.keys()) {
            for (const k of await (await caches.open(n)).keys()) {
                const u = new URL(k.url);
                if (u.pathname.startsWith('/dashboard') && !u.searchParams.has('_rsc')) salida.push(u.pathname + u.search);
            }
        }
        return salida;
    });

/** Una respuesta guardada cuya dirección empieza por `prefijo`. */
const respuestaGuardada = (page: Page, prefijo: string) =>
    page.evaluate(
        (prefijo) =>
            new Promise<any>((ok) => {
                const p = indexedDB.open('gestiedu');
                p.onerror = () => ok(null);
                p.onsuccess = () => {
                    const bd = p.result;
                    if (!bd.objectStoreNames.contains('respuestas')) return ok(null);
                    const r = bd.transaction('respuestas', 'readonly').objectStore('respuestas').getAll();
                    r.onsuccess = () => ok((r.result as any[]).find((f) => f.clave.startsWith(prefijo)) ?? null);
                    r.onerror = () => ok(null);
                };
            }),
        prefijo
    );

const compilada = async () => {
    const html = await (await fetch(`http://127.0.0.1:${DESTINO}/login`)).text().catch(() => '');
    return !(html.includes('hmr-client') || html.includes('webpack-hmr'));
};

test.describe('Lo que se baja solo', () => {
    test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

    test('DESCARGA-01: el profesor, sin servidor, abre una clase de la semana que nunca abrió', async ({ page, context }, testInfo) => {
        test.setTimeout(240_000);
        test.skip(!(await compilada()), 'Necesita la web COMPILADA (WEB_DESTINO)');
        const puerta = await abrirPuerta(PUERTO, DESTINO);
        try {
            await entrar(page, 'profesor18@testing.edu.ve');

            // Sin tocar nada: se bajan solas sus clases (pantalla y datos).
            let clase = '';
            await expect
                .poll(
                    async () => {
                        clase = (await pantallasGuardadas(page)).find((p) => p.startsWith('/dashboard/clase-en-vivo/')) ?? '';
                        return Boolean(clase) && Boolean(await respuestaGuardada(page, '/sessions/live-detail?'));
                    },
                    { timeout: 150_000, intervals: [3000] }
                )
                .toBe(true);
            const [, , , seccion, materia] = clase.split('?')[0].split('/');
            const fecha = new URLSearchParams(clase.split('?')[1]).get('date');
            const detalle = await respuestaGuardada(page, `/sessions/live-detail?classroomId=${seccion}&date=${fecha}&subjectId=${materia}`);
            const alumno = detalle?.datos?.students?.[0];
            expect(alumno?.firstName).toBeTruthy();

            // Se apaga todo y se abre esa clase, que nunca se abrió.
            await puerta.cerrar();
            await apagarLaApi(context);
            await page.goto(`${WEB}${clase}`);
            // La materia a la vista, y sus alumnos en la lista (plegada en el teléfono).
            await expect(page.getByText(detalle.datos.subject.name).first()).toBeVisible({ timeout: 30_000 });
            await expect(page.getByText(alumno.firstName).first()).toBeAttached();
            await expect(page.getByText('Sin conexión con el liceo').first()).toBeVisible({ timeout: 20_000 });
            await page.screenshot({ path: testInfo.outputPath('clase-sin-servidor.png') });
        } catch (e) {
            await captureEvidence(testInfo, page, 'DESCARGA-01', 'La clase bajada en segundo plano no se abrió sin servidor', e);
            throw e;
        } finally {
            await puerta.cerrar().catch(() => undefined);
            await context.unroute(`${API}/**`).catch(() => undefined);
        }
    });

    test('DESCARGA-02: el admin, sin servidor, abre Usuarios sin haberlo abierto; lo no guardado lo deja donde estaba', async ({ page, context }, testInfo) => {
        test.setTimeout(240_000);
        test.skip(!(await compilada()), 'Necesita la web COMPILADA (WEB_DESTINO)');
        const puerta = await abrirPuerta(PUERTO, DESTINO);
        try {
            await entrar(page, 'admin@testing.edu.ve');
            await expect
                .poll(
                    async () =>
                        (await pantallasGuardadas(page)).includes('/dashboard/usuarios') &&
                        Boolean(await respuestaGuardada(page, '/users?limit=10&page=1&status=ACTIVE')),
                    { timeout: 150_000, intervals: [3000] }
                )
                .toBe(true);
            const lista = await respuestaGuardada(page, '/users?limit=10&page=1&status=ACTIVE');
            const primero = lista?.datos?.users?.[0];
            expect(primero?.firstName).toBeTruthy();

            await puerta.cerrar();
            await apagarLaApi(context);
            await page.goto(`${WEB}/dashboard/usuarios`);
            await expect(page.getByText(primero.firstName).first()).toBeVisible({ timeout: 30_000 });

            // Una pantalla que no se bajó: se queda en Usuarios, con el aviso.
            // Como al tocar un enlace: se viene de Usuarios.
            await page.goto(`${WEB}/dashboard/labor-social`, { referer: `${WEB}/dashboard/usuarios` });
            await expect(page.getByText(/aún no está guardada en este teléfono/)).toBeVisible({ timeout: 20_000 });
            expect(new URL(page.url()).pathname).toBe('/dashboard/usuarios');
            await expect(page.getByRole('heading', { name: 'No hay conexión con el liceo' })).toHaveCount(0);
            await page.screenshot({ path: testInfo.outputPath('usuarios-sin-servidor.png') });
        } catch (e) {
            await captureEvidence(testInfo, page, 'DESCARGA-02', 'Usuarios bajado en segundo plano no se abrió sin servidor', e);
            throw e;
        } finally {
            await puerta.cerrar().catch(() => undefined);
            await context.unroute(`${API}/**`).catch(() => undefined);
        }
    });
});
