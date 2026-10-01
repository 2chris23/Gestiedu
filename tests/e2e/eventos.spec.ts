import { test, expect } from '@playwright/test';
import axios from 'axios';
import { API_BASE, WEB_BASE, TENANT_SLUG, loginApi, injectSessionCookies, captureEvidence, queryTenantDb } from './helpers';

/**
 * LOS EVENTOS DEL LICEO: UN DÍA SIN CLASES Y LAS HORAS DE LA TARDE
 *
 * Lo pidió el dueño (28-09-2026): con doble clic en un día, suspender las
 * clases del día entero —de todo el liceo, de un año o de una sección—; y el
 * panel del día enseñaba solo las horas de la mañana.
 *
 * Un lunes de dentro de dos o tres semanas, lejos de las pruebas que usan
 * «hoy». Era un lunes fijo de octubre y la prueba pulsaba «Mes siguiente»
 * contando con estar en septiembre: el 1 de octubre se iba a noviembre.
 */
const DIA = (() => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + 14 + ((8 - d.getUTCDay()) % 7));
    return d.toISOString().slice(0, 10);
})();
const TITULO = 'Sin clases e2e';

async function borrarLosDeLaPrueba() {
    const admin = await loginApi('admin@testing.edu.ve', '123456');
    const h = { Authorization: `Bearer ${admin.accessToken}`, 'x-tenant-slug': TENANT_SLUG };
    const filas = await queryTenantDb<{ id: string }>(`SELECT id FROM school_events WHERE title = $1`, [TITULO]);
    // Por la API: así se reactivan las clases que suspendió.
    for (const f of filas) await axios.delete(`${API_BASE}/events/${f.id}`, { headers: h });
}

test.beforeAll(borrarLosDeLaPrueba);
test.afterAll(borrarLosDeLaPrueba);

test('EVENTO-UI-01: doble clic en un día suspende las clases del día entero, de una sola sección', async ({ page }, testInfo) => {
    try {
        await injectSessionCookies(page, await loginApi('admin@testing.edu.ve', '123456'));
        await page.goto(`${WEB_BASE}/dashboard/eventos`);
        // El mes que lo tiene: este, o el siguiente.
        await expect(page.locator('[data-dia]').first()).toBeVisible({ timeout: 60000 });
        if (!(await page.locator(`[data-dia="${DIA}"]`).count())) await page.getByRole('button', { name: 'Mes siguiente' }).click();
        await page.locator(`[data-dia="${DIA}"]`).dblclick();

        const ventana = page.getByRole('dialog', { name: 'Día sin clases' });
        await expect(ventana).toBeVisible({ timeout: 30000 });
        // Sin «Hasta»: es el día entero.
        await expect(ventana.getByLabel('Hasta')).toHaveCount(0);
        await ventana.getByLabel('Título').fill(TITULO);
        await ventana.getByRole('button', { name: /Secciones/ }).click();
        await ventana.locator('div.flex-wrap button').first().click();
        await expect(ventana.getByText(/Se suspenderán \d+ clases?/)).toBeVisible({ timeout: 15000 });
        await ventana.getByRole('button', { name: 'Suspender las clases' }).click();
        await expect(page.getByText(/Evento creado/)).toBeVisible({ timeout: 15000 });

        const [ev] = await queryTenantDb<any>(
            `SELECT "startTime", "endTime", scope, cardinality("classroomIds") AS n FROM school_events WHERE title = $1`,
            [TITULO]
        );
        expect(ev).toMatchObject({ startTime: '00:00', endTime: '23:59', scope: 'CLASSROOMS', n: 1 });
        // En el panel se lee «Todo el día», no 00:00–23:59.
        await expect(page.getByText(/Todo el día · 1 sección/)).toBeVisible();
        await page.screenshot({ path: testInfo.outputPath('dia-sin-clases.png') });
    } catch (e) {
        await captureEvidence(testInfo, page, 'EVENTO-UI-01', 'Día sin clases con doble clic', e);
        throw e;
    }
});

test('EVENTO-UI-02: el panel del día enseña también las horas de la tarde', async ({ page }, testInfo) => {
    await injectSessionCookies(page, await loginApi('admin@testing.edu.ve', '123456'));
    await page.goto(`${WEB_BASE}/dashboard/eventos`);
    const turno = page.getByRole('group', { name: 'Turno' });
    await turno.getByRole('button', { name: /Tarde/ }).click({ timeout: 60000 });
    await expect(turno.getByRole('button', { name: /Tarde/ })).toHaveAttribute('aria-pressed', 'true');
    // La primera hora de la tarde empieza pasado el mediodía.
    const primera = page.getByText(/^1RA HORA$/i).first().locator('xpath=following-sibling::div[1]');
    const hora = (await primera.innerText()).trim();
    expect(hora >= '12:00', `la primera hora de la tarde sale a las ${hora}`).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('eventos-tarde.png') });
});
