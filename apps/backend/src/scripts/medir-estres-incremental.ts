/**
 * PRUEBA DE ESTRÉS INCREMENTAL
 *
 * La pregunta: si con 5 personas una pantalla tarda 20 ms y con 30 tarda 100,
 * ¿qué pasa con 100, con 300? Si el tiempo crece más rápido que la gente, el
 * sistema va a colapsar al crecer. Si se mantiene plano hasta cierto número y
 * ahí se dispara, ese número es el techo.
 *
 * Se sube la gente por escalones (5 → 10 → 20 → … → 500). Cada escalón dura lo
 * mismo y cada persona hace lo que haría de verdad, con su pausa entre clic y
 * clic:
 *
 *   · un ALUMNO mira su panel, su resumen y la hora;
 *   · un PROFESOR mira su panel, abre su clase en vivo y, a veces, GUARDA la
 *     asistencia (escritura de verdad, sobre una fecha lejana que se limpia al
 *     terminar);
 *   · un ADMIN mira su panel, la lista de usuarios y los alumnos de una sección.
 *
 * Cada persona entra con SU cuenta (como en un liceo real), así que el límite
 * de peticiones por sesión se reparte igual que en producción.
 *
 * El escalón se da por fallido —y la prueba se detiene ahí— si más del 1 % de
 * las peticiones fallan o si el p95 pasa de 1 segundo. Lo que se busca es
 * justamente ese punto.
 *
 * ─── LO QUE ESTA MEDIDA NO ES ────────────────────────────────────────────────
 *
 * El generador corre en la MISMA máquina que el servidor, PostgreSQL y Redis.
 * Llega un momento en que lo que se mide es el reparto del procesador entre
 * los cuatro, no el sistema. Por eso se vigila el retraso del propio generador:
 * si él se atasca, los tiempos salen inflados y el informe lo dice.
 *
 * ─── CON MUCHOS LICEOS A LA VEZ ─────────────────────────────────────────────
 *
 * Con `LICEOS`, la gente se reparte entre varios liceos (uno por persona, por
 * turnos). Es lo que ve el servidor de verdad: 200 bases, no una. Una entrada
 * que acaba en `*` es un prefijo (`muchos-*`, los de `seed-muchos-liceos.ts`).
 *
 * Uso:
 *   npm run medir:estres
 *   ESCALONES=5,10,20 SEGUNDOS=30 npm run medir:estres
 *   LICEOS='muchos-*' CLAVE='Test123!' TENANT_CONNECTION_LIMIT=1 npm run medir:estres
 */
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import { monitorEventLoopDelay } from 'perf_hooks';
import { Client } from 'pg';
import { platformPrisma } from '../config/database';
import { guardarMedicion } from './guardar-medicion';

const PUERTO = Number(process.env.PUERTO_MEDIDA || 3008);
/**
 * Contra un servidor que ya está en marcha en OTRA máquina (la prueba del
 * servidor: DESPLIEGUE.md §10-bis). Sin esto, el guion arranca su propio
 * proceso aquí mismo. La base de la plataforma (PLATFORM_DATABASE_URL) tiene
 * que ser la de ese servidor: de ahí salen los liceos y la gente.
 */
const API_REMOTA = process.env.API_REMOTA?.replace(/\/+$/, '');
const API = API_REMOTA ? `${API_REMOTA}/api` : `http://localhost:${PUERTO}/api`;
const SALUD = API_REMOTA ? `${API_REMOTA}/health` : `http://localhost:${PUERTO}/health`;
const SLUG = process.env.LICEO || 'instituto-testing';
/** Varios liceos: `a,b,c` o `prefijo-*`. Sin esto, solo `LICEO`. */
const LICEOS = (process.env.LICEOS || '').split(',').map((x) => x.trim()).filter(Boolean);
const CLAVE = process.env.CLAVE || '123456';
const ESCALONES = (process.env.ESCALONES || '5,10,20,30,50,75,100,150,200,300,500').split(',').map(Number);
const SEGUNDOS = Number(process.env.SEGUNDOS || 60);
/** Pausa entre acción y acción de cada persona, en ms: entre MIN y MAX. */
const PAUSA_MIN = Number(process.env.PAUSA_MIN || 1000);
const PAUSA_MAX = Number(process.env.PAUSA_MAX || 3000);
const P95_MAXIMO = Number(process.env.P95_MAXIMO || 1000);
const FALLOS_MAXIMOS = Number(process.env.FALLOS_MAXIMOS || 1); // %
/** Fecha donde escriben los profesores: lejos de los días de uso, y se limpia. */
const FECHA_DE_ESCRITURA = process.env.FECHA_DE_ESCRITURA || '2027-06-30';
/** Uno de cada N clics de un profesor es guardar la clase. */
const GUARDA_CADA = Number(process.env.GUARDA_CADA || 8);
/**
 * Segundos entre que entra la gente del escalón y que se empieza a medir.
 *
 * No es un adorno: cuando entran 200 personas de golpe, sus primeras pantallas
 * van todas a la base (no hay nada guardado todavía). Esa avalancha es real —es
 * el lunes a las siete— pero es OTRA cosa que la carga sostenida, y mezclarlas
 * hace creer que el sistema se dobla con la gente cuando lo que se está viendo
 * es el arranque en frío.
 */
const ASENTAR_S = Number(process.env.ASENTAR_S || 5);

const percentil = (xs: number[], p: number) => {
    if (xs.length === 0) return 0;
    const o = [...xs].sort((a, b) => a - b);
    return o[Math.min(o.length - 1, Math.floor((o.length * p) / 100))];
};
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));
const azar = (min: number, max: number) => min + Math.floor(Math.random() * (max - min + 1));

interface Llaves {
    accessToken: string;
    refreshToken: string;
}

interface Persona {
    email: string;
    id: string;
    rol: 'ADMIN' | 'TEACHER' | 'STUDENT';
    /** El liceo de esta persona, y una sección suya para la lista de alumnos. */
    slug: string;
    seccionId?: string;
    llaves?: Llaves;
    /** Profesor: una clase suya para abrir y guardar. */
    clase?: { classroomId: string; subjectId: string; alumnos: string[] };
}

interface Medida {
    ruta: string;
    ms: number;
    ok: boolean;
    estado: number;
}

/** Con TRAZA_GC=archivo, el servidor anota cada pausa del recolector de basura ahí. */
const TRAZA_GC = process.env.TRAZA_GC;

function arrancarElServidor(): ChildProcess {
    // Node directo, sin `npx` en medio: así el proceso que se mata es el que
    // escucha, y las opciones del motor (--trace-gc) llegan a quien toca.
    const hijo = spawn(
        process.execPath,
        [...(TRAZA_GC ? ['--trace-gc'] : []), '--import', 'tsx', path.join(__dirname, '..', 'index.ts')],
        {
            env: { ...process.env, PUERTO_DEL_HOST: String(PUERTO), NODE_ENV: 'production', LOG_LEVEL: 'error' },
            stdio: TRAZA_GC ? ['ignore', 'pipe', 'ignore'] : 'ignore',
        }
    );
    if (TRAZA_GC && hijo.stdout) {
        const destino = fs.createWriteStream(TRAZA_GC);
        hijo.stdout.on('data', (d) => {
            // Cada línea con la hora de este lado, para cruzarla con las peticiones lentas.
            for (const linea of String(d).split(/\r?\n/)) if (linea.trim()) destino.write(`${Date.now()} ${linea}\n`);
        });
    }
    return hijo;
}

async function esperarAlServidor(hastaCuando: number) {
    while (Date.now() < hastaCuando) {
        try {
            if ((await fetch(SALUD)).ok) return true;
        } catch {
            /* todavía no */
        }
        await esperar(400);
    }
    return false;
}

/**
 * EL PUERTO TIENE QUE ESTAR LIBRE, Y QUEDAR LIBRE
 *
 * Una vez el servidor de una corrida no murió al terminar (en Windows, matar a
 * `npx` no alcanza al proceso de Node que cuelga de él). Las corridas
 * siguientes arrancaron el suyo, no pudieron abrir el puerto —en silencio,
 * porque la salida va a ninguna parte— y **midieron al viejo**: sin los cambios
 * nuevos y con la memoria acumulada. Salieron números que no eran de nada.
 *
 * Ahora: si el puerto está ocupado al empezar, no se mide. Y al terminar se mata
 * lo que escuche en él, sea quien sea su padre.
 */
function quienEscuchaEn(puerto: number): Promise<number | null> {
    return new Promise((resolve) => {
        const cmd =
            process.platform === 'win32'
                ? `powershell -NoProfile -Command "(Get-NetTCPConnection -LocalPort ${puerto} -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1).OwningProcess"`
                : `lsof -ti:${puerto} -sTCP:LISTEN | head -1`;
        const p = spawn(cmd, { shell: true });
        let salida = '';
        p.stdout.on('data', (d) => (salida += String(d)));
        p.on('exit', () => resolve(Number(salida.trim()) || null));
        p.on('error', () => resolve(null));
    });
}

async function matarLoQueEscuchaEn(puerto: number) {
    for (let intento = 0; intento < 5; intento++) {
        const pid = await quienEscuchaEn(puerto);
        if (!pid) return;
        try {
            process.kill(pid, 'SIGKILL');
        } catch {
            /* ya no está */
        }
        await esperar(1000);
    }
}

async function memoriaDelServidor(): Promise<number> {
    return new Promise((resolve) => {
        const cmd =
            process.platform === 'win32'
                ? `powershell -NoProfile -Command "$p = (Get-NetTCPConnection -LocalPort ${PUERTO} -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1).OwningProcess; if ($p) { [math]::Round((Get-Process -Id $p).WorkingSet64 / 1MB) }"`
                : `ps -o rss= -p $(lsof -ti:${PUERTO} | head -1) | awk '{print int($1/1024)}'`;
        const p = spawn(cmd, { shell: true });
        let salida = '';
        p.stdout.on('data', (d) => (salida += String(d)));
        p.on('exit', () => resolve(Number(salida.trim()) || 0));
        p.on('error', () => resolve(0));
    });
}

async function entrar(email: string, slug: string): Promise<Llaves | null> {
    const hastaCuando = Date.now() + 120_000;
    for (;;) {
        try {
            const res = await fetch(`${API}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Institute-Slug': slug },
                body: JSON.stringify({ email, password: CLAVE }),
            });
            if (res.ok) return ((await res.json()) as { tokens: Llaves }).tokens;
            if (res.status !== 429 || Date.now() > hastaCuando) return null;
        } catch {
            if (Date.now() > hastaCuando) return null;
        }
        await esperar(3000);
    }
}

let renovacionesEnLaTanda = 0;

async function renovar(llaves: Llaves, slug: string): Promise<boolean> {
    renovacionesEnLaTanda++;
    try {
        const res = await fetch(`${API}/auth/refresh-token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Institute-Slug': slug },
            body: JSON.stringify({ refreshToken: llaves.refreshToken }),
        });
        if (!res.ok) return false;
        const cuerpo = (await res.json()) as { tokens?: Llaves } & Partial<Llaves>;
        const nuevas = cuerpo.tokens ?? (cuerpo as Llaves);
        if (!nuevas?.accessToken) return false;
        llaves.accessToken = nuevas.accessToken;
        if (nuevas.refreshToken) llaves.refreshToken = nuevas.refreshToken;
        return true;
    } catch {
        return false;
    }
}

/** Una petición como la haría la pantalla: si la credencial caducó, la renueva y repite. */
async function pedir(p: Persona, metodo: 'GET' | 'POST', ruta: string, cuerpo?: unknown): Promise<Medida> {
    const nombre = ruta.split('?')[0].replace(/\/[a-z0-9]{20,}/gi, '/:id');
    const t = performance.now();
    const hacer = () =>
        fetch(`${API}${ruta}`, {
            method: metodo,
            headers: {
                Authorization: `Bearer ${p.llaves!.accessToken}`,
                'X-Institute-Slug': p.slug,
                ...(cuerpo ? { 'Content-Type': 'application/json' } : {}),
            },
            body: cuerpo ? JSON.stringify(cuerpo) : undefined,
        });
    try {
        let res = await hacer();
        await res.arrayBuffer();
        if (res.status === 401 && (await renovar(p.llaves!, p.slug))) {
            res = await hacer();
            await res.arrayBuffer();
        }
        return { ruta: `${metodo} ${nombre}`, ms: performance.now() - t, ok: res.ok, estado: res.status };
    } catch {
        return { ruta: `${metodo} ${nombre}`, ms: performance.now() - t, ok: false, estado: 0 };
    }
}

async function unClic(p: Persona, contador: { n: number }): Promise<Medida> {
    contador.n++;
    if (p.rol === 'STUDENT') {
        const opciones = ['/dashboard/student', '/students/my-dashboard', '/time'];
        return pedir(p, 'GET', opciones[contador.n % opciones.length]);
    }
    if (p.rol === 'TEACHER') {
        const c = p.clase!;
        if (contador.n % GUARDA_CADA === 0) {
            return pedir(p, 'POST', '/sessions/live-save', {
                classroomId: c.classroomId,
                subjectId: c.subjectId,
                date: FECHA_DE_ESCRITURA,
                topic: `Medición ${contador.n}`,
                attendances: c.alumnos.map((studentId, i) => ({ studentId, status: (contador.n + i) % 7 === 0 ? 'ABSENT' : 'PRESENT' })),
            });
        }
        const opciones = [
            '/dashboard/teacher',
            `/sessions/live-detail?classroomId=${c.classroomId}&subjectId=${c.subjectId}&date=${FECHA_DE_ESCRITURA}`,
            `/schedules/teacher/${p.id}/blocks`,
        ];
        return pedir(p, 'GET', opciones[contador.n % opciones.length]);
    }
    const opciones = ['/dashboard/admin', '/users?page=1&limit=20', `/students?classroomId=${p.seccionId}&page=1&limit=30`];
    return pedir(p, 'GET', opciones[contador.n % opciones.length]);
}

interface Liceo {
    slug: string;
    base: string;
    conexion: { user: string; password: string; host: string; port: number };
}

async function losLiceos(): Promise<Liceo[]> {
    const pedidos = LICEOS.length ? LICEOS : [SLUG];
    const exactos = pedidos.filter((x) => !x.endsWith('*'));
    const prefijos = pedidos.filter((x) => x.endsWith('*')).map((x) => x.slice(0, -1));
    const filas = await platformPrisma.institute.findMany({
        where: {
            status: 'ACTIVE',
            databaseName: { not: null },
            OR: [{ slug: { in: exactos } }, ...prefijos.map((p) => ({ slug: { startsWith: p } }))],
        },
        select: { slug: true, databaseName: true, databaseHost: true, databasePort: true, databaseUser: true, databasePassword: true },
        orderBy: { slug: 'asc' },
    });
    return filas
        // La plantilla de `seed-muchos-liceos` no se usa: se copia de ella.
        .filter((f) => !f.slug.endsWith('-plantilla'))
        .map((f) => ({
            slug: f.slug,
            base: f.databaseName!,
            conexion: { user: f.databaseUser!, password: f.databasePassword!, host: f.databaseHost!, port: f.databasePort ?? 5432 },
        }));
}

/** La gente de UN liceo: cuentas reales, en la proporción de un liceo. */
async function laGenteDe(liceo: Liceo, cuantos: number): Promise<Persona[]> {
    const db = new Client({ ...liceo.conexion, database: liceo.base });
    await db.connect();

    const profesores = (
        await db.query<{ email: string; id: string; classroom_id: string; subject_id: string }>(
            `SELECT DISTINCT ON (u.id) u.email, u.id, cs."classroomId" AS classroom_id, cs."subjectId" AS subject_id
             FROM users u
             JOIN classroom_subjects cs ON cs."teacherId" = u.id
             JOIN classrooms cl ON cl.id = cs."classroomId"
             JOIN academic_years ay ON ay.id = cl."academicYearId" AND ay.status = 'ACTIVE'
             WHERE u."isActive" = true AND u.role = 'TEACHER'
             ORDER BY u.id, cs."classroomId"`
        )
    ).rows;
    const alumnosPorSeccion = new Map<string, string[]>();
    for (const f of (
        await db.query<{ classroom_id: string; student_id: string }>(
            `SELECT "classroomId" AS classroom_id, "studentId" AS student_id FROM student_classrooms WHERE "isActive" = true`
        )
    ).rows) {
        if (!alumnosPorSeccion.has(f.classroom_id)) alumnosPorSeccion.set(f.classroom_id, []);
        alumnosPorSeccion.get(f.classroom_id)!.push(f.student_id);
    }
    const alumnos = (
        await db.query<{ email: string; id: string }>(
            `SELECT email, id FROM users WHERE "isActive" = true AND role = 'STUDENT' AND email IS NOT NULL ORDER BY id LIMIT $1`,
            [cuantos]
        )
    ).rows;
    const admins = (
        await db.query<{ email: string; id: string }>(`SELECT email, id FROM users WHERE "isActive" = true AND role = 'ADMIN' ORDER BY id`)
    ).rows;
    const seccionId = profesores[0]?.classroom_id;
    await db.end();

    // Proporción de un liceo: ~1 profesor por cada 8 alumnos y un par de admins.
    const personas: Persona[] = [];
    let ia = 0, ip = 0, iad = 0;
    for (let i = 0; i < cuantos; i++) {
        if (i % 40 === 3 && admins.length) {
            const a = admins[iad++ % admins.length];
            personas.push({ email: a.email, id: a.id, rol: 'ADMIN', slug: liceo.slug, seccionId });
        } else if (i % 9 === 1 && ip < profesores.length) {
            const pr = profesores[ip++];
            personas.push({
                email: pr.email, id: pr.id, rol: 'TEACHER', slug: liceo.slug,
                clase: { classroomId: pr.classroom_id, subjectId: pr.subject_id, alumnos: (alumnosPorSeccion.get(pr.classroom_id) ?? []).slice(0, 35) },
            });
        } else if (ia < alumnos.length) {
            const al = alumnos[ia++];
            personas.push({ email: al.email, id: al.id, rol: 'STUDENT', slug: liceo.slug });
        }
    }
    return personas;
}

async function main() {
    const liceos = await losLiceos();
    if (liceos.length === 0) {
        console.error(`  No hay liceos que medir (${LICEOS.length ? LICEOS.join(',') : SLUG}).`);
        process.exit(1);
    }

    // ── La gente, repartida entre los liceos por turnos ────────────────────────
    const maximo = Math.max(...ESCALONES);
    const porLiceo = Math.ceil(maximo / liceos.length);
    const grupos = await Promise.all(liceos.map((l) => laGenteDe(l, porLiceo)));
    const personas: Persona[] = [];
    for (let i = 0; personas.length < maximo && i < porLiceo; i++) {
        for (const g of grupos) if (g[i] && personas.length < maximo) personas.push(g[i]);
    }
    const disponibles = personas.length;
    const escalones = ESCALONES.filter((n) => n <= disponibles);
    if (escalones.length < ESCALONES.length) {
        console.log(`  Aviso: el liceo tiene ${disponibles} cuentas usables; se mide hasta ${escalones[escalones.length - 1]}.`);
    }

    if (!API_REMOTA && (await quienEscuchaEn(PUERTO))) {
        console.error(`  El puerto ${PUERTO} ya está ocupado por otro proceso: se mediría a ese y no a este código. Ciérralo o usa PUERTO_MEDIDA.`);
        process.exit(1);
    }
    const servidor = API_REMOTA ? null : arrancarElServidor();
    const retraso = monitorEventLoopDelay({ resolution: 10 });
    retraso.enable();
    const resultados: any[] = [];

    try {
        if (!(await esperarAlServidor(Date.now() + 120_000))) {
            console.error('  El servidor no levantó.');
            process.exit(1);
        }

        console.log(`\n  Estrés incremental · ${liceos.length} liceo(s) · ${SEGUNDOS} s por escalón · pausa ${PAUSA_MIN}–${PAUSA_MAX} ms entre clics`);
        console.log(`  Se detiene si fallan >${FALLOS_MAXIMOS} % o el p95 pasa de ${P95_MAXIMO} ms\n`);
        console.log(
            '    gente' + 'pet/s'.padStart(8) + 'p50'.padStart(8) + 'p95'.padStart(8) + 'p99'.padStart(8) +
            'peor'.padStart(8) + 'fallos'.padStart(9) + 'memoria'.padStart(9) + 'conex.'.padStart(8) + 'gen.'.padStart(8)
        );
        console.log('    ' + '─'.repeat(80));

        let dentro: Persona[] = [];
        let parar = false;
        let medidas: Medida[] = [];
        const trabajando: Promise<void>[] = [];

        const trabajar = async (p: Persona) => {
            const contador = { n: azar(0, 10) };
            await esperar(azar(0, PAUSA_MAX)); // que no arranquen todos en el mismo milisegundo
            while (!parar) {
                medidas.push(await unClic(p, contador));
                await esperar(azar(PAUSA_MIN, PAUSA_MAX));
            }
        };

        for (const n of escalones) {
            // Entran los que faltan (fuera de la medida: entrar no es usar).
            const nuevos = personas.slice(dentro.length, n);
            for (let i = 0; i < nuevos.length; i += 8) {
                await Promise.all(
                    nuevos.slice(i, i + 8).map(async (p) => {
                        p.llaves = (await entrar(p.email, p.slug)) ?? undefined;
                    })
                );
            }
            const conLlave = nuevos.filter((p) => p.llaves);
            if (conLlave.length < nuevos.length) console.log(`    (no pudieron entrar ${nuevos.length - conLlave.length})`);
            dentro = dentro.concat(nuevos);
            for (const p of conLlave) trabajando.push(trabajar(p));

            // Que el escalón se asiente, y a medir.
            await esperar(ASENTAR_S * 1000);
            medidas = [];
            renovacionesEnLaTanda = 0;
            retraso.reset();
            const t0 = performance.now();
            await esperar(SEGUNDOS * 1000);
            const duracion = (performance.now() - t0) / 1000;
            const tanda = medidas;
            medidas = [];

            const buenos = tanda.filter((m) => m.ok).map((m) => m.ms);
            const fallos = tanda.filter((m) => !m.ok);
            const porcFallos = tanda.length ? (fallos.length / tanda.length) * 100 : 0;
            const [memoria, conexiones] = await Promise.all([API_REMOTA ? 0 : memoriaDelServidor(), contarConexiones(liceos)]);
            const genP99 = Math.round(retraso.percentile(99) / 1e6);

            const porRuta: Record<string, number[]> = {};
            for (const m of tanda) (porRuta[m.ruta] ??= []).push(m.ms);
            const estados: Record<string, number> = {};
            for (const f of fallos) estados[String(f.estado)] = (estados[String(f.estado)] ?? 0) + 1;

            const fila = {
                gente: conLlave.length + (resultados.at(-1)?.gente ?? 0),
                peticiones: tanda.length,
                porSegundo: Math.round(tanda.length / duracion),
                p50: Math.round(percentil(buenos, 50)),
                p95: Math.round(percentil(buenos, 95)),
                p99: Math.round(percentil(buenos, 99)),
                peor: Math.round(Math.max(0, ...buenos)),
                fallos: fallos.length,
                porcentajeDeFallos: Number(porcFallos.toFixed(2)),
                estadosDeFallo: estados,
                memoriaMB: memoria,
                conexionesBase: conexiones,
                retrasoDelGeneradorP99ms: genP99,
                p99PorRuta: Object.fromEntries(
                    Object.entries(porRuta)
                        .map(([r, xs]) => [r, Math.round(percentil(xs, 99))] as const)
                        .sort((a, b) => b[1] - a[1])
                ),
                lentasDeMasDeUnSegundo: tanda.filter((m) => m.ms > 1000).length,
                renovaciones: renovacionesEnLaTanda,
                p95PorRuta: Object.fromEntries(
                    Object.entries(porRuta)
                        .map(([r, xs]) => [r, Math.round(percentil(xs, 95))] as const)
                        .sort((a, b) => b[1] - a[1])
                ),
            };
            resultados.push(fila);

            console.log(
                '    ' + String(fila.gente).padStart(5) + String(fila.porSegundo).padStart(8) +
                `${fila.p50}ms`.padStart(8) + `${fila.p95}ms`.padStart(8) + `${fila.p99}ms`.padStart(8) +
                `${fila.peor}ms`.padStart(8) + `${fila.porcentajeDeFallos}%`.padStart(9) +
                `${memoria}MB`.padStart(9) + String(conexiones).padStart(8) + `${genP99}ms`.padStart(8)
            );

            if (porcFallos > FALLOS_MAXIMOS || fila.p95 > P95_MAXIMO) {
                console.log(`\n    ✗ Escalón de ${fila.gente} personas fuera de lo aceptable. Se detiene aquí.`);
                break;
            }
        }

        parar = true;
        await Promise.race([Promise.all(trabajando), esperar(15_000)]);
    } finally {
        retraso.disable();
        if (servidor) {
            servidor.kill();
            await matarLoQueEscuchaEn(PUERTO);
        }
        for (const l of liceos) await limpiar(l.conexion, l.base);
    }

    // ── Lectura ──────────────────────────────────────────────────────────────
    const lectura = leer(resultados);
    console.log('\n  ' + lectura.join('\n  ') + '\n');

    guardarMedicion(liceos.length > 1 ? `estres-${liceos.length}-liceos` : 'estres-incremental', {
        liceo: liceos.length === 1 ? liceos[0].slug : undefined,
        liceos: liceos.length,
        slugs: liceos.map((l) => l.slug),
        parametros: {
            ESCALONES, SEGUNDOS, ASENTAR_S, PAUSA_MIN, PAUSA_MAX, P95_MAXIMO, FALLOS_MAXIMOS, GUARDA_CADA,
            TENANT_CONNECTION_LIMIT: process.env.TENANT_CONNECTION_LIMIT ?? null,
            redis: process.env.REDIS_URL || process.env.REDIS_PORT ? 'sí' : 'el de .env',
        },
        resultados,
        lectura,
    });
    process.exit(0);
}

/** Conexiones abiertas en las bases de los liceos que se miden, sumadas. */
async function contarConexiones(liceos: Liceo[]): Promise<number> {
    const c = new Client({ ...liceos[0].conexion, database: 'postgres' });
    try {
        await c.connect();
        const r = await c.query<{ n: string }>('SELECT count(*) AS n FROM pg_stat_activity WHERE datname = ANY($1)', [liceos.map((l) => l.base)]);
        return Number(r.rows[0].n);
    } catch {
        return 0;
    } finally {
        await c.end().catch(() => undefined);
    }
}

/** Lo que escribieron los profesores en la fecha de medición no se queda. */
async function limpiar(conexion: any, base: string) {
    const c = new Client({ ...conexion, database: base });
    try {
        await c.connect();
        await c.query(`DELETE FROM class_sessions WHERE date = $1`, [FECHA_DE_ESCRITURA]);
        await c.query(`DELETE FROM daily_attendance WHERE date = $1`, [FECHA_DE_ESCRITURA]).catch(() => undefined);
    } catch (e) {
        console.log(`  Aviso: no se pudo limpiar lo escrito el ${FECHA_DE_ESCRITURA}: ${(e as Error).message}`);
    } finally {
        await c.end().catch(() => undefined);
    }
}

/**
 * Cómo leer la tabla, en frases.
 *
 * Escalar bien = al doblar la gente, las peticiones por segundo casi se doblan
 * y el p95 apenas se mueve. Colapsar = el p95 crece más rápido que la gente, o
 * las peticiones por segundo dejan de subir (el sistema ya no da más).
 */
function leer(r: any[]): string[] {
    if (r.length === 0) return ['No hay escalones medidos.'];
    const frases: string[] = [];
    const base = r[0];
    let rodilla: any = null;

    for (let i = 1; i < r.length; i++) {
        const a = r[i - 1];
        const b = r[i];
        const crecioGente = b.gente / a.gente;
        const crecioP95 = b.p95 / Math.max(1, a.p95);
        const crecioTrabajo = b.porSegundo / Math.max(1, a.porSegundo);
        const degrada = b.p95 > 50 && crecioP95 > Math.max(1.5, crecioGente * 0.9);
        const satura = crecioTrabajo < 1 + (crecioGente - 1) * 0.5;
        if (!rodilla && (degrada || satura)) rodilla = { ...b, degrada, satura, antes: a };
    }

    const ultimo = r[r.length - 1];
    frases.push(
        `De ${base.gente} a ${ultimo.gente} personas: p95 de ${base.p95} ms a ${ultimo.p95} ms; ` +
            `trabajo de ${base.porSegundo} a ${ultimo.porSegundo} peticiones/s; fallos al final ${ultimo.porcentajeDeFallos} %.`
    );

    // El p95 dice cómo le va a casi todos; el p99 y el peor, a quien le toca
    // la mala suerte. Un sistema puede tener p95 plano y ya estar haciendo
    // esperar segundos a uno de cada cien: eso también es empezar a doblarse.
    const cola = r.find((x) => x.p99 > 500 || x.lentasDeMasDeUnSegundo > x.peticiones * 0.005);
    if (cola) {
        frases.push(
            `Con ${cola.gente} personas la cola se alarga: p99 ${cola.p99} ms, peor ${cola.peor} ms, ` +
                `${cola.lentasDeMasDeUnSegundo} peticiones de más de 1 s. El p95 sigue en ${cola.p95} ms: a casi todos les va bien, a unos pocos no.`
        );
    }

    if (!rodilla && !cola) {
        frases.push('Escala bien en todo el rango medido: el trabajo crece con la gente y el p95 y el p99 se mantienen. No se encontró el techo.');
    } else if (!rodilla) {
        frases.push('El trabajo sigue creciendo con la gente (no hay techo de capacidad), pero la cola de tiempos marca dónde empieza a costar.');
    } else {
        const motivo = [
            rodilla.degrada ? `el p95 pasó de ${rodilla.antes.p95} a ${rodilla.p95} ms` : '',
            rodilla.satura ? `las peticiones/s casi no subieron (${rodilla.antes.porSegundo} → ${rodilla.porSegundo})` : '',
        ].filter(Boolean).join(' y ');
        frases.push(`El sistema empieza a doblarse entre ${rodilla.antes.gente} y ${rodilla.gente} personas: ${motivo}.`);
    }

    // En Windows el temporizador ya marca ~25 ms en reposo: se avisa a partir de 75.
    const ahogado = r.find((x) => x.retrasoDelGeneradorP99ms > 75);
    if (ahogado) {
        frases.push(
            `Ojo: desde ${ahogado.gente} personas el propio generador se retrasa (${ahogado.retrasoDelGeneradorP99ms} ms). ` +
                'A partir de ahí los tiempos están inflados por la máquina, no por el sistema: hace falta medir desde otro equipo.'
        );
    }
    return frases;
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
