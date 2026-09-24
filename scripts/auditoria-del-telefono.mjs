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
 * Y una séptima que no es de diseño sino de honradez: **sin-cargar**. Si la
 * pantalla sigue diciendo «Cargando…» cuando se mide, no se mide nada y sale
 * limpia. Pasó: cinco pantallas cambiaron de rojo a verde entre dos tandas sin
 * tocar una línea, porque en la segunda no habían terminado de cargar.
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
import {
    MEDIR,
    TELEFONO,
    BANDA_ARRIBA,
    BANDA_ABAJO,
    DEDO,
    LETRA,
    ZONAS_DE_UN_TELEFONO,
    QUE_SIGNIFICA,
} from './reglas-del-telefono.mjs';
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
 *
 * OJO CON CUÁL: no todas las direcciones llevan el `id`. Las de Académico y
 * Materias van por **nombre del ciclo y `slug`**
 * (`/dashboard/academico/2026-2027/2026-2027-1-a/castellano`), y las de Aulas y
 * Usuarios por id. Poniendo el id donde iba el slug, la pantalla no encuentra
 * la sección y se queda para siempre en «Cargando sección…» — y una pantalla
 * que no carga no incumple nada, así que salía impecable en la auditoría. Se
 * comprueba mirando a dónde enlaza la propia aplicación, no adivinando.
 */
async function lasPantallasDeDentro() {
    // El ciclo en curso se marca en `status`, no en `isActive` (que en los
    // datos de prueba está en false aunque el ciclo esté abierto). Si ninguno
    // lo dice, vale el más reciente: aquí solo hace falta UNA dirección viva.
    const [ciclo] = await consultar(
        `SELECT id, name FROM academic_years
          ORDER BY (status = 'ACTIVE') DESC, "createdAt" DESC
          LIMIT 1`
    );

    const [seccion] = ciclo
        ? await consultar(
              `SELECT id, slug FROM classrooms WHERE "academicYearId" = $1 ORDER BY grade, section LIMIT 1`,
              [ciclo.id]
          )
        : [];

    const [materia] = seccion
        ? await consultar(
              `SELECT s.id, s.slug, s.name FROM classroom_subjects cs
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
                c.slug   AS "seccionSlug",
                s.slug   AS "materiaSlug",
                a.name   AS "cicloNombre",
                count(*) OVER (PARTITION BY u.id) AS imparte
           FROM classroom_subjects cs
           JOIN users u ON u.id = cs."teacherId"
           JOIN classrooms c ON c.id = cs."classroomId"
           JOIN subjects s ON s.id = cs."subjectId"
           LEFT JOIN academic_years a ON a.id = c."academicYearId"
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
                ['Ciclo', `/dashboard/academico/${ciclo?.name}`],
                ['Sección', `/dashboard/academico/${ciclo?.name}/${seccion?.slug}`],
                ['Sección · materia', `/dashboard/academico/${ciclo?.name}/${seccion?.slug}/${materia?.slug}`],
                ['Promoción', `/dashboard/academico/${ciclo?.name}/promocion`],
                ['Aulas', '/dashboard/aulas'],
                ['Un aula', `/dashboard/aulas/${seccion?.id}`],
                ['Materias', '/dashboard/materias'],
                ['Una materia', `/dashboard/materias/${ciclo?.name}/${materia?.slug}`],
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
                ['Su sección', `/dashboard/academico/${suyo?.cicloNombre}/${suyo?.seccionSlug}`],
                [
                    'Plan de evaluación',
                    `/dashboard/academico/${suyo?.cicloNombre}/${suyo?.seccionSlug}/${suyo?.materiaSlug}`,
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
// ════════════════════════════════════════════════════════════════════════════
// El recorrido
// ════════════════════════════════════════════════════════════════════════════

const nombreDeArchivo = (rol, pantalla) =>
    `${rol}-${pantalla}`
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-');


/**
 * ESPERAR A QUE LA PANTALLA SEA LA PANTALLA
 *
 * Con tres segundos fijos, las pantallas que piden varias cosas al servidor se
 * medían mientras aún decían «Cargando sección…»: sin contenido no hay nada
 * que incumpla, así que salían impecables. Cinco pasaron de rojo a verde entre
 * dos tandas sin tocar una línea de código.
 *
 * Aquí se espera a que no quede tráfico y a que no quede ni un «Cargando» ni un
 * esqueleto latiendo. Si no termina, se dice.
 */
/** ¿La pantalla está enseñando un «Cargando» o un esqueleto AHORA MISMO? */
async function sigueCargando(page) {
    return page
        .evaluate(() => {
            const texto = document.body?.innerText || '';
            if (/Cargando|Loading/i.test(texto)) return true;
            if (document.querySelector('[aria-busy="true"]')) return true;

            /**
             * UN PUNTO QUE LATE NO ES UNA PANTALLA CARGANDO
             *
             * `animate-pulse` a secas daba falsos positivos: un icono de
             * calendario de 24 px y el puntito de «EN CURSO» laten como
             * adorno, y por ellos tres pantallas salían marcadas como «seguía
             * cargando» estando perfectamente cargadas. Un esqueleto de verdad
             * es una barra ancha y sin texto.
             */
            return [...document.querySelectorAll('.animate-pulse, .animate-latir')].some((el) => {
                if (el.textContent && el.textContent.trim().length > 0) return false;
                const r = el.getBoundingClientRect();
                return r.width >= 60 && r.height >= 12;
            });
        })
        .catch(() => false);
}

async function esperarAQueTermine(page, tope = 20000) {
    await page.waitForLoadState('networkidle', { timeout: tope }).catch(() => {});

    const hasta = Date.now() + tope;
    while (Date.now() < hasta) {
        const sigue = await sigueCargando(page);
        if (!sigue) {
            await page.waitForTimeout(600);
            return true;
        }
        await page.waitForTimeout(500);
    }
    return false;
}

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
                const cargada = await esperarAQueTermine(page);
                await page.addStyleTag({ content: ZONAS_DE_UN_TELEFONO });
                await page.waitForTimeout(250);

                // Otra vez, justo antes de medir: hay pantallas que terminan de
                // cargar y vuelven a «Cargando» cuando algo se refresca por
                // detrás. Si se mide en ese instante, sale impecable porque no
                // hay nada pintado.
                const aunCargando = await sigueCargando(page);

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
                if (!cargada || aunCargando) {
                    todas.unshift({
                        regla: 'sin-cargar',
                        detalle: 'seguía cargando al medirla: lo de abajo no se ha comprobado',
                    });
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
