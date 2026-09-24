import { test, expect, type Page, type BrowserContext, type Browser } from '@playwright/test';
import { WEB_BASE, TENANT_SLUG, queryTenantDb } from './helpers';
// Las reglas viven en un solo sitio y las usan dos: esta prueba y el recorrido
// con fotos (`node scripts/recorrido-del-diseno.mjs`).
import { MEDIR_DISENO, QUE_SIGNIFICA_DISENO } from '../../scripts/reglas-del-diseno.mjs';

/**
 * QUE TODO QUEDE EN SU SITIO
 *
 * Nada de esto da un error. Una pantalla con el título 16 px más adentro que
 * las demás funciona; un botón «Nuevo Ciclo» partido en dos líneas se pulsa
 * igual. Pero el liceo entero parece hecho a retazos, y quien lo usa no sabe
 * decir por qué: solo que «se ve raro».
 *
 * Así que se MIDE, con el DOM:
 *
 *  DISENO-01  El título de cada pantalla cae en la misma columna que el resto,
 *             en el teléfono y en el portátil, y hay UN solo `<main>`.
 *  DISENO-02  El título de pantalla mide lo mismo en todas.
 *  DISENO-03  Ni botones partidos, ni textos pisándose, ni ventanas torcidas en
 *             las pantallas de todos los días (reglas de `reglas-del-diseno.mjs`).
 *  DISENO-04  En el Panel, las baldosas de una fila empiezan a la misma altura
 *             y la que queda sola ocupa la fila.
 *  DISENO-05  El representante ve cómo va cada hijo SIN TOCAR NADA.
 *  DISENO-06  Las ventanas, en el teléfono: centradas, dentro de la pantalla y
 *             con una X de 44 px que se llama «Cerrar».
 *  DISENO-07  En la lista de una sección y en sus cifras, nada se recorta a una
 *             sola línea con «…»: el profesor tiene que saber a quién le pone la
 *             nota («Kleiver Josu…» y «Kleiver Josu…» son dos alumnos).
 */

const TELEFONO = { width: 390, height: 844 };
const PORTATIL = { width: 1366, height: 768 };

type Rol = { email: string };
const ADMIN: Rol = { email: 'admin@testing.edu.ve' };
const REPRESENTANTE: Rol = { email: 'tutor.prueba@testing.edu.ve' };

async function contexto(browser: Browser, tam: 'telefono' | 'portatil'): Promise<BrowserContext> {
    return browser.newContext(
        tam === 'telefono'
            ? { viewport: TELEFONO, isMobile: true, hasTouch: true, deviceScaleFactor: 1 }
            : { viewport: PORTATIL, deviceScaleFactor: 1 }
    );
}

/** Entra por el formulario, esperando si el límite de intentos frena. */
async function entrar(page: Page, rol: Rol) {
    for (let i = 0; i < 8; i++) {
        await page.goto(`${WEB_BASE}/login?slug=${TENANT_SLUG}`);
        await page.fill('input[type="email"]', rol.email);
        await page.fill('input[type="password"]', '123456');
        const resp = page
            .waitForResponse((r) => r.url().includes('/auth/login') && r.request().method() === 'POST', { timeout: 20000 })
            .catch(() => null);
        await page.click('button[type="submit"]');
        if ((await resp)?.status() !== 429) {
            await page.waitForURL('**/dashboard**', { timeout: 30000 });
            return;
        }
        await page.waitForTimeout(8000);
    }
    throw new Error(`no se pudo entrar como ${rol.email}: el límite de intentos no se soltó`);
}

async function esperarAQueCargue(page: Page) {
    await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
    const hasta = Date.now() + 20000;
    while (Date.now() < hasta) {
        const sigue = await page.evaluate(() => /\bCargando\b/i.test(document.body?.innerText || '')).catch(() => false);
        if (!sigue) break;
        await page.waitForTimeout(400);
    }
    await page.waitForTimeout(500);
}

/** Las pantallas de dentro llevan identificadores: se preguntan a la base. */
async function lasPantallas() {
    const [fila] = await queryTenantDb<any>(
        `SELECT a.name AS ciclo, c.slug AS seccion, c.id AS "seccionId", s.slug AS materia
           FROM classroom_subjects cs
           JOIN classrooms c ON c.id = cs."classroomId"
           JOIN subjects s ON s.id = cs."subjectId"
           JOIN academic_years a ON a.id = c."academicYearId"
          ORDER BY (a.status = 'ACTIVE') DESC, c.grade, c.section, s.name
          LIMIT 1`
    );
    const [alumno] = await queryTenantDb<any>(
        `SELECT u.id FROM users u JOIN student_classrooms sc ON sc."studentId" = u.id WHERE u.role = 'STUDENT' ORDER BY u.id LIMIT 1`
    );
    return [
        ['Panel', '/dashboard'],
        ['Académico', '/dashboard/academico'],
        ['Ciclo', `/dashboard/academico/${fila.ciclo}`],
        ['Sección', `/dashboard/academico/${fila.ciclo}/${fila.seccion}`],
        ['Sección · materia', `/dashboard/academico/${fila.ciclo}/${fila.seccion}/${fila.materia}`],
        ['Promoción', `/dashboard/academico/${fila.ciclo}/promocion`],
        ['Aulas', '/dashboard/aulas'],
        ['Un aula', `/dashboard/aulas/${fila.seccionId}`],
        ['Materias', '/dashboard/materias'],
        ['Una materia', `/dashboard/materias/${fila.ciclo}/${fila.materia}`],
        ['Horarios', '/dashboard/horarios'],
        ['Usuarios', '/dashboard/usuarios'],
        ['Ficha de alumno', `/dashboard/usuarios/${alumno.id}`],
        ['Calendario', '/dashboard/calendario'],
        ['Eventos', '/dashboard/eventos'],
        ['Pagos', '/dashboard/pagos'],
        ['Configuración', '/dashboard/configuracion'],
    ] as Array<[string, string]>;
}

/**
 * Dónde empieza el título, comparado con la columna del marco. Si delante del
 * título va una flecha de volver, cuenta la flecha (su dibujo, no su caja de
 * 44 px, que sobresale a propósito para el dedo).
 */
function medirElTitulo() {
    const main = document.querySelector('main')!;
    const marco = main.firstElementChild as HTMLElement;
    const m = getComputedStyle(marco);
    const columna = marco.getBoundingClientRect().left + parseFloat(m.paddingLeft);
    const h1 = main.querySelector('h1');
    if (!h1) return { columna, izquierda: null, letra: null, mains: document.querySelectorAll('main').length };
    const rango = document.createRange();
    rango.selectNodeContents(h1);
    const rt = [...rango.getClientRects()].filter((r) => r.width > 0)[0] || h1.getBoundingClientRect();
    let izquierda = rt.left;
    // Si el título va dentro de una tarjeta (la ficha de una persona, con su
    // foto delante), lo que tiene que caer en la columna es la TARJETA.
    for (let e = h1.parentElement; e && e !== marco; e = e.parentElement) {
        const s = getComputedStyle(e);
        const conCaja = parseFloat(s.borderLeftWidth) > 0 || s.backgroundColor !== 'rgba(0, 0, 0, 0)';
        const r = e.getBoundingClientRect();
        if (conCaja && parseFloat(s.borderRadius) > 0 && r.left >= columna - 1) {
            return {
                columna: Math.round(columna),
                izquierda: Math.round(r.left),
                letra: getComputedStyle(h1).fontSize,
                mains: document.querySelectorAll('main').length,
            };
        }
    }
    // ¿Hay una flecha o unas migas en la misma fila, a la izquierda del título?
    for (const svg of main.querySelectorAll('header svg, h1 ~ * svg, a svg, button svg')) {
        const r = svg.getBoundingClientRect();
        if (!r.width || r.bottom < rt.top - 40 || r.top > rt.bottom + 40) continue;
        if (r.left < izquierda && r.left > columna - 30) izquierda = r.left;
    }
    return {
        columna: Math.round(columna),
        izquierda: Math.round(izquierda),
        letra: getComputedStyle(h1).fontSize,
        mains: document.querySelectorAll('main').length,
    };
}

for (const tam of ['telefono', 'portatil'] as const) {
    test(`DISENO-01/02: los títulos caen en la columna y miden lo mismo (${tam})`, async ({ browser }) => {
        const ctx = await contexto(browser, tam);
        const page = await ctx.newPage();
        await entrar(page, ADMIN);
        const fallos: string[] = [];
        const letras = new Map<string, string[]>();
        for (const [titulo, ruta] of await lasPantallas()) {
            await page.goto(`${WEB_BASE}${ruta}`);
            await esperarAQueCargue(page);
            const t = await page.evaluate(medirElTitulo);
            if (t.mains !== 1) fallos.push(`${titulo}: ${t.mains} <main> (uno dentro de otro)`);
            if (t.izquierda === null) {
                fallos.push(`${titulo}: sin título <h1>`);
                continue;
            }
            if (Math.abs(t.izquierda - t.columna) > 4)
                fallos.push(`${titulo}: el título empieza en ${t.izquierda} y la columna en ${t.columna} (${t.izquierda - t.columna} px)`);
            letras.set(t.letra!, [...(letras.get(t.letra!) || []), titulo]);
        }
        await ctx.close();
        if (letras.size > 1)
            fallos.push(
                `los títulos miden distinto: ${[...letras].map(([l, ps]) => `${l} en ${ps.join(', ')}`).join(' · ')}`
            );
        expect(fallos, fallos.join('\n')).toEqual([]);
    });
}

test('DISENO-03: en el teléfono, nada partido, pisado ni torcido en las pantallas de todos los días', async ({ browser }) => {
    const ctx = await contexto(browser, 'telefono');
    const page = await ctx.newPage();
    await entrar(page, ADMIN);
    const vigiladas = new Set(['boton-partido', 'encima', 'texto-cortado', 'modal-descentrado', 'modal-se-sale']);
    const fallos: string[] = [];
    for (const [titulo, ruta] of await lasPantallas()) {
        await page.goto(`${WEB_BASE}${ruta}`);
        await esperarAQueCargue(page);
        const faltas = (await page.evaluate(MEDIR_DISENO, { tolerancia: 2 })) as any[];
        for (const f of faltas.filter((x) => vigiladas.has(x.regla)))
            fallos.push(`${titulo}: ${(QUE_SIGNIFICA_DISENO as any)[f.regla]} — «${f.que}» ${f.detalle}`);
    }
    await ctx.close();
    expect(fallos, fallos.join('\n')).toEqual([]);
});

test('DISENO-04: en el Panel, las baldosas de una fila empiezan a la misma altura y ninguna queda descolgada', async ({ browser }) => {
    for (const [rol, tam] of [
        [ADMIN, 'telefono'],
        [ADMIN, 'portatil'],
        [REPRESENTANTE, 'telefono'],
    ] as const) {
        const ctx = await contexto(browser, tam);
        const page = await ctx.newPage();
        await entrar(page, rol);
        await esperarAQueCargue(page);
        const medida = await page.evaluate(() => {
            const seccion = document.querySelector('section[aria-labelledby="accesos-del-liceo"]');
            const rejilla = seccion?.querySelector('div');
            if (!rejilla) return null;
            const baldosas = [...rejilla.children] as HTMLElement[];
            const filas = new Map<number, { titulos: number[]; anchos: number[] }>();
            for (const b of baldosas) {
                const r = b.getBoundingClientRect();
                const nombre = b.querySelector('span.block span, span > span.font-semibold') || b;
                const fila = filas.get(Math.round(r.top)) || { titulos: [], anchos: [] };
                fila.titulos.push(Math.round(nombre.getBoundingClientRect().top - r.top));
                fila.anchos.push(Math.round(r.width));
                filas.set(Math.round(r.top), fila);
            }
            return { ancho: Math.round(rejilla.getBoundingClientRect().width), filas: [...filas.values()] };
        });
        await ctx.close();
        expect(medida, 'el Panel no tiene la sección «Ir a»').not.toBeNull();
        for (const fila of medida!.filas) {
            expect(new Set(fila.titulos).size, `títulos a distinta altura en una fila: ${fila.titulos}`).toBe(1);
        }
        const ultima = medida!.filas[medida!.filas.length - 1];
        const primera = medida!.filas[0];
        if (ultima.anchos.length < primera.anchos.length && tam === 'telefono') {
            // La que queda sola en el teléfono ocupa la fila entera.
            expect(ultima.anchos[0], 'la última baldosa quedó descolgada, a media fila').toBeGreaterThan(medida!.ancho - 2);
        }
    }
});

test('DISENO-05: el representante ve el promedio y la asistencia de cada hijo sin tocar nada', async ({ browser }) => {
    const ctx = await contexto(browser, 'telefono');
    const page = await ctx.newPage();
    await entrar(page, REPRESENTANTE);
    await esperarAQueCargue(page);
    const tarjetas = page.locator('section', { has: page.getByRole('heading', { name: 'Mis representados' }) }).locator('> div');
    const n = await tarjetas.count();
    expect(n, 'no hay representados en la pantalla').toBeGreaterThan(0);
    for (let i = 0; i < n; i++) {
        await expect(tarjetas.nth(i).getByText('Promedio', { exact: true })).toBeVisible();
        await expect(tarjetas.nth(i).getByText('Asistencia', { exact: true })).toBeVisible();
    }
    // El parentesco se lee como se dice, no como se guarda.
    await expect(page.getByText(/· MADRE\b/)).toHaveCount(0);
    // Y lo que el representante vino a ver va antes que los accesos.
    const orden = await page.evaluate(() => {
        const rep = [...document.querySelectorAll('h2')].find((h) => h.textContent?.trim() === 'Mis representados');
        const ir = document.getElementById('accesos-del-liceo');
        return rep && ir ? rep.getBoundingClientRect().top < ir.getBoundingClientRect().top : null;
    });
    expect(orden, '«Ir a» va delante de «Mis representados»').toBe(true);
    await ctx.close();
});

test('DISENO-06: en el teléfono, las ventanas quedan centradas, dentro y con una X de 44 px', async ({ browser }) => {
    const ctx = await contexto(browser, 'telefono');
    const page = await ctx.newPage();
    await entrar(page, ADMIN);
    const vigiladas = new Set(['modal-descentrado', 'modal-se-sale', 'cerrar-pequeno', 'cerrar-sin-nombre', 'ventana-sin-rol']);
    const ventanas: Array<[string, string, (p: Page) => Promise<void>]> = [
        ['Nuevo ciclo', '/dashboard/academico', (p) => p.getByRole('button', { name: 'Nuevo Ciclo' }).click()],
        ['Borrar un ciclo', '/dashboard/academico', (p) => p.locator('[title="Eliminar ciclo escolar"]').first().click()],
        ['Nueva aula', '/dashboard/aulas', (p) => p.getByRole('button', { name: 'Nueva Aula' }).click()],
        ['Nueva materia', '/dashboard/materias', (p) => p.getByRole('button', { name: 'Nueva Materia' }).click()],
        ['Nuevo usuario', '/dashboard/usuarios', (p) => p.getByRole('button', { name: 'Nuevo Usuario' }).click()],
    ];
    const fallos: string[] = [];
    for (const [nombre, ruta, abrir] of ventanas) {
        await page.goto(`${WEB_BASE}${ruta}`);
        await esperarAQueCargue(page);
        await abrir(page);
        // `role="dialog"` a veces está en una caja de 0 × 0 (Headless UI) y la
        // ventana va dentro: se espera a que haya algo de verdad a la vista.
        await page.waitForFunction(
            () =>
                [...document.querySelectorAll('[role="dialog"], [role="alertdialog"], .fixed.inset-0')].some((d) =>
                    [d, ...d.querySelectorAll('*')].some((e) => {
                        const r = e.getBoundingClientRect();
                        return r.width > 120 && r.height > 120 && r.width < innerWidth - 1;
                    })
                ),
            undefined,
            { timeout: 10000 }
        );
        await page.waitForTimeout(600);
        const faltas = (await page.evaluate(MEDIR_DISENO, { tolerancia: 2 })) as any[];
        for (const f of faltas.filter((x) => vigiladas.has(x.regla)))
            fallos.push(`${nombre}: ${(QUE_SIGNIFICA_DISENO as any)[f.regla]} — «${f.que}» ${f.detalle}`);
    }
    await ctx.close();
    expect(fallos, fallos.join('\n')).toEqual([]);
});

/** Lo que se recorta a UNA línea con «…» y no cabe: se lee a medias. */
function recortadosAUnaLinea() {
    const main = document.querySelector('main')!;
    return [...main.querySelectorAll('*')]
        .filter((el) => {
            const s = getComputedStyle(el);
            if (s.whiteSpace !== 'nowrap' || s.textOverflow !== 'ellipsis') return false;
            if (!(el as HTMLElement).offsetParent) return false;
            return el.scrollWidth > el.clientWidth + 1;
        })
        .map((el) => (el as HTMLElement).innerText.trim().slice(0, 40));
}

test('DISENO-07: en la sección, los nombres y los rótulos de las cifras se leen enteros en el teléfono', async ({ browser }) => {
    const ctx = await contexto(browser, 'telefono');
    const page = await ctx.newPage();
    await entrar(page, ADMIN);
    const pantallas = await lasPantallas();
    const fallos: string[] = [];
    for (const titulo of ['Sección', 'Sección · materia', 'Ciclo']) {
        const [, ruta] = pantallas.find(([t]) => t === titulo)!;
        await page.goto(`${WEB_BASE}${ruta}`);
        await esperarAQueCargue(page);
        for (const texto of await page.evaluate(recortadosAUnaLinea)) fallos.push(`${titulo}: «${texto}» se corta con «…»`);
    }
    await ctx.close();
    expect(fallos, fallos.join('\n')).toEqual([]);
});
