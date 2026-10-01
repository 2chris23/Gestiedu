/**
 * MUCHOS LICEOS PEQUEÑOS, PARA MEDIR CON MUCHOS LICEOS A LA VEZ
 *
 *   LICEOS=50 npm run seed:muchos-liceos
 *   npm run seed:muchos-liceos -- --limpiar
 *
 * Las mediciones de carga se hacían con UN liceo enorme (`test-load-5k`). Lo
 * que se rompe con 200 liceos es otra cosa: una conexión por liceo, lo que se
 * guarda en memoria por liceo, el repartidor de conexiones. Eso solo se ve con
 * muchas bases a la vez.
 *
 * Se siembra UN liceo pequeño de plantilla (`muchos-plantilla`, con
 * `seed-load-test.ts` en tamaño reducido) y se copia N veces con
 * `CREATE DATABASE ... TEMPLATE`, que tarda un segundo por liceo en vez de
 * sembrar cada uno. Cada copia se apunta en la plataforma con su nombre
 * (`muchos-001`, `muchos-002`…) y su fila de liceo dentro de su base se
 * renombra (las columnas que la señalan cambian solas: ON UPDATE CASCADE).
 *
 * La clave de todas las cuentas es `Test123!`.
 *
 * Tamaño de cada liceo (se puede cambiar): 3 grados × 2 secciones × 25 alumnos
 * = 150 alumnos, 20 profesores, 2 admins, 1 representante por alumno.
 */
import 'dotenv/config';
import { execFileSync } from 'child_process';
import path from 'path';
import { Client } from 'pg';
import { platformPrisma } from '../config/database';

const PREFIJO = 'muchos-';
const PLANTILLA = `${PREFIJO}plantilla`;
const BASE_DE_LA_PLANTILLA = `tenant_${PLANTILLA.replace(/-/g, '_')}`;
const LICEOS = Number(process.env.LICEOS || 50);

const conexion = () => {
    const u = new URL(process.env.PLATFORM_DATABASE_URL!);
    return {
        host: u.hostname,
        port: Number(u.port || 5432),
        user: decodeURIComponent(u.username),
        password: decodeURIComponent(u.password),
    };
};

async function enPostgres<T>(fn: (c: Client) => Promise<T>, base = 'postgres'): Promise<T> {
    const c = new Client({ ...conexion(), database: base });
    await c.connect();
    try {
        return await fn(c);
    } finally {
        await c.end();
    }
}

const nombreDe = (i: number) => `${PREFIJO}${String(i).padStart(3, '0')}`;
const baseDe = (slug: string) => `tenant_${slug.replace(/-/g, '_')}`;

async function sembrarLaPlantilla() {
    const ya = await platformPrisma.institute.findFirst({ where: { slug: PLANTILLA } });
    if (ya?.databaseName) {
        console.log(`  La plantilla ya existe (${BASE_DE_LA_PLANTILLA}).`);
        return;
    }
    console.log('  Sembrando la plantilla (un liceo pequeño)…');
    execFileSync(process.execPath, [require.resolve('tsx/cli'), path.join(__dirname, 'seed-load-test.ts')], {
        stdio: 'inherit',
        env: {
            ...process.env,
            SEMILLA_LICEO: PLANTILLA,
            SEMILLA_CODIGO: 'MUCHOS-PLANTILLA',
            SEMILLA_NOMBRE: 'Liceo de plantilla',
            SEMILLA_GRADOS: process.env.SEMILLA_GRADOS || '3',
            SEMILLA_SECCIONES: process.env.SEMILLA_SECCIONES || '2',
            SEMILLA_ALUMNOS_POR_SECCION: process.env.SEMILLA_ALUMNOS_POR_SECCION || '25',
            SEMILLA_TUTORES_POR_ALUMNO: process.env.SEMILLA_TUTORES_POR_ALUMNO || '1',
            SEMILLA_PROFESORES: process.env.SEMILLA_PROFESORES || '20',
            SEMILLA_ADMINS: process.env.SEMILLA_ADMINS || '2',
            SEMILLA_ACTIVIDADES: process.env.SEMILLA_ACTIVIDADES || '4',
            SEMILLA_DIAS: process.env.SEMILLA_DIAS || '40',
        },
    });
}

async function copiar(i: number, plantilla: { id: string; plan: string }) {
    const slug = nombreDe(i);
    const base = baseDe(slug);
    const ya = await platformPrisma.institute.findFirst({ where: { slug } });
    if (ya) return false;

    // Una copia exacta de la plantilla. La plantilla no puede tener a nadie
    // conectado mientras se copia: por eso esto va antes de medir.
    await enPostgres((c) => c.query(`CREATE DATABASE "${base}" TEMPLATE "${BASE_DE_LA_PLANTILLA}"`));

    const id = `muchos${String(i).padStart(3, '0')}`;
    await enPostgres(async (c) => {
        await c.query(
            `UPDATE institutes SET id = $1, slug = $2, subdomain = $2, code = $3, name = $4 WHERE id = $5`,
            [id, slug, `MUCHOS-${String(i).padStart(3, '0')}`, `Liceo ${i}`, plantilla.id]
        );
    }, base);

    const c = conexion();
    await platformPrisma.institute.create({
        data: {
            id,
            name: `Liceo ${i}`,
            code: `MUCHOS-${String(i).padStart(3, '0')}`,
            slug,
            subdomain: slug,
            email: `test@${slug}.com`,
            status: 'ACTIVE',
            environment: 'development',
            plan: plantilla.plan,
            databaseName: base,
            databaseHost: c.host,
            databasePort: c.port,
            databaseUser: c.user,
            databasePassword: c.password,
        },
    });
    return true;
}

async function limpiar() {
    const liceos = await platformPrisma.institute.findMany({
        where: { slug: { startsWith: PREFIJO } },
        select: { id: true, slug: true, databaseName: true },
    });
    for (const l of liceos) {
        if (l.databaseName) {
            await enPostgres((c) => c.query(`DROP DATABASE IF EXISTS "${l.databaseName}" WITH (FORCE)`));
        }
        await platformPrisma.institute.delete({ where: { id: l.id } });
    }
    console.log(`  Quitados ${liceos.length} liceos de medición (${PREFIJO}*).`);
}

async function main() {
    if (process.argv.includes('--limpiar')) return limpiar();

    await sembrarLaPlantilla();
    const plantilla = await platformPrisma.institute.findFirst({ where: { slug: PLANTILLA }, select: { id: true, plan: true } });
    if (!plantilla) throw new Error('No quedó la plantilla sembrada');

    // Que nadie esté conectado a la plantilla: si no, no se puede copiar.
    await enPostgres((c) =>
        c.query(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`, [
            BASE_DE_LA_PLANTILLA,
        ])
    );

    const t0 = Date.now();
    let nuevos = 0;
    for (let i = 1; i <= LICEOS; i++) {
        if (await copiar(i, plantilla)) nuevos++;
        process.stdout.write(`\r  Liceos: ${i}/${LICEOS}`);
    }
    console.log(`\n  ${nuevos} liceos nuevos en ${Math.round((Date.now() - t0) / 1000)} s (${LICEOS - nuevos} ya estaban).`);
    console.log(`  Para medir: LICEOS=${PREFIJO}* CLAVE=Test123! npm run medir:estres`);
}

main()
    .then(async () => {
        await platformPrisma.$disconnect();
        process.exit(0);
    })
    .catch(async (e) => {
        console.error('ERROR:', e instanceof Error ? e.message : e);
        await platformPrisma.$disconnect().catch(() => undefined);
        process.exit(1);
    });
