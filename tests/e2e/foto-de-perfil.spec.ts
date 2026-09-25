import { test, expect } from '@playwright/test';
import sharp from 'sharp';
import { WEB_BASE, loginViaUI, captureEvidence, queryTenantDb } from './helpers';

/**
 * LA FOTO DE PERFIL, EN EL NAVEGADOR
 *
 * El admin elige una foto de ~2 MB, el navegador la achica, el servidor la deja
 * en WebP 256 px, y la foto aparece en el círculo del perfil. Después se quita.
 */

test.describe('Foto de perfil', () => {
    let alumno: { id: string };

    test.beforeAll(async () => {
        [alumno] = await queryTenantDb(
            `SELECT id FROM users WHERE role = 'STUDENT' AND status = 'ACTIVE' AND avatar IS NULL ORDER BY id LIMIT 1`
        );
    });

    test.afterAll(async () => {
        if (!alumno) return;
        await queryTenantDb(`DELETE FROM user_photos WHERE "userId" = $1`, [alumno.id]);
        await queryTenantDb(`UPDATE users SET avatar = NULL WHERE id = $1`, [alumno.id]);
    });

    test('FOTO-UI-01: el admin pone una foto grande, queda pequeña y se ve; luego la quita', async ({ page }, testInfo) => {
        try {
            expect(alumno?.id).toBeTruthy();

            // Una foto "de teléfono" de 12 MP.
            const w = 3000, h = 4000;
            const px = Buffer.alloc(w * h * 3);
            for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
                const i = (y * w + x) * 3;
                const g = ((x * 2654435761) ^ (y * 40503)) >>> 26;
                px[i] = ((x / w) * 200 + g) | 0; px[i + 1] = ((y / h) * 200 + g) | 0; px[i + 2] = 120;
            }
            const foto = await sharp(px, { raw: { width: w, height: h, channels: 3 } }).jpeg({ quality: 88 }).toBuffer();

            await loginViaUI(page, 'admin@testing.edu.ve', '123456');
            await page.goto(`${WEB_BASE}/dashboard/usuarios/${alumno.id}`);
            const poner = page.getByRole('button', { name: 'Poner foto' });
            await expect(poner).toBeVisible({ timeout: 30000 });

            const [elegir] = await Promise.all([page.waitForEvent('filechooser'), poner.click()]);
            await elegir.setFiles({ name: 'foto-telefono.jpg', mimeType: 'image/jpeg', buffer: foto });

            await expect(page.getByText(/Foto guardada: de .* MB a \d+ KB/)).toBeVisible({ timeout: 30000 });

            // Se pinta desde memoria (blob:), con la sesión, no con una dirección pública.
            const img = page.locator('img[src^="blob:"]').first();
            await expect(img).toBeVisible({ timeout: 15000 });
            expect(await img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBe(256);

            const [fila] = await queryTenantDb(`SELECT size FROM user_photos WHERE "userId" = $1`, [alumno.id]);
            expect(fila.size).toBeLessThan(25_000);
            await page.screenshot({ path: 'test-results/evidencia/foto-de-perfil.png' });

            await page.getByRole('button', { name: 'Quitar foto' }).click();
            await page.getByRole('button', { name: 'Quitar', exact: true }).click();
            await expect(page.getByRole('button', { name: 'Poner foto' })).toBeVisible({ timeout: 15000 });
            expect(await queryTenantDb(`SELECT 1 FROM user_photos WHERE "userId" = $1`, [alumno.id])).toHaveLength(0);
        } catch (error) {
            await captureEvidence(testInfo, page, 'FOTO-UI-01', 'Poner y quitar foto', error);
            throw error;
        }
    });
});
