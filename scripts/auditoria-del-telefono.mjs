#!/usr/bin/env node
/**
 * LA APP EN EL TELÉFONO, MEDIDA DE VERDAD
 *
 *   npm run movil            (con los dos servidores arriba)
 *
 * ─── POR QUÉ SE REESCRIBIÓ ──────────────────────────────────────────────────
 *
 * Lo que había antes recorría 19 pantallas, hacía una foto de cada una y
 * comprobaba UNA cosa: `documentElement.scrollWidth > innerWidth`. Daba verde
 * mientras en el teléfono había ocho fallos a la vista. No mentía: medía lo
 * que no era.
 *
 *   · la barra de estado tapando la cabecera  → eso es ALTO, no ancho;
 *   · la tabla de alumnos que hay que arrastrar → vive dentro de un
 *     `overflow-x-auto`, así que el documento NO crece y el número no se
 *     entera;
 *   · cuatro tarjetas ocupando la pantalla entera → eso es densidad.
 *
 * Un medidor que da verde mientras al usuario se le rompe la pantalla es peor
 * que no tener ninguno. Este comprueba seis cosas, y cada una nació de un
 * fallo real fotografiado en un Android.
 *
 * ─── LAS SEIS REGLAS ────────────────────────────────────────────────────────
 *
 *  1. ancho        La pantalla no se sale de ancho.
 *  2. arrastre     Nada de dentro se arrastra de lado (ni tablas, ni rejillas).
 *  3. banda-arriba La franja del reloj y la batería está TAPADA por algo opaco.
 *  4. banda-abajo  Lo mismo con la barra de gestos de abajo.
 *  5. dedo         Lo que se pulsa mide 44 px o más.
 *  6. letra        Nada por debajo de 12 px.
 *
 * ─── LO DE LAS BANDAS, QUE TIENE TRUCO ──────────────────────────────────────
 *
 * En un ordenador `env(safe-area-inset-top)` vale 0: no hay muesca. Así que
 * una comprobación de píxeles no vería nunca este fallo, ni antes ni después
 * de arreglarlo.
 *
 * Por eso la app no lee `env()` a pelo: lo guarda en dos variables
 * (`--zona-segura-arriba` / `--zona-segura-abajo`, en `globals.css`) y las usa
 * a través de ellas. Aquí se les pone el valor de un teléfono de verdad —40 px
 * arriba, 24 px abajo— y la página reserva ese hueco como lo reservaría en el
 * móvil. Entonces sí se puede medir: **¿queda algo dentro de la banda sin nada
 * opaco por encima?**
 *
 * Deja `docs/capturas-movil/index.html`: todas las pantallas juntas, cada una
 * con lo que incumple escrito debajo y marcada en rojo.
 */

import { chromium } from 'playwright';
import pg from 'pg';
import { mkdir, writeFile, rm } from 'fs/promises';
import { existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const CARPETA = join(RAIZ, 'docs', 'capturas-movil');

const WEB = process.argv.find((a) => a.startsWith('--web='))?.slice(6) || 'http://localhost:3000';
const LICEO = process.argv.find((a) => a.startsWith('--liceo='))?.slice(8) || 'instituto-testing';
const SOLO = process.argv.find((a) => a.startsWith('--rol='))?.slice(6) || null;
const CLAVE = '123456';

const BD =
    process.env.TEST_DB_URL ||
    'postgresql://postgres:82nQKb95S7wNDmuxyvIG6dOYkZUo@localhost:5432/tenant_instituto_testing';

/** El teléfono de referencia: un Android normal. */
const TELEFONO = { width: 390, height: 844 };

/** Lo que se come el sistema en ese teléfono. */
const BANDA_ARRIBA = 40;
const BANDA_ABAJO = 24;

/** El mínimo para un dedo. Apple dice 44, Google 48; se exige el menor. */
const DEDO = 44;
const LETRA = 12;

// ════════════════════════════════════════════════════════════════════════════
// De dónde salen las pantallas de verdad
// ════════════════════════════════════════════════════════════════════════════

async function consultar(sql, params = []) {
    const cliente = new pg.Client({ connectionString: BD });
    await cliente.connect();
    try {
        return (await cliente.query(sql, params)).rows;
    } catch (e) {
        // Callar esto costó media auditoría: una consulta con una columna que
        // no existe devolvía [], las nueve pantallas de dentro se quedaban sin
        // identificador y el recorrido las saltaba EN SILENCIO. Parecía que
        // todo iba bien con doce pantallas menos.
        console.error(`  (la consulta falló: ${e.message})`);
        return [];
    } finally {
        await cliente.end();
    }
}

/**
 * Las pantallas de dentro (una sección, una materia, el horario de un
 * profesor) llevan identificadores en la dirección. Escribirlos a mano aquí
 * los deja viejos en una semana, así que se preguntan a la base.
 */
async function lasPantallasDeDentro() {
    // El ciclo en curso se marca en `status`, no en `isActive` (que en los
    // datos de prueba está en false aunque el ciclo esté abierto). Si ninguno
    // lo dice, vale el más reciente: aquí solo hace falta UNA dirección viva.
    const [ciclo] = await consultar(
        `SELECT id FROM academic_years
          ORDER BY (status = 'ACTIVE') DESC, "createdAt" DESC
          LIMIT 1`
    );

    const [seccion] = ciclo
        ? await consultar(
              `SELECT id FROM classrooms WHERE "academicYearId" = $1 ORDER BY grade, section LIMIT 1`,
              [ciclo.id]
          )
        : [];

    const [materia] = seccion
        ? await consultar(
              `SELECT s.id, s.name FROM classroom_subjects cs
                 JOIN subjects s ON s.id = cs."subjectId"
                WHERE cs."classroomId" = $1 ORDER BY s.name LIMIT 1`,
              [seccion.id]
          )
        : [];

    const [profe] = await consultar(
        `SELECT id FROM users WHERE role = 'TEACHER' AND "isActive" = true ORDER BY id LIMIT 1`
    );

    const [alumno] = await consultar(
        `SELECT id FROM users WHERE role = 'STUDENT' AND "isActive" = true ORDER BY id LIMIT 1`
    );

    return { ciclo, seccion, materia, profe, alumno };
}

/**
 * UN PROFESOR QUE DÉ CLASES DE VERDAD
 *
 * El correo estaba escrito a mano aquí —`profesor.ciencias@tuapp.com`— y esa
 * cuenta no imparte ninguna materia. Resultado: el recorrido del profesor
 * saltaba sus tres pantallas de trabajo (su sección, el plan de evaluación y
 * la clase en vivo) y medía un panel vacío, que es justo lo que no interesa.
 * Se le pregunta a la base quién da más clases.
 */
async function elProfesorDeVerdad() {
    const [fila] = await consultar(
        `SELECT u.email,
                cs."classroomId",
                cs."subjectId",
                c."academicYearId",
                count(*) OVER (PARTITION BY u.id) AS imparte
           FROM classroom_subjects cs
           JOIN users u ON u.id = cs."teacherId"
           JOIN classrooms c ON c.id = cs."classroomId"
          WHERE u."isActive" = true
          ORDER BY imparte DESC, u.email
          LIMIT 1`
    );
    return fila || null;
}

async function losRecorridos() {
    const { ciclo, seccion, materia, profe, alumno } = await lasPantallasDeDentro();
    const suyo = await elProfesorDeVerdad();

    const conIds = (lista) => lista.filter(([, ruta]) => !ruta.includes('undefined') && !ruta.includes('null'));

    return [
        {
            rol: 'Administrador',
            email: 'admin@testing.edu.ve',
            pantallas: conIds([
                ['Inicio', '/dashboard'],
                ['Académico', '/dashboard/academico'],
                ['Ciclo', `/dashboard/academico/${ciclo?.id}`],
                ['Sección', `/dashboard/academico/${ciclo?.id}/${seccion?.id}`],
                ['Sección · materia', `/dashboard/academico/${ciclo?.id}/${seccion?.id}/${materia?.id}`],
                ['Promoción', `/dashboard/academico/${ciclo?.id}/promocion`],
                ['Aulas', '/dashboard/aulas'],
                ['Un aula', `/dashboard/aulas/${seccion?.id}`],
                ['Materias', '/dashboard/materias'],
                ['Una materia', `/dashboard/materias/${ciclo?.id}/${materia?.id}`],
                ['Horarios', '/dashboard/horarios'],
                ['Horario de sección', `/dashboard/horarios/seccion/${seccion?.id}`],
                ['Horario de profesor', `/dashboard/horarios/profesor/${profe?.id}`],
                ['Usuarios', '/dashboard/usuarios'],
                ['Ficha de alumno', `/dashboard/usuarios/${alumno?.id}`],
                ['Calendario', '/dashboard/calendario'],
                ['Eventos', '/dashboard/eventos'],
                ['Pagos', '/dashboard/pagos'],
                ['Configuración', '/dashboard/configuracion'],
            ]),
        },
        {
            rol: 'Profesor',
            email: suyo?.email || 'profesor.ciencias@tuapp.com',
            pantallas: conIds([
                ['Inicio', '/dashboard'],
                ['Académico', '/dashboard/academico'],
                ['Su sección', `/dashboard/academico/${suyo?.academicYearId}/${suyo?.classroomId}`],
                [
                    'Plan de evaluación',
                    `/dashboard/academico/${suyo?.academicYearId}/${suyo?.classroomId}/${suyo?.subjectId}`,
                ],
                ['Clase en vivo', `/dashboard/clase-en-vivo/${suyo?.classroomId}/${suyo?.subjectId}`],
                ['Materias', '/dashboard/materias'],
                ['Horarios', '/dashboard/horarios'],
                ['Calendario', '/dashboard/calendario'],
            ]),
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
}

// ════════════════════════════════════════════════════════════════════════════
// Las seis reglas, medidas dentro del navegador
// ════════════════════════════════════════════════════════════════════════════

/**
 * Se ejecuta EN la página. Devuelve la lista de lo que incumple, con el texto
 * del elemento culpable: sin eso, un aviso de «algo se arrastra» no sirve de
 * nada para arreglarlo.
 */
const MEDIR = ({ bandaArriba, bandaAbajo, dedo, letra }) => {
    const faltas = [];

    /**
     * CUÁNTO MIDE EL TELÉFONO DE VERDAD
     *
     * `window.innerWidth` NO sirve para esto, y es lo que usaba la versión
     * anterior. Cuando algo se sale de ancho, el navegador de un móvil ENSANCHA
     * la ventana para que quepa: en una pantalla que pedía 6 px de más,
     * `innerWidth` valía 396 y `scrollWidth` también 396, así que
     * `scrollWidth > innerWidth` daba falso. El fallo se tapaba a sí mismo.
     *
     * Lo que sí mide el cristal del teléfono es `visualViewport`.
     */
    const anchoDelTelefono = Math.round(window.visualViewport?.width ?? document.documentElement.clientWidth);
    const altoDelTelefono = Math.round(window.visualViewport?.height ?? document.documentElement.clientHeight);
    const visible = (el) => {
        const e = getComputedStyle(el);
        return e.display !== 'none' && e.visibility !== 'hidden' && e.opacity !== '0';
    };
    const comoSeLlama = (el) => {
        const texto = (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ');
        const etiqueta = el.tagName.toLowerCase();
        return texto ? `${etiqueta} «${texto.slice(0, 40)}»` : `${etiqueta}.${(el.className || '').toString().split(' ')[0]}`;
    };

    // ── 1. La pantalla se sale de ancho ───────────────────────────────────
    const anchoDoc = document.documentElement.scrollWidth;
    if (anchoDoc > anchoDelTelefono + 1) {
        const culpables = [...document.querySelectorAll('body *')]
            .filter((el) => visible(el) && el.getBoundingClientRect().right > anchoDelTelefono + 1)
            .filter((el, _i, todos) => !todos.some((otro) => otro !== el && otro.contains(el)))
            .slice(0, 2)
            .map(comoSeLlama);
        faltas.push({
            regla: 'ancho',
            detalle:
                `la pantalla mide ${anchoDoc} px y el teléfono ${anchoDelTelefono}` +
                (culpables.length ? ` — sobresale ${culpables.join(', ')}` : ''),
        });
    }

    // ── 2. Algo de dentro se arrastra de lado ─────────────────────────────
    // Se cuentan solo los de fuera: una tabla ancha suele ir metida en dos o
    // tres cajas que también se arrastran, y sin esto el mismo fallo salía
    // repetido tres veces con el mismo texto.
    const arrastrados = [];
    for (const el of document.querySelectorAll('*')) {
        if (!visible(el)) continue;
        const e = getComputedStyle(el);
        const seArrastra = e.overflowX === 'auto' || e.overflowX === 'scroll';
        if (!seArrastra) continue;
        if (el.scrollWidth <= el.clientWidth + 1) continue;
        if (el.clientWidth < 120) continue; // una pastilla de fichas no cuenta
        if (arrastrados.some((otro) => otro.contains(el))) continue;
        arrastrados.push(el);
    }
    for (const el of arrastrados.slice(0, 3)) {
        faltas.push({
            regla: 'arrastre',
            detalle: `hay que arrastrar ${el.scrollWidth - el.clientWidth} px en ${comoSeLlama(el)}`,
        });
    }

    // ── 3 y 4. Las bandas del sistema, tapadas ────────────────────────────
    /** ¿Hay algo opaco, fijo y de lado a lado cubriendo esta franja? */
    const estaTapada = (desde, hasta) => {
        for (const el of document.querySelectorAll('body *')) {
            if (!visible(el)) continue;
            const e = getComputedStyle(el);
            if (e.position !== 'fixed' && e.position !== 'sticky') continue;
            const fondo = e.backgroundColor;
            const alfa = fondo.startsWith('rgba') ? parseFloat(fondo.split(',')[3]) : fondo === 'transparent' ? 0 : 1;
            if (alfa < 0.85) continue;
            const r = el.getBoundingClientRect();
            // 98 % y no «de borde a borde»: cuando la pantalla se sale de
            // ancho, la cabecera mide lo que el cuerpo y no lo que la ventana
            // ensanchada, y sin esta holgura se daba por destapada una franja
            // que sí estaba tapada.
            if (r.left > 1 || r.right < anchoDelTelefono * 0.98) continue;
            if (r.top <= desde + 1 && r.bottom >= hasta - 1) return true;
        }
        return false;
    };

    /** Lo que se vería dentro de la franja si nadie la tapa. */
    const loQueAsomaEn = (desde, hasta) => {
        const dentro = [];
        for (const el of document.querySelectorAll('a,button,input,select,textarea,h1,h2,h3,h4,p,span,label,td,th,li,img,svg')) {
            if (!visible(el)) continue;
            if (!el.textContent?.trim() && !['IMG', 'SVG', 'INPUT'].includes(el.tagName)) continue;
            const r = el.getBoundingClientRect();
            if (r.width < 4 || r.height < 4) continue;
            if (r.bottom <= desde || r.top >= hasta) continue;
            dentro.push(comoSeLlama(el));
            if (dentro.length >= 3) break;
        }
        return dentro;
    };

    if (!estaTapada(0, bandaArriba)) {
        const asoma = loQueAsomaEn(0, bandaArriba);
        if (asoma.length) {
            faltas.push({
                regla: 'banda-arriba',
                detalle: `el reloj y la batería tapan: ${asoma.join(', ')}`,
            });
        }
    }

    if (!estaTapada(altoDelTelefono - bandaAbajo, altoDelTelefono)) {
        const asoma = loQueAsomaEn(altoDelTelefono - bandaAbajo, altoDelTelefono);
        if (asoma.length) {
            faltas.push({
                regla: 'banda-abajo',
                detalle: `la barra de gestos tapa: ${asoma.join(', ')}`,
            });
        }
    }

    // ── 5. Lo que se pulsa, más pequeño que un dedo ───────────────────────
    const pequenos = [];
    for (const el of document.querySelectorAll('a[href],button,[role="button"],input[type="checkbox"],input[type="radio"],select')) {
        if (!visible(el)) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) continue; // escondido de verdad
        if (r.top > altoDelTelefono || r.bottom < 0) continue; // fuera de la vista
        if (r.height >= dedo && r.width >= dedo) continue;
        // Un enlace dentro de un párrafo no es un botón: se salta el texto corrido.
        if (el.tagName === 'A' && el.parentElement && /^(P|SPAN|LI|TD)$/.test(el.parentElement.tagName)) continue;
        pequenos.push(`${comoSeLlama(el)} mide ${Math.round(r.width)}×${Math.round(r.height)}`);
        if (pequenos.length >= 3) break;
    }
    if (pequenos.length) {
        faltas.push({ regla: 'dedo', detalle: pequenos.join('; ') });
    }

    // ── 6. Letra demasiado pequeña ────────────────────────────────────────
    const menudas = new Map();
    for (const el of document.querySelectorAll('p,span,td,th,li,label,a,button,div')) {
        if (!visible(el)) continue;
        const propio = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 2);
        if (!propio) continue;
        const tam = parseFloat(getComputedStyle(el).fontSize);
        if (isNaN(tam) || tam >= letra) continue;
        const r = el.getBoundingClientRect();
        if (r.top > altoDelTelefono || r.bottom < 0) continue;
        menudas.set(`${tam} px`, (menudas.get(`${tam} px`) || 0) + 1);
    }
    if (menudas.size) {
        const resumen = [...menudas.entries()].map(([t, n]) => `${n} a ${t}`).join(', ');
        faltas.push({ regla: 'letra', detalle: resumen });
    }

    return faltas;
};

// ════════════════════════════════════════════════════════════════════════════
// El recorrido
// ════════════════════════════════════════════════════════════════════════════

const nombreDeArchivo = (rol, pantalla) =>
    `${rol}-${pantalla}`
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-');

/** El teléfono de verdad tiene muesca; el ordenador no. Se le pone. */
const ZONAS_DE_UN_TELEFONO = `:root{--zona-segura-arriba:${BANDA_ARRIBA}px !important;--zona-segura-abajo:${BANDA_ABAJO}px !important}`;

async function entrar(page, email) {
    await page.goto(`${WEB}/login?slug=${LICEO}`, { waitUntil: 'domcontentloaded' });
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', CLAVE);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard**', { timeout: 30000 });
    await page.waitForTimeout(2500);
}

async function main() {
    const recorridos = (await losRecorridos()).filter((r) => !SOLO || r.rol.toLowerCase().startsWith(SOLO.toLowerCase()));

    if (existsSync(CARPETA)) await rm(CARPETA, { recursive: true, force: true });
    await mkdir(CARPETA, { recursive: true });

    const navegador = await chromium.launch();
    const fichas = [];

    for (const recorrido of recorridos) {
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
                await page.addStyleTag({ content: ZONAS_DE_UN_TELEFONO });
                await page.waitForTimeout(250);

                const archivo = `${nombreDeArchivo(recorrido.rol, titulo)}.png`;
                await page.screenshot({ path: join(CARPETA, archivo) });

                // Arriba del todo, y con la pantalla bajada: lo que pasa por
                // debajo de la banda solo se ve cuando algo ha rodado.
                const faltas = await page.evaluate(MEDIR, {
                    bandaArriba: BANDA_ARRIBA,
                    bandaAbajo: BANDA_ABAJO,
                    dedo: DEDO,
                    letra: LETRA,
                });
                await page.evaluate(() => window.scrollBy(0, 400));
                await page.waitForTimeout(400);
                const alBajar = await page.evaluate(MEDIR, {
                    bandaArriba: BANDA_ARRIBA,
                    bandaAbajo: BANDA_ABAJO,
                    dedo: DEDO,
                    letra: LETRA,
                });

                const todas = [...faltas];
                for (const f of alBajar) {
                    if (!todas.some((x) => x.regla === f.regla)) todas.push({ ...f, alBajar: true });
                }

                fichas.push({ rol: recorrido.rol, titulo, ruta, archivo, faltas: todas });
                const sello = todas.length ? `✗ ${todas.map((f) => f.regla).join(' ')}` : '✓';
                console.log(`  ${sello.padEnd(34)} ${recorrido.rol} · ${titulo}`);
            } catch (e) {
                console.log(`  … ${recorrido.rol} · ${titulo} — no se pudo: ${String(e).slice(0, 90)}`);
            }
        }

        await contexto.close();
    }

    await navegador.close();
    await writeFile(join(CARPETA, 'index.html'), hoja(fichas), 'utf-8');
    await writeFile(join(CARPETA, 'resumen.json'), JSON.stringify(fichas, null, 2), 'utf-8');

    const conFallo = fichas.filter((f) => f.faltas.length).length;
    const porRegla = {};
    fichas.forEach((f) => f.faltas.forEach((x) => (porRegla[x.regla] = (porRegla[x.regla] || 0) + 1)));

    console.log(`\n${fichas.length} pantallas · ${conFallo} con algo que arreglar`);
    for (const [regla, n] of Object.entries(porRegla).sort((a, b) => b[1] - a[1])) {
        console.log(`   ${String(n).padStart(3)}  ${regla}`);
    }
    console.log(`\nAbre  docs/capturas-movil/index.html`);

    if (process.argv.includes('--exigir') && conFallo > 0) process.exit(1);
}

// ════════════════════════════════════════════════════════════════════════════
// La hoja para mirarlo todo de una vez
// ════════════════════════════════════════════════════════════════════════════

const QUE_SIGNIFICA = {
    ancho: 'La pantalla se sale de ancho',
    arrastre: 'Hay que arrastrar de lado',
    'banda-arriba': 'El reloj tapa contenido',
    'banda-abajo': 'La barra de gestos tapa contenido',
    dedo: 'Botones más pequeños que un dedo',
    letra: 'Letra por debajo de 12 px',
};

function hoja(fichas) {
    const escapar = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const porRol = fichas.reduce((acc, f) => {
        (acc[f.rol] ??= []).push(f);
        return acc;
    }, {});

    const bloques = Object.entries(porRol)
        .map(
            ([rol, suyas]) => `
    <section>
      <h2>${escapar(rol)} <small>${suyas.filter((f) => f.faltas.length).length} de ${suyas.length} con algo</small></h2>
      <div class="rejilla">
        ${suyas
            .map(
                (f) => `<figure${f.faltas.length ? ' class="mal"' : ''}>
          <img src="${f.archivo}" alt="${escapar(f.rol)}: ${escapar(f.titulo)}" loading="lazy" />
          <figcaption>
            <strong>${escapar(f.titulo)}</strong>
            <span class="ruta">${escapar(f.ruta)}</span>
            ${
                f.faltas.length
                    ? `<ul class="faltas">${f.faltas
                          .map(
                              (x) =>
                                  `<li><b>${escapar(QUE_SIGNIFICA[x.regla] || x.regla)}</b>${
                                      x.alBajar ? ' <i>(al bajar)</i>' : ''
                                  }<br/>${escapar(x.detalle)}</li>`
                          )
                          .join('')}</ul>`
                    : '<span class="bien">Sin nada que arreglar</span>'
            }
          </figcaption>
        </figure>`
            )
            .join('\n        ')}
      </div>
    </section>`
        )
        .join('\n');

    const porRegla = {};
    fichas.forEach((f) => f.faltas.forEach((x) => (porRegla[x.regla] = (porRegla[x.regla] || 0) + 1)));
    const conFallo = fichas.filter((f) => f.faltas.length).length;

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
  .resumen { color: #475569; margin: 0 0 10px; font-size: .95rem; }
  .resumen b { color: #b91c1c; }
  .cuenta { display: flex; flex-wrap: wrap; gap: 8px; margin: 0 0 28px; padding: 0; list-style: none; }
  .cuenta li { background: #fff; border: 1px solid #e2e8f0; border-radius: 999px;
               padding: 5px 12px; font-size: .8rem; }
  .cuenta b { color: #b91c1c; }
  h2 { font-size: 1.05rem; margin: 28px 0 12px; text-transform: uppercase;
       letter-spacing: .06em; color: #475569; }
  h2 small { text-transform: none; letter-spacing: 0; font-weight: 400; color: #94a3b8; }
  .rejilla { display: grid; gap: 20px; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); }
  figure { margin: 0; background: #fff; border: 1px solid #e2e8f0; border-radius: 16px;
           overflow: hidden; box-shadow: 0 1px 3px rgba(15,23,42,.06); }
  figure.mal { border-color: #fca5a5; box-shadow: 0 0 0 3px rgba(248,113,113,.15); }
  img { display: block; width: 100%; height: auto; border-bottom: 1px solid #f1f5f9; }
  figcaption { padding: 12px 14px; display: grid; gap: 3px; font-size: .85rem; }
  .ruta { color: #64748b; font-family: ui-monospace, monospace; font-size: .72rem;
          overflow-wrap: anywhere; }
  .faltas { margin: 8px 0 0; padding-left: 18px; color: #b91c1c; font-size: .76rem; line-height: 1.45; }
  .faltas li { margin-bottom: 6px; }
  .faltas i { color: #94a3b8; font-style: normal; }
  .bien { margin-top: 6px; color: #15803d; font-size: .76rem; font-weight: 600; }
</style>
</head>
<body>
  <h1>La app en el teléfono</h1>
  <p class="resumen">
    ${fichas.length} pantallas a ${TELEFONO.width} × ${TELEFONO.height}, con las bandas
    del sistema de un Android (${BANDA_ARRIBA} px arriba, ${BANDA_ABAJO} abajo).
    ${conFallo ? `<b>${conFallo} tienen algo que arreglar.</b>` : 'Ninguna tiene nada que arreglar.'}
    ${new Date().toLocaleString('es-VE')}.
  </p>
  <ul class="cuenta">
    ${Object.entries(QUE_SIGNIFICA)
        .map(([regla, texto]) => `<li>${texto}: <b>${porRegla[regla] || 0}</b></li>`)
        .join('\n    ')}
  </ul>
${bloques}
</body>
</html>`;
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
