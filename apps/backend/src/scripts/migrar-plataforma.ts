/**
 * MIGRA LA BASE DE LA PLATAFORMA (la de los liceos y los superadministradores)
 *
 *   npm run migrate:plataforma
 *
 * Se ejecuta en cada despliegue, ANTES de migrar los liceos (lo hace el
 * servicio `migrator` de `docker-compose.prod.yml`).
 *
 * POR QUÉ EXISTE
 *
 * El esquema de la plataforma vivía en `src/prisma/platform-schema.prisma`,
 * en la MISMA carpeta que el de los liceos. Prisma busca las migraciones en la
 * carpeta `migrations` que está junto al esquema, así que
 * `prisma migrate deploy --schema=src/prisma/platform-schema.prisma` —lo que
 * ejecutaba el despliegue— aplicaba **las migraciones de los liceos** a la
 * base de la plataforma: en un servidor nuevo creaba allí las tablas de
 * alumnos y notas, y nunca la de los liceos ni la de los superadministradores.
 * El sistema no arrancaba. Nadie lo había visto porque en este PC la base de
 * la plataforma se hizo con `db push`, que no mira las migraciones.
 * (Comprobado con `prisma migrate status` antes de tocarlo: daba como
 * pendientes las 12 migraciones de los liceos.)
 *
 * Ahora la plataforma tiene su carpeta (`src/prisma/plataforma/`) con sus
 * propias migraciones.
 *
 * LAS BASES HECHAS A MANO
 *
 * Una base de plataforma creada con `db push` tiene las tablas pero no la
 * tabla `_prisma_migrations`: `migrate deploy` intentaría crearlo todo otra
 * vez y fallaría. Si esa base es IGUAL al esquema, se apuntan sus migraciones
 * como aplicadas y se sigue. Si no es igual, no se toca nada: se enseña la
 * diferencia y se para, porque adivinar ahí es arriesgar la lista de liceos.
 */
import 'dotenv/config';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { Client } from 'pg';

const CARPETA = path.join(__dirname, '../prisma/plataforma');
const ESQUEMA = path.join(CARPETA, 'schema.prisma');
const MIGRACIONES = path.join(CARPETA, 'migrations');

function prisma(args: string[], url: string): { codigo: number; salida: string } {
    const cli = require.resolve('prisma/build/index.js');
    try {
        // `migrate diff` no admite --schema (el esquema va en sus propias opciones).
        const conEsquema = args[1] === 'diff' ? args : [...args, '--schema', ESQUEMA];
        const salida = execFileSync(process.execPath, [cli, ...conEsquema], {
            env: { ...process.env, PLATFORM_DATABASE_URL: url },
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        return { codigo: 0, salida };
    } catch (error: any) {
        return { codigo: error.status ?? 1, salida: `${error.stdout ?? ''}${error.stderr ?? ''}` };
    }
}

export function migracionesDeLaPlataforma(): string[] {
    return fs
        .readdirSync(MIGRACIONES, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
        .sort();
}

async function comoEsta(url: string): Promise<'vacia' | 'con-migraciones' | 'hecha-a-mano'> {
    const cliente = new Client({ connectionString: url });
    await cliente.connect();
    try {
        const hay = async (tabla: string) =>
            (await cliente.query('SELECT to_regclass($1) IS NOT NULL AS hay', [`public.${tabla}`])).rows[0].hay as boolean;
        if (await hay('_prisma_migrations')) return 'con-migraciones';
        return (await hay('institutes')) ? 'hecha-a-mano' : 'vacia';
    } finally {
        await cliente.end();
    }
}

export async function migrarPlataforma(url: string, decir: (linea: string) => void = console.log): Promise<boolean> {
    const estado = await comoEsta(url);

    if (estado === 'hecha-a-mano') {
        decir('La base de la plataforma se hizo sin migraciones (db push). Comparando con el esquema…');
        const diferencia = prisma(['migrate', 'diff', '--from-url', url, '--to-schema-datamodel', ESQUEMA, '--exit-code', '--script'], url);
        if (diferencia.codigo !== 0) {
            decir('NO coincide con el esquema, y no se toca nada. Lo que le falta o le sobra:');
            decir(diferencia.salida.trim());
            decir('Revisa ese SQL, aplícalo a mano si es correcto y vuelve a ejecutar esto.');
            return false;
        }
        for (const migracion of migracionesDeLaPlataforma()) {
            const r = prisma(['migrate', 'resolve', '--applied', migracion], url);
            if (r.codigo !== 0) {
                decir(`No se pudo apuntar ${migracion} como aplicada:\n${r.salida.trim()}`);
                return false;
            }
        }
        decir('Coincide: sus migraciones quedan apuntadas como aplicadas.');
    }

    const r = prisma(['migrate', 'deploy'], url);
    decir(r.salida.trim());
    return r.codigo === 0;
}

if (require.main === module) {
    const url = process.env.PLATFORM_DATABASE_URL;
    if (!url) {
        console.error('Falta PLATFORM_DATABASE_URL.');
        process.exit(1);
    }
    migrarPlataforma(url)
        .then((ok) => process.exit(ok ? 0 : 1))
        .catch((error) => {
            console.error('ERROR:', error instanceof Error ? error.message : error);
            process.exit(1);
        });
}
