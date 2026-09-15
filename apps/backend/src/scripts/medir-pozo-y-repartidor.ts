/**
 * LO QUE CUESTA EL POZO DE CONEXIONES, Y LO QUE LO ARREGLA
 *
 * En `tenant-db-url.ts` está explicado por qué el tope de conexiones por liceo
 * es **2**: hasta 50 liceos guardados a la vez × 2 = 100, que es justo el máximo
 * por defecto de PostgreSQL. La cuenta sale, pero se paga: con muchas personas a
 * la vez, dos conexiones para todo un liceo hacen cola.
 *
 * Ahí quedaba escrito que la salida es PgBouncer, «que el código ya está
 * preparado y falta levantarlo». Este guion levanta las tres situaciones de
 * verdad, con el servidor entero arrancando en cada una, y mide la pantalla que
 * más pesa con mucha gente a la vez:
 *
 *   A. pozo 2, sin repartidor  →  lo que hay hoy por defecto
 *   B. pozo 25, sin repartidor →  rápido, pero solo cabe con pocos liceos
 *   C. pozo 25, CON repartidor →  rápido y cabe, que es lo que se recomienda
 *
 * Además de los tiempos se cuenta lo único que decide si una configuración cabe
 * o no: **las conexiones reales que PostgreSQL acaba teniendo abiertas**.
 *
 * ─── LO QUE ESTA MEDIDA NO ES ────────────────────────────────────────────────
 *
 * El generador corre en la misma máquina que el servidor y que PostgreSQL, así
 * que los tres se reparten el procesador. Los números absolutos son peores que
 * los de un despliegue de verdad. Lo que sí vale es la **comparación**: las tres
 * situaciones se miden igual, seguidas, en la misma máquina.
 *
 *   PGBOUNCER_HOST=localhost PGBOUNCER_PORT=6432 npm run medir:pozo
 */
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import { Client } from 'pg';
import { PrismaClient } from '@prisma/client';
import { platformPrisma } from '../config/database';

const PUERTO = Number(process.env.PUERTO_MEDIDA || 3007);
const API = `http://localhost:${PUERTO}/api`;
const SLUG = process.env.LICEO || 'instituto-testing';
/**
 * CUÁNTA GENTE, Y POR QUÉ NO MÁS
 *
 * El sistema limita a 200 peticiones por minuto y por persona, y eso no se toca
 * para medir: es lo que frena a quien abusa. Aquí **todas** las llamadas van con
 * la misma credencial (un administrador), así que la medición entera tiene que
 * caber en ese cupo o lo que se mediría es el tope, no el sistema.
 *
 * 150 a la vez + un calentamiento corto = 160, y cabe. Con 150 peticiones
 * simultáneas el pozo de conexiones ya hace cola de sobra: es lo que se quiere
 * ver.
 */
const A_LA_VEZ = Number(process.env.A_LA_VEZ || 150);
const POR_PERSONA = Number(process.env.POR_PERSONA || 1);
const CALENTAMIENTO = 10;

const percentil = (xs: number[], p: number) => {
    if (xs.length === 0) return 0;
    const o = [...xs].sort((a, b) => a - b);
    return o[Math.min(o.length - 1, Math.floor((o.length * p) / 100))];
};

interface Situacion {
    nombre: string;
    pozo: number;
    repartidor: boolean;
}

async function esperarAlServidor(hastaCuando: number): Promise<boolean> {
    while (Date.now() < hastaCuando) {
        try {
            const r = await fetch(`http://localhost:${PUERTO}/health`);
            if (r.ok) return true;
        } catch {
            /* todavía no levanta */
        }
        await new Promise((r) => setTimeout(r, 400));
    }
    return false;
}

function arrancar(s: Situacion): ChildProcess {
    const env: NodeJS.ProcessEnv = {
        ...process.env,
        // `PORT` a secas no manda: lo pone el archivo `.env`, a propósito (ver
        // `config/environment.ts`). La variable explícita sí, y por eso existe:
        // esto levanta un servidor aparte sin tocar el que esté en marcha.
        PUERTO_DEL_HOST: String(PUERTO),
        NODE_ENV: 'production',
        // El tope de peticiones por minuto se deja muy alto a propósito: lo que
        // se quiere medir es el trabajo del servidor, no el tope. No es una
        // recomendación de producción.
        RATE_LIMIT_MAX: '100000',
        TENANT_CONNECTION_LIMIT: String(s.pozo),
        LOG_LEVEL: 'error',
    };
    if (!s.repartidor) delete env.PGBOUNCER_HOST;

    return spawn('npx', ['tsx', path.join(__dirname, '..', 'index.ts')], {
        env,
        stdio: 'ignore',
        shell: process.platform === 'win32',
        detached: false,
    });
}

/** Conexiones reales de PostgreSQL contra la base del liceo. */
async function conexionesReales(
    admin: { user: string; password: string; host: string; port: number },
    base: string
): Promise<number> {
    const c = new Client({ ...admin, database: 'postgres' });
    await c.connect();
    const r = await c.query<{ n: string }>(
        'SELECT count(*) AS n FROM pg_stat_activity WHERE datname = $1',
        [base]
    );
    await c.end();
    return Number(r.rows[0].n);
}

async function entrar(): Promise<string> {
    const hastaCuando = Date.now() + 90_000;
    for (;;) {
        const res = await fetch(`${API}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Institute-Slug': SLUG },
            body: JSON.stringify({ email: 'admin@testing.edu.ve', password: '123456' }),
        });
        if (res.ok) return ((await res.json()) as { tokens: { accessToken: string } }).tokens.accessToken;
        if (res.status !== 429 || Date.now() > hastaCuando) {
            throw new Error(`no se pudo entrar: ${res.status}`);
        }
        await new Promise((r) => setTimeout(r, 5000));
    }
}

async function tanda(token: string, ruta: string) {
    const tiempos: number[] = [];
    let fallos = 0;
    const t0 = Date.now();

    await Promise.all(
        Array.from({ length: A_LA_VEZ }, async () => {
            for (let i = 0; i < POR_PERSONA; i++) {
                const t = Date.now();
                try {
                    const res = await fetch(`${API}${ruta}`, {
                        headers: { Authorization: `Bearer ${token}`, 'X-Institute-Slug': SLUG },
                    });
                    await res.arrayBuffer();
                    if (!res.ok) fallos++;
                    else tiempos.push(Date.now() - t);
                } catch {
                    fallos++;
                }
            }
        })
    );

    const totalMs = Date.now() - t0;
    return {
        p50: percentil(tiempos, 50),
        p95: percentil(tiempos, 95),
        peor: Math.max(...tiempos, 0),
        porSegundo: totalMs > 0 ? Math.round((tiempos.length / totalMs) * 1000) : 0,
        fallos,
    };
}

/**
 * EL POZO, MEDIDO DONDE SOLO CUENTA EL POZO
 *
 * Aquí no hay servidor ni HTTP: son consultas directas a la base, todas a la
 * vez. Es la única forma de ver lo que cuesta el tope de conexiones **por sí
 * solo**, sin que lo tape el trabajo de responder una petición.
 *
 * El número de aquí y el de la tabla de después contestan preguntas distintas, y
 * mezclarlos lleva a recomendar cosas que luego no se notan. Por eso se miden
 * los dos en la misma pasada.
 */
async function elPozoEnLaBase(
    base: string,
    admin: { user: string; password: string; host: string; port: number },
    classroomId: string
) {
    const url = `postgresql://${admin.user}:${encodeURIComponent(admin.password)}` +
        `@${admin.host}:${admin.port}/${base}?schema=public`;
    const cuantas = Number(process.env.CONSULTAS_A_LA_VEZ || 200);

    // Si se mide otra base, la sección de aquella, no la del liceo de la API.
    const primeraSeccion = new PrismaClient({ datasources: { db: { url } } });
    const seccionDeEstaBase =
        (await primeraSeccion.classroom.findFirst({ select: { id: true } }))?.id ?? classroomId;
    await primeraSeccion.$disconnect();

    const alumnosDeLaSeccion = (db: PrismaClient) =>
        db.user.findMany({
            where: {
                role: 'STUDENT',
                isActive: true,
                studentClassrooms: { some: { classroomId: seccionDeEstaBase, isActive: true } },
            },
            take: 30,
        });

    console.log(`
  Solo la base de datos, sin HTTP — ${cuantas} consultas a la vez
`);
    console.log('    pozo' + 'p50'.padStart(10) + 'p95'.padStart(9) + 'todo'.padStart(9));
    console.log('    ' + '─'.repeat(36));

    for (const pozo of [2, 5, 10, 25]) {
        const db = new PrismaClient({ datasources: { db: { url: `${url}&connection_limit=${pozo}` } } });
        await db.$connect();
        await Promise.all(Array.from({ length: 10 }, () => alumnosDeLaSeccion(db)));

        const t0 = Date.now();
        const tiempos = await Promise.all(
            Array.from({ length: cuantas }, async () => {
                const t = Date.now();
                await alumnosDeLaSeccion(db);
                return Date.now() - t;
            })
        );
        const total = Date.now() - t0;

        console.log(
            '    ' + String(pozo).padStart(4) +
            `${percentil(tiempos, 50)}`.padStart(8) + 'ms' +
            `${percentil(tiempos, 95)}`.padStart(7) + 'ms' +
            `${total}`.padStart(7) + 'ms'
        );
        await db.$disconnect();
        await new Promise((r) => setTimeout(r, 800));
    }
}

async function main() {
    if (!process.env.PGBOUNCER_HOST) {
        console.error('\n  Falta PGBOUNCER_HOST: la situación C no se puede medir sin repartidor.\n');
        process.exit(1);
    }

    const liceo = await platformPrisma.institute.findFirst({
        where: { slug: SLUG },
        select: {
            id: true,
            databaseName: true,
            databaseHost: true,
            databasePort: true,
            databaseUser: true,
            databasePassword: true,
        },
    });
    if (!liceo?.databaseName) {
        console.error(`  No existe el liceo «${SLUG}».`);
        process.exit(1);
    }
    const admin = {
        user: liceo.databaseUser!,
        password: liceo.databasePassword!,
        host: liceo.databaseHost!,
        port: liceo.databasePort ?? 5432,
    };

    // La pantalla que más pesa: los alumnos de una sección.
    const seccion = await (async () => {
        const c = new Client({ ...admin, database: liceo.databaseName! });
        await c.connect();
        const r = await c.query<{ id: string }>(
            `SELECT c.id FROM classrooms c
             JOIN academic_years a ON a.id = c."academicYearId"
             WHERE a.status = 'ACTIVE' LIMIT 1`
        );
        await c.end();
        return r.rows[0]?.id;
    })();
    if (!seccion) {
        console.error('  El liceo no tiene secciones en el año activo.');
        process.exit(1);
    }
    const ruta = `/students?classroomId=${seccion}&page=1&limit=30`;

    const situaciones: Situacion[] = [
        { nombre: 'A. pozo 2, sin repartidor', pozo: 2, repartidor: false },
        { nombre: 'B. pozo 25, sin repartidor', pozo: 25, repartidor: false },
        { nombre: 'C. pozo 25, CON repartidor', pozo: 25, repartidor: true },
    ];

    // Se puede apuntar a otra base con BASE_DE_LA_MEDIDA: la del liceo de carga
    // (15.000 personas) da números más parecidos a los de un liceo grande.
    await elPozoEnLaBase(process.env.BASE_DE_LA_MEDIDA || liceo.databaseName!, admin, seccion);

    console.log(`
  Lo mismo, pero por la API: ${A_LA_VEZ} personas a la vez, ${POR_PERSONA} llamadas cada una
`);
    console.log(
        '    situación'.padEnd(32) +
        'p50'.padStart(8) + 'p95'.padStart(8) + 'peor'.padStart(9) +
        'por seg'.padStart(10) + 'conex.'.padStart(9)
    );
    console.log('    ' + '─'.repeat(72));

    for (const s of situaciones) {
        const servidor = arrancar(s);
        try {
            const arriba = await esperarAlServidor(Date.now() + 90_000);
            if (!arriba) {
                console.log(`    ${s.nombre.padEnd(28)}  el servidor no levantó`);
                continue;
            }

            const token = await entrar();
            // Unas pocas primero: lo que se quiere medir es el sistema en
            // marcha, no el primer arranque de cada cosa.
            for (let i = 0; i < CALENTAMIENTO; i++) {
                await fetch(`${API}${ruta}`, {
                    headers: { Authorization: `Bearer ${token}`, 'X-Institute-Slug': SLUG },
                }).then((x) => x.arrayBuffer());
            }

            const r = await tanda(token, ruta);
            const conexiones = await conexionesReales(admin, liceo.databaseName!);

            console.log(
                '    ' + s.nombre.padEnd(28) +
                `${r.p50}`.padStart(6) + 'ms' +
                `${r.p95}`.padStart(6) + 'ms' +
                `${r.peor}`.padStart(7) + 'ms' +
                String(r.porSegundo).padStart(10) +
                String(conexiones).padStart(9) +
                (r.fallos ? `   FALLOS: ${r.fallos}` : '')
            );
        } finally {
            servidor.kill();
            // Windows no mata a los hijos de `npx`: se cierra el puerto a mano.
            await new Promise((r) => setTimeout(r, 1500));
            await matarElPuerto();
            await new Promise((r) => setTimeout(r, 1500));
        }
    }

    console.log('');
    await platformPrisma.$disconnect();
    process.exit(0);
}

/** Cierra lo que haya quedado escuchando en el puerto de la medición. */
async function matarElPuerto() {
    await new Promise<void>((resolve) => {
        const cmd =
            process.platform === 'win32'
                ? `for /f "tokens=5" %a in ('netstat -ano ^| findstr :${PUERTO} ^| findstr LISTENING') do taskkill /F /PID %a`
                : `lsof -ti:${PUERTO} | xargs -r kill -9`;
        const p = spawn(cmd, { shell: true, stdio: 'ignore' });
        p.on('exit', () => resolve());
        p.on('error', () => resolve());
    });
}

main().catch((e) => {
    console.error('\n  ERROR:', e.message, '\n');
    process.exit(1);
});
