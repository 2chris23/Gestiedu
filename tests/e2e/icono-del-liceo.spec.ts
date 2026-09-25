import { test, expect } from '@playwright/test';
import axios from 'axios';
import { API_BASE, WEB_BASE, TENANT_SLUG, loginViaUI } from './helpers';

/**
 * EL ICONO DE LA PESTAÑA ES EL DEL LICEO
 *
 * El liceo subía su favicon, Configuración decía «Guardado» y la pestaña
 * seguía con el birrete azul de la plataforma: `app/layout.tsx` declaraba
 * `/favicon.svg` y Chrome lo prefería al PNG del liceo que se añadía después.
 * Ahora lo declarado ya es `/icono-de-pestana`, que responde con el del liceo.
 */

const API = API_BASE.replace(/\/api\/?$/, '');

test.describe('Icono del liceo', () => {
    test('FAV-01: dentro del liceo, la pestaña declara el icono del liceo y no el de la plataforma', async ({ page }) => {
        const { data } = await axios.get(`${API_BASE}/institutes/current/config`, {
            headers: { 'X-Institute-Slug': TENANT_SLUG },
        });
        const favicon: string | undefined = data?.data?.favicon;
        test.skip(!favicon, 'El liceo de pruebas no tiene favicon subido');

        await loginViaUI(page, 'admin@testing.edu.ve');
        await page.goto(`${WEB_BASE}/dashboard`);

        const declarados = await page.$$eval('link[rel~="icon"]', (ls) =>
            ls.map((l) => l.getAttribute('href') || '')
        );
        expect(declarados).toContain('/icono-de-pestana');
        expect(declarados.filter((h) => h.startsWith('/favicon.'))).toEqual([]);

        // Lo que responde es, byte a byte, el archivo que subió el liceo.
        const suyo = await axios.get(`${API}${favicon}`, { responseType: 'arraybuffer' });
        const r = await page.request.get(`${WEB_BASE}/icono-de-pestana`);
        expect(r.status()).toBe(200);
        expect(r.headers()['content-type']).toMatch(/^image\//);
        expect(r.headers()['cache-control']).toContain('private');
        expect(Buffer.from(await r.body()).equals(Buffer.from(suyo.data))).toBe(true);
    });

    test('FAV-02: sin liceo, el icono es el de la plataforma; y la portada no cambia aunque quede la cookie', async ({ page, context }) => {
        const sin = await page.request.get(`${WEB_BASE}/icono-de-pestana`, { maxRedirects: 0 });
        expect(sin.status()).toBe(307);
        expect(sin.headers()['location']).toContain('/favicon.svg');

        await context.addCookies([{ name: 'institute_slug', value: TENANT_SLUG, domain: 'localhost', path: '/' }]);
        await page.goto(`${WEB_BASE}/`);
        const declarados = await page.$$eval('link[rel~="icon"]', (ls) =>
            ls.map((l) => l.getAttribute('href') || '')
        );
        expect(declarados).toContain('/favicon.svg');
        expect(declarados).not.toContain('/icono-de-pestana');
    });
});
