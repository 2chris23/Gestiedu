#!/usr/bin/env node
/**
 * EL RECORRIDO DEL DISEÑO: TODAS LAS PANTALLAS, LOS CINCO ROLES, OCHO TAMAÑOS
 *
 *   node scripts/recorrido-del-diseno.mjs                 (con los dos servidores arriba)
 *   node scripts/recorrido-del-diseno.mjs --rol=admin --tam=telefono
 *   node scripts/recorrido-del-diseno.mjs --salida=docs/nube/diseno/recorrido
 *
 * Hace una foto de cada pantalla en cada tamaño y mide con el DOM lo que a ojo
 * se ve torcido (`reglas-del-diseno.mjs`): ventanas descentradas, iconos más
 * altos que su texto, lo centrado que no está en el centro, textos cortados,
 * tarjetas de una fila con alturas distintas…
 *
 * Los tamaños no son al azar: el teléfono de pie de siempre, dos teléfonos
 * tumbados (uno normal y uno de pantalla larga, 1075×484, que ya pasa de 1024 de
 * ancho y aun así NO debe llevar barra lateral), dos tabletas, un portátil y un
 * escritorio. Teléfono y tableta llevan dedo (`hasTouch`); portátil y
 * escritorio, ratón: la barra lateral (`lateral:`) depende de eso.
 *
 * Deja `resumen.json` y una hoja `index.html` en la carpeta de salida (por
 * defecto, fuera del repositorio: las fotos de una tarde no se suben).
 */

import { chromium } from 'playwright';
import pg from 'pg';
import { mkdir, writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { MEDIR_DISENO, FICHA_DE_LA_PANTALLA, QUE_SIGNIFICA_DISENO } from './reglas-del-diseno.mjs';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d;

const WEB = arg('web', 'http://localhost:3000');
const LICEO = arg('liceo', 'instituto-testing');
const SALIDA = arg('salida', join(RAIZ, 'test-results', 'recorrido-del-diseno'));
const SOLO_ROL = arg('rol', null);
const SOLO_TAM = arg('tam', null);
const SOLO_PANTALLA = arg('pantalla', null);
const BD = process.env.TEST_DB_URL || 'postgresql://postgres:postgres@localhost:5432/tenant_instituto_testing';

export const TAMANOS = [
    { id: 'telefono', ancho: 390, alto: 844, dedo: true },
    { id: 'tumbado', ancho: 844, alto: 390, dedo: true },
    { id: 'tumbado-largo', ancho: 1075, alto: 484, dedo: true },
    { id: 'tableta', ancho: 768, alto: 1024, dedo: true },
    { id: 'tableta-tumbada', ancho: 1280, alto: 800, dedo: true },
    { id: 'portatil', ancho: 1366, alto: 768, dedo: false },
    { id: 'escritorio', ancho: 1920, alto: 1080, dedo: false },
];

async function consultar(sql, params = []) {
    const c = new pg.Client({ connectionString: BD });
    await c.connect();
    try {
        return (await c.query(sql, params)).rows;
    } catch (e) {
        console.error(`  (la consulta falló: ${e.message})`);
        return [];
    } finally {
        await c.end();
    }
}

async function losRecorridos() {
    const [ciclo] = await consultar(
        `SELECT id, name FROM academic_years ORDER BY (status = 'ACTIVE') DESC, "createdAt" DESC LIMIT 1`
    );
    const [suyo] = await consultar(
        `SELECT u.email, cs."classroomId", cs."subjectId", c.slug AS "seccionSlug", s.slug AS "materiaSlug",
                a.name AS "cicloNombre", count(*) OVER (PARTITION BY u.id) AS imparte
           FROM classroom_subjects cs
           JOIN users u ON u.id = cs."teacherId"
           JOIN classrooms c ON c.id = cs."classroomId"
           JOIN subjects s ON s.id = cs."subjectId"
           LEFT JOIN academic_years a ON a.id = c."academicYearId"
          WHERE u."isActive" = true
          ORDER BY (SELECT count(*) FROM student_classrooms sc WHERE sc."classroomId" = c.id) DESC, imparte DESC, u.email
          LIMIT 1`
    );
    const [seccion] = await consultar(`SELECT id, slug FROM classrooms WHERE id = $1`, [suyo?.classroomId]);
    const [profe] = await consultar(`SELECT id FROM users WHERE role = 'TEACHER' AND "isActive" ORDER BY id LIMIT 1`);
    const [alumno] = await consultar(
        `SELECT u.id FROM users u JOIN student_classrooms sc ON sc."studentId" = u.id WHERE u.role = 'STUDENT' ORDER BY u.id LIMIT 1`
    );
    const [instituto] = await consultar(`SELECT id FROM institutes LIMIT 1`).catch(() => []);
    const c = ciclo?.name;
    const conIds = (l) => l.filter(([, r]) => !/undefined|null/.test(r));

    return [
        {
            rol: 'sin-sesion',
            pantallas: [
                ['Entrar al liceo', `/login?slug=${LICEO}`],
                ['Portal del liceo', `/instituto/${LICEO}`],
                ['Entrar desde el portal', `/instituto/${LICEO}/login`],
                ['Entrar como superadmin', '/superadmin/login'],
                ['No existe', '/dashboard/esta-pantalla-no-existe'],
            ],
        },
        {
            rol: 'superadmin',
            entrar: { ruta: '/superadmin/login', email: 'admin@tuapp.com', clave: 'SuperAdmin2026!', espera: '**/superadmin/**' },
            pantallas: [
                ['Panel', '/superadmin/dashboard'],
                ['Liceos', '/superadmin/institutes'],
                ['Nuevo liceo', '/superadmin/institutes/new'],
                ['Métricas', '/superadmin/metrics'],
                ['Migraciones', '/superadmin/migraciones'],
                ['Planes', '/superadmin/plans'],
            ],
        },
        {
            rol: 'admin',
            email: 'admin@testing.edu.ve',
            pantallas: conIds([
                ['Inicio', '/dashboard'],
                ['Académico', '/dashboard/academico'],
                ['Ciclo', `/dashboard/academico/${c}`],
                ['Sección', `/dashboard/academico/${c}/${suyo?.seccionSlug}`],
                ['Sección · materia', `/dashboard/academico/${c}/${suyo?.seccionSlug}/${suyo?.materiaSlug}`],
                ['Promoción', `/dashboard/academico/${c}/promocion`],
                ['Aulas', '/dashboard/aulas'],
                ['Un aula', `/dashboard/aulas/${seccion?.id}`],
                ['Materias', '/dashboard/materias'],
                ['Una materia', `/dashboard/materias/${c}/${suyo?.materiaSlug}`],
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
            rol: 'profesor',
            email: suyo?.email,
            pantallas: conIds([
                ['Inicio', '/dashboard'],
                ['Académico', '/dashboard/academico'],
                ['Su sección', `/dashboard/academico/${c}/${suyo?.seccionSlug}`],
                ['Plan de evaluación', `/dashboard/academico/${c}/${suyo?.seccionSlug}/${suyo?.materiaSlug}`],
                ['Clase en vivo', `/dashboard/clase-en-vivo/${suyo?.classroomId}/${suyo?.subjectId}`],
                ['Materias', '/dashboard/materias'],
                ['Horarios', '/dashboard/horarios'],
                ['Calendario', '/dashboard/calendario'],
            ]),
        },
        {
            rol: 'alumno',
            email: 'est0575@testing.edu.ve',
            pantallas: [
                ['Inicio', '/dashboard'],
                ['Calendario', '/dashboard/calendario'],
            ],
        },
        {
            rol: 'representante',
            email: 'tutor.prueba@testing.edu.ve',
            pantallas: [
                ['Inicio', '/dashboard'],
                ['Calendario', '/dashboard/calendario'],
            ],
        },
    ].filter((r) => !SOLO_ROL || r.rol === SOLO_ROL);
}

async function sigueCargando(page) {
    return page
        .evaluate(() => {
            const t = document.body?.innerText || '';
            if (/\bCargando\b|\bLoading\b/i.test(t)) return true;
            if (document.querySelector('[aria-busy="true"]')) return true;
            return [...document.querySelectorAll('.animate-pulse, .animate-latir')].some((el) => {
                if (el.textContent && el.textContent.trim()) return false;
                const r = el.getBoundingClientRect();
                return r.width >= 60 && r.height >= 12;
            });
        })
        .catch(() => false);
}

async function esperar(page, tope = 20000) {
    await page.waitForLoadState('networkidle', { timeout: tope }).catch(() => {});
    const hasta = Date.now() + tope;
    while (Date.now() < hasta) {
        if (!(await sigueCargando(page))) {
            await page.waitForTimeout(500);
            return true;
        }
        await page.waitForTimeout(400);
    }
    return false;
}

async function entrar(page, recorrido) {
    const e = recorrido.entrar || { ruta: `/login?slug=${LICEO}`, email: recorrido.email, clave: '123456', espera: '**/dashboard**' };
    for (let intento = 0; intento < 6; intento++) {
        await page.goto(`${WEB}${e.ruta}`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('input[type="email"]', { timeout: 20000 });
        await page.fill('input[type="email"]', e.email);
        await page.fill('input[type="password"]', e.clave);
        const resp = page.waitForResponse((r) => /\/login/.test(r.url()) && r.request().method() === 'POST', { timeout: 20000 }).catch(() => null);
        await page.click('button[type="submit"]');
        const r = await resp;
        if (r?.status() === 429) {
            await page.waitForTimeout(10000);
            continue;
        }
        await page.waitForURL(e.espera, { timeout: 30000 });
        await page.waitForTimeout(1500);
        return;
    }
    throw new Error('el límite de intentos no se soltó');
}

const archivo = (...p) =>
    p
        .join('-')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');

async function main() {
    await mkdir(SALIDA, { recursive: true });
    const navegador = await chromium.launch();
    const fichas = [];
    const recorridos = await losRecorridos();

    for (const tam of TAMANOS.filter((t) => !SOLO_TAM || t.id === SOLO_TAM)) {
        for (const recorrido of recorridos) {
            const ctx = await navegador.newContext({
                viewport: { width: tam.ancho, height: tam.alto },
                isMobile: tam.dedo && tam.ancho < 1100,
                hasTouch: tam.dedo,
                deviceScaleFactor: 1,
                locale: 'es-VE',
            });
            const page = await ctx.newPage();
            if (recorrido.rol !== 'sin-sesion') {
                try {
                    await entrar(page, recorrido);
                } catch (e) {
                    console.log(`  (no se pudo entrar como ${recorrido.rol}: ${String(e).slice(0, 80)})`);
                    await ctx.close();
                    continue;
                }
            }
            for (const [titulo, ruta] of recorrido.pantallas) {
                if (SOLO_PANTALLA && !titulo.toLowerCase().includes(SOLO_PANTALLA.toLowerCase())) continue;
                try {
                    await page.goto(`${WEB}${ruta}`, { waitUntil: 'domcontentloaded' });
                    const cargada = await esperar(page);
                    const nombre = `${archivo(recorrido.rol, titulo, tam.id)}.png`;
                    await page.screenshot({ path: join(SALIDA, nombre), fullPage: true });
                    const faltas = await page.evaluate(MEDIR_DISENO, { tolerancia: 2 });
                    const ficha = await page.evaluate(FICHA_DE_LA_PANTALLA);
                    const conBarraLateral = await page.evaluate(() => {
                        const a = document.querySelector('aside');
                        return !!a && getComputedStyle(a).display !== 'none';
                    });
                    fichas.push({ rol: recorrido.rol, titulo, ruta, tam: tam.id, archivo: nombre, cargada, conBarraLateral, ficha, faltas });
                    const sello = faltas.length ? `✗ ${[...new Set(faltas.map((f) => f.regla))].join(' ')}` : '✓';
                    console.log(`  ${tam.id.padEnd(16)} ${recorrido.rol.padEnd(14)} ${titulo.padEnd(24)} ${cargada ? '' : '(sin cargar) '}${sello}`);
                } catch (e) {
                    console.log(`  … ${tam.id} ${recorrido.rol} ${titulo} — no se pudo: ${String(e).slice(0, 100)}`);
                }
            }
            await ctx.close();
        }
    }
    await navegador.close();

    await writeFile(join(SALIDA, 'resumen.json'), JSON.stringify(fichas, null, 2));
    const porRegla = {};
    for (const f of fichas) for (const x of f.faltas) porRegla[x.regla] = (porRegla[x.regla] || 0) + 1;
    console.log(`\n${fichas.length} fotos · ${fichas.filter((f) => f.faltas.length).length} con algo`);
    for (const [r, n] of Object.entries(porRegla).sort((a, b) => b[1] - a[1]))
        console.log(`  ${String(n).padStart(4)}  ${QUE_SIGNIFICA_DISENO[r] || r}`);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
