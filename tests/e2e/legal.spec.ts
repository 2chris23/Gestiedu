import { test, expect } from '@playwright/test';
import { WEB_BASE, captureEvidence, loginViaUI, queryTenantDb } from './helpers';

/**
 * LO LEGAL (19-oct-2026; `lib/legal/documentos.ts`)
 *
 *   LEGAL-UI-01 la página pública: el índice con los doce documentos, cada uno en su
 *               página, sin sesión, y los enlaces del pie de la portada
 *   LEGAL-UI-02 la primera vez se piden aceptar los términos: sin marcar no se sigue;
 *               al aceptar queda en el servidor y no se vuelve a pedir
 *   LEGAL-UI-03 Configuración → Información legal: cuándo aceptó y cada documento para leerlo
 */

const DOCUMENTOS = ['terminos', 'privacidad', 'menores', 'liceos', 'tratamiento-de-datos', 'uso-aceptable', 'cookies', 'seguridad', 'conservacion', 'derechos', 'proveedores', 'aviso-legal'];

test('LEGAL-UI-01: las páginas legales, públicas, una por documento', async ({ page }, testInfo) => {
    try {
        await page.goto(`${WEB_BASE}/legal`);
        await expect(page.getByRole('heading', { name: 'Información legal', level: 1 })).toBeVisible();
        for (const id of DOCUMENTOS) await expect(page.locator(`a[href="/legal/${id}"]`).first()).toBeVisible();
        for (const id of DOCUMENTOS) {
            const r = await page.goto(`${WEB_BASE}/legal/${id}`);
            expect(r?.status(), id).toBe(200);
            await expect(page.locator('h1')).toBeVisible();
            await expect(page.getByText('Última actualización')).toBeVisible();
        }
        expect((await page.goto(`${WEB_BASE}/legal/no-existe`))?.status()).toBe(404);
        await page.goto(`${WEB_BASE}/`);
        await expect(page.getByRole('contentinfo').getByRole('link', { name: 'Privacidad' })).toHaveAttribute('href', '/legal/privacidad');
        for (const entrar of ['/login?slug=instituto-testing', '/instituto/instituto-testing/login']) {
            await page.goto(`${WEB_BASE}${entrar}`);
            await expect(page.getByRole('navigation', { name: 'Información legal' }).getByRole('link', { name: 'Términos' }), entrar).toHaveAttribute('href', '/legal/terminos', { timeout: 20000 });
        }
    } catch (e) {
        await captureEvidence(testInfo, page, 'LEGAL-UI-01', 'Las páginas legales', e);
        throw e;
    }
});

test.describe('En la app', () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

    test('LEGAL-UI-02: la primera vez se aceptan los términos, y no se vuelven a pedir', async ({ page }, testInfo) => {
        const correo = 'est0575@testing.edu.ve';
        const [yo] = await queryTenantDb<{ id: string }>(`SELECT id FROM users WHERE email = $1`, [correo]);
        await queryTenantDb(`DELETE FROM aceptaciones_legales WHERE "usuarioId" = $1`, [yo.id]);
        try {
            await page.addInitScript(() => localStorage.setItem('gestiedu:pedir-lo-legal', '1'));
            await loginViaUI(page, correo);
            const ventana = page.locator('[data-aceptar-lo-legal]');
            await expect(ventana).toBeVisible({ timeout: 30000 });
            await expect(ventana.getByRole('heading', { name: 'Antes de empezar' })).toBeVisible();
            // Se leen dentro de la app.
            await ventana.getByRole('button', { name: /Términos y condiciones de uso/ }).click();
            await expect(ventana.getByText('1. Qué es Gestiedu')).toBeVisible();
            // Al estudiante también se le enseña lo de los datos de menores.
            await expect(ventana.getByRole('button', { name: /Datos de niños, niñas y adolescentes/ })).toBeVisible();
            const aceptar = ventana.getByRole('button', { name: 'Aceptar y continuar' });
            await expect(aceptar).toBeDisabled();
            await ventana.getByRole('checkbox').check();
            await aceptar.click();
            await expect(ventana).toHaveCount(0, { timeout: 15000 });
            const filas = await queryTenantDb(`SELECT 1 FROM aceptaciones_legales WHERE "usuarioId" = $1`, [yo.id]);
            expect(filas).toHaveLength(1);
            await page.reload();
            await page.waitForTimeout(2500);
            await expect(page.locator('[data-aceptar-lo-legal]')).toHaveCount(0);
        } catch (e) {
            await captureEvidence(testInfo, page, 'LEGAL-UI-02', 'Aceptar los términos', e);
            throw e;
        }
    });

    test('LEGAL-UI-03: Configuración → Información legal', async ({ page }, testInfo) => {
        try {
            await loginViaUI(page, 'est0575@testing.edu.ve');
            await page.goto(`${WEB_BASE}/dashboard/configuracion?seccion=legal`);
            const lista = page.locator('[data-informacion-legal]');
            await expect(lista).toBeVisible({ timeout: 30000 });
            await expect(lista.locator('li')).toHaveCount(DOCUMENTOS.length);
            await lista.getByRole('button', { name: /Política de privacidad/ }).click();
            await expect(page.getByText('2. Qué datos se guardan')).toBeVisible();
        } catch (e) {
            await captureEvidence(testInfo, page, 'LEGAL-UI-03', 'Información legal en Configuración', e);
            throw e;
        }
    });
});
