import { test, expect, type Page, type Browser } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { API_BASE, TENANT_SLUG, loginApi, loginViaUI, queryTenantDb, representanteConUnHijo } from './helpers';

/**
 * LA GRABADORA: QUÉ PIDE DE VERDAD CADA PANTALLA (para la precarga)
 *
 * La precarga baja en un paquete todo lo de cada persona
 * (`apps/backend/src/services/precarga.service.ts`). Para saber QUÉ lecturas
 * hace cada pantalla no se escribe nada a mano —ya falló una vez: «había cosas
 * que no se habían cargado»—: se abre una pantalla de cada molde, en un
 * teléfono y en un ordenador, se pulsa cada pestaña y se apunta cada lectura.
 * El servidor dice qué es cada trozo de esa pantalla (su contexto: `{id}`,
 * `{seccion}`, `{hoy}`…) y cada lectura se guarda en molde.
 *
 *   GRABAR=1 npx playwright test grabar-lecturas    → reescribe
 *       apps/backend/src/precarga/lecturas-por-pantalla.json
 *   npx playwright test grabar-lecturas             → PRECARGA-MAPA: graba
 *       igual y falla si una pantalla pide algo que el mapa no tiene
 *
 * Y falla también si una lectura lleva un id o una fecha que el contexto no
 * explica: esa lectura no se podría rellenar para otra persona, y sin
 * conexión saldría «no está guardada». Se arregla dándole ese dato al
 * contexto en el servidor (`precarga.service.ts`).
 */

const ARCHIVO = path.join(process.cwd(), 'apps', 'backend', 'src', 'precarga', 'lecturas-por-pantalla.json');

/** Lo que no se guarda nunca en el teléfono (`respuestas-guardadas.ts`) ni va en el paquete. */
const NO_VA = /^\/(auth|superadmin|precarga|health|time)\b|^\/avisos\/telefonos/;

/** ¿Un trozo que parece de una persona o un día concretos? */
const PARECE_DATO = /^(?=.*\d)[A-Za-z0-9_.%-]{6,}$/;
const PARECE_FECHA = /\d{4}-\d{2}(-\d{2})?/;

/** La llave del teléfono: dirección con los parámetros ordenados (`claveDeLaPeticion`). */
function laClave(camino: string, query: string): string {
    const todos = new URLSearchParams(query);
    const orden = [...todos.entries()].sort(([a, x], [b, y]) => (a === b ? x.localeCompare(y) : a.localeCompare(b)));
    const limpia = camino.replace(/^\/+/, '/').replace(/\/+$/, '') || '/';
    return orden.length ? `${limpia}?${new URLSearchParams(orden).toString()}` : limpia;
}

/** La lectura en molde: cada valor del contexto, por su nombre (el más largo primero). */
function enMolde(clave: string, ctx: Record<string, string | string[]>): { molde: string; sueltos: string[] } {
    // Un valor lista (las materias de la sección) se marca `{materiasDeLaSeccion[]}`:
    // el servidor pone una lectura por cada una. Un valor suelto gana a la lista.
    // Con el mismo valor en dos nombres (la clase de hoy: `{fecha}` y `{hoy}`;
    // un lunes: `{lunes}`), gana el de la pantalla, que va después del común:
    // si no, la clase en vivo del martes pediría la fecha del lunes.
    const orden = new Map(Object.keys(ctx).map((k, i) => [k, i]));
    const pares = Object.entries(ctx)
        .flatMap(([k, v]) => (Array.isArray(v) ? v.map((x) => [`${k}[]`, x] as const) : [[k, v] as const]))
        .filter(([, v]) => typeof v === 'string' && v.length >= 4)
        .map(([k, v]) => [k, encodeURIComponent(v)] as const)
        .sort(
            (a, b) =>
                b[1].length - a[1].length ||
                Number(a[0].endsWith('[]')) - Number(b[0].endsWith('[]')) ||
                (orden.get(b[0].replace('[]', '')) ?? 0) - (orden.get(a[0].replace('[]', '')) ?? 0)
        );
    // Primero se marcan, luego se ponen los nombres: así un valor no se come
    // otro que ya se cambió.
    let s = clave;
    const marcas: string[] = [];
    for (const [k, v] of pares) {
        if (!s.includes(v)) continue;
        s = s.split(v).join(`\u0000${marcas.length}\u0000`);
        marcas.push(k);
    }
    const [camino, query = ''] = s.split('?');
    const trozos = [...camino.split('/'), ...query.split('&').map((p) => p.split('=')[1] ?? '')];
    const sueltos = trozos.filter((t) => t && !t.includes('\u0000') && (PARECE_DATO.test(t) || PARECE_FECHA.test(t)));
    const molde = s.replace(/\u0000(\d+)\u0000/g, (_, i) => `{${marcas[Number(i)]}}`);
    return { molde, sueltos };
}

async function profesorDeVerdad(): Promise<string> {
    const [fila] = await queryTenantDb<{ email: string }>(
        `SELECT u.email FROM classroom_subjects cs JOIN users u ON u.id = cs."teacherId"
          WHERE u."isActive" = true GROUP BY u.email ORDER BY count(*) DESC, u.email LIMIT 1`
    );
    return fila?.email ?? 'profesor.ciencias@tuapp.com';
}

async function quieta(page: Page) {
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
    await expect
        .poll(() => page.evaluate(() => (window as unknown as { __lecturasEnCurso?: number }).__lecturasEnCurso ?? 0), { timeout: 15000 })
        .toBe(0)
        .catch(() => undefined);
    await page.waitForTimeout(500);
}

interface PantallaDelPlan {
    molde: string;
    variante: string | null;
    ctx: Record<string, string | string[]>;
    url: string;
}

const VISTAS = [
    { nombre: 'telefono', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
    { nombre: 'ordenador', viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false },
];

async function grabarUnRol(browser: Browser, correo: string) {
    const sesion = await loginApi(correo);
    const rol = sesion.user.role as string;
    const lecturasPorMolde = new Map<string, Set<string>>();
    const sueltos: string[] = [];

    for (const vista of VISTAS) {
        const context = await browser.newContext({ viewport: vista.viewport, isMobile: vista.isMobile, hasTouch: vista.hasTouch });
        const page = await context.newPage();
        await loginViaUI(page, correo);

        // El menú lo decide la web (módulos encendidos…): el del ordenador lo enseña entero.
        // El menú sale entero cuando se sabe qué módulos tiene el liceo
        // (pagos, comedor): antes, Pagos no estaba y no se grababa.
        await quieta(page);
        const menu = await page.$$eval('a[href^="/dashboard"]', (as) => [...new Set(as.map((a) => (a as HTMLAnchorElement).getAttribute('href') || ''))]);
        const r = await page.request.post(`${API_BASE}/precarga/plan`, {
            headers: { Authorization: `Bearer ${sesion.accessToken}`, 'X-Institute-Slug': TENANT_SLUG },
            data: { menu: menu.filter((h) => /^\/dashboard(\/[a-z0-9-]+)*$/.test(h)), conContexto: true },
        });
        expect(r.status()).toBe(200);
        const plan = (await r.json()) as { pantallas: PantallaDelPlan[] };

        // Una de cada molde (y de cada variante: la ficha de un alumno no es la
        // de un profesor). De las fichas de alumnos, tres: unos tienen
        // representante y otros no, unos notas y otros no.
        const llave = (p: PantallaDelPlan) => `${rol}:${p.molde}${p.variante ? `#${p.variante}` : ''}`;
        const porLlave = new Map<string, PantallaDelPlan[]>();
        for (const p of plan.pantallas) {
            const lista = porLlave.get(llave(p)) ?? [];
            if (lista.length < (p.variante === 'STUDENT' ? 3 : 1)) lista.push(p);
            porLlave.set(llave(p), lista);
        }
        const muestra = [...porLlave.values()].flat();

        const api = new URL(API_BASE);
        let ahora: PantallaDelPlan | null = null;
        page.on('request', (req) => {
            if (req.method() !== 'GET' || !ahora) return;
            const u = new URL(req.url());
            if (u.origin !== api.origin || !u.pathname.startsWith(api.pathname)) return;
            const clave = laClave(u.pathname.slice(api.pathname.length), u.search.slice(1));
            if (NO_VA.test(clave)) return;
            const { molde, sueltos: s } = enMolde(clave, ahora.ctx);
            if (s.length) sueltos.push(`${rol} ${ahora.molde}: ${clave} → ${s.join(', ')}`);
            const k = llave(ahora);
            if (!lecturasPorMolde.has(k)) lecturasPorMolde.set(k, new Set());
            lecturasPorMolde.get(k)!.add(molde);
        });

        for (const p of muestra) {
            ahora = p;
            await page.goto(p.url).catch(() => undefined);
            await quieta(page);
            const pestanas = page.locator('[data-pestana]:visible, [role="tab"]:visible');
            const n = Math.min(await pestanas.count(), 15);
            for (let i = 0; i < n; i++) {
                await pestanas.nth(i).click({ timeout: 3000 }).catch(() => undefined);
                await quieta(page);
            }
            ahora = null;
        }
        await context.close();
    }
    return { lecturasPorMolde, sueltos: [...new Set(sueltos)] };
}

test.describe('Grabadora de lecturas', () => {
    test.setTimeout(60 * 60 * 1000);

    test('PRECARGA-MAPA: cada lectura de cada pantalla está en el mapa (GRABAR=1 lo reescribe)', async ({ browser }) => {
        const todas = new Map<string, Set<string>>();
        const sueltos: string[] = [];
        const representante = await representanteConUnHijo();
        try {
            for (const correo of ['admin@testing.edu.ve', await profesorDeVerdad(), 'est0575@testing.edu.ve', representante.correo]) {
                const r = await grabarUnRol(browser, correo);
                for (const [k, v] of r.lecturasPorMolde) todas.set(k, new Set([...(todas.get(k) ?? []), ...v]));
                sueltos.push(...r.sueltos);
            }
        } finally {
            await representante.quitar();
        }

        const nuevo: Record<string, string[]> = {};
        for (const k of [...todas.keys()].sort()) nuevo[k] = [...todas.get(k)!].sort();

        if (process.env.GRABAR) {
            const anterior = JSON.parse(readFileSync(ARCHIVO, 'utf-8')) as { version: number };
            writeFileSync(ARCHIVO, JSON.stringify({ version: (anterior.version || 0) + 1, pantallas: nuevo }, null, 2) + '\n');
        } else {
            const mapa = JSON.parse(readFileSync(ARCHIVO, 'utf-8')) as { pantallas: Record<string, string[]> };
            const faltan: string[] = [];
            for (const [k, v] of Object.entries(nuevo)) for (const l of v) if (!(mapa.pantallas[k] ?? []).includes(l)) faltan.push(`${k}: ${l}`);
            expect(faltan, `Faltan en el mapa (corre GRABAR=1):\n${faltan.join('\n')}`).toEqual([]);
        }
        expect(sueltos, `Lecturas con datos que el contexto no explica:\n${sueltos.join('\n')}`).toEqual([]);
    });
});
