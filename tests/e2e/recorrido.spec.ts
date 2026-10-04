import { test, expect, type Page } from '@playwright/test';
import { WEB_BASE, captureEvidence, loginViaUI, queryTenantDb } from './helpers';
import { MEDIR, TELEFONO, BANDA_ARRIBA, BANDA_ABAJO, DEDO, LETRA, ZONAS_DE_UN_TELEFONO, QUE_SIGNIFICA } from '../../scripts/reglas-del-telefono.mjs';

/**
 * EL RECORRIDO GUIADO, COMO EN RIAL (RECORRIDO-UI-01…04, 2026-10-04)
 *
 *   01  el «?» abre el de la pantalla; avanza, retrocede, con el teclado;
 *       el hueco cae sobre el botón de verdad; Escape cierra y el foco vuelve
 *   02  en el teléfono, cada paso del alumno se ve entero y cumple las reglas
 *       del teléfono (dedo y letra); no le sale lo que es del admin
 *   03  la primera vez se OFRECE, una sola vez
 *   04  el «¿Cómo funciona?» de la clase en vivo abre el suyo
 */

const AJUSTES = { bandaArriba: BANDA_ARRIBA, bandaAbajo: BANDA_ABAJO, dedo: DEDO, letra: LETRA };

const globo = (page: Page) => page.getByRole('dialog', { name: /.+/ }).filter({ has: page.getByText(/^\d+ de \d+$/) });

/** Lo que ilumina el hueco y dónde está el elemento de verdad. */
async function elHueco(page: Page) {
    return page.evaluate(() => {
        const hueco = document.querySelector<HTMLElement>('[data-recorrido-hueco]');
        if (!hueco) return null;
        const donde = hueco.dataset.recorridoHueco!;
        const h = hueco.getBoundingClientRect();
        const el = Array.from(document.querySelectorAll<HTMLElement>(`[data-recorrido="${donde}"]`)).find((x) => x.getBoundingClientRect().width > 0);
        const r = el?.getBoundingClientRect();
        const cubre = Boolean(r && h.left <= r.left + 1 && h.top <= r.top + 1 && h.right >= r.right - 1 && h.bottom >= r.bottom - 1);
        const caja = (x?: DOMRect) => (x ? [x.left, x.top, x.right, x.bottom].map(Math.round).join(',') : 'nada');
        return { donde, cubre, detalle: `hueco ${caja(h)} · elemento ${caja(r)}` };
    });
}

async function esperarElHueco(page: Page) {
    // La pantalla baja sola (suave): se espera a que deje de moverse y a que
    // el hueco esté sobre su botón (o a que pasen 4 s, y entonces falla).
    let antes = '';
    const hasta = Date.now() + 4000;
    while (Date.now() < hasta) {
        await page.waitForTimeout(150);
        const ahora = JSON.stringify(await page.evaluate(() => document.querySelector('[data-recorrido-hueco]')?.getBoundingClientRect() ?? null));
        const h = await elHueco(page);
        if (ahora === antes && (!h || h.cubre)) return;
        antes = ahora;
    }
}

test.describe('Recorrido guiado', () => {
    test('RECORRIDO-UI-01: el «?» abre el de la pantalla; avanza, retrocede y se cierra', async ({ page }, testInfo) => {
        try {
            await loginViaUI(page, 'admin@testing.edu.ve', '123456');
            await page.goto(`${WEB_BASE}/dashboard`);
            await expect(page.getByRole('region', { name: 'Cuadro de honor' })).toBeVisible({ timeout: 30000 });
            const boton = page.getByRole('button', { name: '¿Cómo funciona esta pantalla?' }).first();
            await boton.click();

            const g = globo(page);
            await expect(g).toBeVisible();
            await expect(g.getByText('Bienvenido a Gestiedu')).toBeVisible();
            await expect(g).toBeFocused();
            const total = Number((await g.getByText(/^\d+ de \d+$/).textContent())!.split(' de ')[1]);
            expect(total).toBeGreaterThanOrEqual(5);

            await g.getByRole('button', { name: 'Siguiente' }).click();
            await esperarElHueco(page);
            expect(await elHueco(page)).toMatchObject({ donde: 'inicio-cifras', cubre: true });

            // Con el teclado, como en rial con el dedo.
            await page.keyboard.press('ArrowRight');
            await esperarElHueco(page);
            expect((await elHueco(page))?.donde).toBe('accesos');
            await page.keyboard.press('ArrowLeft');
            await expect(g.getByText(/^2 de /)).toBeVisible();

            // Hasta el cuadro de honor: la pantalla baja sola y el hueco lo cubre.
            for (let n = 0; n < total && (await elHueco(page))?.donde !== 'cuadro-de-honor'; n++) {
                await g.getByRole('button', { name: 'Siguiente' }).click();
                await esperarElHueco(page);
            }
            expect(await elHueco(page)).toMatchObject({ donde: 'cuadro-de-honor', cubre: true });
            await page.screenshot({ path: 'test-results/evidencia/recorrido-admin.png' });

            // Lo de detrás no se toca mientras se explica.
            await page.mouse.click(5, 5);
            await expect(g).toBeVisible();

            await page.keyboard.press('Escape');
            await expect(g).toHaveCount(0);
            await expect(boton).toBeFocused();
        } catch (e) {
            await captureEvidence(testInfo, page, 'RECORRIDO-UI-01', 'Recorrido del admin', e);
            throw e;
        }
    });

    test.describe('en el teléfono', () => {
        test.use({ viewport: TELEFONO, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });

        test('RECORRIDO-UI-02: el del alumno se ve entero en cada paso y cumple las reglas del teléfono', async ({ page }, testInfo) => {
            try {
                const [alumno] = await queryTenantDb<{ email: string }>(
                    `SELECT u.email FROM users u JOIN student_classrooms sc ON sc."studentId" = u.id AND sc."isActive" = true
                      WHERE u.role = 'STUDENT' AND u."isActive" = true ORDER BY u.email LIMIT 1`
                );
                await loginViaUI(page, alumno.email, '123456');
                await page.goto(`${WEB_BASE}/dashboard`);
                await page.waitForLoadState('networkidle').catch(() => undefined);
                await page.addStyleTag({ content: ZONAS_DE_UN_TELEFONO });
                await page.getByRole('button', { name: '¿Cómo funciona esta pantalla?' }).first().click();
                const g = globo(page);
                await expect(g).toBeVisible();

                const vistos: string[] = [];
                const faltas: string[] = [];
                for (let n = 0; n < 20; n++) {
                    await esperarElHueco(page);
                    const hueco = await elHueco(page);
                    if (hueco) {
                        vistos.push(hueco.donde);
                        expect(hueco.cubre, `el hueco no cubre «${hueco.donde}»: ${hueco.detalle}`).toBe(true);
                    }
                    // El globo, dentro del cristal y sin tapar la franja del reloj ni la de gestos.
                    const caja = (await g.boundingBox())!;
                    expect(caja.x).toBeGreaterThanOrEqual(0);
                    expect(caja.x + caja.width).toBeLessThanOrEqual(TELEFONO.width);
                    expect(caja.y).toBeGreaterThanOrEqual(BANDA_ARRIBA);
                    expect(caja.y + caja.height).toBeLessThanOrEqual(TELEFONO.height - BANDA_ABAJO);
                    for (const f of (await page.evaluate(MEDIR, AJUSTES)) as Array<{ regla: string; detalle: string }>) {
                        if (f.regla === 'dedo' || f.regla === 'letra' || f.regla === 'ancho') faltas.push(`${QUE_SIGNIFICA[f.regla] ?? f.regla}: ${f.detalle}`);
                    }
                    if (n === 1) await page.screenshot({ path: 'test-results/evidencia/recorrido-alumno-telefono.png' });
                    const listo = g.getByRole('button', { name: 'Listo' });
                    if (await listo.count()) {
                        await listo.click();
                        break;
                    }
                    await g.getByRole('button', { name: 'Siguiente' }).click();
                }
                await expect(g).toHaveCount(0);
                expect(vistos).toEqual(expect.arrayContaining(['mi-dia', 'menu', 'campana', 'ayuda']));
                expect(vistos).not.toContain('cuadro-de-honor');
                expect(vistos).not.toContain('inicio-cifras');
                expect([...new Set(faltas)], faltas.join('\n')).toEqual([]);
            } catch (e) {
                await captureEvidence(testInfo, page, 'RECORRIDO-UI-02', 'Recorrido del alumno en el teléfono', e);
                throw e;
            }
        });
    });

    test('RECORRIDO-UI-03: la primera vez se ofrece, una sola vez', async ({ page }, testInfo) => {
        try {
            await loginViaUI(page, 'admin@testing.edu.ve', '123456');
            // Las pruebas no ven la oferta (taparía lo que pulsan) salvo que la pidan;
            // y lo visto de esta persona se olvida para empezar de cero.
            await page.evaluate(() => {
                localStorage.setItem('gestiedu:ofrecer-recorridos', '1');
                for (const k of Object.keys(localStorage)) if (k.startsWith('gestiedu:recorridos-vistos:')) localStorage.removeItem(k);
            });
            await page.goto(`${WEB_BASE}/dashboard/usuarios`);
            const oferta = page.getByRole('region', { name: 'Recorrido de la pantalla' });
            await expect(oferta).toBeVisible({ timeout: 15000 });
            await expect(oferta.getByText('¿Te enseño esta pantalla?')).toBeVisible();
            await oferta.getByRole('button', { name: 'Ver cómo funciona' }).click();
            const g = globo(page);
            await expect(g).toBeVisible();
            await esperarElHueco(page);
            expect((await elHueco(page))?.donde).toBe('usuarios-nuevo');
            await g.getByRole('button', { name: 'Saltar el recorrido' }).click();
            await expect(g).toHaveCount(0);

            await page.reload();
            await expect(page.getByRole('heading', { name: 'Usuarios' })).toBeVisible({ timeout: 20000 });
            await page.waitForTimeout(3000);
            await expect(oferta).toHaveCount(0);
        } catch (e) {
            await captureEvidence(testInfo, page, 'RECORRIDO-UI-03', 'La oferta del recorrido', e);
            throw e;
        } finally {
            await page.evaluate(() => localStorage.removeItem('gestiedu:ofrecer-recorridos')).catch(() => undefined);
        }
    });

    test('RECORRIDO-UI-04: el «¿Cómo funciona?» de la clase en vivo abre el suyo, con el botón de asistencia', async ({ page }, testInfo) => {
        try {
            const [clase] = await queryTenantDb<{ classroom_id: string; subject_id: string; profe_email: string }>(
                `SELECT cs."classroomId" AS classroom_id, cs."subjectId" AS subject_id, u.email AS profe_email
                   FROM classroom_subjects cs
                   JOIN users u ON u.id = cs."teacherId" AND u."isActive" = true
                   JOIN classrooms c ON c.id = cs."classroomId"
                   JOIN academic_years ay ON ay.id = c."academicYearId" AND ay.status = 'ACTIVE'
                  WHERE EXISTS (SELECT 1 FROM student_classrooms sc WHERE sc."classroomId" = cs."classroomId" AND sc."isActive" = true)
                  LIMIT 1`
            );
            await loginViaUI(page, clase.profe_email, '123456');
            await page.goto(`${WEB_BASE}/dashboard/clase-en-vivo/${clase.classroom_id}/${clase.subject_id}`);
            await page.getByRole('button', { name: '¿Cómo funciona?', exact: true }).click({ timeout: 30000 });
            const g = globo(page);
            await expect(g.getByText('Qué toca hoy')).toBeVisible();
            const vistos: string[] = [];
            for (let n = 0; n < 10; n++) {
                await esperarElHueco(page);
                const h = await elHueco(page);
                if (h) {
                    expect(h.cubre, `el hueco no cubre «${h.donde}»: ${h.detalle}`).toBe(true);
                    vistos.push(h.donde);
                }
                if (h?.donde === 'clase-asistencia') await page.screenshot({ path: 'test-results/evidencia/recorrido-clase-en-vivo.png' });
                const listo = g.getByRole('button', { name: 'Listo' });
                if (await listo.count()) {
                    await listo.click();
                    break;
                }
                await g.getByRole('button', { name: 'Siguiente' }).click();
            }
            expect(vistos).toEqual(expect.arrayContaining(['clase-tema', 'clase-actividades', 'clase-asistencia', 'clase-alumnos', 'clase-observacion']));
        } catch (e) {
            await captureEvidence(testInfo, page, 'RECORRIDO-UI-04', 'Recorrido de la clase en vivo', e);
            throw e;
        }
    });
});
