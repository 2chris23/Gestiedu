import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { Client } from 'pg';
import { migrarPlataforma } from '../../src/scripts/migrar-plataforma';

/**
 * LA BASE DE LA PLATAFORMA SE MIGRA CON SUS MIGRACIONES, NO CON LAS DE LOS LICEOS
 *
 * El despliegue ejecutaba `prisma migrate deploy` con el esquema de la
 * plataforma, que vivía en la misma carpeta que el de los liceos: Prisma cogía
 * las migraciones de los LICEOS. En un servidor nuevo, la base de la
 * plataforma acababa con tablas de alumnos y sin la tabla de liceos, y el
 * sistema no arrancaba. Ver `src/scripts/migrar-plataforma.ts`.
 */

const BASE = process.env.PLATFORM_DATABASE_URL!;
const conBase = (nombre: string) => BASE.replace(/\/[^/?]+(\?|$)/, `/${nombre}$1`);
const ADMIN = conBase('postgres');
const sufijo = `${process.pid}_${Date.now()}`;
const creadas: string[] = [];

async function sql(url: string, consulta: string, valores: unknown[] = []) {
    const c = new Client({ connectionString: url });
    await c.connect();
    try {
        return (await c.query(consulta, valores)).rows;
    } finally {
        await c.end();
    }
}

async function baseNueva(nombre: string): Promise<string> {
    const db = `plataforma_prueba_${nombre}_${sufijo}`.slice(0, 63);
    await sql(ADMIN, `CREATE DATABASE "${db}"`);
    creadas.push(db);
    return conBase(db);
}

const tablas = async (url: string) =>
    (await sql(url, `SELECT table_name FROM information_schema.tables WHERE table_schema='public'`)).map((r) => r.table_name as string);

/** Como se hacía antes en este PC: `db push`, sin migraciones. */
function aMano(url: string) {
    execFileSync(process.execPath, [
        require.resolve('prisma/build/index.js'), 'db', 'push', '--skip-generate',
        '--schema', path.join(__dirname, '../../src/prisma/plataforma/schema.prisma'),
    ], { env: { ...process.env, PLATFORM_DATABASE_URL: url }, stdio: 'ignore' });
}

describe('Migrar la base de la plataforma', () => {
    const silencio = () => undefined;

    afterAll(async () => {
        for (const db of creadas) {
            await sql(ADMIN, `DROP DATABASE IF EXISTS "${db}" WITH (FORCE)`).catch(() => undefined);
        }
    }, 60000);

    it('PLAT-01: en un servidor nuevo crea las tablas de la plataforma, y ninguna de los liceos', async () => {
        const url = await baseNueva('vacia');
        expect(await migrarPlataforma(url, silencio)).toBe(true);

        const hay = await tablas(url);
        expect(hay).toEqual(expect.arrayContaining(['institutes', 'super_admins', 'platform_config', '_prisma_migrations']));
        // Lo que pasaba antes: las tablas de los liceos en la base de la plataforma.
        expect(hay).not.toContain('users');
        expect(hay).not.toContain('grades');
    }, 120000);

    it('PLAT-02: una base hecha con db push e igual al esquema se apunta como migrada, sin tocar sus datos', async () => {
        const url = await baseNueva('a_mano');
        aMano(url);
        await sql(url, `INSERT INTO platform_config (id, "platformName", "updatedAt") VALUES ('platform', 'Dato que no se pierde', NOW())`);

        expect(await migrarPlataforma(url, silencio)).toBe(true);

        const migradas = await sql(url, `SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL`);
        expect(migradas.length).toBeGreaterThan(0);
        expect((await sql(url, `SELECT "platformName" FROM platform_config`))[0]?.platformName).toBe('Dato que no se pierde');

        // Y la segunda vez no hace nada.
        expect(await migrarPlataforma(url, silencio)).toBe(true);
    }, 120000);

    it('PLAT-03: una base hecha a mano que NO coincide no se toca: se para y lo dice', async () => {
        const url = await baseNueva('distinta');
        aMano(url);
        await sql(url, `ALTER TABLE platform_config DROP COLUMN "supportEmail"`);

        const dicho: string[] = [];
        expect(await migrarPlataforma(url, (l) => dicho.push(l))).toBe(false);
        expect(dicho.join('\n')).toMatch(/NO coincide/);
        expect(await tablas(url)).not.toContain('_prisma_migrations');
    }, 120000);

    it('PLAT-04: cada esquema de Prisma tiene su propia carpeta (y con ella, sus propias migraciones)', () => {
        const raiz = path.join(__dirname, '../../src/prisma');
        const esquemas: string[] = [];
        const recorrer = (dir: string) => {
            for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
                if (e.isDirectory() && e.name !== 'migrations') recorrer(path.join(dir, e.name));
                else if (e.name.endsWith('.prisma')) esquemas.push(path.join(dir, e.name));
            }
        };
        recorrer(raiz);

        const carpetas = esquemas.map((e) => path.dirname(e));
        expect(esquemas.length).toBeGreaterThanOrEqual(2);
        expect(new Set(carpetas).size).toBe(carpetas.length);
    });
});
