import { spawn } from 'child_process';
import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'fs';
import path from 'path';
import { platformPrisma } from '../config/database';
import { buildTenantDatabaseUrl, maskDatabaseUrl } from '../config/tenant-db-url';
import { logger } from '../utils/logger';

/**
 * RESPALDOS POR LICEO
 *
 * Con una base de datos por liceo, un respaldo del sistema no sirve de nada si no
 * se puede devolver **un solo liceo** a como estaba. Si el liceo Bolívar borra por
 * error un año escolar entero, restaurar toda la plataforma para arreglarlo
 * significaría pisar el trabajo de los otros 199.
 *
 * Aquí cada liceo se guarda en su propio archivo, y se puede devolver solo.
 *
 * Lo importante no es hacer el respaldo: es **haberlo restaurado alguna vez**. Un
 * respaldo que nunca se probó no es un respaldo, es un archivo. Por eso hay una
 * prueba que lo guarda, rompe los datos a propósito y los devuelve
 * (`tests/integration/respaldos.test.ts`).
 */

/** Dónde quedan los archivos. Configurable: en un servidor va a un disco aparte. */
export function carpetaDeRespaldos(): string {
    return process.env.BACKUP_DIR || path.resolve(process.cwd(), 'backups');
}

/** Cuántos días se guardan antes de borrar los viejos. */
export function diasQueSeGuardan(): number {
    const raw = Number(process.env.BACKUP_RETENTION_DAYS);
    return Number.isFinite(raw) && raw > 0 ? raw : 14;
}

/**
 * Las herramientas de PostgreSQL no siempre están en el PATH (en Windows casi
 * nunca). Se deja configurar dónde están.
 */
function herramienta(nombre: 'pg_dump' | 'pg_restore' | 'psql'): string {
    const carpeta = process.env.PG_BIN_DIR;
    if (!carpeta) return nombre;
    const ejecutable = process.platform === 'win32' ? `${nombre}.exe` : nombre;
    return path.join(carpeta, ejecutable);
}

export interface ResultadoDeRespaldo {
    slug: string;
    ok: boolean;
    archivo?: string;
    bytes?: number;
    error?: string;
    ms: number;
}

export interface InformeDeRespaldo {
    total: number;
    guardados: number;
    fallidos: ResultadoDeRespaldo[];
    resultados: ResultadoDeRespaldo[];
    carpeta: string;
    ms: number;
}

/**
 * La URL que arma el sistema lleva parámetros que solo entiende Prisma
 * (`schema`, `connection_limit`, `pgbouncer`…). `pg_dump` los rechaza con
 * "parámetro de URI no válido" y el respaldo no se hace. Se quitan.
 */
export function urlParaHerramientas(url: string): string {
    try {
        const u = new URL(url);
        for (const soloDePrisma of ['schema', 'connection_limit', 'pgbouncer', 'pool_timeout', 'connect_timeout']) {
            u.searchParams.delete(soloDePrisma);
        }
        u.search = u.searchParams.toString();
        return u.toString();
    } catch {
        return url;
    }
}

function ejecutar(comando: string, args: string[], env: NodeJS.ProcessEnv): Promise<void> {
    return new Promise((resolve, reject) => {
        const hijo = spawn(comando, args, { env, windowsHide: true });
        let errores = '';

        hijo.stderr.on('data', (d) => {
            errores += String(d);
        });
        hijo.on('error', (e) => reject(new Error(`no se pudo ejecutar ${comando}: ${e.message}`)));
        hijo.on('close', (codigo) => {
            if (codigo === 0) return resolve();
            reject(new Error(errores.trim().slice(0, 500) || `${comando} terminó con código ${codigo}`));
        });
    });
}

/** Los liceos que están funcionando y tienen base propia. */
async function liceosActivos() {
    return platformPrisma.institute.findMany({
        where: { status: 'ACTIVE', databaseName: { not: null } },
        select: {
            id: true,
            slug: true,
            name: true,
            databaseName: true,
            databaseHost: true,
            databasePort: true,
            databaseUser: true,
            databasePassword: true,
        },
    });
}

function nombreDeArchivo(slug: string, cuando = new Date()): string {
    const marca = cuando.toISOString().replace(/[:.]/g, '-').slice(0, 19);
    return `${slug}__${marca}.dump`;
}

/**
 * Guarda un liceo en un archivo.
 *
 * Se usa el formato propio de PostgreSQL (`-Fc`), que va comprimido y permite
 * restaurar tablas sueltas si algún día hace falta.
 */
export async function respaldarLiceo(
    instituto: Awaited<ReturnType<typeof liceosActivos>>[number],
    carpeta = carpetaDeRespaldos()
): Promise<ResultadoDeRespaldo> {
    const t0 = Date.now();

    if (!existsSync(carpeta)) mkdirSync(carpeta, { recursive: true });

    const archivo = path.join(carpeta, nombreDeArchivo(instituto.slug));

    try {
        // Conexión directa: los respaldos no pasan por PgBouncer.
        const url = buildTenantDatabaseUrl(
            {
                databaseName: instituto.databaseName,
                databaseHost: instituto.databaseHost,
                databasePort: instituto.databasePort,
                databaseUser: instituto.databaseUser,
                databasePassword: instituto.databasePassword,
            } as any,
            'direct'
        );

        await ejecutar(
            herramienta('pg_dump'),
            ['--format=custom', '--no-owner', '--no-acl', '--file', archivo, urlParaHerramientas(url)],
            {
            ...process.env,
        });

        const bytes = statSync(archivo).size;
        if (bytes === 0) throw new Error('el archivo salió vacío');

        return { slug: instituto.slug, ok: true, archivo, bytes, ms: Date.now() - t0 };
    } catch (error) {
        // Un respaldo que falló no puede dejar un archivo a medias en la carpeta:
        // el día que haga falta, alguien lo vería ahí y creería que tiene con qué
        // restaurar. Mejor que no haya nada a que haya algo que no sirve.
        try {
            if (existsSync(archivo)) unlinkSync(archivo);
        } catch {
            /* si no se puede borrar, el error de abajo es lo que importa */
        }

        return {
            slug: instituto.slug,
            ok: false,
            error: error instanceof Error ? error.message : String(error),
            ms: Date.now() - t0,
        };
    }
}

/** Guarda todos los liceos, uno por uno. */
export async function respaldarTodos(carpeta = carpetaDeRespaldos()): Promise<InformeDeRespaldo> {
    const t0 = Date.now();
    const institutos = await liceosActivos();
    const resultados: ResultadoDeRespaldo[] = [];

    for (const instituto of institutos) {
        const r = await respaldarLiceo(instituto, carpeta);
        resultados.push(r);
        if (r.ok) {
            logger.info('Liceo respaldado', { slug: r.slug, bytes: r.bytes, ms: r.ms });
        } else {
            logger.error('No se pudo respaldar el liceo', { slug: r.slug, error: r.error });
        }
    }

    const fallidos = resultados.filter((r) => !r.ok);
    return {
        total: institutos.length,
        guardados: resultados.length - fallidos.length,
        fallidos,
        resultados,
        carpeta,
        ms: Date.now() - t0,
    };
}

/**
 * Devuelve un liceo a como estaba en un archivo.
 *
 * `--clean` borra lo que haya antes de meter lo guardado: si no, quedaría una
 * mezcla de lo viejo y lo restaurado, que es peor que cualquiera de las dos.
 */
export async function restaurarLiceo(archivo: string, urlDestino: string): Promise<void> {
    if (!existsSync(archivo)) throw new Error(`no existe el archivo de respaldo: ${archivo}`);

    logger.warn('Restaurando un liceo: se reemplaza su contenido', {
        archivo: path.basename(archivo),
        destino: maskDatabaseUrl(urlDestino),
    });

    await ejecutar(
        herramienta('pg_restore'),
        ['--clean', '--if-exists', '--no-owner', '--no-acl', '--dbname', urlParaHerramientas(urlDestino), archivo],
        { ...process.env }
    );
}

/** Borra los respaldos más viejos que el plazo configurado. */
export function limpiarRespaldosViejos(carpeta = carpetaDeRespaldos(), dias = diasQueSeGuardan()): string[] {
    if (!existsSync(carpeta)) return [];

    const limite = Date.now() - dias * 24 * 60 * 60 * 1000;
    const borrados: string[] = [];

    for (const nombre of readdirSync(carpeta)) {
        if (!nombre.endsWith('.dump')) continue;
        const completo = path.join(carpeta, nombre);
        if (statSync(completo).mtimeMs < limite) {
            unlinkSync(completo);
            borrados.push(nombre);
        }
    }

    return borrados;
}

/** El respaldo más reciente de un liceo, si lo hay. */
export function ultimoRespaldoDe(slug: string, carpeta = carpetaDeRespaldos()): string | null {
    if (!existsSync(carpeta)) return null;

    const archivos = readdirSync(carpeta)
        .filter((n) => n.startsWith(`${slug}__`) && n.endsWith('.dump'))
        .map((n) => ({ n, t: statSync(path.join(carpeta, n)).mtimeMs }))
        .sort((a, b) => b.t - a.t);

    return archivos.length > 0 ? path.join(carpeta, archivos[0].n) : null;
}
