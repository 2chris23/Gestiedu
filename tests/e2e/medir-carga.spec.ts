import { test, type Browser } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { WEB_BASE, loginApi, injectSessionCookies, queryTenantDb } from './helpers';

/**
 * CUÁNTO JAVASCRIPT BAJA CADA PANTALLA LA PRIMERA VEZ
 *
 * Es la regla con la que se mide la carga diferida: no aprueba ni suspende,
 * apunta. Cada pantalla se abre en un navegador limpio (sin nada guardado),
 * como la abre quien entra por primera vez desde el teléfono, y se suma todo el
 * javascript que baja hasta que la red se queda quieta:
 *
 *   - `transferido`: lo que viaja por la red (comprimido). Es lo que paga el
 *     plan de datos y lo que tarda en una conexión lenta.
 *   - `descomprimido`: lo que el teléfono tiene que leer y ejecutar. Es lo que
 *     tarda en un teléfono lento aunque la red sea buena.
 *
 * QUÉ NO MIDE: las fotos, las letras ni los datos de la API; ni lo que baja al
 * pulsar después (un modal que se carga al abrirlo cuenta cuando se abre, no
 * aquí: justo es lo que se busca).
 *
 * Con el servidor de DESARROLLO los números no sirven (sin minificar y con el
 * recargador en caliente). Medir con la web compilada:
 *
 *   cd apps/web && npm run build && npx next start -p 3108
 *   MEDIR_ETIQUETA=antes WEB_BASE=http://localhost:3108 npx playwright test medir-carga
 *
 * El resultado queda en docs/mediciones/carga-<etiqueta>.json.
 */

interface Pantalla {
    nombre: string;
    quien: string | null;
    ruta: () => string;
}

let ids: { clase: string; materia: string; profe: string; ciclo: string } = { clase: '', materia: '', profe: '', ciclo: '' };

const PANTALLAS: Pantalla[] = [
    { nombre: 'portada', quien: null, ruta: () => '/' },
    { nombre: 'login del liceo', quien: null, ruta: () => '/instituto/instituto-testing/login' },
    { nombre: 'inicio (admin)', quien: 'admin@testing.edu.ve', ruta: () => '/dashboard' },
    { nombre: 'usuarios (admin)', quien: 'admin@testing.edu.ve', ruta: () => '/dashboard/usuarios' },
    { nombre: 'configuración (admin)', quien: 'admin@testing.edu.ve', ruta: () => '/dashboard/configuracion' },
    { nombre: 'académico (admin)', quien: 'admin@testing.edu.ve', ruta: () => '/dashboard/academico' },
    { nombre: 'sección (admin)', quien: 'admin@testing.edu.ve', ruta: () => `/dashboard/academico/${ids.ciclo}/${ids.clase}` },
    { nombre: 'horarios (admin)', quien: 'admin@testing.edu.ve', ruta: () => '/dashboard/horarios' },
    { nombre: 'inicio (profesor)', quien: 'PROFE', ruta: () => '/dashboard' },
    { nombre: 'clase en vivo (profesor)', quien: 'PROFE', ruta: () => `/dashboard/clase-en-vivo/${ids.clase}/${ids.materia}` },
    { nombre: 'inicio (alumno)', quien: 'est0575@testing.edu.ve', ruta: () => '/dashboard' },
    { nombre: 'mi clase (alumno)', quien: 'est0575@testing.edu.ve', ruta: () => '/dashboard/mi-clase' },
    { nombre: 'boleta (alumno)', quien: 'est0575@testing.edu.ve', ruta: () => '/dashboard/boleta/mia' },
    { nombre: 'inicio (representante)', quien: 'tutor.prueba@testing.edu.ve', ruta: () => '/dashboard' },
];

async function medir(browser: Browser, p: Pantalla) {
    // Sin el ayudante (sw.js): lo que él sirve sale con tamaño 0 en la red y
    // falsea «transferido». Se mide lo que baja la página, no lo guardado.
    const contexto = await browser.newContext({ serviceWorkers: 'block' });
    const page = await contexto.newPage();
    if (p.quien) {
        const email = p.quien === 'PROFE' ? ids.profe : p.quien;
        await injectSessionCookies(page, await loginApi(email, '123456'));
    }
    const scripts: Promise<{ url: string; transferido: number; descomprimido: number }>[] = [];
    page.on('requestfinished', (req) => {
        if (req.resourceType() !== 'script') return;
        scripts.push(
            (async () => {
                const sizes = await req.sizes().catch(() => null);
                const res = await req.response();
                const cuerpo = res ? await res.body().catch(() => Buffer.alloc(0)) : Buffer.alloc(0);
                return { url: req.url(), transferido: sizes?.responseBodySize ?? 0, descomprimido: cuerpo.length };
            })()
        );
    });
    const t0 = Date.now();
    await page.goto(`${WEB_BASE}${p.ruta()}`, { waitUntil: 'networkidle', timeout: 60000 });
    const ms = Date.now() - t0;
    const lista = await Promise.all(scripts);
    await contexto.close();
    const suma = (k: 'transferido' | 'descomprimido') => lista.reduce((a, s) => a + s[k], 0);
    return { pantalla: p.nombre, archivos: lista.length, transferidoKB: Math.round(suma('transferido') / 1024), descomprimidoKB: Math.round(suma('descomprimido') / 1024), ms };
}

test('CARGA-01: el javascript que baja cada pantalla la primera vez', async ({ browser }) => {
    test.setTimeout(15 * 60_000);
    const [c] = await queryTenantDb<{ clase: string; materia: string; profe: string; ciclo: string }>(
        `SELECT cs."classroomId" AS clase, cs."subjectId" AS materia, u.email AS profe, c."academicYearId" AS ciclo
           FROM classroom_subjects cs
           JOIN users u ON u.id = cs."teacherId" AND u."isActive" = true
           JOIN classrooms c ON c.id = cs."classroomId"
           JOIN academic_years ay ON ay.id = c."academicYearId" AND ay.status = 'ACTIVE'
          WHERE EXISTS (SELECT 1 FROM student_classrooms sc WHERE sc."classroomId" = cs."classroomId" AND sc."isActive" = true)
          LIMIT 1`
    );
    ids = c;

    const filas = [];
    for (const p of PANTALLAS) filas.push(await medir(browser, p));
    console.table(filas);

    const etiqueta = process.env.MEDIR_ETIQUETA || new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
    const dir = path.join(__dirname, '..', '..', 'docs', 'mediciones');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `carga-${etiqueta}.json`), JSON.stringify({ web: WEB_BASE, cuando: new Date().toISOString(), filas }, null, 2));
});
