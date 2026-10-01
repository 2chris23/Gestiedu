import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import net from 'net';
import axios from 'axios';
import { TENANT_SLUG, captureEvidence, loginApi, queryTenantDb } from './helpers';

/**
 * SE TRABAJA SIN CONEXIÓN, COMO EN WHATSAPP (2026-09-30)
 *
 * El profesor, sin servidor, pasa lista: queda pendiente (⏱) en el teléfono,
 * sobrevive a cerrar y abrir la app, y sube sola cuando vuelve el servidor.
 * Necesita la web COMPILADA (el cliente de desarrollo no arranca sin servidor).
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

const compilada = async () => {
    const html = await (await fetch(`http://127.0.0.1:${DESTINO}/login`)).text().catch(() => '');
    return !(html.includes('hmr-client') || html.includes('webpack-hmr'));
};

test('SINCON-UI-01: sin servidor se pasa lista; queda ⏱, sobrevive a recargar y sube sola al volver', async ({ page, context }, testInfo) => {
    test.setTimeout(240_000);
    test.skip(!(await compilada()), 'Necesita la web COMPILADA (WEB_DESTINO)');
    const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas' }).format(new Date());
    const [clase] = await queryTenantDb<{ seccion: string; materia: string }>(
        `SELECT cs."classroomId" AS seccion, cs."subjectId" AS materia
           FROM classroom_subjects cs JOIN users u ON u.id = cs."teacherId"
           JOIN classrooms cl ON cl.id = cs."classroomId" JOIN academic_years ay ON ay.id = cl."academicYearId" AND ay.status = 'ACTIVE'
          WHERE u.email = 'profesor18@testing.edu.ve' ORDER BY cl.grade, cl.section LIMIT 1`
    );
    const url = `${WEB}/dashboard/clase-en-vivo/${clase.seccion}/${clase.materia}?date=${hoy}`;
    const pasarLista = async (p: Page) => {
        await p.goto(url);
        await p.getByRole('button', { name: /Pasar asistencia|Corregir asistencia/ }).click({ timeout: 60_000 });
        const g = p.getByRole('group', { name: /^Asistencia de / }).first();
        await expect(g).toBeVisible({ timeout: 30_000 });
        return g;
    };
    let puerta = await abrirPuerta(PUERTO, DESTINO);
    try {
        await page.setViewportSize({ width: 1280, height: 900 });
        await entrar(page, 'profesor18@testing.edu.ve');
        const grupo = await pasarLista(page);
        const nombre = (await grupo.getAttribute('aria-label'))!.replace('Asistencia de ', '');
        const [alumno] = await queryTenantDb<{ id: string }>(
            `SELECT u.id FROM users u JOIN student_classrooms sc ON sc."studentId" = u.id AND sc."classroomId" = $1 AND sc."isActive"
              WHERE u."firstName" || ' ' || u."lastName" = $2 LIMIT 1`,
            [clase.seccion, nombre]
        );
        // Lo que se pone es distinto de lo que hay. No se borra nada a mano en
        // la base: eso no avisa a nadie (ni a la memoria rápida del servidor),
        // la pantalla enseñaría lo de antes y el servidor —bien— preguntaría.
        const [hay] = await queryTenantDb<{ status: string }>(`SELECT status FROM daily_attendance WHERE "studentId" = $1 AND date = $2::date`, [alumno.id, hoy]);
        const [boton, esperado] = hay?.status === 'LATE' ? ['Ausente', 'ABSENT'] : ['Tardanza', 'LATE'];
        await page.waitForTimeout(3000); // que lo abierto quede guardado en el teléfono

        // ── Sin servidor: se pasa lista ──────────────────────────────────
        await puerta.cerrar();
        await apagarLaApi(context);
        await grupo.getByRole('button', { name: boton }).click();
        await expect(page.getByText('Pendiente de enviar').first()).toBeVisible({ timeout: 20_000 });
        await expect(page.getByRole('button', { name: /sin enviar: tocar para ver/ })).toBeVisible();

        // Se cierra y se abre la app sin servidor: sigue ahí, pendiente.
        await page.reload();
        await expect(page.getByRole('button', { name: /sin enviar: tocar para ver/ })).toBeVisible({ timeout: 30_000 });
        await page.getByRole('button', { name: /sin enviar: tocar para ver/ }).click();
        await expect(page.getByRole('dialog', { name: 'Lo que hiciste sin conexión' })).toContainText('Clase de');
        await page.screenshot({ path: testInfo.outputPath('pendiente-sin-conexion.png') });
        await page.keyboard.press('Escape');

        // ── Vuelve el servidor: sube sola ─────────────────────────────────
        puerta = await abrirPuerta(PUERTO, DESTINO);
        await context.unroute(`${API}/**`);
        await expect(page.getByRole('button', { name: /sin enviar: tocar para ver/ })).toHaveCount(0, { timeout: 60_000 });
        // Si quedó «por decidir», que la prueba diga qué chocó y con quién.
        const decidir = page.getByRole('button', { name: /por decidir: tocar para ver/ });
        if (await decidir.isVisible().catch(() => false)) {
            await decidir.click();
            const texto = await page.getByRole('dialog', { name: 'Lo que hiciste sin conexión' }).innerText();
            const filas = await queryTenantDb(`SELECT da.status, da."teacherId", da."modificadoPorId", da."updatedAt" FROM daily_attendance da WHERE da."studentId" = $1 AND da.date = $2::date`, [alumno.id, hoy]);
            const cola = await page.evaluate(
                () =>
                    new Promise((ok) => {
                        const r = indexedDB.open('gestiedu');
                        r.onsuccess = () => {
                            const t = r.result.transaction('por-enviar').objectStore('por-enviar').getAll();
                            t.onsuccess = () => ok(t.result.map((c: any) => ({ datos: c.datos, choque: c.choque })));
                        };
                    })
            );
            throw new Error(`Quedó por decidir: ${texto}
En la base: ${JSON.stringify(filas)}
Alumno: ${alumno.id}
Cola: ${JSON.stringify(cola).slice(0, 3000)}`);
        }
        await expect
            .poll(async () => (await queryTenantDb<{ status: string }>(`SELECT status FROM daily_attendance WHERE "studentId" = $1 AND date = $2::date`, [alumno.id, hoy]))[0]?.status, {
                timeout: 20_000,
            })
            .toBe(esperado);
        const [recibido] = await queryTenantDb<{ n: string }>(`SELECT count(*) AS n FROM cambios_recibidos WHERE ruta = '/api/sessions/live-save'`);
        expect(Number(recibido.n)).toBeGreaterThan(0);
    } catch (e) {
        await captureEvidence(testInfo, page, 'SINCON-UI-01', 'Lo hecho sin conexión no quedó pendiente o no subió al volver', e);
        throw e;
    } finally {
        await puerta.cerrar().catch(() => undefined);
        await context.unroute(`${API}/**`).catch(() => undefined);
    }
});

test('SINCON-UI-06: una observación hecha sin servidor queda pendiente y llega sola, una sola vez', async ({ page, context }, testInfo) => {
    test.setTimeout(240_000);
    test.skip(!(await compilada()), 'Necesita la web COMPILADA (WEB_DESTINO)');
    const titulo = `Sin conexión ${Date.now()}`;
    let puerta = await abrirPuerta(PUERTO, DESTINO);
    try {
        await page.setViewportSize({ width: 1280, height: 900 });
        await entrar(page, 'profesor18@testing.edu.ve');
        await page.goto(`${WEB}/dashboard/observaciones`);
        await page.getByRole('button', { name: /Nueva observación/ }).click({ timeout: 60_000 });
        await page.locator('#obs-buscar').fill('a');
        await page.getByRole('list', { name: 'Alumnos encontrados' }).getByRole('button').first().click({ timeout: 30_000 });

        // Se va el servidor con la ventana a medio llenar.
        await puerta.cerrar();
        await apagarLaApi(context);
        await page.locator('#obs-titulo').fill(titulo);
        await page.getByRole('button', { name: 'Guardar observación' }).click();
        await expect(page.getByText(/la observación quedó pendiente/)).toBeVisible({ timeout: 20_000 });
        await expect(page.getByRole('button', { name: /sin enviar: tocar para ver/ })).toBeVisible();

        puerta = await abrirPuerta(PUERTO, DESTINO);
        await context.unroute(`${API}/**`);
        await expect(page.getByRole('button', { name: /sin enviar: tocar para ver/ })).toHaveCount(0, { timeout: 60_000 });
        const filas = await queryTenantDb<{ n: string }>(`SELECT count(*) AS n FROM observations WHERE title = $1`, [titulo]);
        expect(Number(filas[0].n)).toBe(1);
    } catch (e) {
        await captureEvidence(testInfo, page, 'SINCON-UI-06', 'La observación sin conexión no quedó pendiente o no llegó', e);
        throw e;
    } finally {
        await puerta.cerrar().catch(() => undefined);
        await context.unroute(`${API}/**`).catch(() => undefined);
    }
});

test('SINCON-UI-07: el admin cambia la configuración sin servidor; queda pendiente y llega sola', async ({ page, context }, testInfo) => {
    test.setTimeout(240_000);
    test.skip(!(await compilada()), 'Necesita la web COMPILADA (WEB_DESTINO)');
    const admin = await loginApi('admin@testing.edu.ve', '123456');
    const cab = { Authorization: `Bearer ${admin.accessToken}`, 'X-Institute-Slug': TENANT_SLUG };
    const leer = async () => (await axios.get(`${API}/api/institutes/current/config`, { headers: cab })).data.data;
    const antes = await leer();
    const direccion = `Calle sin conexión ${Date.now()}`;
    let puerta = await abrirPuerta(PUERTO, DESTINO);
    try {
        await page.setViewportSize({ width: 1280, height: 900 });
        await entrar(page, 'admin@testing.edu.ve');
        await page.goto(`${WEB}/dashboard/configuracion`);
        const campo = page.locator('input[name="address"], textarea[name="address"]');
        await expect(campo).toBeVisible({ timeout: 60_000 });
        await page.waitForTimeout(3000); // que lo abierto quede guardado en el teléfono

        await puerta.cerrar();
        await apagarLaApi(context);
        await campo.fill(direccion);
        await page.getByRole('button', { name: 'Guardar Cambios' }).click();
        await expect(page.getByText(/el cambio quedó pendiente/)).toBeVisible({ timeout: 20_000 });
        await expect(page.getByRole('button', { name: /sin enviar: tocar para ver/ })).toBeVisible();

        puerta = await abrirPuerta(PUERTO, DESTINO);
        await context.unroute(`${API}/**`);
        await expect(page.getByRole('button', { name: /sin enviar: tocar para ver/ })).toHaveCount(0, { timeout: 60_000 });
        const ahora = await leer();
        expect(ahora.address).toBe(direccion);
        // Lo que no tocó sigue igual.
        expect(ahora.name).toBe(antes.name);
    } catch (e) {
        await captureEvidence(testInfo, page, 'SINCON-UI-07', 'La configuración sin conexión no quedó pendiente o no llegó', e);
        throw e;
    } finally {
        await puerta.cerrar().catch(() => undefined);
        await context.unroute(`${API}/**`).catch(() => undefined);
        await axios.put(`${API}/api/institutes/current/config`, { address: antes.address ?? '' }, { headers: cab }).catch(() => undefined);
    }
});
