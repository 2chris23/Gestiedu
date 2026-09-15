import { test } from '@playwright/test';
import axios from 'axios';
import {
    API_BASE,
    WEB_BASE,
    TENANT_SLUG,
    loginApi,
    injectSessionCookies,
    queryTenantDb,
} from './helpers';

/**
 * INVENTARIO DE PANTALLAS: CUÁNTO TARDA CADA UNA
 *
 * Las otras mediciones responden preguntas sueltas. Esta hace el cuadro
 * completo, pantalla por pantalla, con las tres cifras que de verdad vive un
 * usuario:
 *
 *   1. **Abrir la primera vez** — entrar desde cero.
 *   2. **Volver** — entrar otra vez, con los datos ya a mano. Es lo que más
 *      pasa en un día de trabajo: se entra y se sale de las mismas pantallas.
 *   3. **Guardar** — lo que el usuario espera mirando el botón, en las pantallas
 *      que guardan algo.
 *
 * Y aparte, una vez: **cuánto tarda en verse lo que otro guarda**, que es igual
 * para todas porque el aviso es el mismo mecanismo.
 *
 * ─── CÓMO LEER ESTO ──────────────────────────────────────────────────────────
 *
 * Solo vale contra **compilación de producción** (`npm run build` + `npm start`
 * en `apps/web`). En modo desarrollo, Next compila cada pantalla al entrar y la
 * primera vez sale diez veces peor sin que eso signifique nada.
 *
 * El guardado se mide contra la API directamente, que es lo que la pantalla
 * espera. Lo que la pantalla añade encima es pintar, y eso se ve en "volver".
 *
 * EJECUTAR:
 *   npx playwright test tests/e2e/inventario-de-pantallas.spec.ts --reporter=list
 */

interface Pantalla {
    nombre: string;
    ruta: string;
    /** Cómo guarda, si guarda. Se mide contra la API. */
    guardado?: {
        que: string;
        ejecutar: (token: string, datos: Datos) => Promise<{ ok: boolean; limpiar?: () => Promise<void> }>;
    };
}

interface Datos {
    seccionId?: string;
    materiaId?: string;
    alumnoId?: string;
    profesorId?: string;
    cicloId?: string;
    lapsoId?: string;
}

interface Medida {
    nombre: string;
    ruta: string;
    primeraVez: number | null;
    alVolver: number | null;
    guardado: number | null;
    queGuarda: string | null;
    nota?: string;
}

const ESPERA = 45000;

const cabeceras = (token: string, conCuerpo = true) => ({
    Authorization: `Bearer ${token}`,
    'X-Institute-Slug': TENANT_SLUG,
    ...(conCuerpo ? { 'Content-Type': 'application/json' } : {}),
});

/**
 * Ir por el menú, sin recargar — que es lo que hace un usuario de verdad.
 *
 * Un usuario no escribe la dirección ni pulsa F5: hace clic en la barra
 * lateral. Eso NO recarga la página, solo cambia lo que se ve, y por eso es
 * muchísimo más rápido que abrir desde cero.
 *
 * Medir solo la recarga completa da el peor caso y asusta sin motivo; medir
 * solo el menú da el mejor caso y engaña. Hacen falta los dos.
 *
 * Devuelve `null` cuando esa pantalla no está en el menú (las de detalle, que
 * se abren desde una lista): ahí solo tiene sentido la cifra de abrir.
 */
async function irPorElMenu(page: any, ruta: string): Promise<number | null> {
    const enlace = page.locator(`a[href="${ruta}"]`).first();
    if ((await enlace.count()) === 0) return null;

    const t0 = Date.now();
    try {
        await enlace.click();
        await page.waitForURL(`**${ruta}`, { timeout: ESPERA });
        await page.locator('main').first().waitFor({ state: 'visible', timeout: ESPERA });
        await page.waitForLoadState('networkidle', { timeout: ESPERA }).catch(() => undefined);
        return Date.now() - t0;
    } catch {
        return null;
    }
}

/** Abre una pantalla desde cero (recarga completa): el peor caso. */
async function abrir(page: any, ruta: string): Promise<number | null> {
    const t0 = Date.now();
    try {
        await page.goto(`${WEB_BASE}${ruta}`, { waitUntil: 'domcontentloaded' });
        await page.locator('main').first().waitFor({ state: 'visible', timeout: ESPERA });
        // Se espera a que el tráfico se calme: una pantalla "visible" que sigue
        // pidiendo datos todavía no sirve para trabajar.
        await page.waitForLoadState('networkidle', { timeout: ESPERA }).catch(() => undefined);
        return Date.now() - t0;
    } catch {
        return null;
    }
}

async function medirGuardado(
    token: string,
    datos: Datos,
    guardado: NonNullable<Pantalla['guardado']>
): Promise<number | null> {
    const t0 = Date.now();
    try {
        const r = await guardado.ejecutar(token, datos);
        const ms = Date.now() - t0;
        if (r.limpiar) await r.limpiar().catch(() => undefined);
        return r.ok ? ms : null;
    } catch {
        return null;
    }
}

test('INVENTARIO: cuánto tarda cada pantalla en abrir, volver y guardar', async ({ browser }) => {
    test.setTimeout(900000);

    const sesion = await loginApi('admin@testing.edu.ve', '123456', true, TENANT_SLUG, true);
    const token = sesion.accessToken;

    // ── Datos reales del liceo, para poder abrir las pantallas con id ────────
    const [seccion] = await queryTenantDb<any>(
        `SELECT c.id, c."academicYearId" FROM classrooms c
         JOIN student_classrooms sc ON sc."classroomId" = c.id AND sc."isActive" = true
         GROUP BY c.id, c."academicYearId" ORDER BY count(*) DESC LIMIT 1`
    );
    const [materia] = await queryTenantDb<any>(
        `SELECT cs."subjectId" AS id FROM classroom_subjects cs WHERE cs."classroomId" = $1 LIMIT 1`,
        [seccion?.id]
    );
    // La pantalla se llama "[cedula]" pero lo que recibe es el id del usuario:
    // en la base del liceo no hay columna `cedula`.
    const [alumno] = await queryTenantDb<any>(
        `SELECT u.id FROM users u
         JOIN student_classrooms sc ON sc."studentId" = u.id AND sc."classroomId" = $1
         WHERE u.role = 'STUDENT' LIMIT 1`,
        [seccion?.id]
    );
    const [profesor] = await queryTenantDb<any>(
        `SELECT id FROM users WHERE role = 'TEACHER' AND "isActive" = true LIMIT 1`
    );
    const [lapso] = await queryTenantDb<any>(
        `SELECT p.id FROM periods p WHERE p."academicYearId" = $1 ORDER BY p."startDate" DESC LIMIT 1`,
        [seccion?.academicYearId]
    );

    const datos: Datos = {
        seccionId: seccion?.id,
        materiaId: materia?.id,
        alumnoId: alumno?.id,
        profesorId: profesor?.id,
        cicloId: seccion?.academicYearId,
        lapsoId: lapso?.id,
    };

    const borrar = (ruta: string) => async () => {
        await axios.delete(`${API_BASE}${ruta}`, { headers: cabeceras(token, false) }).catch(() => undefined);
    };

    const pantallas: Pantalla[] = [
        { nombre: 'Inicio (panel)', ruta: '/dashboard' },
        {
            nombre: 'Materias',
            ruta: '/dashboard/materias',
            guardado: {
                que: 'crear una materia',
                ejecutar: async (t) => {
                    const r = await axios.post(
                        `${API_BASE}/subjects`,
                        {
                            name: `Inventario ${Date.now()}`,
                            code: `INV${String(Date.now()).slice(-6)}`,
                            description: 'medición',
                        },
                        { headers: cabeceras(t) }
                    );
                    const id = r.data?.subject?.id ?? r.data?.data?.id ?? r.data?.id;
                    return { ok: r.status < 300, limpiar: id ? borrar(`/subjects/${id}`) : undefined };
                },
            },
        },
        { nombre: 'Académico (ciclos)', ruta: '/dashboard/academico' },
        { nombre: 'Actividades', ruta: '/dashboard/actividades' },
        { nombre: 'Aulas', ruta: '/dashboard/aulas' },
        { nombre: 'Estudiantes', ruta: '/dashboard/estudiantes' },
        { nombre: 'Usuarios', ruta: '/dashboard/usuarios' },
        { nombre: 'Horarios', ruta: '/dashboard/horarios' },
        { nombre: 'Calendario', ruta: '/dashboard/calendario' },
        {
            nombre: 'Eventos',
            ruta: '/dashboard/eventos',
            guardado: {
                que: 'crear un evento',
                ejecutar: async (t) => {
                    const hoy = (await axios.get(`${API_BASE}/time`, { headers: cabeceras(t, false) })).data;
                    const fecha = hoy?.date ?? hoy?.data?.date;
                    const r = await axios.post(
                        `${API_BASE}/events`,
                        {
                            // El evento exige hora y alcance: sin ellos responde 400 y
                            // parecería que guardar eventos está roto.
                            title: `Inventario ${Date.now()}`,
                            date: fecha,
                            type: 'OTRO',
                            startTime: '08:00',
                            endTime: '09:00',
                            scope: 'INSTITUTE',
                        },
                        { headers: cabeceras(t) }
                    );
                    const id = r.data?.event?.id ?? r.data?.data?.id ?? r.data?.id;
                    return { ok: r.status < 300, limpiar: id ? borrar(`/events/${id}`) : undefined };
                },
            },
        },
        { nombre: 'Configuración', ruta: '/dashboard/configuracion' },
    ];

    if (datos.seccionId) {
        pantallas.push(
            { nombre: 'Detalle de una sección', ruta: `/dashboard/aulas/${datos.seccionId}` },
            { nombre: 'Horario de una sección', ruta: `/dashboard/horarios/seccion/${datos.seccionId}` }
        );
    }
    if (alumno?.id) {
        pantallas.push({ nombre: 'Ficha de un alumno', ruta: `/dashboard/usuarios/${alumno.id}` });
    }
    if (datos.profesorId) {
        pantallas.push({ nombre: 'Horario de un profesor', ruta: `/dashboard/horarios/profesor/${datos.profesorId}` });
    }
    if (datos.cicloId && datos.seccionId && datos.materiaId) {
        pantallas.push({
            nombre: 'Plan de evaluación',
            ruta: `/dashboard/academico/${datos.cicloId}/${datos.seccionId}/${datos.materiaId}`,
            guardado: {
                que: 'guardar una fila del plan',
                ejecutar: async (t, d) => {
                    const r = await axios.post(
                        `${API_BASE}/evaluation-plan/rows/batch`,
                        {
                            classroomId: d.seccionId,
                            subjectId: d.materiaId,
                            // El lapso se nombra 'LAPSO_1', no '1'.
                            lapso: 'LAPSO_1',
                            // Los criterios EVALUATION tienen que sumar exactamente
                            // 20 puntos (escala oficial 01-20): con cualquier otra
                            // cosa el plan no guarda.
                            rows: [
                                {
                                    weekNumber: 1,
                                    rowType: 'EVALUATION',
                                    title: `Inventario ${Date.now()}`,
                                    actividadEval: 'Medición',
                                    puntos: 20.0,
                                    ponderacion: 100.0,
                                },
                            ],
                        },
                        { headers: cabeceras(t) }
                    );
                    return { ok: r.status < 300 };
                },
            },
        });
    }

    if (datos.seccionId && datos.materiaId) {
        pantallas.push({
            nombre: 'Clase en vivo',
            ruta: `/dashboard/clase-en-vivo/${datos.seccionId}/${datos.materiaId}`,
            guardado: {
                que: 'guardar la clase (asistencia)',
                ejecutar: async (t, d) => {
                    const hoy = (await axios.get(`${API_BASE}/time`, { headers: cabeceras(t, false) })).data;
                    const fecha = hoy?.date ?? hoy?.data?.date;
                    const r = await axios.post(
                        `${API_BASE}/sessions/live-save`,
                        {
                            classroomId: d.seccionId,
                            subjectId: d.materiaId,
                            date: fecha,
                            topic: `Inventario ${Date.now()}`,
                        },
                        { headers: cabeceras(t) }
                    );
                    return { ok: r.status < 300 };
                },
            },
        });
    }

    const contexto = await browser.newContext();
    const page = await contexto.newPage();
    await injectSessionCookies(page, sesion);

    // Una entrada en frío antes de empezar: la primera pantalla de la sesión
    // siempre paga el arranque y ensuciaría la primera medida.
    await abrir(page, '/dashboard');

    const medidas: Medida[] = [];

    for (const p of pantallas) {
        const primeraVez = await abrir(page, p.ruta);

        // Y ahora como lo hace un usuario: desde el inicio, por el menú.
        await abrir(page, '/dashboard');
        const alVolver = await irPorElMenu(page, p.ruta);

        let guardado: number | null = null;
        if (p.guardado) guardado = await medirGuardado(token, datos, p.guardado);

        medidas.push({
            nombre: p.nombre,
            ruta: p.ruta,
            primeraVez,
            alVolver,
            guardado,
            queGuarda: p.guardado?.que ?? null,
            nota: primeraVez === null ? 'no se pudo abrir' : undefined,
        });

        console.log(
            `  ${p.nombre.padEnd(28)} recarga ${String(primeraVez ?? '—').padStart(5)} ms` +
                ` · por el menú ${String(alVolver ?? '—').padStart(5)} ms` +
                (p.guardado ? ` · guardar ${String(guardado ?? 'falló').padStart(5)} ms` : '')
        );
    }

    await contexto.close();

    // ── El cuadro ────────────────────────────────────────────────────────────
    const n = (x: number | null) => (x === null ? '—' : `${x} ms`);
    const conDato = medidas.filter((m) => m.alVolver !== null);
    const media =
        conDato.length > 0
            ? Math.round(conDato.reduce((a, m) => a + (m.alVolver ?? 0), 0) / conDato.length)
            : 0;

    console.log('');
    console.log('  ╔══════════════════════════════════════════════════════════════════════════╗');
    console.log('  ║  INVENTARIO DE PANTALLAS                                                 ║');
    console.log('  ╚══════════════════════════════════════════════════════════════════════════╝');
    console.log('');
    console.log(`  ${'PANTALLA'.padEnd(28)} ${'RECARGA'.padStart(9)} ${'POR MENÚ'.padStart(9)} ${'GUARDAR'.padStart(9)}   QUÉ GUARDA`);
    console.log(`  ${'─'.repeat(28)} ${'─'.repeat(9)} ${'─'.repeat(9)} ${'─'.repeat(9)}   ${'─'.repeat(28)}`);
    for (const m of medidas) {
        console.log(
            `  ${m.nombre.padEnd(28)} ${n(m.primeraVez).padStart(9)} ${n(m.alVolver).padStart(9)}` +
                ` ${n(m.guardado).padStart(9)}   ${m.queGuarda ?? '(no guarda)'}`
        );
    }
    console.log('');
    console.log(`  MEDIA POR EL MENÚ: ${media} ms sobre ${conDato.length} pantallas del menú`);
    console.log('  (las pantallas de detalle no están en el menú: solo tienen cifra de recarga)');
    console.log('');
    console.log('  Nota: solo vale contra compilación de producción de la web.');
    console.log('  El guardado se mide contra la API, que es lo que la pantalla espera.');
    console.log('');
});
