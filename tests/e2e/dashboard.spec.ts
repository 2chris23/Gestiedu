import { test, expect } from '@playwright/test';
import {
    WEB_BASE,
    loginApi,
    injectSessionCookies,
    captureEvidence,
    queryTenantDb,
} from './helpers';

/**
 * TODAS LAS PANTALLAS, UNA POR UNA
 *
 * Las demás pruebas comprueban funciones concretas. Esta comprueba otra cosa, y
 * es la que más barato encuentra roturas: **que ninguna pantalla del sistema
 * pida algo que el servidor le niegue**.
 *
 * Se entra en cada pantalla con cada rol y se vigila el tráfico. Si una pantalla
 * pide un dato y recibe un 400, un 403 o un 500, sale aquí — aunque la pantalla
 * "se vea bien", porque un panel que enseña cero cuando debería enseñar treinta
 * no se distingue a simple vista de uno vacío de verdad.
 *
 * Así se descubrió que `GET /api/teachers/my-classrooms` devolvía 400 siempre:
 * la pantalla del profesor cargaba, pero sin sus secciones.
 *
 * También se miran los errores de JavaScript. Una pantalla puede pintarse a
 * medias y no avisar de nada.
 */

const ESPERA_PANTALLA = 30000;

interface Fallo {
    tipo: 'peticion' | 'javascript' | 'pantalla';
    detalle: string;
}

/**
 * Abre una pantalla y devuelve todo lo que salió mal mientras cargaba.
 *
 * Los 401 no cuentan: hay peticiones que se lanzan justo cuando la sesión se
 * está renovando y el sistema reintenta solo. Lo que no puede pasar es un 400
 * (la pantalla pide mal), un 403 (pide lo que no le toca) o un 500.
 */
async function abrirYVigilar(page: any, ruta: string): Promise<Fallo[]> {
    const fallos: Fallo[] = [];

    const alResponder = (res: any) => {
        const url = res.url();
        if (!url.includes('/api/')) return;
        const codigo = res.status();
        if (codigo === 400 || codigo === 403 || codigo >= 500) {
            fallos.push({ tipo: 'peticion', detalle: `${codigo} ${url.replace(/^https?:\/\/[^/]+/, '')}` });
        }
    };

    const alFallarJs = (error: Error) => {
        fallos.push({ tipo: 'javascript', detalle: error.message });
    };

    page.on('response', alResponder);
    page.on('pageerror', alFallarJs);

    try {
        await page.goto(`${WEB_BASE}${ruta}`, { waitUntil: 'domcontentloaded' });
        try {
            await page.locator('main').first().waitFor({ state: 'visible', timeout: ESPERA_PANTALLA });
        } catch {
            // Que una pantalla no llegue a pintarse es un hallazgo, no un motivo
            // para abandonar el recorrido: se anota y se sigue con las demás.
            fallos.push({ tipo: 'pantalla', detalle: 'no llegó a pintarse en 30 s' });
        }
        // Tiempo para que terminen las peticiones que lanza la pantalla al entrar.
        await page.waitForTimeout(2500);
    } finally {
        page.off('response', alResponder);
        page.off('pageerror', alFallarJs);
    }

    return fallos;
}

/** Rutas que necesitan un id de verdad, sacado de la base del liceo. */
async function rutasConDatos(): Promise<string[]> {
    const rutas: string[] = [];

    const [seccion] = await queryTenantDb<{ id: string }>(
        `SELECT c.id FROM classrooms c
         JOIN student_classrooms sc ON sc."classroomId" = c.id AND sc."isActive" = true
         GROUP BY c.id ORDER BY count(*) DESC LIMIT 1`
    );
    if (seccion) {
        rutas.push(`/dashboard/aulas/${seccion.id}`);
        rutas.push(`/dashboard/horarios/seccion/${seccion.id}`);
    }

    // La pantalla se llama "[cedula]" pero lo que recibe es el id del usuario:
    // en la base del liceo no hay columna `cedula`.
    const [alumno] = await queryTenantDb<{ id: string }>(
        `SELECT id FROM users WHERE role = 'STUDENT' AND "isActive" = true LIMIT 1`
    );
    if (alumno) rutas.push(`/dashboard/usuarios/${alumno.id}`);

    const [profesor] = await queryTenantDb<{ id: string }>(
        `SELECT id FROM users WHERE role = 'TEACHER' AND "isActive" = true LIMIT 1`
    );
    if (profesor) rutas.push(`/dashboard/horarios/profesor/${profesor.id}`);

    return rutas;
}

/** Las pantallas que ve cada rol, según lo que le toca. */
const PANTALLAS_DE_ADMIN = [
    '/dashboard',
    '/dashboard/academico',
    '/dashboard/aulas',
    '/dashboard/calendario',
    '/dashboard/configuracion',
    '/dashboard/eventos',
    '/dashboard/horarios',
    '/dashboard/materias',
    '/dashboard/usuarios',
];

const PANTALLAS_DE_PROFESOR = [
    '/dashboard',
    '/dashboard/academico',
    '/dashboard/calendario',
    '/dashboard/horarios',
];

const PANTALLAS_DE_ESTUDIANTE = ['/dashboard', '/dashboard/calendario'];
const PANTALLAS_DE_TUTOR = ['/dashboard', '/dashboard/calendario'];

test.describe('Todas las pantallas', () => {
    test.describe.configure({ mode: 'serial' });

    const casos: Array<{ rol: string; email: string; pantallas: string[]; conDatos?: boolean }> = [
        {
            rol: 'admin',
            email: 'admin@testing.edu.ve',
            pantallas: PANTALLAS_DE_ADMIN,
            conDatos: true,
        },
        { rol: 'profesor', email: 'profesor.ciencias@tuapp.com', pantallas: PANTALLAS_DE_PROFESOR },
        { rol: 'estudiante', email: 'est0575@testing.edu.ve', pantallas: PANTALLAS_DE_ESTUDIANTE },
        { rol: 'tutor', email: 'tutor.prueba@testing.edu.ve', pantallas: PANTALLAS_DE_TUTOR },
    ];

    for (const caso of casos) {
        test(`PANT-${caso.rol}: sus pantallas cargan sin que el servidor le niegue nada`, async ({
            browser,
        }, testInfo) => {
            test.setTimeout(300000);

            const sesion = await loginApi(caso.email, '123456');
            const contexto = await browser.newContext();
            const page = await contexto.newPage();
            await injectSessionCookies(page, sesion);

            const pantallas = [...caso.pantallas];
            if (caso.conDatos) pantallas.push(...(await rutasConDatos()));

            const problemas: Record<string, Fallo[]> = {};

            try {
                for (const ruta of pantallas) {
                    const fallos = await abrirYVigilar(page, ruta);
                    if (fallos.length > 0) problemas[ruta] = fallos;
                    console.log(`  ${fallos.length === 0 ? 'ok  ' : 'MAL '} ${caso.rol.padEnd(10)} ${ruta}`);
                    for (const f of fallos) console.log(`         ${f.tipo}: ${f.detalle}`);
                }

                const rutasConProblema = Object.keys(problemas);
                if (rutasConProblema.length > 0) {
                    const detalle = rutasConProblema
                        .map((r) => `  ${r}\n${problemas[r].map((f) => `      ${f.tipo}: ${f.detalle}`).join('\n')}`)
                        .join('\n');
                    throw new Error(`Pantallas con problemas para ${caso.rol}:\n${detalle}`);
                }
            } catch (error) {
                await captureEvidence(
                    testInfo,
                    page,
                    `PANT-${caso.rol}`,
                    'Las pantallas del rol cargan sin errores',
                    error
                );
                throw error;
            } finally {
                await contexto.close();
            }

            expect(Object.keys(problemas)).toHaveLength(0);
        });
    }
});
