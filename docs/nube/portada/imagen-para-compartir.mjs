/**
 * LA IMAGEN PARA COMPARTIR (Open Graph), SACADA DE LA PROPIA PORTADA
 *
 * Qué hace: abre la portada compilada con «menos movimiento» (la foto fija
 * con las tres pantallas enteras), fotografía los aparatos y los pone al lado
 * del titular en un lienzo de 1200×630, el tamaño que usan WhatsApp,
 * Facebook, LinkedIn y X. Guarda `apps/web/public/portada-compartir.jpg`.
 * Así la imagen enseña lo mismo que la portada, sin inventar nada.
 * Qué NO hace: publicarla. Solo se anuncia en la página si al compilar hay
 * `NEXT_PUBLIC_SITIO_URL` (ver `components/landing/contacto.ts`).
 *
 * Uso (desde la raíz, con la web en :3000):
 *   node docs/nube/portada/imagen-para-compartir.mjs
 */
import { chromium } from '@playwright/test';
import { statSync } from 'node:fs';

const WEB = process.env.WEB_BASE || 'http://localhost:3000';
const SALIDA = 'apps/web/public/portada-compartir.jpg';

const browser = await chromium.launch();

// 1. Los aparatos, quietos y a doble resolución, sobre transparente.
const ctx = await browser.newContext({
    viewport: { width: 1366, height: 900 },
    deviceScaleFactor: 2,
    reducedMotion: 'reduce',
});
const p = await ctx.newPage();
await p.goto(WEB + '/', { waitUntil: 'networkidle' });
// El gorro de la marca, el mismo SVG de la cabecera.
const gorro = await p.locator('header a[href="/"] svg').first().evaluate((e) => e.outerHTML);
const escenario = p.locator('[data-escaparate]').first();
await escenario.scrollIntoViewIfNeeded();
await p.waitForTimeout(1500);
// Sin el fondo de la sección: solo los aparatos, para ponerlos sobre el lienzo.
await escenario.evaluate((el) => {
    for (let n = el; n; n = n.parentElement) {
        n.style.setProperty('background', 'transparent', 'important');
        n.style.setProperty('box-shadow', 'none', 'important');
    }
});
const aparatos = (await escenario.screenshot({ omitBackground: true })).toString('base64');
await ctx.close();

// 2. El lienzo: titular a la izquierda, aparatos a la derecha.
const lienzo = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await lienzo.setContent(`<!doctype html><html lang="es"><head><style>
  * { box-sizing: border-box; margin: 0; }
  body { width: 1200px; height: 630px; overflow: hidden; font-family: Inter, 'Segoe UI', Roboto, sans-serif;
         background: radial-gradient(70% 80% at 80% 20%, rgba(99,102,241,.18), transparent 70%), linear-gradient(#fff, #f1f5f9); }
  .texto { position: absolute; left: 64px; top: 0; bottom: 0; width: 440px; display: flex; flex-direction: column; justify-content: center; }
  .marca { display: flex; align-items: center; gap: 12px; font-size: 28px; font-weight: 800; color: #0f172a; }
  .marca i { width: 48px; height: 48px; border-radius: 14px; background: #4f46e5; color: #fff; display: flex; align-items: center; justify-content: center; }
  .marca svg { width: 28px; height: 28px; }
  h1 { margin-top: 28px; font-size: 44px; line-height: 1.08; font-weight: 800; letter-spacing: -.02em; color: #0f172a; }
  p { margin-top: 20px; font-size: 22px; line-height: 1.4; color: #475569; }
  img { position: absolute; right: 24px; top: 50%; transform: translateY(-50%); width: 660px; }
</style></head><body>
  <div class="texto">
    <div class="marca"><i>${gorro}</i>Gestiedu</div>
    <h1>Tu liceo al día, desde el teléfono de cada profesor</h1>
    <p>Asistencia, notas, horarios y mensualidades para liceos de Venezuela.</p>
  </div>
  <img src="data:image/png;base64,${aparatos}" alt="">
</body></html>`);
await lienzo.waitForTimeout(300);
await lienzo.screenshot({ path: SALIDA, type: 'jpeg', quality: 82 });
await browser.close();
console.log(`${SALIDA}: ${Math.round(statSync(SALIDA).size / 1024)} KB`);
