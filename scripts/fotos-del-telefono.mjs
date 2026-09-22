#!/usr/bin/env node
/**
 * LA APP DEL TELÉFONO, EN UNA SOLA HOJA
 *
 *   npm run fotos            (con los servidores arriba)
 *
 * Entra como cada rol, recorre sus pantallas a tamaño de móvil y guarda una
 * foto de cada una. Al final deja una hoja de contactos —`index.html`— con
 * todas juntas: se abre en el navegador y se ve de un vistazo qué está mal, sin
 * tener que ir pantalla por pantalla en el teléfono ni mandar capturas.
 *
 * Dice también, debajo de cada foto, si esa pantalla **se sale de ancho**: es
 * el fallo que no se nota mirando y hace que la pantalla se mueva de lado.
 */

import { chromium } from 'playwright';
import { mkdir, writeFile, rm } from 'fs/promises';
import { existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const CARPETA = join(RAIZ, 'docs', 'capturas-movil');

const WEB = process.argv.find((a) => a.startsWith('--web='))?.slice(6) || 'http://localhost:3000';
const LICEO = process.argv.find((a) => a.startsWith('--liceo='))?.slice(8) || 'instituto-testing';
const CLAVE = '123456';

/** El teléfono de referencia: un Android normal. */
const TELEFONO = { width: 390, height: 844 };

const RECORRIDOS = [
    {
        rol: 'Administrador',
        email: 'admin@testing.edu.ve',
        pantallas: [
            ['Inicio', '/dashboard'],
            ['Académico', '/dashboard/academico'],
            ['Aulas y secciones', '/dashboard/aulas'],
            ['Materias', '/dashboard/materias'],
            ['Horarios', '/dashboard/horarios'],
            ['Usuarios', '/dashboard/usuarios'],
            ['Calendario', '/dashboard/calendario'],
            ['Eventos', '/dashboard/eventos'],
            ['Pagos', '/dashboard/pagos'],
            ['Configuración', '/dashboard/configuracion'],
        ],
    },
    {
        rol: 'Profesor',
        email: 'profesor.ciencias@tuapp.com',
        pantallas: [
            ['Inicio', '/dashboard'],
            ['Académico', '/dashboard/academico'],
            ['Materias', '/dashboard/materias'],
            ['Horarios', '/dashboard/horarios'],
            ['Calendario', '/dashboard/calendario'],
        ],
    },
    {
        rol: 'Estudiante',
        email: 'est0575@testing.edu.ve',
        pantallas: [
            ['Inicio', '/dashboard'],
            ['Calendario', '/dashboard/calendario'],
        ],
    },
    {
        rol: 'Representante',
        email: 'tutor.prueba@testing.edu.ve',
        pantallas: [
            ['Inicio', '/dashboard'],
            ['Calendario', '/dashboard/calendario'],
        ],
    },
];

const nombreDeArchivo = (rol, pantalla) =>
    `${rol}-${pantalla}`.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-');

async function entrar(page, email) {
    await page.goto(`${WEB}/login?slug=${LICEO}`, { waitUntil: 'domcontentloaded' });
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', CLAVE);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard**', { timeout: 30000 });
    await page.waitForTimeout(2500);
}

/** Lo que no se ve mirando: si la pantalla se sale de ancho. */
async function seSaleDeAncho(page) {
    return page.evaluate(() => {
        const sw = document.documentElement.scrollWidth;
        const w = window.innerWidth;
        return sw > w + 1 ? `${sw} px en una pantalla de ${w}` : null;
    });
}

async function main() {
    if (existsSync(CARPETA)) await rm(CARPETA, { recursive: true, force: true });
    await mkdir(CARPETA, { recursive: true });

    const navegador = await chromium.launch();
    const fichas = [];

    for (const recorrido of RECORRIDOS) {
        const contexto = await navegador.newContext({
            viewport: TELEFONO,
            deviceScaleFactor: 2,
            isMobile: true,
            hasTouch: true,
        });
        const page = await contexto.newPage();

        try {
            await entrar(page, recorrido.email);
        } catch {
            console.log(`  (no se pudo entrar como ${recorrido.rol}: ${recorrido.email})`);
            await contexto.close();
            continue;
        }

        for (const [titulo, ruta] of recorrido.pantallas) {
            try {
                await page.goto(`${WEB}${ruta}`, { waitUntil: 'domcontentloaded' });
                await page.waitForTimeout(3000);

                const archivo = `${nombreDeArchivo(recorrido.rol, titulo)}.png`;
                await page.screenshot({ path: join(CARPETA, archivo) });
                const desborde = await seSaleDeAncho(page);

                fichas.push({ rol: recorrido.rol, titulo, ruta, archivo, desborde });
                console.log(`  ${recorrido.rol} · ${titulo}${desborde ? `  ← SE SALE (${desborde})` : ''}`);
            } catch (e) {
                console.log(`  ${recorrido.rol} · ${titulo} — no se pudo: ${String(e).slice(0, 80)}`);
            }
        }

        await contexto.close();
    }

    await navegador.close();
    await writeFile(join(CARPETA, 'index.html'), hoja(fichas), 'utf-8');

    console.log(`\nListo: ${fichas.length} pantallas.\nAbre  docs/capturas-movil/index.html`);
}

function hoja(fichas) {
    const porRol = fichas.reduce((acc, f) => {
        (acc[f.rol] ??= []).push(f);
        return acc;
    }, {});

    const bloques = Object.entries(porRol)
        .map(([rol, suyas]) => `
    <section>
      <h2>${rol}</h2>
      <div class="rejilla">
        ${suyas
            .map(
                (f) => `<figure${f.desborde ? ' class="mal"' : ''}>
          <img src="${f.archivo}" alt="${f.rol}: ${f.titulo}" loading="lazy" />
          <figcaption>
            <strong>${f.titulo}</strong>
            <span class="ruta">${f.ruta}</span>
            ${f.desborde ? `<span class="aviso">Se sale de ancho: ${f.desborde}</span>` : ''}
          </figcaption>
        </figure>`
            )
            .join('\n        ')}
      </div>
    </section>`)
        .join('\n');

    const conFallo = fichas.filter((f) => f.desborde).length;

    return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>La app en el teléfono</title>
<style>
  :root { color-scheme: light; }
  body { margin: 0; padding: 24px; background: #f5f6f9; color: #0f172a;
         font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
  h1 { font-size: 1.5rem; margin: 0 0 4px; }
  .resumen { color: #475569; margin: 0 0 28px; font-size: .95rem; }
  .resumen b { color: #b91c1c; }
  h2 { font-size: 1.05rem; margin: 28px 0 12px; text-transform: uppercase;
       letter-spacing: .06em; color: #475569; }
  .rejilla { display: grid; gap: 20px; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); }
  figure { margin: 0; background: #fff; border: 1px solid #e2e8f0; border-radius: 16px;
           overflow: hidden; box-shadow: 0 1px 3px rgba(15,23,42,.06); }
  figure.mal { border-color: #fca5a5; box-shadow: 0 0 0 3px rgba(248,113,113,.15); }
  img { display: block; width: 100%; height: auto; border-bottom: 1px solid #f1f5f9; }
  figcaption { padding: 12px 14px; display: grid; gap: 2px; font-size: .85rem; }
  .ruta { color: #64748b; font-family: ui-monospace, monospace; font-size: .75rem; }
  .aviso { margin-top: 6px; color: #b91c1c; font-weight: 700; font-size: .78rem; }
</style>
</head>
<body>
  <h1>La app en el teléfono</h1>
  <p class="resumen">
    ${fichas.length} pantallas a ${TELEFONO.width} × ${TELEFONO.height}, como un Android normal.
    ${conFallo ? `<b>${conFallo} se salen de ancho.</b>` : 'Ninguna se sale de ancho.'}
    Hecho el ${new Date().toLocaleString('es-VE')}.
  </p>
${bloques}
</body>
</html>`;
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
