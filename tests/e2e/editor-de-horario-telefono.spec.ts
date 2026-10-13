import { test, expect, type Page } from '@playwright/test';
import { WEB_BASE, loginApi, injectSessionCookies, captureEvidence, queryTenantDb } from './helpers';

/**
 * EL EDITOR DE HORARIO EN EL TELÉFONO, COMO SE USA DE VERDAD (octubre 2026)
 *
 * Un amigo de Cristian lo probó: «no se siente intuitivo» y los botones de
 * Android tapaban la semana. Lo que se pide es sencillo: coger una materia de
 * la izquierda y soltarla en la semana, mover una clase a otro hueco, y al
 * tocar una clase, que salga el botón de quitarla.
 *
 *   HORARIO-TEL-01  con el dedo y el teléfono tumbado: tocar una clase saca
 *                   «Quitar»; quitarla la devuelve a la lista; y llevar la
 *                   materia DE LADO hasta el hueco la coge al instante (sin
 *                   esperar pulsando) y la deja ahí.
 *   HORARIO-TEL-02  el editor se aparta de los botones de Android (los lados
 *                   seguros de la pantalla).
 *
 * No se guarda nada: se sale sin guardar.
 */

const TELEFONO_TUMBADO = { width: 844, height: 390 };
test.use({ viewport: TELEFONO_TUMBADO, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });

async function abrirElEditor(page: Page) {
    const [seccion] = await queryTenantDb<{ id: string }>(
        `SELECT c.id FROM classrooms c
         JOIN schedule_blocks b ON b."classroomSubjectId" IN (SELECT id FROM classroom_subjects WHERE "classroomId" = c.id)
         GROUP BY c.id ORDER BY count(*) DESC LIMIT 1`
    );
    const sesion = await loginApi('admin@testing.edu.ve', '123456');
    await injectSessionCookies(page, sesion);
    await page.goto(`${WEB_BASE}/dashboard/horarios/seccion/${seccion.id}`);
    const editor = page.getByRole('dialog', { name: 'Editar el horario' });
    await expect(editor.locator('.rejilla-densa [aria-roledescription="draggable"]').first()).toBeVisible({ timeout: 30000 });
    return editor;
}

/** Un dedo de verdad (eventos táctiles), de un punto a otro, en pasos. */
async function arrastrarConElDedo(page: Page, desde: { x: number; y: number }, hasta: { x: number; y: number }) {
    const cdp = await page.context().newCDPSession(page);
    const tocar = (type: string, x: number, y: number) =>
        cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] } as never);
    await tocar('touchStart', desde.x, desde.y);
    // De lado primero: así se coge al instante, sin mantener pulsado.
    for (let i = 1; i <= 4; i++) await tocar('touchMove', desde.x + i * 5, desde.y);
    const pasos = 12;
    for (let i = 1; i <= pasos; i++) {
        await tocar('touchMove', desde.x + 20 + ((hasta.x - desde.x - 20) * i) / pasos, desde.y + ((hasta.y - desde.y) * i) / pasos);
        await page.waitForTimeout(16);
    }
    await tocar('touchEnd', hasta.x, hasta.y);
    await cdp.detach();
}

const centro = (b: { x: number; y: number; width: number; height: number }) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });

test.describe('El editor de horario en el teléfono', () => {
    test('HORARIO-TEL-01: tocar una clase saca «Quitar», y una materia se lleva de lado hasta el hueco', async ({ page }, testInfo) => {
        try {
            const editor = await abrirElEditor(page);
            const enLaSemana = editor.locator('.rejilla-densa [aria-roledescription="draggable"]');
            const antes = await enLaSemana.count();

            const clase = enLaSemana.first();
            const nombre = ((await clase.locator('span').first().textContent()) ?? '').trim();
            const hueco = centro((await clase.boundingBox())!);

            // Tocarla: sale «Quitar», grande, y quitarla la devuelve a la lista.
            await page.touchscreen.tap(hueco.x, hueco.y);
            const quitar = editor.getByRole('button', { name: `Quitar ${nombre} de esta hora`, exact: true });
            await expect(quitar).toBeVisible();
            await quitar.tap();
            await expect(enLaSemana).toHaveCount(antes - 1);

            const materia = editor.locator('aside [aria-roledescription="draggable"]', { hasText: nombre });
            await expect(materia).toBeVisible();

            // Llevarla de lado hasta el hueco que quedó libre.
            await arrastrarConElDedo(page, centro((await materia.boundingBox())!), hueco);
            await expect(enLaSemana).toHaveCount(antes);
            const puesta = enLaSemana.filter({ hasText: nombre });
            await expect(puesta.first()).toBeVisible();

            // Y no se guarda: se sale sin guardar.
            expect(await editor.getByRole('button', { name: 'Guardar' }).isEnabled()).toBe(true);
        } catch (error) {
            await captureEvidence(testInfo, page, 'HORARIO-TEL-01', 'El editor de horario con el dedo', error);
            throw error;
        }
    });

    test('HORARIO-TEL-02: el editor se aparta de los botones de Android', async ({ page }, testInfo) => {
        try {
            const editor = await abrirElEditor(page);
            const lados = await editor.evaluate((e) => [(e as HTMLElement).style.paddingLeft, (e as HTMLElement).style.paddingRight]);
            expect(lados).toEqual(['env(safe-area-inset-left, 0px)', 'env(safe-area-inset-right, 0px)']);
        } catch (error) {
            await captureEvidence(testInfo, page, 'HORARIO-TEL-02', 'Los lados seguros del editor', error);
            throw error;
        }
    });
});
