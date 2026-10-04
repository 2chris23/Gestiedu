/**
 * VUELVE LA LUZ, Y LAS 7:00 (robustez, 2026-10-04)
 *
 * Dos avalanchas que `medir:estres` no tiene, porque allí la gente entra poco a
 * poco y cada uno a su ritmo:
 *
 *   1. VUELVE LA LUZ. Todo el liceo estaba sin conexión; vuelve, y cada
 *      teléfono a la vez: pregunta si el servidor contesta, renueva su
 *      sesión, sube lo pendiente (el profesor, la clase que pasó sin señal) y
 *      vuelve a pedir lo de su pantalla. Se mide dos veces:
 *        · «todos en el mismo instante» (cómo era antes);
 *        · «con azar», cada uno entre 0 y 4 s (cómo es ahora: `lib/azar.ts`).
 *   2. LAS 7:00. Todos los profesores pasan lista en el mismo minuto.
 *
 * Para cada una: p50/p95/p99, fallos (y cuántos 503 del freno de admisión,
 * que no son fallos sino «ahora no»), y cuánto tardó en quedar todo hecho.
 *
 * ─── LO QUE ESTA MEDIDA NO ES ────────────────────────────────────────────────
 *
 * El generador y el servidor están en la misma máquina (salvo con API_REMOTA):
 * con muchos teléfonos a la vez se mide también el reparto del procesador.
 * Los teléfonos de verdad están detrás de redes lentas, que reparten un poco
 * la llegada; aquí llegan todos por la misma red local: es el peor caso.
 *
 * Uso:
 *   npm run medir:vuelve-la-luz
 *   GENTE=300 AZAR_MS=4000 npm run medir:vuelve-la-luz
 *   API_REMOTA=https://api.ejemplo.com GENTE=500 npm run medir:vuelve-la-luz
 */
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import { Client } from 'pg';
import { platformPrisma } from '../config/database';
import { guardarMedicion } from './guardar-medicion';
import { unDiaLibre } from './dia-libre-para-medir';

const PUERTO = Number(process.env.PUERTO_MEDIDA || 3009);
const API_REMOTA = process.env.API_REMOTA?.replace(/\/+$/, '');
const API = API_REMOTA ? `${API_REMOTA}/api` : `http://localhost:${PUERTO}/api`;
const SALUD = API_REMOTA ? `${API_REMOTA}/health` : `http://localhost:${PUERTO}/health`;
const SLUG = process.env.LICEO || 'instituto-testing';
const CLAVE = process.env.CLAVE || '123456';
const GENTE = Number(process.env.GENTE || 200);
/** Hasta cuánto se reparte la llegada «con azar» (lo que hace la app ahora). */
const AZAR_MS = Number(process.env.AZAR_MS || 4000);
/** El minuto de las 7:00: en cuántos ms se reparten los profesores. */
const MINUTO_MS = Number(process.env.MINUTO_MS || 60_000);
/**
 * Dónde escriben los profesores. El servidor no deja guardar una clase de una
 * fecha FUTURA (FUTURE_DATE), así que se busca un domingo PASADO del año en
 * curso sin nada guardado ese día, y se limpia al terminar. Si ese día ya
 * tiene algo, no se mide: lo de verdad no se toca.
 */
let FECHA_DE_ESCRITURA = process.env.FECHA_DE_ESCRITURA || '';

/**
 * Desde dónde llaman los teléfonos (cabecera X-Forwarded-For, que el servidor
 * acepta de la propia máquina como si viniera de nginx):
 *   una  → todos por el wifi del liceo, UNA dirección pública (el caso real
 *          dentro del plantel: los cupos por dirección muerden aquí);
 *   cada → cada teléfono con sus datos móviles, una dirección cada uno.
 */
const IPS = process.env.IPS === 'cada' ? 'cada' : 'una';
const IP_DEL_LICEO = '10.200.0.1';

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));
const percentil = (xs: number[], p: number) => {
    if (xs.length === 0) return 0;
    const o = [...xs].sort((a, b) => a - b);
    return o[Math.min(o.length - 1, Math.floor((o.length * p) / 100))];
};

interface Llaves {
    accessToken: string;
    refreshToken: string;
}
interface Persona {
    email: string;
    id: string;
    rol: 'TEACHER' | 'STUDENT';
    llaves?: Llaves;
    clase?: { classroomId: string; subjectId: string; alumnos: string[] };
    /** Su dirección con datos móviles (para entrar y con IPS=cada). */
    ip: string;
}
const desde = (p: Persona) => ({ 'X-Forwarded-For': IPS === 'cada' ? p.ip : IP_DEL_LICEO });
interface Medida {
    ruta: string;
    ms: number;
    estado: number;
    /** Lo que dijo el servidor al decir que no (para saber por qué). */
    motivo?: string;
}

function arrancarElServidor(): ChildProcess {
    return spawn(process.execPath, ['--import', 'tsx', path.join(__dirname, '..', 'index.ts')], {
        env: { ...process.env, PUERTO_DEL_HOST: String(PUERTO), NODE_ENV: 'production', LOG_LEVEL: 'error' },
        // VER_EL_SERVIDOR=1: sus errores a esta consola (para saber qué fue un 500).
        stdio: process.env.VER_EL_SERVIDOR ? ['ignore', 'inherit', 'inherit'] : 'ignore',
    });
}

async function esperarAlServidor(hasta: number) {
    while (Date.now() < hasta) {
        try {
            if ((await fetch(SALUD)).ok) return true;
        } catch {
            /* todavía no */
        }
        await esperar(400);
    }
    return false;
}

async function entrar(email: string, ip: string): Promise<Llaves | null> {
    const hasta = Date.now() + 120_000;
    for (;;) {
        try {
            const res = await fetch(`${API}/auth/login`, {
                method: 'POST',
                // Entrar es la preparación, no la medida: cada uno desde la suya.
                headers: { 'Content-Type': 'application/json', 'X-Institute-Slug': SLUG, 'X-Forwarded-For': ip },
                body: JSON.stringify({ email, password: CLAVE }),
            });
            if (res.ok) return ((await res.json()) as { tokens: Llaves }).tokens;
            if (res.status !== 429 || Date.now() > hasta) return null;
        } catch {
            if (Date.now() > hasta) return null;
        }
        await esperar(3000);
    }
}

async function pedir(p: Persona, metodo: 'GET' | 'POST', ruta: string, cuerpo?: unknown, sinLlave = false): Promise<Medida> {
    const t = performance.now();
    try {
        const res = await fetch(ruta.startsWith('http') ? ruta : `${API}${ruta}`, {
            method: metodo,
            headers: {
                ...(sinLlave ? {} : { Authorization: `Bearer ${p.llaves!.accessToken}` }),
                'X-Institute-Slug': SLUG,
                ...desde(p),
                ...(cuerpo ? { 'Content-Type': 'application/json' } : {}),
            },
            body: cuerpo ? JSON.stringify(cuerpo) : undefined,
        });
        const texto = res.status >= 400 ? (await res.text()).slice(0, 160) : (await res.arrayBuffer(), undefined);
        return { motivo: texto, ruta: `${metodo} ${ruta.split('?')[0].replace(/\/[a-z0-9]{20,}/gi, '/:id').replace(/^https?:\/\/[^/]+/, '')}`, ms: performance.now() - t, estado: res.status };
    } catch {
        return { ruta: `${metodo} ${ruta}`, ms: performance.now() - t, estado: 0 };
    }
}

async function renovar(p: Persona): Promise<Medida> {
    const t = performance.now();
    try {
        const res = await fetch(`${API}/auth/refresh-token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Institute-Slug': SLUG, ...desde(p) },
            body: JSON.stringify({ refreshToken: p.llaves!.refreshToken }),
        });
        const cuerpo = (await res.json().catch(() => ({}))) as { tokens?: Llaves } & Partial<Llaves>;
        const nuevas = cuerpo.tokens ?? (cuerpo as Llaves);
        if (res.ok && nuevas?.accessToken) {
            p.llaves!.accessToken = nuevas.accessToken;
            if (nuevas.refreshToken) p.llaves!.refreshToken = nuevas.refreshToken;
        }
        return { ruta: 'POST /auth/refresh-token', ms: performance.now() - t, estado: res.status, motivo: res.ok ? undefined : JSON.stringify(cuerpo).slice(0, 160) };
    } catch {
        return { ruta: 'POST /auth/refresh-token', ms: performance.now() - t, estado: 0 };
    }
}

const pasarLista = (p: Persona, n: number) =>
    pedir(p, 'POST', '/sessions/live-save', {
        classroomId: p.clase!.classroomId,
        subjectId: p.clase!.subjectId,
        date: FECHA_DE_ESCRITURA,
        topic: `Vuelve la luz ${n}`,
        attendances: p.clase!.alumnos.map((studentId, i) => ({ studentId, status: (n + i) % 7 === 0 ? 'ABSENT' : 'PRESENT' })),
    });

/** Lo que hace un teléfono cuando vuelve la conexión, en el orden de la app. */
async function alVolver(p: Persona, n: number): Promise<Medida[]> {
    const m: Medida[] = [];
    m.push(await pedir(p, 'GET', SALUD, undefined, true));
    m.push(await renovar(p));
    if (p.rol === 'TEACHER') {
        m.push(await pasarLista(p, n));
        m.push(await pedir(p, 'GET', '/dashboard/teacher'));
    } else {
        m.push(await pedir(p, 'GET', '/dashboard/student'));
        m.push(await pedir(p, 'GET', '/students/my-dashboard'));
    }
    return m;
}

function resumen(nombre: string, medidas: Medida[], totalMs: number) {
    const buenas = medidas.filter((m) => m.estado >= 200 && m.estado < 400).map((m) => m.ms);
    const frenadas = medidas.filter((m) => m.estado === 503 || m.estado === 429).length;
    const fallos = medidas.filter((m) => m.estado === 0 || (m.estado >= 400 && m.estado !== 503 && m.estado !== 429));
    const estados: Record<string, number> = {};
    for (const f of fallos) estados[String(f.estado)] = (estados[String(f.estado)] ?? 0) + 1;
    // Por ruta y código: «frenado» puede ser el freno de admisión (503) o el
    // cupo por dirección (429), y no significan lo mismo.
    const porRuta: Record<string, { n: number; motivo?: string }> = {};
    for (const m of medidas.filter((x) => x.estado === 0 || x.estado >= 400)) {
        const k = `${m.ruta} → ${m.estado}`;
        porRuta[k] = { n: (porRuta[k]?.n ?? 0) + 1, motivo: porRuta[k]?.motivo ?? m.motivo };
    }
    return {
        noPorRuta: porRuta,
        patron: nombre,
        peticiones: medidas.length,
        p50: Math.round(percentil(buenas, 50)),
        p95: Math.round(percentil(buenas, 95)),
        p99: Math.round(percentil(buenas, 99)),
        peor: Math.round(Math.max(0, ...buenas)),
        frenadasPorElServidor: frenadas,
        fallos: fallos.length,
        estadosDeFallo: estados,
        todoHechoEnMs: Math.round(totalMs),
    };
}

async function laGente(): Promise<{ personas: Persona[]; conexion: any; base: string; esquema: string | null }> {
    const fila = await platformPrisma.institute.findFirst({
        where: { slug: SLUG },
        select: { databaseName: true, databaseSchema: true, databaseHost: true, databasePort: true, databaseUser: true, databasePassword: true },
    });
    if (!fila?.databaseName) throw new Error(`El liceo ${SLUG} no tiene base.`);
    const conexion = { user: fila.databaseUser!, password: fila.databasePassword!, host: fila.databaseHost!, port: fila.databasePort ?? 5432 };
    const esquema = fila.databaseSchema && fila.databaseSchema !== 'public' ? fila.databaseSchema : null;
    const db = new Client({ ...conexion, database: fila.databaseName });
    await db.connect();
    // Con la base compartida, cada liceo es un esquema: sin esto se leería otro.
    if (esquema) await db.query(`SET search_path TO "${esquema.replace(/"/g, '')}"`);
    const profesores = (
        await db.query(
            `SELECT DISTINCT ON (u.id) u.email, u.id, cs."classroomId" AS classroom_id, cs."subjectId" AS subject_id
               FROM users u JOIN classroom_subjects cs ON cs."teacherId" = u.id
               JOIN classrooms cl ON cl.id = cs."classroomId"
               JOIN academic_years ay ON ay.id = cl."academicYearId" AND ay.status = 'ACTIVE'
              WHERE u."isActive" = true AND u.role = 'TEACHER' ORDER BY u.id, cs."classroomId"`
        )
    ).rows;
    const porSeccion = new Map<string, string[]>();
    for (const f of (await db.query(`SELECT "classroomId" AS c, "studentId" AS s FROM student_classrooms WHERE "isActive" = true`)).rows) {
        if (!porSeccion.has(f.c)) porSeccion.set(f.c, []);
        porSeccion.get(f.c)!.push(f.s);
    }
    const alumnos = (await db.query(`SELECT email, id FROM users WHERE "isActive" = true AND role = 'STUDENT' AND email IS NOT NULL ORDER BY id LIMIT $1`, [GENTE])).rows;
    FECHA_DE_ESCRITURA = await unDiaLibre(db, FECHA_DE_ESCRITURA);
    await db.end();

    const personas: Persona[] = [];
    let ip = 0;
    let ia = 0;
    for (let i = 0; personas.length < GENTE && (ip < profesores.length || ia < alumnos.length); i++) {
        if (i % 9 === 1 && ip < profesores.length) {
            const pr = profesores[ip++];
            personas.push({ ip: `10.1.${personas.length >> 8}.${(personas.length % 250) + 1}`, email: pr.email, id: pr.id, rol: 'TEACHER', clase: { classroomId: pr.classroom_id, subjectId: pr.subject_id, alumnos: (porSeccion.get(pr.classroom_id) ?? []).slice(0, 35) } });
        } else if (ia < alumnos.length) {
            const al = alumnos[ia++];
            personas.push({ ip: `10.1.${personas.length >> 8}.${(personas.length % 250) + 1}`, email: al.email, id: al.id, rol: 'STUDENT' });
        }
    }
    return { personas, conexion, base: fila.databaseName, esquema };
}

async function main() {
    const { personas, conexion, base, esquema } = await laGente();
    const servidor = API_REMOTA ? null : arrancarElServidor();
    const resultados: any[] = [];
    try {
        if (!(await esperarAlServidor(Date.now() + 120_000))) throw new Error('El servidor no levantó.');
        console.log(`\n  Vuelve la luz · ${SLUG} · ${personas.length} teléfonos (${personas.filter((p) => p.rol === 'TEACHER').length} profesores) · ${IPS === 'una' ? 'todos por el wifi del liceo (una dirección)' : 'cada uno con sus datos'}`);
        for (let i = 0; i < personas.length; i += 8) {
            await Promise.all(personas.slice(i, i + 8).map(async (p) => (p.llaves = (await entrar(p.email, p.ip)) ?? undefined)));
        }
        const dentro = personas.filter((p) => p.llaves);
        console.log(`  Con sesión: ${dentro.length}\n`);

        const ronda = async (nombre: string, retraso: () => number) => {
            const t0 = performance.now();
            const todas = (await Promise.all(dentro.map(async (p, n) => {
                await esperar(retraso());
                return alVolver(p, n);
            }))).flat();
            const r = resumen(nombre, todas, performance.now() - t0);
            resultados.push(r);
            console.log(`  ${nombre.padEnd(28)} p50 ${String(r.p50).padStart(5)} ms · p95 ${String(r.p95).padStart(5)} ms · p99 ${String(r.p99).padStart(5)} ms · frenadas ${r.frenadasPorElServidor} · fallos ${r.fallos} · todo en ${(r.todoHechoEnMs / 1000).toFixed(1)} s`);
            await esperar(20_000);
        };

        await ronda('Todos en el mismo instante', () => 0);
        await ronda(`Con azar (0–${AZAR_MS / 1000} s)`, () => Math.random() * AZAR_MS);

        const profes = dentro.filter((p) => p.rol === 'TEACHER');
        const t0 = performance.now();
        const lista = await Promise.all(profes.map(async (p, n) => {
            await esperar(Math.random() * MINUTO_MS);
            return pasarLista(p, 1000 + n);
        }));
        const siete = resumen(`Las 7:00 (${profes.length} profesores en ${MINUTO_MS / 1000} s)`, lista, performance.now() - t0);
        resultados.push(siete);
        console.log(`  ${siete.patron.padEnd(28)} p50 ${siete.p50} ms · p95 ${siete.p95} ms · p99 ${siete.p99} ms · frenadas ${siete.frenadasPorElServidor} · fallos ${siete.fallos}`);
    } finally {
        servidor?.kill();
        const c = new Client({ ...conexion, database: base });
        try {
            await c.connect();
            if (esquema) await c.query(`SET search_path TO "${esquema.replace(/"/g, '')}"`);
            await c.query(`DELETE FROM daily_attendance WHERE date = $1`, [FECHA_DE_ESCRITURA]).catch(() => undefined);
            await c.query(`DELETE FROM class_sessions WHERE date = $1`, [FECHA_DE_ESCRITURA]);
        } catch (e) {
            console.log(`  Aviso: no se pudo limpiar lo escrito el ${FECHA_DE_ESCRITURA}: ${(e as Error).message}`);
        } finally {
            await c.end().catch(() => undefined);
        }
    }
    const [junto, conAzar] = resultados;
    const lectura = [
        `Todos a la vez: p95 ${junto.p95} ms, ${junto.frenadasPorElServidor} frenadas y ${junto.fallos} fallos; con azar: p95 ${conAzar.p95} ms, ${conAzar.frenadasPorElServidor} frenadas y ${conAzar.fallos} fallos.`,
        conAzar.p95 < junto.p95 ? `El azar baja el p95 ${Math.round((1 - conAzar.p95 / Math.max(1, junto.p95)) * 100)} % a cambio de tardar hasta ${AZAR_MS / 1000} s más en empezar.` : 'Con esta gente el azar no cambia el p95: el servidor aguanta la avalancha entera.',
    ];
    console.log('\n  ' + lectura.join('\n  ') + '\n');
    guardarMedicion(`vuelve-la-luz-${IPS}`, { liceo: SLUG, parametros: { GENTE, AZAR_MS, MINUTO_MS, IPS }, resultados, lectura });
    process.exit(0);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
