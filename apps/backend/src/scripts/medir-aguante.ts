/**
 * EL SISTEMA, UN RATO LARGO SEGUIDO
 *
 * Las otras mediciones contestan *«¿cuánto tarda?»* y *«¿aguanta un golpe?»*.
 * Falta la tercera, que es la que de verdad se nota en un liceo: **¿aguanta la
 * mañana entera?**
 *
 * Un sistema puede ir rápido en el primer minuto y arrastrarse en el trigésimo:
 * memoria que se va llenando y no se suelta, copias guardadas que crecen sin
 * caducar, conexiones que se abren y no se cierran. Eso no sale en una ráfaga de
 * dos segundos. Sale aquí.
 *
 * Lo que se mira, minuto a minuto:
 *
 *   - cuánto tarda (p50 y p95), para ver si **empeora con el tiempo**;
 *   - cuántos fallos, que tienen que ser **cero**;
 *   - cuánta memoria gasta el servidor, para ver si **sube y no baja**;
 *   - cuántas conexiones tiene abiertas contra la base.
 *
 * ─── CÓMO ESTÁ MONTADO, Y POR QUÉ ────────────────────────────────────────────
 *
 * Con **personas distintas de verdad**, no con una repitiendo. El sistema limita
 * a 200 peticiones por minuto y por persona, y eso no se toca para medir: es lo
 * que frena a quien abusa. Con treinta personas pidiendo cada segundo, la carga
 * es real y ninguna se acerca a su tope.
 *
 * Cada una pide **su** pantalla: el profesor la suya, el alumno la suya. Es lo
 * que pasa un lunes por la mañana, y de paso pasa por caminos distintos del
 * sistema.
 *
 * ─── LO QUE ESTA MEDIDA NO ES ────────────────────────────────────────────────
 *
 * El generador corre en la misma máquina que el servidor y que PostgreSQL. Los
 * tiempos absolutos son peores que los de un despliegue de verdad. Lo que sí
 * vale, y es lo que se viene a ver, es **la forma de la curva**: si el minuto
 * treinta se parece al primero, no hay nada que se esté llenando.
 *
 *   PUERTO_MEDIDA=3007 MINUTOS=10 GENTE=30 npm run medir:aguante
 */
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import { Client } from 'pg';
import { platformPrisma } from '../config/database';

const PUERTO = Number(process.env.PUERTO_MEDIDA || 3007);
const API = `http://localhost:${PUERTO}/api`;
const SLUG = process.env.LICEO || 'instituto-testing';
const MINUTOS = Number(process.env.MINUTOS || 10);
const GENTE = Number(process.env.GENTE || 30);
const PAUSA_MS = Number(process.env.PAUSA_MS || 900);
const CLAVE = process.env.CLAVE || '123456';

const percentil = (xs: number[], p: number) => {
    if (xs.length === 0) return 0;
    const o = [...xs].sort((a, b) => a - b);
    return o[Math.min(o.length - 1, Math.floor((o.length * p) / 100))];
};

interface Minuto {
    hechas: number;
    fallos: number;
    tiempos: number[];
}

const PANTALLA_DE: Record<string, string> = {
    TEACHER: '/dashboard/teacher',
    STUDENT: '/dashboard/student',
    ADMIN: '/dashboard/admin',
    TUTOR: '/dashboard/student',
};

async function esperarAlServidor(hastaCuando: number): Promise<boolean> {
    while (Date.now() < hastaCuando) {
        try {
            if ((await fetch(`http://localhost:${PUERTO}/health`)).ok) return true;
        } catch {
            /* todavía no levanta */
        }
        await new Promise((r) => setTimeout(r, 400));
    }
    return false;
}

function arrancarElServidor(): ChildProcess {
    return spawn('npx', ['tsx', path.join(__dirname, '..', 'index.ts')], {
        env: {
            ...process.env,
            // La variable explícita: `PORT` a secas no manda (ver environment.ts).
            PUERTO_DEL_HOST: String(PUERTO),
            NODE_ENV: 'production',
            LOG_LEVEL: 'error',
        },
        stdio: 'ignore',
        shell: process.platform === 'win32',
    });
}

/** Cuánta memoria gasta el proceso que escucha en el puerto, en MB. */
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

async function conexionesDeLaBase(
    admin: { user: string; password: string; host: string; port: number },
    base: string
): Promise<number> {
    const c = new Client({ ...admin, database: 'postgres' });
    try {
        await c.connect();
        const r = await c.query<{ n: string }>(
            'SELECT count(*) AS n FROM pg_stat_activity WHERE datname = $1',
            [base]
        );
        return Number(r.rows[0].n);
    } catch {
        return 0;
    } finally {
        await c.end().catch(() => undefined);
    }
}

interface Llaves {
    accessToken: string;
    refreshToken: string;
}

async function entrar(email: string): Promise<Llaves | null> {
    const hastaCuando = Date.now() + 120_000;
    for (;;) {
        const res = await fetch(`${API}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Institute-Slug': SLUG },
            body: JSON.stringify({ email, password: CLAVE }),
        });
        if (res.ok) return ((await res.json()) as { tokens: Llaves }).tokens;
        if (res.status !== 429 || Date.now() > hastaCuando) return null;
        await new Promise((r) => setTimeout(r, 5000));
    }
}

/**
 * RENOVAR LA CREDENCIAL, COMO HACE LA PANTALLA
 *
 * La credencial corta vale quince minutos. Una medición que no la renueve
 * empieza a recibir 401 justo al llegar ahí, y eso **no es un fallo del
 * sistema**: es la medición comportándose como ningún cliente de verdad se
 * comporta. La pantalla renueva sola (`conseguirCredencial` en la web), y aquí
 * también.
 *
 * De paso, esto comprueba algo que ninguna otra medición tocaba: que una sesión
 * que dura más que su credencial **sigue funcionando sin que nadie note nada**.
 */
async function renovar(llaves: Llaves): Promise<boolean> {
    try {
        const res = await fetch(`${API}/auth/refresh-token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Institute-Slug': SLUG },
            body: JSON.stringify({ refreshToken: llaves.refreshToken }),
        });
        if (!res.ok) return false;
        const cuerpo = (await res.json()) as { tokens?: Llaves; accessToken?: string; refreshToken?: string };
        const nuevas = cuerpo.tokens ?? (cuerpo as Llaves);
        if (!nuevas?.accessToken) return false;
        llaves.accessToken = nuevas.accessToken;
        if (nuevas.refreshToken) llaves.refreshToken = nuevas.refreshToken;
        return true;
    } catch {
        return false;
    }
}

async function main() {
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

    // Las personas: profesores y alumnos de verdad del liceo.
    const cliente = new Client({ ...admin, database: liceo.databaseName });
    await cliente.connect();
    const gente = (
        await cliente.query<{ email: string; role: string }>(
            `SELECT email, role FROM users
             WHERE "isActive" = true AND role IN ('TEACHER','STUDENT')
             ORDER BY role, email
             LIMIT $1`,
            [GENTE]
        )
    ).rows;
    await cliente.end();

    if (gente.length === 0) {
        console.error('  El liceo no tiene gente con la que medir.');
        process.exit(1);
    }

    const servidor = arrancarElServidor();
    try {
        if (!(await esperarAlServidor(Date.now() + 120_000))) {
            console.error('  El servidor no levantó.');
            process.exit(1);
        }

        console.log(`\n  ${gente.length} personas pidiendo su pantalla cada ${PAUSA_MS} ms, durante ${MINUTOS} minutos\n`);

        const sesiones: Array<{ llaves: Llaves; ruta: string }> = [];
        for (const p of gente) {
            const llaves = await entrar(p.email);
            if (llaves) sesiones.push({ llaves, ruta: PANTALLA_DE[p.role] ?? '/dashboard' });
        }
        if (sesiones.length === 0) {
            console.error('  No se pudo entrar con nadie.');
            process.exit(1);
        }
        console.log(`  Dentro: ${sesiones.length} de ${gente.length}\n`);

        console.log('    minuto' + 'p50'.padStart(9) + 'p95'.padStart(9) + 'peor'.padStart(9) +
            'por seg'.padStart(10) + 'fallos'.padStart(9) + 'memoria'.padStart(10) + 'conex.'.padStart(9));
        console.log('    ' + '─'.repeat(72));

        const minutos: Minuto[] = [];
        let actual: Minuto = { hechas: 0, fallos: 0, tiempos: [] };
        const hastaCuando = Date.now() + MINUTOS * 60_000;
        let siguienteCorte = Date.now() + 60_000;
        let parar = false;
        let renovaciones = 0;

        const trabajar = async (s: { llaves: Llaves; ruta: string }) => {
            while (!parar) {
                const t = Date.now();
                try {
                    const pedir = () =>
                        fetch(`${API}${s.ruta}`, {
                            headers: { Authorization: `Bearer ${s.llaves.accessToken}`, 'X-Institute-Slug': SLUG },
                        });

                    let res = await pedir();
                    await res.arrayBuffer();

                    // Credencial caducada: se renueva y se repite, igual que la
                    // pantalla. Cuenta como UNA petición, porque para quien usa
                    // el sistema lo es.
                    if (res.status === 401 && (await renovar(s.llaves))) {
                        renovaciones++;
                        res = await pedir();
                        await res.arrayBuffer();
                    }

                    actual.hechas++;
                    if (res.ok) actual.tiempos.push(Date.now() - t);
                    else actual.fallos++;
                } catch {
                    actual.hechas++;
                    actual.fallos++;
                }
                await new Promise((r) => setTimeout(r, PAUSA_MS));
            }
        };

        const todos = sesiones.map(trabajar);

        while (Date.now() < hastaCuando) {
            await new Promise((r) => setTimeout(r, Math.max(0, siguienteCorte - Date.now())));

            const cerrado = actual;
            actual = { hechas: 0, fallos: 0, tiempos: [] };
            minutos.push(cerrado);
            siguienteCorte += 60_000;

            const [memoria, conexiones] = await Promise.all([
                memoriaDelServidor(),
                conexionesDeLaBase(admin, liceo.databaseName!),
            ]);

            console.log(
                '    ' + String(minutos.length).padStart(6) +
                `${percentil(cerrado.tiempos, 50)}`.padStart(7) + 'ms' +
                `${percentil(cerrado.tiempos, 95)}`.padStart(7) + 'ms' +
                `${Math.max(...cerrado.tiempos, 0)}`.padStart(7) + 'ms' +
                String(Math.round(cerrado.hechas / 60)).padStart(10) +
                String(cerrado.fallos).padStart(9) +
                `${memoria}`.padStart(8) + 'MB' +
                String(conexiones).padStart(9)
            );
        }

        parar = true;
        await Promise.all(todos);

        // ── El veredicto ────────────────────────────────────────────────────
        const fallos = minutos.reduce((a, m) => a + m.fallos, 0);
        const hechas = minutos.reduce((a, m) => a + m.hechas, 0);
        const primero = percentil(minutos[0]?.tiempos ?? [], 95);
        const ultimo = percentil(minutos[minutos.length - 1]?.tiempos ?? [], 95);

        console.log('');
        console.log(`    ${hechas} peticiones, ${fallos} fallos, ${renovaciones} credenciales renovadas por el camino`);
        console.log(`    p95 del primer minuto: ${primero} ms   —   del último: ${ultimo} ms`);
        console.log('');

        const seArrastra = primero > 0 && ultimo > primero * 1.5;
        if (fallos === 0 && !seArrastra) {
            console.log('    AGUANTA: ni un fallo, y el último minuto no va peor que el primero.\n');
        } else {
            if (fallos > 0) console.log(`    NO AGUANTA: ${fallos} peticiones fallaron.`);
            if (seArrastra) console.log('    NO AGUANTA: se va poniendo más lento con el tiempo.');
            console.log('');
        }

        await platformPrisma.$disconnect();
        process.exit(fallos === 0 && !seArrastra ? 0 : 1);
    } finally {
        servidor.kill();
        await new Promise((r) => setTimeout(r, 1000));
        await new Promise<void>((resolve) => {
            const cmd =
                process.platform === 'win32'
                    ? `powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort ${PUERTO} -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"`
                    : `lsof -ti:${PUERTO} | xargs -r kill -9`;
            const p = spawn(cmd, { shell: true, stdio: 'ignore' });
            p.on('exit', () => resolve());
            p.on('error', () => resolve());
        });
    }
}

main().catch((e) => {
    console.error('\n  ERROR:', e.message, '\n');
    process.exit(1);
});
