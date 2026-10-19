import { test, expect, type Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { loginViaUI, queryTenantDb } from './helpers';

/**
 * MEDIR LA PRIMERA ENTRADA (fase 0 del plan de la precarga, 18-oct-2026)
 *
 * No es una prueba que se ponga en rojo: MIDE. Por cada rol entra como la
 * primera vez en un teléfono y apunta, cada 200 ms, lo que enseña la pantalla
 * de la descarga (la fase, el % de la barra, «X de Y MB», la velocidad).
 * Guarda además la captura de red (HAR) para analizarla con REA.
 *
 *   FRIO=1  borra antes el paquete preparado de esa persona (es una caché):
 *           así se mide lo que le pasa a quien entra el primer día.
 *
 * Con la web compilada (el ayudante solo existe así):
 *   MEDIR=1 WEB_BASE=http://localhost:3100 FRIO=1 npx playwright test medir-primera-entrada
 *
 * Deja en docs/mediciones/primera-entrada-<rol>.json la línea de tiempo y en
 * .har la captura.
 */

test.skip(!process.env.MEDIR, 'Solo mide con MEDIR=1');
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
test.setTimeout(15 * 60_000);

const SALIDA = path.resolve(__dirname, '../../docs/mediciones');

async function correoDe(rol: 'alumno' | 'profesor' | 'admin'): Promise<{ id: string; email: string }> {
    const sql = {
        alumno: `SELECT u.id, u.email FROM users u
                   JOIN student_classrooms sc ON sc."studentId" = u.id AND sc."isActive" = true
                   JOIN classrooms c ON c.id = sc."classroomId"
                   JOIN academic_years ay ON ay.id = c."academicYearId" AND ay.status = 'ACTIVE'
                  WHERE u.role = 'STUDENT' AND u."isActive" ORDER BY u.email LIMIT 1`,
        profesor: `SELECT u.id, u.email FROM classroom_subjects cs JOIN users u ON u.id = cs."teacherId"
                    WHERE u."isActive" GROUP BY u.id, u.email ORDER BY count(*) DESC, u.email LIMIT 1`,
        admin: `SELECT id, email FROM users WHERE email = 'admin@testing.edu.ve'`,
    }[rol];
    const [fila] = await queryTenantDb<{ id: string; email: string }>(sql);
    return fila;
}

async function muestras(page: Page, hasta: () => boolean) {
    const linea: Array<Record<string, unknown>> = [];
    const t0 = Date.now();
    while (!hasta()) {
        const m = await page
            .evaluate(() => {
                const d = document.querySelector('[data-precarga]');
                if (!d) return null;
                const estado = d.querySelector('[role="status"]')?.textContent ?? '';
                const pct = /(\d+)\s*%/.exec(estado)?.[1];
                const textos = [...d.querySelectorAll('p')].map((p) => p.textContent?.trim()).filter(Boolean);
                return { fase: d.getAttribute('data-precarga'), pct: pct === undefined ? null : Number(pct), textos };
            })
            .catch(() => null);
        if (m) linea.push({ ms: Date.now() - t0, ...m });
        await page.waitForTimeout(200);
    }
    return linea;
}

for (const rol of ['alumno', 'profesor', 'admin'] as const) {
    test(`MEDIR primera entrada: ${rol}`, async ({ browser }) => {
        fs.mkdirSync(SALIDA, { recursive: true });
        const quien = await correoDe(rol);
        if (process.env.FRIO) await queryTenantDb(`DELETE FROM paquetes_de_precarga WHERE "usuarioId" = $1`, [quien.id]);

        const har = path.join(SALIDA, `primera-entrada-${rol}.har`);
        const ctx = await browser.newContext({
            viewport: { width: 390, height: 844 },
            hasTouch: true,
            isMobile: true,
            recordHar: { path: har, content: 'omit' },
        });
        const page = await ctx.newPage();
        await page.addInitScript(() => {
            try {
                localStorage.setItem('gestiedu:precarga-en-el-navegador', '1');
            } catch {
                /* nada */
            }
        });

        const inicio = Date.now();
        await loginViaUI(page, quien.email);
        await expect(page.locator('[data-precarga]')).toBeVisible({ timeout: 60_000 });
        let listo = false;
        const vigia = (async () => {
            await expect
                .poll(
                    () => page.evaluate(() => !!JSON.parse(localStorage.getItem('gestiedu:precarga') || 'null')?.completa),
                    { timeout: 14 * 60_000, intervals: [250] }
                )
                .toBe(true);
            listo = true;
        })();
        const linea = await muestras(page, () => listo);
        await vigia;
        const ms = Date.now() - inicio;
        const bytes = await page.evaluate(() => JSON.parse(localStorage.getItem('gestiedu:precarga') || '{}').bytes ?? 0);

        // ¿La barra retrocede? Cuántas veces y cuánto.
        let retrocesos = 0;
        let peor = 0;
        let antes = -1;
        for (const m of linea) {
            const p = m.pct as number | null;
            if (p === null) continue;
            if (p < antes) {
                retrocesos++;
                peor = Math.max(peor, antes - p);
            }
            antes = p;
        }
        await ctx.close();
        const resumen = { rol, frio: !!process.env.FRIO, segundos: ms / 1000, mbGuardados: bytes / 1e6, retrocesos, peorRetroceso: peor, muestras: linea.length };
        console.log('MEDIR', JSON.stringify(resumen));
        fs.writeFileSync(path.join(SALIDA, `primera-entrada-${rol}.json`), JSON.stringify({ resumen, linea }, null, 1));
    });
}
