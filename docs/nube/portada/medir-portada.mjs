/**
 * LO QUE TARDA Y LO QUE SE MUEVE LA PORTADA
 *
 * Qué mide: la portada (`/`) de la web COMPILADA (`next start`), en un
 * teléfono simulado (390×844, CPU 4× más lenta, red 4G lenta) y en un
 * escritorio (1366×900, sin freno). De cada uno:
 *
 *   · FCP y LCP  — cuándo sale lo primero y cuándo lo más grande.
 *   · CLS        — cuánto «salta» la página mientras carga (tiene que ser 0).
 *   · Bloqueo    — la suma de lo que pasa de 50 ms en cada tarea larga
 *                  (lo que Lighthouse llama TBT), hasta 6 s después de cargar.
 *   · JS         — los kilobytes de JavaScript que baja (comprimidos).
 *   · Imágenes   — los kilobytes de imágenes que baja.
 *   · INP        — lo que tarda en pintarse la respuesta a un toque, el peor
 *                  de: cada botón de escena, «Pausar», «Ver 4 más» (solo en
 *                  el teléfono) y abrir una pregunta. Bueno: 200 ms o menos.
 *
 * Qué NO mide: un teléfono de verdad, la red de verdad de un liceo, ni el
 * primer arranque en frío del servidor (se hace una carga de calentamiento
 * antes). Se repite 3 veces y se da la mediana.
 *
 * Uso (desde la raíz, con la web en :3000):
 *   node docs/nube/portada/medir-portada.mjs [etiqueta]
 */
import { chromium } from '@playwright/test';

const WEB = process.env.WEB_BASE || 'http://localhost:3000';
const VECES = 3;

const PERFILES = [
    {
        nombre: 'teléfono',
        viewport: { width: 390, height: 844 },
        movil: true,
        cpu: 4,
        // «4G lenta» de Lighthouse: 150 ms de ida y vuelta, 1,6 Mb/s.
        red: { latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 },
    },
    { nombre: 'escritorio', viewport: { width: 1366, height: 900 }, movil: false, cpu: 1, red: null },
];

const mediana = (xs) => {
    const s = [...xs].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
};

async function unaVez(browser, perfil) {
    const context = await browser.newContext({
        viewport: perfil.viewport,
        isMobile: perfil.movil,
        hasTouch: perfil.movil,
        deviceScaleFactor: perfil.movil ? 2 : 1,
    });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    if (perfil.red) await cdp.send('Network.emulateNetworkConditions', { offline: false, ...perfil.red });
    if (perfil.cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: perfil.cpu });

    const bytes = { js: 0, img: 0, total: 0 };
    const tipos = new Map();
    cdp.on('Network.responseReceived', (e) => tipos.set(e.requestId, e.type));
    cdp.on('Network.loadingFinished', (e) => {
        const t = tipos.get(e.requestId);
        bytes.total += e.encodedDataLength;
        if (t === 'Script') bytes.js += e.encodedDataLength;
        if (t === 'Image') bytes.img += e.encodedDataLength;
    });

    await page.addInitScript(() => {
        window.__m = { lcp: 0, cls: 0, bloqueo: 0, fcp: 0, inp: 0 };
        new PerformanceObserver((l) => {
            for (const e of l.getEntries()) if (e.interactionId) window.__m.inp = Math.max(window.__m.inp, e.duration);
        }).observe({ type: 'event', buffered: true, durationThreshold: 16 });
        new PerformanceObserver((l) => {
            for (const e of l.getEntries()) window.__m.lcp = e.startTime;
        }).observe({ type: 'largest-contentful-paint', buffered: true });
        new PerformanceObserver((l) => {
            for (const e of l.getEntries()) if (!e.hadRecentInput) window.__m.cls += e.value;
        }).observe({ type: 'layout-shift', buffered: true });
        new PerformanceObserver((l) => {
            for (const e of l.getEntries()) window.__m.bloqueo += Math.max(0, e.duration - 50);
        }).observe({ type: 'longtask', buffered: true });
        new PerformanceObserver((l) => {
            for (const e of l.getEntries()) if (e.name === 'first-contentful-paint') window.__m.fcp = e.startTime;
        }).observe({ type: 'paint', buffered: true });
    });

    await page.goto(WEB + '/', { waitUntil: 'load' });
    await page.waitForTimeout(6000);
    // El LCP se congela con la primera interacción; se lee antes.
    const m = await page.evaluate(() => window.__m);

    // Ahora, los toques. Uno detrás de otro, con aire para que se pinte.
    const tocar = async (loc) => {
        if (!(await loc.isVisible())) return;
        await loc.scrollIntoViewIfNeeded();
        await (perfil.movil ? loc.tap() : loc.click());
        await page.waitForTimeout(400);
    };
    const escenas = page.getByRole('group', { name: 'Escenas de la demostración' }).getByRole('button');
    for (let i = 0; i < (await escenas.count()); i++) await tocar(escenas.nth(i));
    await tocar(page.getByRole('button', { name: /^(Pausar|Seguir)/ }).first());
    await tocar(page.getByRole('button', { name: /^Ver \d+ más/ }));
    await tocar(page.locator('#preguntas summary').first());
    await page.waitForTimeout(500);
    m.inp = await page.evaluate(() => window.__m.inp);
    await context.close();
    return { ...m, js: bytes.js / 1024, img: bytes.img / 1024, total: bytes.total / 1024 };
}

const etiqueta = process.argv[2] || '';
const browser = await chromium.launch();
// Calentamiento: la primera petición a `next start` compila/lee de disco.
{
    const p = await browser.newPage();
    await p.goto(WEB + '/');
    await p.close();
}
for (const perfil of PERFILES) {
    const vueltas = [];
    for (let i = 0; i < VECES; i++) vueltas.push(await unaVez(browser, perfil));
    const r = (k) => mediana(vueltas.map((v) => v[k]));
    console.log(
        `${etiqueta} ${perfil.nombre.padEnd(10)} FCP ${r('fcp').toFixed(0)} ms · LCP ${r('lcp').toFixed(0)} ms · ` +
            `CLS ${r('cls').toFixed(3)} · bloqueo ${r('bloqueo').toFixed(0)} ms · ` +
            `INP ${r('inp').toFixed(0)} ms · JS ${r('js').toFixed(0)} KB · imágenes ${r('img').toFixed(0)} KB · total ${r('total').toFixed(0)} KB`
    );
}
await browser.close();
