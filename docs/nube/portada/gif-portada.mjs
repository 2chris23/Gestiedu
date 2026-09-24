/**
 * EL GIF DEL ESCAPARATE (para el informe)
 *
 * Qué hace: abre la portada compilada en un portátil (1280×800), deja que
 * los aparatos den una vuelta entera y guarda una foto cada 250 ms en
 * <carpeta>/cuadros/. Luego `gif-portada.py` los junta en un GIF.
 * Qué NO hace: medir nada.
 *
 * Uso (desde la raíz, con la web en :3000):
 *   node docs/nube/portada/gif-portada.mjs <carpeta> [segundos]
 */
import { chromium } from '@playwright/test';
import fs from 'fs';

const WEB = process.env.WEB_BASE || 'http://localhost:3000';
const carpeta = process.argv[2];
const segundos = Number(process.argv[3] || 40);
fs.mkdirSync(`${carpeta}/cuadros`, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto(WEB + '/');
const escaparate = page.locator('[data-escaparate]');
await escaparate.scrollIntoViewIfNeeded();
await page.evaluate(() => window.scrollBy(0, 60));
await page.waitForTimeout(1500);
const caja = await escaparate.boundingBox();
const zona = { x: caja.x, y: caja.y, width: caja.width, height: caja.height + 110 };
const fin = Date.now() + segundos * 1000;
let n = 0;
while (Date.now() < fin) {
    const t = Date.now();
    await page.screenshot({ path: `${carpeta}/cuadros/${String(n++).padStart(4, '0')}.png`, clip: zona });
    await page.waitForTimeout(Math.max(0, 250 - (Date.now() - t)));
}
await browser.close();
console.log(n, 'cuadros');
