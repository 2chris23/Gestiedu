import { test, expect } from '@playwright/test';
import axios from 'axios';
import { API_BASE, WEB_BASE, TENANT_SLUG, loginApi, loginViaUI, injectSessionCookies, captureEvidence } from './helpers';

/**
 * LOS DATOS OFICIALES DEL PLANTEL, DE CONFIGURACIÓN A LA HOJA IMPRESA
 *
 *   MEMB-UI-01  el admin pone el código DEA y la entidad en Configuración →
 *               Información General, y se guardan (el código, sin guiones);
 *   MEMB-UI-02  la boleta y la constancia del alumno los llevan en el membrete,
 *               con las líneas del ministerio.
 *
 * Al acabar se dejan los datos del plantel como estaban.
 */

const CAMPOS = ['nombreOficial', 'codigoDea', 'codigoEstadistico', 'codigoDependencia', 'zonaEducativa', 'entidadFederal', 'municipio', 'parroquia', 'textoDelMinisterio'];

test.describe.serial('El membrete oficial', () => {
    let cabeceras: Record<string, string>;
    let antes: Record<string, string> = {};

    test.beforeAll(async () => {
        const { accessToken } = await loginApi('admin@testing.edu.ve', '123456');
        cabeceras = { Authorization: `Bearer ${accessToken}`, 'X-Institute-Slug': TENANT_SLUG };
        const { data } = await axios.get(`${API_BASE}/institutes/current/config`, { headers: cabeceras });
        const cfg = data?.data?.configuration ?? data?.data?.academicConfig ?? {};
        const docs = (typeof cfg === 'string' ? JSON.parse(cfg) : cfg)?.documentos ?? {};
        antes = Object.fromEntries(CAMPOS.map((c) => [c, typeof docs[c] === 'string' ? docs[c] : '']));
    });

    test.afterAll(async () => {
        await axios.put(`${API_BASE}/institutes/current/config`, { configuration: { documentos: antes } }, { headers: cabeceras });
    });

    test('MEMB-UI-01: el admin pone el código DEA y la entidad, y se guardan', async ({ page }, testInfo) => {
        try {
            await loginViaUI(page, 'admin@testing.edu.ve', '123456');
            await page.goto(`${WEB_BASE}/dashboard/configuracion`);
            const seccion = page.getByRole('region', { name: 'Datos oficiales del plantel' });
            await expect(seccion).toBeVisible({ timeout: 30000 });

            await seccion.getByLabel(/Código DEA/).fill('od-0054 1105');
            await seccion.getByLabel(/Código estadístico/).fill('111299');
            await seccion.getByLabel('Municipio').fill('Valencia');
            await seccion.getByRole('combobox', { name: 'Entidad federal' }).click();
            await page.getByRole('option', { name: 'Carabobo', exact: true }).click();
            await page.getByRole('button', { name: /Guardar Cambios/ }).click();
            await expect(page.getByText('Configuración actualizada exitosamente')).toBeVisible({ timeout: 15000 });

            const { data } = await axios.get(`${API_BASE}/institutes/current/membrete`, { headers: cabeceras });
            expect(data.data).toMatchObject({ codigoDea: 'OD00541105', codigoEstadistico: '111299', municipio: 'Valencia', entidadFederal: 'Carabobo' });
        } catch (error) {
            await captureEvidence(testInfo, page, 'MEMB-UI-01', 'Datos del plantel', error);
            throw error;
        }
    });

    test('MEMB-UI-02: la boleta y la constancia del alumno llevan el membrete con el código DEA', async ({ page }, testInfo) => {
        try {
            const alumno = await loginApi('est0575@testing.edu.ve', '123456');
            await injectSessionCookies(page, alumno);

            await page.goto(`${WEB_BASE}/dashboard/boleta/mia`);
            const boleta = page.getByRole('article', { name: 'Boleta de calificaciones' });
            await expect(boleta).toBeVisible({ timeout: 30000 });
            await expect(boleta).toContainText('Ministerio del Poder Popular para la Educación');
            await expect(boleta).toContainText('Código DEA: OD00541105');
            await expect(boleta).toContainText('Municipio Valencia · Estado Carabobo');
            await boleta.locator('[data-membrete]').screenshot({ path: 'test-results/evidencia/membrete-boleta.png' });

            await page.goto(`${WEB_BASE}/dashboard/constancia/mia`);
            const constancia = page.getByRole('article', { name: 'Constancia de estudio' });
            await expect(constancia).toBeVisible({ timeout: 30000 });
            await expect(constancia).toContainText('Código DEA: OD00541105');
        } catch (error) {
            await captureEvidence(testInfo, page, 'MEMB-UI-02', 'Membrete en la boleta', error);
            throw error;
        }
    });
});
