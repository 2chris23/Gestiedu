/**
 * FOTOS DE LA PORTADA, EN VARIOS TAMAÑOS
 *
 * Qué hace: abre la portada compilada y guarda una foto del principio
 * (texto + aparatos) en cada tamaño, más una de la página entera en
 * teléfono y escritorio. También una con «menos movimiento».
 * Qué NO hace: comprobar nada; para eso está `tests/e2e/portada.spec.ts`.
 *
 * Uso (desde la raíz, con la web en :3000):
 *   node docs/nube/portada/fotos-portada.mjs <carpeta> [espera_ms]
 */
import { chromium } from '@playwright/test';

const WEB = process.env.WEB_BASE || 'http://localhost:3000';
const carpeta = process.argv[2] || 'docs/nube/portada';
const espera = Number(process.argv[3] || 2500);

const TAMANOS = [
    ['360', 360, 780, true],
    ['390', 390, 844, true],
    ['tumbado', 844, 390, true],
    ['tableta', 768, 1024, true],
    ['portatil', 1366, 768, false],
    ['escritorio', 1920, 1080, false],
];

const browser = await chromium.launch();
for (const [nombre, width, height, movil] of TAMANOS) {
    const ctx = await browser.newContext({ viewport: { width, height }, isMobile: movil, hasTouch: movil, deviceScaleFactor: 1 });
    const p = await ctx.newPage();
    await p.goto(WEB + '/');
    await p.locator('[data-escaparate]').first().scrollIntoViewIfNeeded();
    await p.waitForTimeout(espera);
    await p.screenshot({ path: `${carpeta}/portada-${nombre}.png` });
    if (nombre === '390' || nombre === 'portatil') {
        await p.evaluate(() => window.scrollTo(0, 0));
        await p.screenshot({ path: `${carpeta}/portada-${nombre}-entera.jpg`, fullPage: true, type: 'jpeg', quality: 70 });
    }
    await ctx.close();
}
const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 }, reducedMotion: 'reduce' });
const p = await ctx.newPage();
await p.goto(WEB + '/');
await p.locator('[data-escaparate]').first().scrollIntoViewIfNeeded();
await p.waitForTimeout(1500);
await p.screenshot({ path: `${carpeta}/portada-quieta.png` });
await browser.close();
